import { count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";
import { createTeamMember } from "./helpers/fixtures";

/**
 * Registration is disabled by default (DISABLE_REGISTRATION unset). The global
 * auth before-hook must gate only /sign-up/email: OAuth callbacks and
 * /sign-in/social drive sign-in or account linking for existing users and must
 * not be rejected with the registration message. Actual user creation reached
 * through an OAuth callback (or password sign-up) is still blocked by the
 * user.create.before hook, which keeps the first-user bootstrap exception.
 *
 * The registration flag is read from process.env at module load, so the
 * "gate active" assertions below reset the module registry and re-import the
 * app with DISABLE_REGISTRATION explicitly set.
 */

function request(
  app: { request: (p: string, i?: RequestInit) => Promise<Response> },
  path: string,
  init: RequestInit = {},
) {
  return app.request(`/api/auth${path}`, {
    headers: {
      "content-type": "application/json",
      Origin: "http://localhost:5173",
      ...init.headers,
    },
    ...init,
  });
}

describe("registration gate scopes to sign-up/email only", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await createTeamMember();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not block /callback/github GET with the registration gate", async () => {
    // Emulate the fork default (registration disabled): setup.ts forces
    // "false" for the whole suite, which would silence the gate and make this
    // assertion vacuous without the stub.
    vi.stubEnv("DISABLE_REGISTRATION", "");
    vi.resetModules();
    const { createApp } = await import("../../apps/api/src/index");
    const res = await request(
      createApp().app,
      "/callback/github?code=abc&state=xyz",
      { method: "GET" },
    );
    // Fails downstream on state validation by design; the registration
    // message must never surface on callback paths.
    expect(await res.text()).not.toContain(
      "Registration is currently disabled",
    );
  });

  it("does not block /sign-in/social POST with the registration gate", async () => {
    vi.stubEnv("DISABLE_REGISTRATION", "");
    vi.resetModules();
    const { createApp } = await import("../../apps/api/src/index");
    const res = await request(createApp().app, "/sign-in/social", {
      method: "POST",
      body: JSON.stringify({
        provider: "github",
        callbackURL: "http://localhost:5173/dashboard",
      }),
    });
    // Without SSO env in the test harness this errors as "provider not
    // found"/redirect shape; either way the registration message must not
    // appear.
    expect(await res.text()).not.toContain(
      "Registration is currently disabled",
    );
  });

  it.each(["unset", "true"] as const)(
    "blocks password sign-up with users present when DISABLE_REGISTRATION is %s",
    async (mode) => {
      if (mode === "true") vi.stubEnv("DISABLE_REGISTRATION", "true");
      // With "unset" we emulate the default fork semantics explicitly rather
      // than relying on the integration setup.ts forcing "false".
      if (mode === "unset") vi.stubEnv("DISABLE_REGISTRATION", "");

      vi.resetModules();
      const { createApp } = await import("../../apps/api/src/index");
      const res = await request(createApp().app, "/sign-up/email", {
        method: "POST",
        body: JSON.stringify({
          name: "Latecomer",
          email: `late-${mode}@example.com`,
          password: "long-test-password",
        }),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        message: expect.stringContaining("Registration is currently disabled"),
      });
      const users = await db
        .select()
        .from(schema.userTable)
        .where(eq(schema.userTable.name, "Latecomer"));
      expect(users).toHaveLength(0);
    },
  );

  it("allows the first-user bootstrap signup when DISABLE_REGISTRATION is unset", async () => {
    // The gate's sole exception: an empty instance (no registered users) must
    // be settable with registration disabled, otherwise a fresh deployment
    // could never create its instance admin (qodo bot #3). The suite's
    // beforeEach installs a fixture team member, so clear users first to
    // emulate the truly fresh instance this test models.
    await db.delete(schema.userTable);
    vi.stubEnv("DISABLE_REGISTRATION", "");
    vi.resetModules();
    const { createApp } = await import("../../apps/api/src/index");
    const res = await request(createApp().app, "/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        name: "Bootstrap Admin",
        email: "bootstrap@example.com",
        password: "long-test-password",
      }),
    });
    expect(res.status).toBe(200);
    const users = await db
      .select()
      .from(schema.userTable)
      .where(eq(schema.userTable.name, "Bootstrap Admin"));
    expect(users).toHaveLength(1);
  });

  it("user.create.before hook keeps the bootstrap exception and blocks later creations", async () => {
    // The HTTP-level tests above exercise the before-middleware gate; this
    // test drives the databaseHooks.user.create.before hook directly because
    // its rejection branch is only reachable on creation paths that bypass
    // /sign-up/email (OAuth identity creation). Exercise both branches:
    // empty instance (bootstrap allowed) and existing users (FORBIDDEN).
    vi.stubEnv("DISABLE_REGISTRATION", "");
    vi.resetModules();
    const { auth } = await import("../../apps/api/src/auth");
    const opts = (
      auth as unknown as {
        options: {
          databaseHooks: {
            user: {
              create: { before: (u: unknown, c: unknown) => Promise<void> };
            };
          };
        };
      }
    ).options;
    const hook = opts.databaseHooks.user.create.before;
    expect(typeof hook).toBe("function");

    // Empty instance: the instance-admin bootstrap signup must pass.
    await db.delete(schema.userTable);
    const zero = await db.select({ value: count() }).from(schema.userTable);
    expect(Number(zero[0]?.value ?? 0)).toBe(0);
    await expect(hook({}, {})).resolves.toBeUndefined();

    // Users present + registration disabled: creation must be rejected.
    await db.insert(schema.userTable).values({
      id: "hook-probe",
      email: "hook-probe@example.com",
      name: "HookProbe",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(hook({}, {})).rejects.toThrow(
      /Registration is currently disabled/,
    );
    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, "hook-probe"));
  });
});
