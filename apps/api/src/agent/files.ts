import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { resolveInProject } from "./paths";

export type AgentListEntry = {
  name: string;
  type: "file" | "directory";
  size: number | null;
};

const DEFAULT_MAX_BYTES = 50 * 1024;
const MAX_LIST_ENTRIES = 500;

/** List a directory inside the project working directory. */
export async function agentListFiles(
  projectRoot: string,
  relPath: string,
): Promise<{ path: string; entries: AgentListEntry[] }> {
  const dir = resolveInProject(projectRoot, relPath);
  const entries = await readdir(dir, { withFileTypes: true });
  const out: AgentListEntry[] = [];
  for (const entry of entries.slice(0, MAX_LIST_ENTRIES)) {
    const full = path.join(dir, entry.name);
    let size: number | null = null;
    if (entry.isFile()) {
      try {
        size = (await stat(full)).size;
      } catch {
        size = null;
      }
    }
    out.push({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      size,
    });
  }
  return { path: path.relative(projectRoot, dir) || ".", entries: out };
}

/**
 * Read a file as text with a byte cap and optional paging.
 * Returns the content, whether it was truncated, and total bytes.
 */
export async function agentReadFile(
  projectRoot: string,
  relPath: string,
  options: { maxBytes?: number; offset?: number; limit?: number } = {},
): Promise<{
  path: string;
  content: string;
  truncated: boolean;
  bytes: number;
}> {
  const file = resolveInProject(projectRoot, relPath);
  const { size } = await stat(file);
  if (size > (options.maxBytes ?? DEFAULT_MAX_BYTES)) {
    return {
      path: relPath,
      content: `File is ${size} bytes (exceeds the ${options.maxBytes ?? DEFAULT_MAX_BYTES}-byte read cap). Use agent_search_files or a smaller offset/limit.`,
      truncated: true,
      bytes: size,
    };
  }
  const buffer = await readFile(file);
  let text = buffer.toString("utf8");
  if (options.offset !== undefined || options.limit !== undefined) {
    const lines = text.split("\n");
    const start = options.offset ?? 0;
    const end =
      options.limit !== undefined ? start + options.limit : lines.length;
    text = lines.slice(start, end).join("\n");
  }
  return { path: relPath, content: text, truncated: false, bytes: size };
}

/** Write a file, creating parent directories as needed. */
export async function agentWriteFile(
  projectRoot: string,
  relPath: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const file = resolveInProject(projectRoot, relPath);
  await mkdir(path.dirname(file), { recursive: true });
  const buffer = Buffer.from(content, "utf8");
  await writeFile(file, buffer);
  return { path: relPath, bytes: buffer.length };
}

// Directories that search/recursion always skips.
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist"]);

/** Recursively collect file paths under root, honoring ignore rules. */
async function walk(
  root: string,
  current: string,
  out: string[],
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        await walk(root, full, out);
      }
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

/**
 * Search by filename fragment and/or content keyword. Returns matching files
 * with line numbers for content matches.
 */
export async function agentSearchFiles(
  projectRoot: string,
  options: { query?: string; content?: string } = {},
): Promise<{
  matches: Array<{ path: string; lines?: number[] }>;
}> {
  const files: string[] = [];
  await walk(projectRoot, projectRoot, files);

  const matches: Array<{ path: string; lines?: number[] }> = [];
  const nameQuery = options.query?.toLowerCase();
  const contentQuery = options.content?.toLowerCase();

  for (const file of files) {
    const rel = path.relative(projectRoot, file);
    const nameMatches = nameQuery
      ? rel.toLowerCase().includes(nameQuery)
      : false;
    if (!nameQuery && !contentQuery) continue;

    if (contentQuery) {
      // Only search text-like files (skip binaries by extension).
      const ext = path.extname(file).toLowerCase();
      if (
        [
          ".png",
          ".jpg",
          ".jpeg",
          ".gif",
          ".webp",
          ".ico",
          ".woff",
          ".woff2",
          ".ttf",
        ].includes(ext)
      ) {
        continue;
      }
      let text = "";
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const lines: number[] = [];
      const lower = text.toLowerCase();
      const lineBreaks = [];
      let pos = text.indexOf("\n");
      while (pos !== -1 && lineBreaks.length < 100000) {
        lineBreaks.push(pos);
        pos = text.indexOf("\n", pos + 1);
      }
      let idx = lower.indexOf(contentQuery);
      let matchesFound = 0;
      while (idx !== -1 && matchesFound < 50) {
        const lineNum = 1 + lineBreaks.filter((b) => b < idx).length;
        lines.push(lineNum);
        matchesFound++;
        idx = lower.indexOf(contentQuery, idx + 1);
      }
      if (lines.length > 0) {
        matches.push({ path: rel, lines });
      }
    } else if (nameMatches) {
      matches.push({ path: rel });
    }
  }

  return { matches: matches.slice(0, 200) };
}

/** Delete a file or empty directory inside the project working directory. */
export async function agentDeleteFile(
  projectRoot: string,
  relPath: string,
): Promise<{ deleted: string }> {
  const target = resolveInProject(projectRoot, relPath);
  await rm(target, { recursive: false, force: false });
  return { deleted: relPath };
}
