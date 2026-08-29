import { apiKey } from "@better-auth/api-key";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import {
  admin as adminPlugin,
  bearer,
  deviceAuthorization,
  lastLoginMethod,
  openAPI,
  username,
} from "better-auth/plugins";
import { config } from "dotenv-mono";
import { count, eq, sql } from "drizzle-orm";
import db, { schema } from "./database";
import deleteAccountData from "./user/controllers/delete-account-data";
import { getDefaultCookieAttributes } from "./utils/get-default-cookie-attributes";
import { isCloud } from "./utils/is-cloud";
import { isDisposableEmail } from "./utils/is-disposable-email";
import { isLocalSignInPath } from "./utils/is-local-sign-in-path";
import { verifyTurnstile } from "./utils/verify-turnstile";

config();

const isRegistrationDisabled = process.env.DISABLE_REGISTRATION !== "false";
const isPasswordRegistrationDisabled =
  process.env.DISABLE_PASSWORD_REGISTRATION === "true";
const isLoginFormDisabled = process.env.DISABLE_LOGIN_FORM === "true";

const apiUrl = process.env.KANEO_API_URL || "http://localhost:1337";
const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";

const trustedOrigins = [clientUrl];
try {
  const apiOrigin = new URL(apiUrl);
  const apiOriginString = `${apiOrigin.protocol}//${apiOrigin.host}`;
  if (!trustedOrigins.includes(apiOriginString)) {
    trustedOrigins.push(apiOriginString);
  }
} catch {}

const baseURLWithoutPath = (() => {
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return apiUrl.split("/").slice(0, 3).join("/"); // Get protocol://host
  }
})();

if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) {
  console.error(
    "AUTH_SECRET is less than 32 characters, please generate a new one.",
  );
  process.exit(1);
}

