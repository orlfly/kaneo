import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import db from "../../database";
import {
  chatMessageTable,
  projectTable,
  teamTable,
} from "../../database/schema";
import {
  type ChatCompletionMessage,
  type ChatCompletionResponse,
  chatCompletion,
  chatCompletionStream,
  isPiAgentConfigured,
} from "../pi-agent-client";
import { progressLabelFor } from "../progress-labels";
import { executeTool, toolDefinitions } from "../tools";

const MAX_TOOL_ROUNDS = 15;

export function buildSystemPrompt(
  projectName: string,
  teamName: string,
): string {
  return `You are pi-agent, an AI project management assistant for the Kaneo project management platform.

You are currently working in the project "${projectName}" which belongs to the team "${teamName}".

Your role as project manager:
- Help the team manage tasks: create tasks, check task status, and analyze project progress.
- When asked to create a task, use the create_task tool.
- Always schedule tasks: pass startDate and dueDate (ISO 8601) when creating a task. Estimate reasonable dates from the task's size, priority, and dependencies (a blocked task starts after its blockers finish). If the user gave no dates, start from today. Tasks without dates never appear on the Gantt chart.
- When asked about tasks or project status, use the list_tasks or get_project_summary tools.
- When asked to check blocked or paused tasks, use the list_blocked_tasks tool.
- When creating a task that depends on existing tasks (a prerequisite, a blocking relationship, or a parent/child relationship), declare the dependency: use create_task_relation with relationType 'subtask' (this task is a child of the target), 'blocks' (this task blocks the target), or 'related' (bidirectional). Use get_task_relations to inspect a task's existing dependencies before creating new ones.
- When asked to update a task's status (e.g. mark it started or finished), use the update_task_status tool: use 'done' to complete a task, 'archived' to close it, and other supported project statuses to move it through the workflow.
- When asked about the project's merge/pull requests (MRs, PRs, merge requests), use the list_merge_requests tool, which queries the project's connected version-control repository.
- When asked to read, search, or analyze the project's source code, documentation, or repository, first use agent_clone_repo to clone the connected repository into the working directory, then use agent_list_files, agent_search_files, and agent_read_file to inspect it.
- When the user uploads a file, it is available under the "uploads" folder in the working directory; read it with agent_read_file.
- If command execution is enabled on the instance, you can run commands in the working directory with agent_run_command.
- When asked to巡检异常 (inspect anomalies), call list_blocked_tasks and suggest how to resolve each blocked task: reassign, decompose, or close.
- Be concise and helpful. Respond in markdown when formatting is useful.
- You cannot delete tasks. If asked to delete one, explain that task deletion is not supported; you can still update its status or create follow-up tasks.

Always use the provided tools to get real data rather than guessing.`;
}

/**
 * Send a message and stream the pi-agent response over a single SSE channel.
 * Progress events are emitted before each tool call so the chat panel can show
 * what the agent is doing between tool executions.
 */
export async function sendMessage(c: Context, projectId: string) {
  if (!(await isPiAgentConfigured())) {
    return c.json({ error: "pi-agent not configured" }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return c.json({ error: "Message content is required" }, 400);
  }

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
  const userId = c.get("userId");

  // Persist the user message before opening the stream so progress events are
  // observable as soon as pi-agent starts thinking.
  await db.insert(chatMessageTable).values({
    id: createId(),
    projectId,
    role: "user",
    content,
    createdAt: new Date(),
  });

  const history = await db
    .select({
      role: chatMessageTable.role,
      content: chatMessageTable.content,
    })
    .from(chatMessageTable)
    .where(eq(chatMessageTable.projectId, projectId))
    .orderBy(chatMessageTable.createdAt)
    .limit(20);

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  return streamSSE(c, async (stream) => {
    const assistantId = createId();
    let round = 0;
    const currentMessages = [...messages];
    let finalContent = "";
    let usedStreamingCompletion = false;

    while (round < MAX_TOOL_ROUNDS) {
      let response: ChatCompletionResponse;
      try {
        response = await chatCompletion(currentMessages, toolDefinitions);
      } catch (error) {
        console.error("[chat] pi-agent chatCompletion error:", error);
        await writeStreamErrorAndDone(
          stream,
          "pi-agent request failed",
          assistantId,
        );
        return;
      }

      const choice = response.choices?.[0];

      if (!choice) {
        await writeStreamErrorAndDone(
          stream,
          "pi-agent returned no response",
          assistantId,
        );
        return;
      }

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        currentMessages.push({
          role: "assistant",
          content: choice.message.content ?? "",
          tool_calls: choice.message.tool_calls,
        });

        await executeToolCalls(
          stream,
          currentMessages,
          choice.message.tool_calls,
          projectId,
          userId,
          round,
        );

        round += 1;
        continue;
      }

      const rawContent = choice.message.content ?? "";

      // Some models (e.g. deepseek-v4-flash) occasionally emit tool calls as
      // literal <invoke name="..."> markup in the content instead of the
      // structured tool_calls field. Detect that and execute the tools, so the
      // conversation does not get stuck on a tool-call "script".
      const literalCalls = parseLiteralToolCalls(rawContent);
      if (literalCalls.length > 0) {
        currentMessages.push({
          role: "assistant",
          content: rawContent,
          tool_calls: literalCalls,
        });

        await executeToolCalls(
          stream,
          currentMessages,
          literalCalls,
          projectId,
          userId,
          round,
        );

        round += 1;
        continue;
      }

      finalContent = rawContent;
      break;
    }

    // If we exhausted the tool rounds without prose, do a final streaming
    // completion (without tools) and resolve any late literal tool calls.
    if (!finalContent && round >= MAX_TOOL_ROUNDS) {
      let streamedContent: string;
      try {
        ({ content: streamedContent } = await chatCompletionStream(
          currentMessages,
          (token) => {
            void stream.writeSSE({ event: "token", data: token });
          },
        ));
        usedStreamingCompletion = true;
      } catch (error) {
        console.error("[chat] pi-agent stream error:", error);
        await writeStreamErrorAndDone(
          stream,
          error instanceof Error
            ? error.message
            : "The AI assistant encountered an error while responding.",
          assistantId,
        );
        return;
      }

      let finalLiteralCalls = parseLiteralToolCalls(streamedContent);
      let resolutionRound = 0;
      while (finalLiteralCalls.length > 0 && resolutionRound < 8) {
        currentMessages.push({
          role: "assistant",
          content: streamedContent,
          tool_calls: finalLiteralCalls,
        });
        await executeToolCalls(
          stream,
          currentMessages,
          finalLiteralCalls,
          projectId,
          userId,
          round + resolutionRound,
        );
        try {
          const finalResponse = await chatCompletion(currentMessages);
          streamedContent = finalResponse.choices?.[0]?.message?.content ?? "";
        } catch (error) {
          console.error("[chat] pi-agent final completion error:", error);
          streamedContent =
            "I ran the requested steps but could not summarize the result. Please try again.";
          break;
        }
        finalLiteralCalls = parseLiteralToolCalls(streamedContent);
        resolutionRound += 1;
      }
      finalContent = streamedContent;

      // Emit any text the streaming completion did not already deliver.
      if (finalContent) {
        const chunkSize = 20;
        for (let i = 0; i < finalContent.length; i += chunkSize) {
          await stream.writeSSE({
            event: "token",
            data: finalContent.slice(i, i + chunkSize),
          });
        }
      }
    } else if (finalContent && !usedStreamingCompletion) {
      // The tool-call loop produced prose. Chunk it so the client still gets a
      // streaming feel even though we already have the full text.
      const chunkSize = 20;
      for (let i = 0; i < finalContent.length; i += chunkSize) {
        await stream.writeSSE({
          event: "token",
          data: finalContent.slice(i, i + chunkSize),
        });
      }
    }

    if (finalContent) {
      await db.insert(chatMessageTable).values({
        id: assistantId,
        projectId,
        role: "assistant",
        content: finalContent,
        createdAt: new Date(),
      });
    }

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({ messageId: assistantId }),
    });
  });
}

