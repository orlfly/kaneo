import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { ResolvedVcsIntegration } from "../vcs/resolve";

const REPO_DIR = "repo";

function cloneUrl(integration: ResolvedVcsIntegration): string {
  if (integration.type === "github") {
    const owner = integration.config.repositoryOwner;
    const name = integration.config.repositoryName;
    return `https://github.com/${owner}/${name}.git`;
  }
  const base = integration.config.baseUrl.replace(/\/+$/, "");
  const owner = integration.config.repositoryOwner;
  const name = integration.config.repositoryName;
  return `${base}/${owner}/${name}.git`;
}

function authFor(integration: ResolvedVcsIntegration) {
  if (integration.type === "github") {
    return () => ({
      username: "x-access-token",
      password: String(integration.config.installationId),
    });
  }
  return () => ({
    username: "oauth2",
    password: integration.config.accessToken,
  });
}

/**
 * Clone the project's connected VCS repository into `<project>/repo`.
 * If a clone already exists, pull instead of re-cloning. Uses isomorphic-git
 * (pure JS) so the production runtime image does not need a git binary.
 */
export async function agentCloneRepo(
  projectRoot: string,
  integration: ResolvedVcsIntegration,
): Promise<{ location: string; branch: string; refreshed: boolean }> {
  const repoDir = path.join(projectRoot, REPO_DIR);

  if (fs.existsSync(path.join(repoDir, ".git"))) {
    await git.pull({
      fs,
      http,
      dir: repoDir,
      onAuth: authFor(integration),
      // A shallow single-branch clone should fast-forward; if it ever needs a
      // merge commit, provide a neutral identity so isomorphic-git does not
      // throw MissingNameError.
      fastForwardOnly: true,
      author: { name: "pi-agent", email: "pi-agent@kaneo.local" },
      committer: { name: "pi-agent", email: "pi-agent@kaneo.local" },
    });
    const branch = await git.currentBranch({ fs, dir: repoDir });
    return { location: REPO_DIR, branch: branch ?? "unknown", refreshed: true };
  }

  await git.clone({
    fs,
    http,
    dir: repoDir,
    url: cloneUrl(integration),
    singleBranch: true,
    depth: 1,
    onAuth: authFor(integration),
  });
  const branch = await git.currentBranch({ fs, dir: repoDir });
  return { location: REPO_DIR, branch: branch ?? "unknown", refreshed: false };
}
