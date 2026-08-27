import { describe, expect, it } from "vitest";
import {
  defaultWorkdirRoot,
  projectWorkdir,
  resolveInProject,
} from "../../../apps/api/src/agent/paths";

describe("agent path sandbox", () => {
  it("defaultWorkdirRoot points under a data/agent-workdir", () => {
    expect(defaultWorkdirRoot()).toContain("data/agent-workdir");
  });

  it("projectWorkdir isolates per project", () => {
    const p = projectWorkdir("/work", "proj-1");
    expect(p).toBe("/work/agent-proj-1");
  });

  it("resolveInProject keeps a safe relative path", () => {
    expect(resolveInProject("/work/agent-p1", "repo/src/a.ts")).toBe(
      "/work/agent-p1/repo/src/a.ts",
    );
  });

  it("resolveInProject rejects parent traversal", () => {
    expect(() => resolveInProject("/work/agent-p1", "../secret")).toThrow(
      /escapes/,
    );
    expect(() =>
      resolveInProject("/work/agent-p1", "../../etc/passwd"),
    ).toThrow(/escapes/);
  });

  it("resolveInProject rejects absolute paths", () => {
    expect(() => resolveInProject("/work/agent-p1", "/etc/passwd")).toThrow(
      /escapes/,
    );
  });

  it("resolveInProject allows subdirectory traversal within root", () => {
    expect(resolveInProject("/work/agent-p1", "repo/sub/file.txt")).toBe(
      "/work/agent-p1/repo/sub/file.txt",
    );
  });
});
