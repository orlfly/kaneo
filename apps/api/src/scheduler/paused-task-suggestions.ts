import { ilike } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import db, { schema } from "../database";
import { taskTable } from "../database/schema";
import { isPiAgentConfigured, chatCompletion, type ChatCompletionMessage } from "../chat/pi-agent-client";

/**
 * Periodically scan all paused tasks and ask pi-agent to generate a resolution
 * suggestion for each. The suggestion is recorded as an activity row so the
 * team can see the manager's advice in the task timeline.
 */
export async function checkPausedTaskSuggestions(): Promise<{ degraded?: boolean }> {
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
      console.error(`Failed to generate suggestion for task ${task.id}:`, error);
    }
  }

  return { degraded };
}