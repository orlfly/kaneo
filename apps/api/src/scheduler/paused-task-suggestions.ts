import * as Sentry from "@sentry/node";
import { and, desc, eq, ilike } from "drizzle-orm";
import {
  type ChatCompletionMessage,
  chatCompletion,
  isPiAgentConfigured,
} from "../chat/pi-agent-client";
import db, { schema } from "../database";
import { taskTable } from "../database/schema";

/**
 * Periodically scan all paused tasks and ask pi-agent to generate a resolution
 * suggestion for each. The suggestion is recorded as an activity row so the
 * team can see the manager's advice in the task timeline.
 *
 * The job runs every 5 minutes, but a task stuck in paused for days must not
 * flood its timeline with near-identical advice (observed: 2,569 rows for 7
 * tasks). A suggestion is regenerated at most once per 24h per task.
 */
const SUGGESTION_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export async function checkPausedTaskSuggestions(): Promise<{
  degraded?: boolean;
}> {
  if (!(await isPiAgentConfigured())) {
    return { degraded: true };
  }

  const pausedTasks = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      pausedReason: taskTable.pausedReason,
      priority: taskTable.priority,
      projectId: taskTable.projectId,
      userId: taskTable.userId,
    })
    .from(taskTable)
    .where(ilike(taskTable.status, "paused"));

  if (pausedTasks.length === 0) {
    return {};
  }

  let degraded = false;

  for (const task of pausedTasks) {
    try {
      // Rate-limit: skip tasks that already have a recent suggestion. The
      // newest agent_suggestion row for this task must be older than the
      // window; status changes append other activity types, so a re-pause
      // after real progress naturally allows a fresh suggestion.
      const [latest] = await db
        .select({ createdAt: schema.activityTable.createdAt })
        .from(schema.activityTable)
        .where(
          and(
            eq(schema.activityTable.taskId, task.id),
            eq(schema.activityTable.type, "agent_suggestion"),
          ),
        )
        .orderBy(desc(schema.activityTable.createdAt))
        .limit(1);

      if (
        latest &&
        Date.now() - latest.createdAt.getTime() < SUGGESTION_MIN_AGE_MS
      ) {
        continue;
      }

      const messages: ChatCompletionMessage[] = [
        {
          role: "system",
          content:
            "You are pi-agent, a project management assistant. A task is blocked and you must suggest a resolution. Reply concisely in one or two sentences.",
        },
        {
          role: "user",
          content: `Task #${task.number} "${task.title}" is paused.\nReason: ${task.pausedReason ?? "No reason provided"}\nPriority: ${task.priority}\n\nSuggest how to resolve this: reassign, decompose, or close.`,
        },
      ];

      const response = await chatCompletion(messages, []);
      const suggestion = response.choices?.[0]?.message?.content ?? "";

      if (!suggestion) {
        degraded = true;
        continue;
      }

      await db.insert(schema.activityTable).values({
        taskId: task.id,
        type: "agent_suggestion",
        userId: null,
        content: suggestion,
        eventData: {
          taskNumber: task.number,
          taskTitle: task.title,
          pausedReason: task.pausedReason,
        },
      });
    } catch (error) {
      degraded = true;
      Sentry.captureException(error, {
        tags: { area: "cron", job: "paused-task-suggestions" },
      });
      console.error(
        `Failed to generate suggestion for task ${task.id}:`,
        error,
      );
    }
  }

  return { degraded };
}
