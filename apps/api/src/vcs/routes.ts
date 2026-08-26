import type { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  type VcsIssueState,
  vcsAddLabelsToIssue,
  vcsCreateIssue,
  vcsCreateIssueComment,
  vcsCreateLabel,
  vcsErrorToHttp,
  vcsGetIssue,
  vcsListIssueComments,
  vcsListIssues,
  vcsListLabels,
  vcsListPullRequests,
  vcsListRepositories,
  vcsRemoveLabelFromIssue,
  vcsReplaceIssueLabels,
  vcsUpdateIssue,
} from "./operations";
import { resolveVcsIntegration, type VcsType } from "./resolve";

type VcsVariables = {
  userId: string;
  teamId: string;
  apiKey?: { id: string; userId: string; enabled: boolean };
};

const projectIdParam = v.object({
  projectId: v.string(),
});

const issueNumberParam = v.object({
  projectId: v.string(),
  number: v.pipe(v.string(), v.transform(Number)),
});

const issueStateQuery = v.object({
  state: v.optional(v.picklist(["open", "closed", "all"])),
});

const createIssueBody = v.object({
  title: v.string(),
  body: v.optional(v.nullable(v.string())),
  closed: v.optional(v.boolean()),
});

const updateIssueBody = v.object({
  title: v.optional(v.string()),
  body: v.optional(v.nullable(v.string())),
  state: v.optional(v.picklist(["open", "closed"])),
});

const createCommentBody = v.object({
  body: v.string(),
});

const createLabelBody = v.object({
  name: v.string(),
  color: v.string(),
});

const labelIdsBody = v.object({
  labelIds: v.array(v.number()),
});

const removeLabelBody = v.object({
  labelId: v.number(),
});

const permission: Record<string, string[]> = {
  workspace: ["manage_settings"],
};

/**
 * Register VCS read/write endpoints under an integration route group. Each
 * endpoint resolves the active integration for the project, verifies the
 * caller is a team member, and dispatches to the underlying VCS client.
 */
export function registerVcsRoutes(
  app: Hono<{ Variables: VcsVariables }>,
  type: VcsType,
) {
  app.get(
    "/vcs/:projectId/repositories",
    describeRoute({
      tags: [type],
      description: `List repositories accessible to the ${type} integration`,
    }),
    validator("param", projectIdParam),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsListRepositories(integration));
    },
  );

  app.get(
    "/vcs/:projectId/issues",
    describeRoute({
      tags: [type],
      description: `List issues in the configured ${type} repository`,
    }),
    validator("param", projectIdParam),
    validator("query", issueStateQuery),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const { state } = c.req.valid("query");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(
        await vcsListIssues(integration, (state ?? "open") as VcsIssueState),
      );
    },
  );

  app.get(
    "/vcs/:projectId/issues/:number",
    describeRoute({
      tags: [type],
      description: `Get a single ${type} issue by number`,
    }),
    validator("param", issueNumberParam),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId, number } = c.req.valid("param");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsGetIssue(integration, number));
    },
  );

  app.get(
    "/vcs/:projectId/issues/:number/comments",
    describeRoute({
      tags: [type],
      description: `List comments on a ${type} issue`,
    }),
    validator("param", issueNumberParam),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId, number } = c.req.valid("param");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsListIssueComments(integration, number));
    },
  );

  app.get(
    "/vcs/:projectId/pull-requests",
    describeRoute({
      tags: [type],
      description: `List open pull requests in the configured ${type} repository`,
    }),
    validator("param", projectIdParam),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsListPullRequests(integration));
    },
  );

  app.get(
    "/vcs/:projectId/labels",
    describeRoute({
      tags: [type],
      description: `List labels in the configured ${type} repository`,
    }),
    validator("param", projectIdParam),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsListLabels(integration));
    },
  );

  app.post(
    "/vcs/:projectId/issues",
    describeRoute({
      tags: [type],
      description: `Create an issue in the configured ${type} repository`,
    }),
    validator("param", projectIdParam),
    validator("json", createIssueBody),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsCreateIssue(integration, body));
    },
  );

  app.patch(
    "/vcs/:projectId/issues/:number",
    describeRoute({
      tags: [type],
      description: `Update a ${type} issue by number`,
    }),
    validator("param", issueNumberParam),
    validator("json", updateIssueBody),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId, number } = c.req.valid("param");
      const body = c.req.valid("json");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsUpdateIssue(integration, number, body));
    },
  );

  app.post(
    "/vcs/:projectId/issues/:number/comments",
    describeRoute({
      tags: [type],
      description: `Comment on a ${type} issue`,
    }),
    validator("param", issueNumberParam),
    validator("json", createCommentBody),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId, number } = c.req.valid("param");
      const { body } = c.req.valid("json");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsCreateIssueComment(integration, number, body));
    },
  );

  app.post(
    "/vcs/:projectId/labels",
    describeRoute({
      tags: [type],
      description: `Create a label in the configured ${type} repository`,
    }),
    validator("param", projectIdParam),
    validator("json", createLabelBody),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsCreateLabel(integration, body));
    },
  );

  app.post(
    "/vcs/:projectId/issues/:number/labels",
    describeRoute({
      tags: [type],
      description: `Add labels to a ${type} issue`,
    }),
    validator("param", issueNumberParam),
    validator("json", labelIdsBody),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId, number } = c.req.valid("param");
      const { labelIds } = c.req.valid("json");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsAddLabelsToIssue(integration, number, labelIds));
    },
  );

  app.put(
    "/vcs/:projectId/issues/:number/labels",
    describeRoute({
      tags: [type],
      description: `Replace all labels on a ${type} issue`,
    }),
    validator("param", issueNumberParam),
    validator("json", labelIdsBody),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId, number } = c.req.valid("param");
      const { labelIds } = c.req.valid("json");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(await vcsReplaceIssueLabels(integration, number, labelIds));
    },
  );

  app.delete(
    "/vcs/:projectId/issues/:number/labels",
    describeRoute({
      tags: [type],
      description: `Remove a label from a ${type} issue`,
    }),
    validator("param", issueNumberParam),
    validator("json", removeLabelBody),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission(permission),
    async (c) => {
      const { projectId, number } = c.req.valid("param");
      const { labelId } = c.req.valid("json");
      const integration = await resolveVcsIntegration(projectId, type);
      return c.json(
        await vcsRemoveLabelFromIssue(integration, number, labelId),
      );
    },
  );

  // Convert unexpected client errors into HTTP responses.
  app.onError((error, c) => {
    const http = vcsErrorToHttp(error);
    return c.json({ message: http.message }, http.status);
  });
}
