import * as Sentry from "@sentry/node";
import { assertPublicDestination } from "../../../utils/assert-public-destination";
import type { GitLabConfig } from "../config";
import { normalizeGitLabBaseUrl } from "../config";

export type GitLabLabel = {
  id: number;
  name: string;
  color: string;
};

export type GitLabIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels?: GitLabLabel[];
  user?: { login?: string; username?: string; avatar_url?: string } | null;
  pull_request?: unknown;
  updated_at?: string;
};

export type GitLabComment = {
  id: number;
  body: string;
  html_url: string;
  user?: { login?: string; username?: string; avatar_url?: string } | null;
  created_at: string;
};

export type GitLabPullRequest = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  head?: { ref?: string };
  user?: { login?: string; username?: string; avatar_url?: string } | null;
  merged?: boolean;
  merged_at?: string | null;
};

export type GitLabApiErrorKind =
  | "REDIRECT"
  | "INVALID_JSON"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "EMPTY_RESPONSE";

export class GitLabApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: GitLabApiErrorKind,
    public body?: string,
  ) {
    super(message);
    this.name = "GitLabApiError";
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    "PRIVATE-TOKEN": token,
    "Content-Type": "application/json",
  };
}

const GITLAB_FETCH_TIMEOUT_MS = 10_000;

/** A GitLab project is referenced by its URL-encoded full path. */
function encodeProjectPath(owner: string, name: string): string {
  return encodeURIComponent(`${owner}/${name}`);
}

/** Web URL of a GitLab project, used to synthesize stable resource URLs. */
export function gitlabProjectWebUrl(
  baseUrl: string,
  owner: string,
  name: string,
): string {
  return `${normalizeGitLabBaseUrl(baseUrl)}/${owner}/${name}`;
}

export async function gitlabFetch<T>(
  baseUrl: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T | undefined> {
  const root = normalizeGitLabBaseUrl(baseUrl);
  const url = `${root}/api/v4${path.startsWith("/") ? path : `/${path}`}`;

  await assertPublicDestination(root, "GitLab");

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GITLAB_FETCH_TIMEOUT_MS);
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  try {
    Sentry.addBreadcrumb({
      category: "integration",
      level: "info",
      data: { integration: "gitlab" },
    });
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      // Following redirects would let a public host bounce the request to an
      // internal address after the destination check has already passed.
      redirect: "manual",
      headers: {
        ...authHeaders(token),
        ...init?.headers,
      },
    });

    if (res.status >= 300 && res.status < 400) {
      throw new GitLabApiError(
        `GitLab request was redirected (HTTP ${res.status})`,
        res.status,
        "REDIRECT",
      );
    }

    const text = await res.text();
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new GitLabApiError(
        `GitLab API error ${res.status}`,
        res.status,
        "HTTP_ERROR",
        text,
      );
    }

    if (res.status === 204 || text === "") {
      return undefined;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GitLabApiError(
        "GitLab API returned invalid JSON",
        res.status,
        "INVALID_JSON",
        text,
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof GitLabApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      if (timedOut) {
        throw new GitLabApiError(
          `GitLab request timed out after ${GITLAB_FETCH_TIMEOUT_MS}ms`,
          408,
          "TIMEOUT",
        );
      }
      throw error;
    }
    throw error;
  }
}

type GitLabProject = {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  visibility: string;
  namespace?: { full_path?: string; kind?: string };
  permissions?: {
    project_access?: { access_level?: number } | null;
    group_access?: { access_level?: number } | null;
  } | null;
};

type GitLabIssueRaw = {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: string;
  web_url: string;
  labels?: string[];
  updated_at?: string;
  author?: {
    id: number;
    username: string;
    name?: string;
    avatar_url?: string;
  } | null;
};

type GitLabNoteRaw = {
  id: number;
  body: string;
  created_at: string;
  author?: {
    username: string;
    avatar_url?: string;
  } | null;
};

