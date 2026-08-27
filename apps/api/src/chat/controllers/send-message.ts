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
- When asked about tasks or project status, use the list_tasks or get_project_summary tools.
- When asked to check blocked or paused tasks, use the list_blocked_tasks tool.
- When asked about the project's merge/pull requests (MRs, PRs, merge requests), use the list_merge_requests tool, which queries the project's connected version-control repository.
- When asked to read, search, or analyze the project's source code, documentation, or repository, first use agent_clone_repo to clone the connected repository into the working directory, then use agent_list_files, agent_search_files, and agent_read_file to inspect it.
- When the user uploads a file, it is available under the "uploads" folder in the working directory; read it with agent_read_file.
- If command execution is enabled on the instance, you can run commands in the working directory with agent_run_command.
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

      await executeToolCalls(currentMessages, choice.message.tool_calls, projectId);

      round += 1;
      continue;
    }

    // No tool calls — stream the text response to the client
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
      await executeToolCalls(currentMessages, literalCalls, projectId);
      round += 1;
      continue;
    }

    const finalContent = rawContent;
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
    let streamedContent: string;
    try {
      ({ content: streamedContent } = await chatCompletionStream(
        currentMessages,
        (token) => {
          void stream.writeSSE({ event: "token", data: token });
        },
      ));
    } catch (error) {
      console.error("[chat] pi-agent stream error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "The AI assistant encountered an error while responding.";
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message }),
      });
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ messageId: assistantId }),
      });
      return;
    }

    // The final stream may still return literal <invoke> tool calls (a model
    // like deepseek-v4-flash does this when it decides to call a tool late).
    // Execute them so the response is not a stuck tool-call script.
    let finalLiteralCalls = parseLiteralToolCalls(streamedContent);
    let resolutionRound = 0;
    while (finalLiteralCalls.length > 0 && resolutionRound < 8) {
      currentMessages.push({
        role: "assistant",
        content: streamedContent,
        tool_calls: finalLiteralCalls,
      });
      await executeToolCalls(currentMessages, finalLiteralCalls, projectId);
      // Ask the model again (without tools) for the actual answer. Loop until
      // it produces prose instead of more literal tool-call markup.
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

    await db.insert(chatMessageTable).values({
      id: assistantId,
      projectId,
      role: "assistant",
      content: streamedContent,
      createdAt: new Date(),
    });

    // Stream the final (possibly resolved) content.
    const chunkSize = 20;
    for (let i = 0; i < streamedContent.length; i += chunkSize) {
      await stream.writeSSE({
        event: "token",
        data: streamedContent.slice(i, i + chunkSize),
      });
    }

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({ messageId: assistantId }),
    });
  });
}

// Regex for literal <invoke name="tool"><parameter name="arg">value</parameter></invoke>
// blocks that some models emit in the content instead of the structured
// tool_calls field.
const INVOKE_RE = /<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/invoke>/g;
const PARAM_RE = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/g;

/**
 * Execute a batch of tool calls, pushing each result into `currentMessages`.
 * A tool failure is captured as a JSON tool result so it never throws through
 * to the request handler.
 */
async function executeToolCalls(
  currentMessages: ChatCompletionMessage[],
  toolCalls: ChatCompletionMessage["tool_calls"],
  projectId: string,
): Promise<void> {
  for (const toolCall of toolCalls ?? []) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      // malformed args
    }

    let result: string;
    try {
      result = await executeTool(toolCall.function.name, args, projectId);
    } catch (error) {
      // A tool failure must not take down the whole request. Surface it as a
      // tool result so the model can respond gracefully, instead of letting an
      // uncaught error escape to the Hono 500 handler.
      console.error(`[chat] tool "${toolCall.function.name}" error:`, error);
      result = JSON.stringify({
        error:
          error instanceof Error ? error.message : "Tool execution failed",
      });
    }

    currentMessages.push({
      role: "tool",
      content: result,
      tool_call_id: toolCall.id,
    });
  }
}

/**
 * Detect tool calls emitted as literal markup in the message content (e.g.
 * `<invoke name="agent_read_file">`). Returns them in the same shape as the
 * structured `tool_calls` field so the caller can execute them uniformly.
 */
export function parseLiteralToolCalls(
  content: string,
): Array<{
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
