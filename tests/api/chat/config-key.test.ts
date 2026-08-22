import { describe, expect, it } from "vitest";
import { shouldKeepExistingKey } from "../../../apps/api/src/chat/config";

describe("shouldKeepExistingKey", () => {
  it("preserves the stored key when the UI echoes the mask placeholder", () => {
    expect(shouldKeepExistingKey("********")).toBe(true);
  });

  it("preserves the stored key on empty input", () => {
    expect(shouldKeepExistingKey("")).toBe(true);
  });

  it("does not preserve on whitespace (caller trims before passing)", () => {
    expect(shouldKeepExistingKey("   ")).toBe(false);
  });

  it("replaces the key when a real secret is provided", () => {
    expect(shouldKeepExistingKey("sk-real-abc")).toBe(false);
  });

  it("treats longer masked-like strings as real keys (only exact mask preserved)", () => {
    expect(shouldKeepExistingKey("**********")).toBe(false);
    expect(shouldKeepExistingKey("***")).toBe(false);
  });
});