type GitLabMergeRequestRaw = {
  iid: number;
  title: string;
  description: string | null;
  state: string;
  web_url: string;
  source_branch: string;
  merged_at?: string | null;
  merge_status?: string;
  author?: {
    username: string;
    avatar_url?: string;
  } | null;
};

function mapIssue(issue: GitLabIssueRaw): GitLabIssue {
  return {
    id: issue.id,
    number: issue.iid,
    title: issue.title,
    body: issue.description,
    html_url: issue.web_url,
    state: issue.state,
    labels: (issue.labels ?? []).map((name) => ({ id: 0, name, color: "" })),
    user: issue.author
      ? {
          login: issue.author.username,
          username: issue.author.username,
          avatar_url: issue.author.avatar_url ?? undefined,
        }
      : null,
    updated_at: issue.updated_at,
  };
}

function projectAccessLevel(project: GitLabProject): number {
  const projectLevel = project.permissions?.project_access?.access_level ?? 0;
  const groupLevel = project.permissions?.group_access?.access_level ?? 0;
  return Math.max(projectLevel, groupLevel);
}

export function createGitLabClient(
  config: Pick<GitLabConfig, "baseUrl" | "accessToken">,
) {
  const { baseUrl, accessToken } = config;
  const project = (o: string, r: string) =>
    `/projects/${encodeProjectPath(o, r)}`;
  const issue = (o: string, r: string, iid: number) =>
    `${project(o, r)}/issues/${iid}`;

  return {
    async getRepo(
      repositoryOwner: string,
      repositoryName: string,
    ): Promise<{
      name: string;
      owner: { login?: string; username?: string };
      html_url: string;
      private: boolean;
      permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
    }> {
      const repo = await gitlabFetch<GitLabProject>(
        baseUrl,
        accessToken,
        project(repositoryOwner, repositoryName),
      );
      if (!repo) {
        throw new GitLabApiError(
          "GitLab project response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      const level = projectAccessLevel(repo);
      return {
        name: repo.name,
        owner: { login: repo.namespace?.full_path ?? repositoryOwner },
        html_url: repo.web_url,
        private: repo.visibility !== "public",
        permissions: {
          // Conservative mapping from GitLab access levels: Maintainer+ can
          // administer, Developer+ can push. Issue writes need Reporter+.
          admin: level >= 40,
          push: level >= 30,
          pull: level >= 10,
        },
      };
    },

    async listUserRepos(
      page = 1,
      limit = 100,
    ): Promise<
      Array<{
        id: number;
        name: string;
        full_name: string;
        owner: { login?: string; username?: string };
        private: boolean;
        html_url: string;
      }>
    > {
      const repos = await gitlabFetch<GitLabProject[]>(
        baseUrl,
        accessToken,
        `/projects?membership=true&per_page=${limit}&page=${page}&order_by=last_activity_at`,
      );
      if (!repos) {
        throw new GitLabApiError(
          "GitLab projects response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.path_with_namespace,
        owner: { login: repo.namespace?.full_path ?? "" },
        private: repo.visibility !== "public",
        html_url: repo.web_url,
      }));
    },

    async createIssue(
      repositoryOwner: string,
      repositoryName: string,
      body: { title: string; body?: string | null; closed?: boolean },
    ): Promise<GitLabIssue> {
      const payload: Record<string, unknown> = {
        title: body.title,
        description: body.body ?? "",
      };
      if (body.closed) {
        payload.state_event = "close";
      }
      const createdIssueRaw = await gitlabFetch<GitLabIssueRaw>(
        baseUrl,
        accessToken,
        `${project(repositoryOwner, repositoryName)}/issues`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!createdIssueRaw) {
        throw new GitLabApiError(
          "GitLab create issue response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return mapIssue(createdIssueRaw);
    },

    async updateIssue(
      repositoryOwner: string,
      repositoryName: string,
      iid: number,
      body: Record<string, unknown> & { state?: string },
    ): Promise<GitLabIssue> {
      const payload: Record<string, unknown> = { ...body };
      delete payload.state;
      // GitLab uses state_event instead of a direct state field.
      if (body.state === "closed") {
        payload.state_event = "close";
      } else if (body.state === "open") {
        payload.state_event = "reopen";
      }
      const updatedIssueRaw = await gitlabFetch<GitLabIssueRaw>(
        baseUrl,
        accessToken,
        issue(repositoryOwner, repositoryName, iid),
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      if (!updatedIssueRaw) {
        throw new GitLabApiError(
          "GitLab update issue response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return mapIssue(updatedIssueRaw);
    },

    async listIssueComments(
      repositoryOwner: string,
      repositoryName: string,
      iid: number,
      page: number,
      limit: number,
    ): Promise<GitLabComment[]> {
      const comments = await gitlabFetch<GitLabNoteRaw[]>(
        baseUrl,
        accessToken,
        `${issue(repositoryOwner, repositoryName, iid)}/notes?page=${page}&per_page=${limit}`,
      );
      if (!comments) {
        throw new GitLabApiError(
          "GitLab notes response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      const projectUrl = gitlabProjectWebUrl(
        baseUrl,
        repositoryOwner,
        repositoryName,
      );
      return comments.map((c) => ({
        id: c.id,
        body: c.body,
        html_url: `${projectUrl}/-/issues/${iid}#note_${c.id}`,
        user: c.author
          ? {
              login: c.author.username,
              username: c.author.username,
              avatar_url: c.author.avatar_url ?? undefined,
            }
          : null,
        created_at: c.created_at,
      }));
    },

    async createIssueComment(
      repositoryOwner: string,
      repositoryName: string,
      iid: number,
      body: string,
    ): Promise<GitLabComment> {
      const comment = await gitlabFetch<GitLabNoteRaw>(
        baseUrl,
        accessToken,
        `${issue(repositoryOwner, repositoryName, iid)}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      );
      if (!comment) {
        throw new GitLabApiError(
          "GitLab create note response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      const projectUrl = gitlabProjectWebUrl(
        baseUrl,
        repositoryOwner,
        repositoryName,
      );
      return {
        id: comment.id,
        body: comment.body,
        html_url: `${projectUrl}/-/issues/${iid}#note_${comment.id}`,
        user: comment.author
          ? {
              login: comment.author.username,
              username: comment.author.username,
            }
          : null,
        created_at: comment.created_at,
      };
    },

    async listLabels(
      repositoryOwner: string,
      repositoryName: string,
    ): Promise<GitLabLabel[]> {
      const labels = await gitlabFetch<
        Array<{ id: number; name: string; color: string }>
      >(
        baseUrl,
        accessToken,
        `${project(repositoryOwner, repositoryName)}/labels`,
      );
      if (!labels) {
        throw new GitLabApiError(
          "GitLab labels response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return labels;
    },

    async createLabel(
      repositoryOwner: string,
      repositoryName: string,
      name: string,
      color: string,
    ): Promise<GitLabLabel> {
      const label = await gitlabFetch<{
        id: number;
        name: string;
        color: string;
      }>(
        baseUrl,
        accessToken,
        `${project(repositoryOwner, repositoryName)}/labels`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            color: `#${color.replace(/^#/, "")}`,
          }),
        },
      );
      if (!label) {
        throw new GitLabApiError(
          "GitLab create label response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return label;
    },

    async getIssue(
      repositoryOwner: string,
      repositoryName: string,
      iid: number,
    ): Promise<GitLabIssue> {
      const issueRaw = await gitlabFetch<GitLabIssueRaw>(
        baseUrl,
        accessToken,
        issue(repositoryOwner, repositoryName, iid),
      );
      if (!issueRaw) {
        throw new GitLabApiError(
          "GitLab issue response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return mapIssue(issueRaw);
    },

    async listIssues(
      repositoryOwner: string,
      repositoryName: string,
      page: number,
      state: "open" | "closed" | "all",
    ): Promise<GitLabIssue[]> {
      const issues = await gitlabFetch<GitLabIssueRaw[]>(
        baseUrl,
        accessToken,
        `${project(repositoryOwner, repositoryName)}/issues?state=${state}&page=${page}&per_page=100`,
      );
      if (!issues) {
        throw new GitLabApiError(
          "GitLab issues response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return issues.map((issue) => mapIssue(issue));
    },

    async listPulls(
      repositoryOwner: string,
      repositoryName: string,
      page: number,
    ): Promise<GitLabPullRequest[]> {
      const pulls = await gitlabFetch<GitLabMergeRequestRaw[]>(
        baseUrl,
        accessToken,
        `${project(repositoryOwner, repositoryName)}/merge_requests?state=opened&page=${page}&per_page=100`,
      );
      if (!pulls) {
        throw new GitLabApiError(
          "GitLab merge requests response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return pulls.map((pr) => ({
        number: pr.iid,
        title: pr.title,
        body: pr.description,
        html_url: pr.web_url,
        state: pr.state,
        head: { ref: pr.source_branch },
        user: pr.author
          ? { login: pr.author.username, username: pr.author.username }
          : null,
        merged: pr.merged_at !== undefined && pr.merged_at !== null,
        merged_at: pr.merged_at ?? null,
      }));
    },

    /** Merge-add labels: GitLab replaces the full label list on PUT. */
    async addLabelsToIssue(
      repositoryOwner: string,
      repositoryName: string,
      iid: number,
      labelIds: number[],
    ) {
      if (labelIds.length === 0) return;
      const current = await this.getIssue(repositoryOwner, repositoryName, iid);
      const nameToId = new Map(
        (await this.listLabels(repositoryOwner, repositoryName)).map((l) => [
          l.name,
          l.id,
        ]),
      );
      const wanted: string[] = [];
      for (const id of labelIds) {
        const name = [...nameToId.entries()].find(([, v]) => v === id)?.[0];
        if (name) wanted.push(name);
      }
      const merged = Array.from(
        new Set([...(current.labels ?? []).map((l) => l.name), ...wanted]),
      );
      await gitlabFetch<unknown>(
        baseUrl,
        accessToken,
        issue(repositoryOwner, repositoryName, iid),
        {
          method: "PUT",
          body: JSON.stringify({ labels: merged.join(",") }),
        },
      );
    },

    /** Remove one label by ID: PUT the remaining label names. */
    async removeLabelFromIssue(
      repositoryOwner: string,
      repositoryName: string,
      iid: number,
      labelId: number,
    ) {
      const current = await this.getIssue(repositoryOwner, repositoryName, iid);
      const nameToId = new Map(
        (await this.listLabels(repositoryOwner, repositoryName)).map((l) => [
          l.name,
          l.id,
        ]),
      );
      const removedName = [...nameToId.entries()].find(
        ([, v]) => v === labelId,
      )?.[0];
      const remaining = (current.labels ?? [])
        .map((l) => l.name)
        .filter((name) => name !== removedName);
      await gitlabFetch<unknown>(
        baseUrl,
        accessToken,
        issue(repositoryOwner, repositoryName, iid),
        {
          method: "PUT",
          body: JSON.stringify({ labels: remaining.join(",") }),
        },
      );
    },
  };
}

export async function verifyGitLabToken(baseUrl: string, token: string) {
  const user = await gitlabFetch<{ id: number; username: string }>(
    normalizeGitLabBaseUrl(baseUrl),
    token,
    "/user",
  );
  if (!user) {
    throw new GitLabApiError(
      "GitLab user response was empty",
      500,
      "EMPTY_RESPONSE",
    );
  }
  return user;
}