/**
 * Emit a progress event before running each tool call so the chat panel can
 * show what the agent is doing. `round` is the zero-indexed round number of
 * the conversation; it is included for clients that want to compact the log.
 */
async function executeToolCalls(
  stream: SSEStreamingApi,
  currentMessages: ChatCompletionMessage[],
  toolCalls: ChatCompletionMessage["tool_calls"],
  projectId: string,
  userId: string,
  round: number,
): Promise<void> {
  for (const toolCall of toolCalls ?? []) {
    const label = progressLabelFor(toolCall.function.name);
    await stream.writeSSE({
      event: "progress",
      data: JSON.stringify({
        round,
        tool: toolCall.function.name,
        label,
      }),
    });

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      // malformed args
    }

    let result: string;
    try {
      result = await executeTool(
        toolCall.function.name,
        args,
        projectId,
        userId,
      );
    } catch (error) {
      console.error(`[chat] tool "${toolCall.function.name}" error:`, error);
      result = JSON.stringify({
        error: error instanceof Error ? error.message : "Tool execution failed",
      });
    }

    currentMessages.push({
      role: "tool",
      content: result,
      tool_call_id: toolCall.id,
    });
  }
}

async function writeStreamErrorAndDone(
  stream: SSEStreamingApi,
  message: string,
  assistantId: string,
): Promise<void> {
  await stream.writeSSE({
    event: "error",
    data: JSON.stringify({ message }),
  });
  await stream.writeSSE({
    event: "done",
    data: JSON.stringify({ messageId: assistantId }),
  });
}

// Regex for literal <invoke name="tool"><parameter name="arg">value</parameter></invoke>
// blocks that some models emit in the content instead of the structured
// tool_calls field. DeepSeek models use a proprietary DSML dialect with a
// fullwidth vertical bar prefix (U+FF5C): <｜DSML｜invoke ...>. Both dialects
// share the same inner structure, so one regex covers them.
const INVOKE_RE =
  /<(?:｜DSML｜)?invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:｜DSML｜)?invoke>/g;
const PARAM_RE =
  /<(?:｜DSML｜)?parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:｜DSML｜)?parameter>/g;

/**
 * Detect tool calls emitted as literal markup in the message content (e.g.
 * `<invoke name="agent_read_file">` or the DeepSeek DSML dialect
 * `<｜DSML｜invoke name="...">`). Returns them in the same shape as the
 * structured `tool_calls` field so the caller can execute them uniformly.
 */
export function parseLiteralToolCalls(content: string): Array<{
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}> {
  const calls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  for (const match of content.matchAll(INVOKE_RE)) {
    const name = match[1] ?? "";
    const body = match[2] ?? "";
    const args: Record<string, unknown> = {};
    for (const param of body.matchAll(PARAM_RE)) {
      args[param[1] ?? ""] = (param[2] ?? "").trim();
    }
    if (!name) continue;
    calls.push({
      id: `literal-${calls.length + 1}`,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    });
  }
  return calls;
}
