import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ProjectContextBundle,
  readContextManifest,
  renderContextDoc,
  writeContextManifest,
} from "../../../apps/api/src/agent/context";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "kaneo-context-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const manifest = {
  projectId: "p1",
  projectName: "Demo",
  teamName: "Team",
  vcs: { type: "github", repository: "owner/repo" },
  syncedAt: "2026-01-01T00:00:00.000Z",
  headSha: "abc123",
};

describe("readContextManifest", () => {
  it("returns null when the manifest is missing", () => {
    expect(readContextManifest(root)).toBeNull();
  });

  it("returns null when the manifest is unparsable", async () => {
    await writeFile(path.join(root, "kaneo-context.json"), "{not json");
    expect(readContextManifest(root)).toBeNull();
  });

  it("returns null when the manifest lacks a projectId", async () => {
    await writeFile(path.join(root, "kaneo-context.json"), "{}");
    expect(readContextManifest(root)).toBeNull();
  });

  it("round-trips a written manifest", async () => {
    writeContextManifest(root, manifest);
    expect(readContextManifest(root)).toEqual(manifest);
  });
});

const bundle: ProjectContextBundle = {
  project: {
    id: "p1",
    name: "Demo",
    slug: "demo",
    description: "A demo project",
    teamName: "Team",
  },
  statuses: ["to-do", "in-progress", "done"],
  taskSummary: { total: 10, byStatus: { "to-do": 7, done: 3 }, overdue: 2 },
  vcs: { connected: true, type: "github", repository: "owner/repo" },
  checkedAt: "2026-01-01T00:00:00.000Z",
};

describe("renderContextDoc", () => {
  it("renders project basics, summary, and statuses", () => {
    const doc = renderContextDoc(bundle);
    expect(doc).toContain("# Kaneo Project Context");
    expect(doc).toContain("Demo");
    expect(doc).toContain("Team");
    expect(doc).toContain("github — owner/repo");
    expect(doc).toContain("Total tasks: 10");
    expect(doc).toContain("Overdue: 2");
    expect(doc).toContain("to-do: 7");
    expect(doc).toContain("- to-do");
    expect(doc).toContain("agent_sync_project");
  });

  it("renders a not-connected VCS line", () => {
    const doc = renderContextDoc({
      ...bundle,
      vcs: { connected: false },
    });
    expect(doc).toContain("not connected");
  });

  it("omits the description line when empty", () => {
    const doc = renderContextDoc({
      ...bundle,
      project: { ...bundle.project, description: "" },
    });
    expect(doc).not.toContain("Description:");
  });
});

describe("writeContextManifest", () => {
  it("writes valid JSON to disk", async () => {
    writeContextManifest(root, manifest);
    const raw = await readFile(path.join(root, "kaneo-context.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(manifest);
  });
});
