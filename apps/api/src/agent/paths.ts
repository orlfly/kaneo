import { mkdir } from "node:fs/promises";
import path from "node:path";

// Default workspace root. In dev the API runs from apps/api and Dockerfile
// creates `/app/apps/api/data`; workdir root lives under `<data>/agent-workdir`.
// An admin can override it via chat_config.workdir_root.
export function defaultWorkdirRoot(): string {
  return path.resolve(process.cwd(), "data/agent-workdir");
}

// Root of all project working directories. Reads chat_config.workdir_root;
// callers that need the config value resolve it before calling here.
export function projectWorkdir(workdirRoot: string, projectId: string): string {
  return path.join(workdirRoot, `agent-${projectId}`);
}

/**
 * Resolve a caller-supplied relative path inside a project working directory
 * and reject anything that escapes it. This is the single path-sandbox choke
 * point used by every file tool, so no tool ever joins a user path directly.
 *
 * Returns the absolute path when safe; throws when the path escapes the root.
 */
export function resolveInProject(projectRoot: string, relPath: string): string {
  const normalizedRel = relPath || ".";
  const resolved = path.resolve(projectRoot, normalizedRel);
  const relative = path.relative(projectRoot, resolved);
  if (relative === "") {
    return resolved;
  }
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Path escapes the agent working directory");
  }
  return resolved;
}

/** Ensure a project working directory exists, creating it recursively. */
export async function ensureProjectWorkdir(projectRoot: string): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
}
