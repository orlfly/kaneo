import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentDeleteFile,
  agentListFiles,
  agentReadFile,
  agentSearchFiles,
  agentWriteFile,
} from "../../../apps/api/src/agent/files";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "agent-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("agent file operations", () => {
  it("writes and reads a file", async () => {
    await agentWriteFile(root, "notes.txt", "hello world");
    const read = await agentReadFile(root, "notes.txt");
    expect(read.content).toBe("hello world");
    expect(read.bytes).toBe(11);
  });

  it("write creates parent directories", async () => {
    await agentWriteFile(root, "a/b/c.txt", "x");
    const read = await agentReadFile(root, "a/b/c.txt");
    expect(read.content).toBe("x");
  });

  it("list shows files and directories", async () => {
    await agentWriteFile(root, "f.txt", "hi");
    await mkdir(path.join(root, "sub"));
    const result = await agentListFiles(root, ".");
    const names = result.entries.map((e) => e.name).sort();
    expect(names).toContain("f.txt");
    expect(names).toContain("sub");
    expect(result.entries.find((e) => e.name === "sub")?.type).toBe(
      "directory",
    );
  });

  it("read respects byte cap", async () => {
    await agentWriteFile(root, "big.txt", "x".repeat(100 * 1024));
    const read = await agentReadFile(root, "big.txt", { maxBytes: 1024 });
    expect(read.truncated).toBe(true);
  });

  it("search by content keyword with line numbers", async () => {
    await agentWriteFile(root, "a.js", "const foo = 1;\nconst bar = 2;\n");
    await agentWriteFile(root, "b.js", "nothing here\n");
    const result = await agentSearchFiles(root, { content: "bar" });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].path).toBe("a.js");
    expect(result.matches[0].lines).toContain(2);
  });

  it("search by filename fragment", async () => {
    await agentWriteFile(root, "README.md", "hi");
    const result = await agentSearchFiles(root, { query: "readme" });
    expect(
      result.matches.some((m) => m.path.toLowerCase().includes("readme")),
    ).toBe(true);
  });

  it("delete removes a file", async () => {
    await agentWriteFile(root, "gone.txt", "x");
    await agentDeleteFile(root, "gone.txt");
    await expect(agentReadFile(root, "gone.txt")).rejects.toThrow();
  });

  it("rejects path traversal on write", async () => {
    await expect(agentWriteFile(root, "../escape.txt", "x")).rejects.toThrow(
      /escapes/,
    );
  });

  it("rejects path traversal on read", async () => {
    await expect(agentReadFile(root, "../../etc/passwd")).rejects.toThrow(
      /escapes/,
    );
  });
});
