import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/index";

describe("API integration: openapi", () => {
  it("serves a merged OpenAPI document", async () => {
    const { app } = createApp();

    const response = await app.request("/api/openapi");

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      openapi: string;
      info?: { title?: string };
      paths?: Record<string, unknown>;
      components?: {
        securitySchemes?: Record<string, unknown>;
      };
    };

    expect(payload.openapi).toBe("3.0.3");
    expect(payload.info?.title).toBe("Kaneo API");
    expect(payload.paths?.["/config"]).toBeTruthy();
    // Chat and team surfaces introduced by the team migration and pi-agent.
    expect(payload.paths?.["/chat/config"]).toBeTruthy();
    expect(payload.paths?.["/chat/status"]).toBeTruthy();
    expect(payload.paths?.["/chat/project/{projectId}"]).toBeTruthy();
    expect(payload.paths?.["/team/active"]).toBeTruthy();
    expect(
      Object.keys(payload.paths || {}).some((path) =>
        path.startsWith("/auth/"),
      ),
    ).toBe(true);
    expect(payload.components?.securitySchemes).toMatchObject({
      bearerAuth: expect.any(Object),
    });
  });
});
