import { describe, expect, it } from "vitest";
import { checkTeamName } from "../../../apps/api/src/utils/check-team-name";

describe("checkTeamName", () => {
  it("accepts normal workspace names", () => {
    expect(checkTeamName("Acme Inc.").ok).toBe(true);
    expect(checkTeamName("My Team – Project").ok).toBe(true);
    expect(checkTeamName("Crypto Snack").ok).toBe(true);
  });

  it("rejects names with embedded URLs (2026-05-28 phishing pattern)", () => {
    const result = checkTeamName("BANK OPER https://ij5205.craftum.io/page2");
    expect(result.ok).toBe(false);
  });

  it("rejects names longer than 100 characters", () => {
    const result = checkTeamName("a".repeat(101));
    expect(result.ok).toBe(false);
  });

  it("rejects names with HTML / template chars", () => {
    expect(checkTeamName("<!DOCTYPE html><script>").ok).toBe(false);
    expect(checkTeamName("hello {{name}}").ok).toBe(false);
  });

  it("rejects empty / whitespace-only names", () => {
    expect(checkTeamName("").ok).toBe(false);
    expect(checkTeamName("   ").ok).toBe(false);
  });

  it("returns the rejection reason as a string", () => {
    const r = checkTeamName("a".repeat(150));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe("string");
  });
});
