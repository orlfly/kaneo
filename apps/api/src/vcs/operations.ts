import { HTTPException } from "hono/http-exception";
import { createGiteaClient } from "../plugins/gitea/utils/gitea-api";
import { getRepoOctokit } from "../plugins/github/utils/github-app";
import { createGitLabClient } from "../plugins/gitlab/utils/gitlab-api";
import type { ResolvedVcsIntegration } from "./resolve";

export type VcsIssueState = "open" | "closed" | "all";

export type VcsIssueInput = {
  title: string;
  body?: string | null;
  closed?: boolean;
};

export type VcsIssueUpdate = {
  title?: string;
  body?: string | null;
  state?: "open" | "closed";
};

export type VcsLabelInput = {
  name: string;
  color: string;
};

/**
 * Dispatch a VCS operation to the appropriate client for the resolved
 * integration. GitHub uses the App installation octokit (or a personal access
 * token when configured); GitLab and Gitea use their existing clients (which
 * enforce the SSRF guard and timeouts).
 */
async function getGithubOctokit(
  integration: Extract<ResolvedVcsIntegration, { type: "github" }>,
) {
  const octokit = await getRepoOctokit(integration.config);
  if (!octokit) {
    throw new HTTPException(500, {
      message:
        "GitHub integration requires a personal access token or a configured GitHub App",
    });
  }
  return octokit;
}

export async function vcsListRepositories(integration: ResolvedVcsIntegration) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    // A personal access token cannot enumerate App installations: list the
    // token owner's own repositories instead.
    if (integration.config.accessToken) {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        per_page: 100,
      });
      return data.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        owner: { login: repo.owner.login },
        html_url: repo.html_url,
      }));
    }
    const { data } =
      await octokit.rest.apps.listReposAccessibleToInstallation();
    return data.repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      owner: { login: repo.owner.login },
      html_url: repo.html_url,
    }));
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  const repos = await client.listUserRepos();
  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    private: repo.private,
    owner: { login: repo.owner.login ?? repo.owner.username ?? "" },
    html_url: repo.html_url,
  }));
}

export async function vcsListIssues(
  integration: ResolvedVcsIntegration,
  state: VcsIssueState = "open",
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      state,
      per_page: 100,
    });
    return issues.filter((issue) => !issue.pull_request);
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  const issues = await client.listIssues(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    1,
    state,
  );
  return issues;
}

export async function vcsGetIssue(
  integration: ResolvedVcsIntegration,
  number: number,
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: issue } = await octokit.rest.issues.get({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      issue_number: number,
    });
    return issue;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.getIssue(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    number,
  );
}

export async function vcsListIssueComments(
  integration: ResolvedVcsIntegration,
  number: number,
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: comments } = await octokit.rest.issues.listComments({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      issue_number: number,
      per_page: 100,
    });
    return comments;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.listIssueComments(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    number,
    1,
    100,
  );
}

export async function vcsListPullRequests(integration: ResolvedVcsIntegration) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: pulls } = await octokit.rest.pulls.list({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      state: "open",
      per_page: 100,
    });
    return pulls;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.listPulls(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    1,
  );
}

export async function vcsListLabels(integration: ResolvedVcsIntegration) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: labels } = await octokit.rest.issues.listLabelsForRepo({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      per_page: 100,
    });
    return labels;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.listLabels(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
  );
}

export async function vcsCreateIssue(
  integration: ResolvedVcsIntegration,
  input: VcsIssueInput,
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: issue } = await octokit.rest.issues.create({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      title: input.title,
      ...(input.body != null ? { body: input.body } : {}),
    });
    return issue;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.createIssue(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    { title: input.title, body: input.body, closed: input.closed },
  );
}

export async function vcsUpdateIssue(
  integration: ResolvedVcsIntegration,
  number: number,
  update: VcsIssueUpdate,
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: issue } = await octokit.rest.issues.update({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      issue_number: number,
      ...(update.title != null ? { title: update.title } : {}),
      ...(update.body != null ? { body: update.body } : {}),
      ...(update.state != null ? { state: update.state } : {}),
    });
    return issue;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.updateIssue(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    number,
    {
      ...(update.title != null ? { title: update.title } : {}),
      ...(update.body != null ? { description: update.body } : {}),
      ...(update.state != null ? { state: update.state } : {}),
    },
  );
}

export async function vcsCreateIssueComment(
  integration: ResolvedVcsIntegration,
  number: number,
  body: string,
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: comment } = await octokit.rest.issues.createComment({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      issue_number: number,
      body,
    });
    return comment;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.createIssueComment(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    number,
    body,
  );
}

export async function vcsCreateLabel(
  integration: ResolvedVcsIntegration,
  input: VcsLabelInput,
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: label } = await octokit.rest.issues.createLabel({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      name: input.name,
      color: input.color.replace(/^#/, ""),
    });
    return label;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  return client.createLabel(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    input.name,
    input.color,
  );
}

export async function vcsAddLabelsToIssue(
  integration: ResolvedVcsIntegration,
  number: number,
  labelIds: number[],
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: issue } = await octokit.rest.issues.addLabels({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      issue_number: number,
      labels: labelIds.map(String),
    });
    return issue;
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  await client.addLabelsToIssue(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    number,
    labelIds,
  );
  return { success: true };
}

export async function vcsReplaceIssueLabels(
  integration: ResolvedVcsIntegration,
  number: number,
  labelIds: number[],
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    const { data: issue } = await octokit.rest.issues.setLabels({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      issue_number: number,
      labels: labelIds.map(String),
    });
    return issue;
  }

  if (integration.type === "gitea") {
    const client = createGiteaClient(integration.config);
    await client.replaceIssueLabels(
      integration.config.repositoryOwner,
      integration.config.repositoryName,
      number,
      labelIds,
    );
    return { success: true };
  }

  // GitLab has no replace-labels endpoint; apply the full set via update.
  const client = createGitLabClient(integration.config);
  const nameToId = new Map(
    (
      await client.listLabels(
        integration.config.repositoryOwner,
        integration.config.repositoryName,
      )
    ).map((label) => [label.name, label.id]),
  );
  const wanted = labelIds
    .map((id) => [...nameToId.entries()].find(([, v]) => v === id)?.[0])
    .filter((name): name is string => Boolean(name));
  await client.updateIssue(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    number,
    { labels: wanted.join(",") },
  );
  return { success: true };
}

export async function vcsRemoveLabelFromIssue(
  integration: ResolvedVcsIntegration,
  number: number,
  labelId: number,
) {
  if (integration.type === "github") {
    const octokit = await getGithubOctokit(integration);
    await octokit.rest.issues.removeLabel({
      owner: integration.config.repositoryOwner,
      repo: integration.config.repositoryName,
      issue_number: number,
      name: String(labelId),
    });
    return { success: true };
  }

  const client =
    integration.type === "gitlab"
      ? createGitLabClient(integration.config)
      : createGiteaClient(integration.config);
  await client.removeLabelFromIssue(
    integration.config.repositoryOwner,
    integration.config.repositoryName,
    number,
    labelId,
  );
  return { success: true };
}

export function vcsErrorToHttp(error: unknown): HTTPException {
  if (error instanceof HTTPException) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new HTTPException(500, { message });
}
