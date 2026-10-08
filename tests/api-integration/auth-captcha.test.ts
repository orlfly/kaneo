import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";
import { createTeamMember } from "./helpers/fixtures";

const endpoints = [
  [
    "/sign-up/email",
    {
      name: "User",
      email: "captcha@example.com",
      password: "long-test-password",
    },
  ],
  [
    "/sign-in/social",
    { provider: "github", callbackURL: "http://localhost:5173/dashboard" },
  ],
] as const;

function post(path: string, body: unknown, token?: string) {
  return createApp().app.request(`/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: "http://localhost:5173",
      ...(token ? { "x-turnstile-token": token } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("server-side auth CAPTCHA enforcement", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await createTeamMember();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-only-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(endpoints)("rejects token-free calls to %s", async (path, body) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await post(path, body)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await db.select().from(schema.userTable)).toHaveLength(1);
    expect(await db.select().from(schema.verificationTable)).toHaveLength(0);
  });

  it.each(endpoints)(
    "verifies before any account/mail/provider action at %s",
    async (path, body) => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ success: false })),
      );
      vi.stubGlobal("fetch", fetchMock);
      expect((await post(path, body, "invalid-token")).status).toBe(403);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
      expect(await db.select().from(schema.userTable)).toHaveLength(1);
      expect(await db.select().from(schema.verificationTable)).toHaveLength(0);
    },
  );

  it("permits one verified password sign-up and rejects a replay response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            hostname: "localhost",
            action: "auth",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["timeout-or-duplicate"],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (
        await post(
          "/sign-up/email",
          {
            name: "User",
            email: "captcha@example.com",
            password: "long-test-password",
          },
          "single-use-token",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          "/sign-up/email",
          {
            name: "User",
            email: "captcha@example.com",
            password: "long-test-password",
          },
          "single-use-token",
        )
      ).status,
    ).toBe(403);
    expect(await db.select().from(schema.userTable)).toHaveLength(2);
  });

  it("does not exempt password bootstrap from configured CAPTCHA", async () => {
    await resetTestDatabase();
    expect((await post("/sign-up/email", endpoints[0][1])).status).toBe(403);
    expect(await db.select().from(schema.userTable)).toHaveLength(0);
  });

  it("does not redeem a second token at an OAuth callback", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await createApp().app.request(
      "/api/auth/callback/github?code=invalid&state=invalid",
    );
    expect(response.status).not.toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await db.select().from(schema.userTable)).toHaveLength(1);
  });
});
