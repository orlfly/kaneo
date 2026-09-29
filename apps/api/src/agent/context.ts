import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { ResolvedVcsIntegration } from "../vcs/resolve";
import { authFor, cloneUrl } from "./git";

export const CONTEXT_MANIFEST_FILE = "kaneo-context.json";
export const CONTEXT_DOC_FILE = "KANEO_CONTEXT.md";
export const REPO_DIR = "repo";

export type ContextManifest = {
  projectId: string;
  projectName: string;
  teamName: string;
  vcs: { type: string; repository: string } | null;
  syncedAt: string;
  headSha?: string;
};

/**
 * A whitelisted snapshot of the project context embedded in the sync tool
 * response and rendered into KANEO_CONTEXT.md. Never carries credentials.
 */
export type ProjectContextBundle = {
  project: {
    id: string;
    name: string;
    slug: string;
    description: string;
    teamName: string;
  };
  statuses: string[];
  taskSummary: {
    total: number;
    byStatus: Record<string, number>;
    overdue: number;
  };
  vcs: { connected: boolean; type?: string; repository?: string };
  task?: Record<string, unknown>;
  checkedAt: string;
};

/** Read the workdir manifest; null when missing or unparsable. */
export function readContextManifest(root: string): ContextManifest | null {
  try {
    const raw = fs.readFileSync(path.join(root, CONTEXT_MANIFEST_FILE), "utf8");
    const parsed = JSON.parse(raw) as ContextManifest;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.projectId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeContextManifest(
  root: string,
  manifest: ContextManifest,
): void {
  fs.writeFileSync(
    path.join(root, CONTEXT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

export function renderContextDoc(bundle: ProjectContextBundle): string {
  const vcsLine = bundle.vcs.connected
    ? `- VCS: ${bundle.vcs.type} — ${bundle.vcs.repository}`
    : "- VCS: not connected";
  const byStatus = Object.entries(bundle.taskSummary.byStatus)
    .map(([status, n]) => `  - ${status}: ${n}`)
    .join("\n");
  return `# Kaneo Project Context

- Project: ${bundle.project.name} (\`${bundle.project.id}\`)
- Team: ${bundle.project.teamName}
${bundle.project.description ? `- Description: ${bundle.project.description}\n` : ""}${vcsLine}
- Synced at: ${bundle.checkedAt}

## Task summary

- Total tasks: ${bundle.taskSummary.total}
- Overdue: ${bundle.taskSummary.overdue}
${byStatus ? `- By status:\n${byStatus}\n` : ""}
## Columns

${bundle.statuses.map((s) => `- ${s}`).join("\n") || "- (none)"}

Refresh this context by calling the \`agent_sync_project\` tool.
`;
}

export function writeContextDoc(
  root: string,
  bundle: ProjectContextBundle,
): void {
  fs.writeFileSync(
    path.join(root, CONTEXT_DOC_FILE),
    renderContextDoc(bundle),
    "utf8",
  );
}

/** Current HEAD commit SHA of the clone, or null when unavailable. */
export async function repoHeadSha(repoDir: string): Promise<string | null> {
  try {
    const commits = await git.log({ fs, dir: repoDir, depth: 1 });
    return commits[0]?.oid ?? null;
  } catch {
    return null;
  }
}

/**
 * Remote head SHA of the clone's default branch, or null when it cannot be
 * determined (offline, bad URL, etc.). Best-effort by design: the caller
 * falls back to a fast-forward pull, which is idempotent.
 */
export async function remoteHeadSha(
  integration: ResolvedVcsIntegration,
): Promise<string | null> {
  try {
    const info = await git.getRemoteInfo({
      http,
      url: cloneUrl(integration),
      onAuth: authFor(integration),
    });
    const heads = info.refs?.heads as Record<string, string> | undefined;
    if (!heads) return null;
    // Prefer a conventional default branch, then fall back to any head.
    const branch =
      heads.main !== undefined
        ? "main"
        : heads.master !== undefined
          ? "master"
          : null;
    return (
      (branch ? heads[branch] : undefined) ?? Object.values(heads)[0] ?? null
    );
  } catch {
    return null;
  }
}
