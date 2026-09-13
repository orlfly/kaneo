import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCallerRole } from "../../../apps/api/src/agent/agents/index";

const verifyMock = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/utils/verify-api-key", () => ({
  verifyApiKey: (raw: string) => verifyMock(raw),
}));

beforeEach(() => {
  verifyMock.mockReset();
});

function makeCtx(authorization?: string, apiKey?: string) {
  return {
    req: {
      header: (name: string) => {
        if (name === "Authorization") return authorization ?? undefined;
        if (name === "x-api-key") return apiKey ?? undefined;
        return undefined;
      },
    },
  } as unknown as Parameters<typeof resolveCallerRole>[0];
}

describe("resolveCallerRole (agent key bound role echo)", () => {
  it("echoes the bound role when metadata declares one", async () => {
    verifyMock.mockResolvedValue({
      valid: true,
      key: { metadata: { agentRole: "ui-design" } },
    });
    expect(await resolveCallerRole(makeCtx("Bearer some-key"))).toBe(
      "ui-design",
    );
  });

  it("returns undefined for a valid key with no role metadata", async () => {
    verifyMock.mockResolvedValue({ valid: true, key: { metadata: null } });
    expect(await resolveCallerRole(makeCtx("Bearer some-key"))).toBeUndefined();
  });

  it("returns undefined for a valid key with non-role metadata", async () => {
    verifyMock.mockResolvedValue({
      valid: true,
      key: { metadata: { name: "x" } },
    });
    expect(await resolveCallerRole(makeCtx("Bearer some-key"))).toBeUndefined();
  });

  it("returns undefined for an invalid key", async () => {
    verifyMock.mockResolvedValue({ valid: false, key: null });
    expect(await resolveCallerRole(makeCtx("Bearer bad"))).toBeUndefined();
  });

  it("returns undefined when no key is provided", async () => {
    expect(await resolveCallerRole(makeCtx())).toBeUndefined();
  });

  it("reads the role from an x-api-key header too", async () => {
    verifyMock.mockResolvedValue({
      valid: true,
      key: { metadata: { agentRole: "devops" } },
    });
    expect(await resolveCallerRole(makeCtx(undefined, "header-key"))).toBe(
      "devops",
    );
  });
});
