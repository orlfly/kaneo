import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createTeamMember } from "./helpers/fixtures";
import { resetTestDatabase } from "./helpers/database";

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

function request(app: { request: (p: string, i?: RequestInit) => Promise<Response> }, path: string, init: RequestInit = {}) {
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
    expect(await res.text()).not.toContain("Registration is currently disabled");
  });

  it("does not block /sign-in/social POST with the registration gate", async () => {
    vi.stubEnv("DISABLE_REGISTRATION", "");
    vi.resetModules();
    const { createApp } = await import("../../apps/api/src/index");
    const res = await request(
      createApp().app,
      "/sign-in/social",
      {
        method: "POST",
        body: JSON.stringify({
          provider: "github",
          callbackURL: "http://localhost:5173/dashboard",
        }),
      },
    );
    // Without SSO env in the test harness this errors as "provider not
    // found"/redirect shape; either way the registration message must not
    // appear.
    expect(await res.text()).not.toContain("Registration is currently disabled");
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
      const res = await request(
        createApp().app,
        "/sign-up/email",
        {
          method: "POST",
          body: JSON.stringify({
            name: "Latecomer",
            email: `late-${mode}@example.com`,
            password: "long-test-password",
          }),
        },
      );
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
});