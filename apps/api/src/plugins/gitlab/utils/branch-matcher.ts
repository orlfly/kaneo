import type { GitHubConfig } from "../../github/config";
import {
  extractTaskNumber,
  extractTaskNumberFromBranch,
  extractTaskNumberFromPRBody,
  extractTaskNumberFromPRTitle,
  generateBranchName,
} from "../../github/utils/branch-matcher";
import type { GitLabConfig } from "../config";

function asBranchConfig(config: GitLabConfig): GitHubConfig {
  return config as unknown as GitHubConfig;
}

export {
  extractTaskNumberFromPRBody,
  extractTaskNumberFromPRTitle,
  generateBranchName,
};

export function extractTaskNumberFromBranchGitLab(
  branchName: string,
  config: GitLabConfig,
  projectSlug: string,
): number | null {
  return extractTaskNumberFromBranch(
    branchName,
    asBranchConfig(config),
    projectSlug,
  );
}

export function extractTaskNumberGitLab(
  branchName: string,
  prTitle: string | undefined,
  prBody: string | undefined,
  config: GitLabConfig,
  projectSlug: string,
): number | null {
  return extractTaskNumber(
    branchName,
    prTitle,
    prBody,
    asBranchConfig(config),
    projectSlug,
  );
}
