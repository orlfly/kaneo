import { eq } from "drizzle-orm";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import type { GitLabConfig } from "./config";
import { verifyGitLabWebhook } from "./utils/verify-signature";
import { handleGitLabIssueClosed } from "./webhooks/issue-closed";
import { handleGitLabIssueCommentCreated } from "./webhooks/issue-comment-created";
import { handleGitLabIssueEdited } from "./webhooks/issue-edited";
import { handleGitLabIssueLabeled } from "./webhooks/issue-labeled";
import { handleGitLabIssueOpened } from "./webhooks/issue-opened";
import { handleGitLabIssueReopened } from "./webhooks/issue-reopened";
import { handleGitLabLabelCreated } from "./webhooks/label-created";
import { handleGitLabMergeRequestClosed } from "./webhooks/pull-request-closed";
import { handleGitLabMergeRequestOpened } from "./webhooks/pull-request-opened";
import { handleGitLabPush } from "./webhooks/push";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasProject(payload: Record<string, unknown>) {
  return isRecord(payload.project);
}

export async function handleGitLabWebhookRequest(
  integrationId: string,
  rawBody: string,
  tokenHeader: string | undefined,
  eventHeader: string | undefined,
): Promise<{ success: boolean; error?: string }> {
  const integration = await db.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
  });

  if (integration?.type !== "gitlab") {
    return { success: false, error: "GitLab integration not found" };
  }

  let config: GitLabConfig;
  try {
    config = JSON.parse(integration.config) as GitLabConfig;
  } catch {
    return { success: false, error: "Invalid integration config" };
  }

  const secret = config.webhookSecret;
  if (!secret) {
    return { success: false, error: "Webhook secret not configured" };
  }

  // GitLab sends the hook token verbatim in X-Gitlab-Token (no HMAC).
  if (!verifyGitLabWebhook(rawBody, secret, tokenHeader)) {
    return { success: false, error: "Invalid webhook token" };
  }

  const event = eventHeader || undefined;
  if (!event) {
    return { success: false, error: "Missing event name" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { success: false, error: "Invalid JSON payload" };
  }

  try {
    await dispatchGitLabEvent(event, payload, integration.id);
    return { success: true };
  } catch (error) {
    console.error("[GitLab Webhook] Handler error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Webhook handler failed",
    };
  }
}

async function dispatchGitLabEvent(
  event: string,
  payload: Record<string, unknown>,
  integrationId: string,
) {
  const objectKind = payload.object_kind as string | undefined;
  const kind = event.replace(/^GitLab /, "") || objectKind;

  console.log(`[GitLab Webhook] Event: ${event} (object_kind: ${objectKind})`);

  switch (kind) {
    case "push":
    case "Push Hook":
      if (hasProject(payload)) {
        await handleGitLabPush(
          payload as Parameters<typeof handleGitLabPush>[0],
          integrationId,
        );
      }
      return;
    case "merge_request":
    case "Merge Request Hook": {
      const attributes = isRecord(payload.object_attributes)
        ? payload.object_attributes
        : {};
      const action = attributes.action as string | undefined;
      if (
        action === "open" ||
        action === "reopen" ||
        action === "update" ||
        (action === "approved" && attributes.state === "opened") ||
        attributes.state === "opened"
      ) {
        if (hasProject(payload)) {
          await handleGitLabMergeRequestOpened(
            payload as Parameters<typeof handleGitLabMergeRequestOpened>[0],
            integrationId,
          );
        }
      } else if (
        action === "close" ||
        action === "merge" ||
        attributes.state === "closed" ||
        attributes.state === "merged"
      ) {
        if (hasProject(payload)) {
          await handleGitLabMergeRequestClosed(
            payload as Parameters<typeof handleGitLabMergeRequestClosed>[0],
            integrationId,
          );
        }
      }
      return;
    }
    case "issue":
    case "Issue Hook": {
      const attributes = isRecord(payload.object_attributes)
        ? payload.object_attributes
        : {};
      const action = attributes.action as string | undefined;
      const changes = isRecord(payload.changes) ? payload.changes : undefined;
      if (action === "open" && hasProject(payload)) {
        await handleGitLabIssueOpened(
          payload as Parameters<typeof handleGitLabIssueOpened>[0],
          integrationId,
        );
      } else if (action === "reopen" && hasProject(payload)) {
        await handleGitLabIssueReopened(
          payload as Parameters<typeof handleGitLabIssueReopened>[0],
          integrationId,
        );
      } else if (action === "close" && hasProject(payload)) {
        await handleGitLabIssueClosed(
          payload as Parameters<typeof handleGitLabIssueClosed>[0],
          integrationId,
        );
      } else if (action === "update" && hasProject(payload)) {
        if (changes && isRecord(changes.labels)) {
          // GitLab reports label changes as an update with changes.labels.
          await handleGitLabIssueLabeled(
            payload as Parameters<typeof handleGitLabIssueLabeled>[0],
            integrationId,
          );
        } else {
          await handleGitLabIssueEdited(
            payload as Parameters<typeof handleGitLabIssueEdited>[0],
            integrationId,
          );
        }
      }
      return;
    }
    case "note":
    case "Note Hook": {
      const attributes = isRecord(payload.object_attributes)
        ? payload.object_attributes
        : {};
      const noteableType = attributes.noteable_type as string | undefined;
      if (noteableType === "Issue" && hasProject(payload)) {
        await handleGitLabIssueCommentCreated(
          payload as Parameters<typeof handleGitLabIssueCommentCreated>[0],
          integrationId,
        );
      }
      return;
    }
    case "label":
    case "Label Hook":
      if (hasProject(payload)) {
        await handleGitLabLabelCreated(
          payload as Parameters<typeof handleGitLabLabelCreated>[0],
          integrationId,
        );
      }
      return;
    default:
      console.log(`[GitLab Webhook] Ignored event: ${event}`);
  }
}
