import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  descHasAcceptanceCriteria,
  humanReadableTitleSchema,
  taskDescriptionSchema,
  titleLooksReadable,
} from "../../apps/api/src/schemas";

describe("titleLooksReadable", () => {
  it("rejects branch-name patterns", () => {
    expect(titleLooksReadable("feat/auth")).toBe(false);
    expect(titleLooksReadable("fix/bug-12")).toBe(false);
    expect(titleLooksReadable("feat/oauth-refresh")).toBe(false);
  });

  it("rejects pure ticket ids", () => {
    expect(titleLooksReadable("#123")).toBe(false);
    expect(titleLooksReadable("456")).toBe(false);
    expect(titleLooksReadable("#42")).toBe(false);
  });

  it("rejects SHA-only titles", () => {
    expect(titleLooksReadable("a1b2c3d4")).toBe(false);
    expect(titleLooksReadable("deadbeef")).toBe(false);
    expect(titleLooksReadable("0123456789abcdef")).toBe(false);
  });

  it("rejects too-short titles", () => {
    expect(titleLooksReadable("short")).toBe(false);
    expect(titleLooksReadable("abc")).toBe(false);
  });

  it("accepts plain English titles", () => {
    expect(titleLooksReadable("Refactor OAuth refresh-token handling")).toBe(
      true,
    );
    expect(titleLooksReadable("Fix flaky integration test runner")).toBe(true);
  });
});

describe("descHasAcceptanceCriteria", () => {
  it("matches English header", () => {
    expect(descHasAcceptanceCriteria("## Acceptance Criteria\n- done")).toBe(
      true,
    );
  });

  it("matches Chinese header", () => {
    expect(descHasAcceptanceCriteria("## 验收标准\n- 完成")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(descHasAcceptanceCriteria("acceptance CRITERIA")).toBe(true);
  });

  it("rejects descriptions without AC", () => {
    expect(descHasAcceptanceCriteria("Just a reference to the docs")).toBe(
      false,
    );
  });
});

describe("humanReadableTitleSchema", () => {
  it("rejects a branch-style title", () => {
    const result = v.safeParse(humanReadableTitleSchema, "feat/auth");
    expect(result.success).toBe(false);
  });

  it("accepts a readable title", () => {
    const result = v.safeParse(
      humanReadableTitleSchema,
      "Refactor OAuth refresh-token handling",
    );
    expect(result.success).toBe(true);
  });
});

describe("taskDescriptionSchema", () => {
  it("rejects a description without acceptance criteria", () => {
    const result = v.safeParse(
      taskDescriptionSchema,
      "This is a description that is long enough but it only references the design doc.",
    );
    expect(result.success).toBe(false);
  });

  it("rejects a description shorter than 40 characters even with AC", () => {
    const result = v.safeParse(taskDescriptionSchema, "## Acceptance Criteria");
    expect(result.success).toBe(false);
  });

  it("accepts a complete description with AC", () => {
    const result = v.safeParse(
      taskDescriptionSchema,
      "## Context\nRefactor the OAuth token refresh flow to handle rotation.\n\n## Acceptance Criteria\n- Token rotation is supported\n- Old tokens are revoked",
    );
    expect(result.success).toBe(true);
  });
});
