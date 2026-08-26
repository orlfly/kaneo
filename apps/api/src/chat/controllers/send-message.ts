import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import db from "../../database";
import {
  chatMessageTable,
  projectTable,
  teamTable,
} from "../../database/schema";
import {
  type ChatCompletionMessage,
  chatCompletion,
  chatCompletionStream,
  isPiAgentConfigured,
} from "../pi-agent-client";
import { executeTool, toolDefinitions } from "../tools";

const MAX_TOOL_ROUNDS = 5;

export function buildSystemPrompt(
  projectName: string,
  teamName: string,
): string {
  return `You are pi-agent, an AI project management assistant for the Kaneo project management platform.

You are currently working in the project "${projectName}" which belongs to the team "${teamName}".

Your role as project manager:
- Help the team manage tasks: create tasks, check task status, and analyze project progress.
- When asked to create a task, use the create_task tool.
- When asked about tasks or project status, use the list_tasks or get_project_summary tools.
- When asked to check blocked or paused tasks, use the list_blocked_tasks tool.
- When asked about the project's merge/pull requests (MRs, PRs, merge requests), use the list_merge_requests tool.
- When asked to巡检异常 (inspect anomalies), call list_blocked_tasks and suggest how to resolve each blocked task: reassign, decompose, or close.
- Be concise and helpful. Respond in markdown when formatting is useful.
- You cannot delete tasks or modify existing tasks directly. If asked, explain that only task creation, querying, and anomaly inspection are supported.

Always use the provided tools to get real data rather than guessing.`;
}

export async function sendMessage(c: Context, projectId: string) {
  if (!(await isPiAgentConfigured())) {
    return c.json({ error: "pi-agent not configured" }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return c.json({ error: "Message content is required" }, 400);
  }

  // Load project and team info for the system prompt
  const [project] = await db
    .select({
      name: projectTable.name,
      teamId: projectTable.teamId,
    })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const [team] = await db
    .select({ name: teamTable.name })
    .from(teamTable)
    .where(eq(teamTable.id, project.teamId))
    .limit(1);

  const systemPrompt = buildSystemPrompt(project.name, team?.name ?? "Unknown");

  // Store user message
  await db.insert(chatMessageTable).values({
    id: createId(),
    projectId,
    role: "user",
    content,
    createdAt: new Date(),
  });

  // Load conversation history (last 20 messages to keep context manageable)
  const history = await db
    .select({
      role: chatMessageTable.role,
      content: chatMessageTable.content,
    })
    .from(chatMessageTable)
    .where(eq(chatMessageTable.projectId, projectId))
    .orderBy(chatMessageTable.createdAt)
    .limit(20);

  // Build messages array
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Tool-call loop: handle tool calls, then stream final text response
  let round = 0;
  const currentMessages = [...messages];

  while (round < MAX_TOOL_ROUNDS) {
    let response: Awaited<ReturnType<typeof chatCompletion>>;
    try {
      response = await chatCompletion(currentMessages, toolDefinitions);
    } catch (error) {
      console.error("[chat] pi-agent chatCompletion error:", error);
      return c.json({ error: "pi-agent request failed" }, 502);
    }
    const choice = response.choices?.[0];

    if (!choice) {
      return c.json({ error: "pi-agent returned no response" }, 502);
    }

    // If there are tool calls, execute them and continue the loop
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      currentMessages.push({
        role: "assistant",
        content: choice.message.content ?? "",
        tool_calls: choice.message.tool_calls,
      });

      for (const toolCall of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          // malformed args
        }

        const result = await executeTool(
          toolCall.function.name,
          args,
          projectId,
        );

        currentMessages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCall.id,
        });
      }

      round += 1;
      continue;
    }

    // No tool calls — stream the text response to the client
    const finalContent = choice.message.content ?? "";
    const assistantId = createId();

    // Persist the assistant response so history survives reloads.
    if (finalContent) {
      await db.insert(chatMessageTable).values({
        id: assistantId,
        projectId,
        role: "assistant",
        content: finalContent,
        createdAt: new Date(),
      });
    }

    return streamSSE(c, async (stream) => {
      // Send the complete response in chunks for a simple streaming experience.
      // For true token streaming we'd call chatCompletionStream, but since the
      // tool-call round already consumed the full response, we emit the text
      // in segments.
      const chunkSize = 20;
      for (let i = 0; i < finalContent.length; i += chunkSize) {
        const chunk = finalContent.slice(i, i + chunkSize);
        await stream.writeSSE({
          event: "token",
          data: chunk,
        });
      }

      // Signal completion
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ messageId: assistantId }),
      });
    });
  }

  // If we exhausted tool rounds, do a final streaming call without tools
  const assistantId = createId();

  return streamSSE(c, async (stream) => {
    const { content: streamedContent } = await chatCompletionStream(
      currentMessages,
      (token) => {
        void stream.writeSSE({ event: "token", data: token });
      },
    );

    await db.insert(chatMessageTable).values({
      id: assistantId,
      projectId,
      role: "assistant",
      content: streamedContent,
      createdAt: new Date(),
    });

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({ messageId: assistantId }),
    });
  });
}