function getDeviceAuthClientIds(): Set<string> {
  const raw = process.env.DEVICE_AUTH_CLIENT_IDS?.trim();
  if (raw) {
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  return new Set(["kaneo-cli", "kaneo-mcp"]);
}

const DEFAULT_TRUSTED_PROXIES = [
  "127.0.0.0/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

function trustedProxies(): string[] {
  const raw = process.env.TRUSTED_PROXIES?.trim();
  if (!raw) {
    return DEFAULT_TRUSTED_PROXIES;
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getDeviceAuthVerificationUri(): string {
  const base = clientUrl.replace(/\/$/, "");
  return `${base}/device`;
}

export const auth = betterAuth({
  baseURL: baseURLWithoutPath,
  trustedOrigins,
  secret: process.env.AUTH_SECRET || "",
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.userTable,
      account: schema.accountTable,
      session: schema.sessionTable,
      verification: schema.verificationTable,
      team: schema.teamTable,
      teamMember: schema.teamMemberTable,
      apikey: schema.apikeyTable,
      deviceCode: schema.deviceCodeTable,
    },
  }),
  user: {
    additionalFields: {
      locale: {
        type: "string",
        input: true,
        required: false,
      },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await deleteAccountData(user.id);
      },
    },
  },
  account: {
    accountLinking: {
      // Link an OAuth/OIDC sign-in to an existing account that shares the same
      // email instead of failing with error=account_not_linked. The listed
      // providers verify the email on their side, so they are trusted to link.
      enabled: true,
      trustedProviders: ["github", "google", "discord", "custom"],
      // Only link to an existing local account after its email has been
      // verified. Without this check, an attacker could pre-register a victim's
      // email with a password account and retain access after the victim signs
      // in through a trusted OAuth/OIDC provider.
      requireLocalEmailVerified: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  plugins: [
    lastLoginMethod(),
    username(),
    bearer(),
    apiKey({
      enableSessionForAPIKeys: true,
      enableMetadata: true,
      apiKeyHeaders: "x-api-key",
      rateLimit: {
        enabled: true,
        maxRequests: 100,
        timeWindow: 60 * 1000,
      },
    }),
    deviceAuthorization({
      verificationUri: getDeviceAuthVerificationUri(),
      validateClient: async (clientId) =>
        getDeviceAuthClientIds().has(clientId),
    }),
    adminPlugin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    openAPI(),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  rateLimit: {
    // Enable in cloud; self-hosted instances opt in by setting KANEO_CLOUD.
    // Default better-auth rate-limit only kicks in for production; we keep the
    // global limits conservative and tighten signup/invite via customRules.
    enabled: isCloud(),
    window: 10,
    max: 100,
    customRules: {
      "/sign-up/email": { window: 60, max: 3 },
      "/team/members": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    apikey: {
      create: {
        before: async (apiKey: { metadata?: unknown }) => {
          // The `human` value is reserved for the `required_role` column. It
          // is NOT an agent role and must never be stored as the agent role on
          // an API key (see HUMAN_REQUIRED_ROLE in @kaneo/permissions).
          const metadata = apiKey?.metadata;
          if (
            metadata &&
            typeof metadata === "object" &&
            "agentRole" in metadata &&
            (metadata as Record<string, unknown>).agentRole === "human"
          ) {
            throw new APIError("BAD_REQUEST", {
              message:
                '"human" is a required_role marker, not an agent role. Use one of: coding, product-design, architecture-design, devops, ui-design, testing, code-review.',
            });
          }
        },
      },
    },
    user: {
      create: {
        before: async () => {
          // Allow the very first signup through even when registration
          // is disabled: that's the instance-admin bootstrap flow.
          // Otherwise a fresh instance with DISABLE_REGISTRATION=true
          // could never be set up because `checkRegistrationAllowed`
          // would reject the first user (qodo bot #3).
          const [userCountRow] = await db
            .select({ value: count() })
            .from(schema.userTable);
          const existingUserCount = userCountRow?.value ?? 0;
          if (existingUserCount === 0) {
            return;
          }

          // Registration is disabled by default (users are added by an admin).
          // Only the very first signup (instance-admin bootstrap) is allowed
          // through when DISABLE_REGISTRATION is not explicitly set to false.
          if (isRegistrationDisabled) {
            throw new APIError("FORBIDDEN", {
              message:
                "Registration is currently disabled. Please ask an administrator to create your account.",
            });
          }
        },
        after: async (user) => {
          // Promote the first user to instance admin atomically.
          //
          // A previous version of this code checked the user count in
          // the `before` hook and returned `role: "admin"`, but the
          // count and the eventual INSERT happened in separate
          // transactions, so two concurrent first-signups could both
          // see count=0 and both become admins (qodo bot #5).
          //
          // We now run the check + promote inside a single transaction
          // guarded by a Postgres advisory lock. Whichever transaction
          // wins the lock first promotes its user; any concurrent
          // transaction then sees totalUserCount > 1 and skips.
          //
          // Note: we count total users (not admins) so that upgrading
          // an existing instance (where every existing user has
          // role=NULL from the new column) doesn't promote the next
          // signup to admin (qodo bot #4).
          await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(2026)`);

            const totalRows = await tx
              .select({ value: count() })
              .from(schema.userTable);
            const totalUserCount = totalRows[0]?.value ?? 0;

            // This hook runs after the user row is inserted, so the
            // just-created user is included in the count. If they are
            // the only row in the table, this is a fresh-instance
            // bootstrap and they get promoted to admin.
            if (totalUserCount === 1) {
              await tx
                .update(schema.userTable)
                .set({ role: "admin" })
                .where(eq(schema.userTable.id, user.id));
            }
          });
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (isLoginFormDisabled && isLocalSignInPath(ctx.path)) {
        throw new APIError("FORBIDDEN", {
          message:
            "Local sign-in is disabled. Please use a configured social or OIDC sign-in method.",
        });
      }

      // Block team-member add calls on cloud from anonymous users or to
      // disposable-email addresses.
      if (ctx.path === "/team/members" && isCloud()) {
        // `before` hooks don't auto-populate ctx.context.session; load it
        // explicitly. `disableRefresh` keeps this gate cheap: we only need
        // the user record, not a session refresh side-effect.
        const session = await getSessionFromCtx(ctx, {
          disableRefresh: true,
        }).catch(() => null);
        const sessionUser = session?.user as
          | { isAnonymous?: boolean | null }
          | undefined;
        if (sessionUser?.isAnonymous) {
          throw new APIError("FORBIDDEN", {
            message: "Guest accounts may not add team members.",
          });
        }
        const inviteeEmail = (ctx.body?.email as string | undefined) ?? "";
        if (inviteeEmail && isDisposableEmail(inviteeEmail)) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Invitations to disposable-email addresses are not allowed.",
          });
        }
      }

      const isSignUpPath =
        ctx.path === "/sign-up/email" ||
        ctx.path.startsWith("/callback/") ||
        ctx.path.startsWith("/sign-in/social");

      if (!isSignUpPath) {
        return;
      }

      const userCountRows = await db
        .select({ value: count() })
        .from(schema.userTable);
      const existingUserCount = userCountRows[0]?.value ?? 0;
      const isInstanceAdminSetup = existingUserCount === 0;

      if (ctx.path === "/sign-up/email") {
        if (isPasswordRegistrationDisabled && !isInstanceAdminSetup) {
          throw new APIError("FORBIDDEN", {
            message:
              "Password registration is currently disabled. Please use a configured social or OIDC sign-in method.",
          });
        }

        // Cloud-only abuse gates on password signup. Self-hosted instances
        // leave KANEO_CLOUD/TURNSTILE_SECRET_KEY unset and skip both.
        if (isCloud() && !isInstanceAdminSetup) {
          const signupEmail = (ctx.body?.email as string | undefined) ?? "";
          if (signupEmail && isDisposableEmail(signupEmail)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Sign-up with disposable email addresses is not allowed.",
            });
          }

          const turnstileToken =
            (ctx.body?.turnstileToken as string | undefined) ??
            ctx.headers?.get("x-turnstile-token") ??
            null;
          const remoteIp =
            ctx.headers?.get("cf-connecting-ip") ??
            ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null;
          const verdict = await verifyTurnstile(turnstileToken, remoteIp);
          if (!verdict.ok) {
            throw new APIError("FORBIDDEN", { message: verdict.reason });
          }
        }
      }

      if (!isRegistrationDisabled || isInstanceAdminSetup) {
        return;
      }

      // Registration is disabled by default; only the instance-admin bootstrap
      // signup (first user) is allowed through. All other signups are blocked.
      throw new APIError("FORBIDDEN", {
        message:
          "Registration is currently disabled. Please ask an administrator to create your account.",
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up") || ctx.path.startsWith("/sign-in")) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          const teamMembership = await db
            .select({ teamId: schema.teamMemberTable.teamId })
            .from(schema.teamMemberTable)
            .where(eq(schema.teamMemberTable.userId, newSession.user.id))
            .orderBy(schema.teamMemberTable.joinedAt)
            .limit(1);

          const activeTeamId = teamMembership[0]?.teamId || null;

          if (activeTeamId) {
            await db
              .update(schema.sessionTable)
              .set({ activeTeamId })
              .where(eq(schema.sessionTable.id, newSession.session.id));
          }
        }
      }
    }),
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      trustedProxies: trustedProxies(),
    },
    defaultCookieAttributes: getDefaultCookieAttributes({
      apiUrl,
      clientUrl,
      cookieDomain: process.env.COOKIE_DOMAIN,
    }),
  },
});
