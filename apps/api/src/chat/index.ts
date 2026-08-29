import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireAdminHandler } from "../admin/require-admin";
import { requireTeamRole } from "../utils/require-team-role";
import { teamAccess } from "../utils/team-access-middleware";
import { type ChatConfig, loadChatConfig, saveChatConfig } from "./config";
import clearMessages from "./controllers/clear-messages";
import { executeAgentTool } from "./controllers/execute-tool";
import listMessages from "./controllers/list-messages";
import { sendMessage } from "./controllers/send-message";
import { uploadFile } from "./controllers/upload-file";

const chatMessageSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  role: v.string(),
  content: v.string(),
  createdAt: v.date(),
});

const chatConfigResponseSchema = v.object({
  enabled: v.boolean(),
  baseUrl: v.string(),
  apiKey: v.string(),
  model: v.string(),
  workdirRoot: v.nullable(v.string()),
  enableCommandExecution: v.boolean(),
  commandTimeoutMs: v.number(),
});

const chatConfigRequestSchema = v.object({
  enabled: v.boolean(),
  baseUrl: v.string(),
  apiKey: v.string(),
  model: v.string(),
  workdirRoot: v.optional(v.nullable(v.string())),
  enableCommandExecution: v.optional(v.boolean()),
  commandTimeoutMs: v.optional(v.number()),
});

// Internal helpers strip the secret before sending it to the wire.
// The fetchers always include apiKey; the server replaces it with a redacted
// marker after a save so the UI cannot display a real key.
function maskConfig(config: ChatConfig): ChatConfig {
  return { ...config, apiKey: config.apiKey ? "********" : "" };
}

const chat = new Hono<{
  Variables: {
    userId: string;
    teamId: string;
    teamRole: "owner" | "member";
  };
}>()
  // Admin-only config endpoints. They sit under /api/chat so the global
  // authenticateApiRequest middleware runs first; requireAdminHandler is the
  // second, instance-admin check.
  .get(
    "/config",
    describeRoute({
      operationId: "getChatConfig",
      tags: ["Chat"],
      description: "Get the AI assistant configuration (admin only)",
      responses: {
        200: {
          description: "Chat configuration",
          content: {
            "application/json": {
              schema: resolver(chatConfigResponseSchema),
            },
          },
        },
      },
    }),
    async (c) => {
      await requireAdminHandler(c);
      const config = await loadChatConfig();
      return c.json(maskConfig(config));
    },
  )
  .put(
    "/config",
    describeRoute({
      operationId: "updateChatConfig",
      tags: ["Chat"],
      description: "Update the AI assistant configuration (admin only)",
      responses: {
        200: {
          description: "Updated chat configuration",
          content: {
            "application/json": {
              schema: resolver(chatConfigResponseSchema),
            },
          },
        },
      },
    }),
    validator("json", chatConfigRequestSchema),
    async (c) => {
      await requireAdminHandler(c);
      const body = c.req.valid("json");
      await saveChatConfig(body);
      const updated = await loadChatConfig();
      return c.json(maskConfig(updated));
    },
  )
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listChatMessages",
      tags: ["Chat"],
      description: "List conversation history for a project",
      responses: {
        200: {
          description: "Chat messages ordered by creation time",
          content: {
            "application/json": {
              schema: resolver(v.array(chatMessageSchema)),
            },
          },
        },
      },
    }),
    teamAccess.fromProject("projectId"),
    async (c) => {
      const projectId = c.req.param("projectId");
      const messages = await listMessages(projectId);
      return c.json(messages);
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "sendChatMessage",
      tags: ["Chat"],
      description:
        "Send a message and stream the pi-agent response via SSE. The stream emits four event types: `progress` (sent before each tool call with `{ round, tool, label }` so the chat panel can show what the agent is doing), `token` (incremental assistant text), `done` (final event with the persisted `messageId`), and `error` (sent before `done` if pi-agent fails).",
      responses: {
        200: {
          description:
            "SSE stream of `progress`, `token`, `done`, and `error` events",
          content: {
            "text/event-stream": {
              schema: resolver(v.any()),
            },
          },
        },
        503: {
          description: "pi-agent not configured",
          content: {
            "application/json": {
              schema: resolver(v.object({ error: v.string() })),
            },
          },
        },
      },
    }),
    teamAccess.fromProject("projectId"),
    requireTeamRole("member"),
    async (c) => {
      const projectId = c.req.param("projectId");
      return sendMessage(c, projectId);
    },
  )
  .post(
    "/project/:projectId/upload",
    describeRoute({
      operationId: "uploadChatFile",
      tags: ["Chat"],
      description:
        "Upload a file to the project's agent working directory so pi-agent can read and analyze it",
      responses: {
        200: {
          description: "File uploaded",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ path: v.string(), bytes: v.number() }),
              ),
            },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: resolver(v.object({ error: v.string() })),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        fileName: v.string(),
        contentType: v.string(),
        data: v.string(),
      }),
    ),
    teamAccess.fromProject("projectId"),
    requireTeamRole("member"),
    async (c) => {
      const projectId = c.req.param("projectId");
      const { fileName, contentType, data } = c.req.valid("json");
      return c.json(
        await uploadFile({ projectId, fileName, contentType, data }),
      );
    },
  )
  .post(
    "/project/:projectId/tool",
    describeRoute({
      operationId: "executeChatTool",
      tags: ["Chat"],
      description:
        "Execute a project-scoped pi-agent tool (agent_clone_repo, agent_read_file, agent_list_files, agent_write_file, agent_search_files, agent_delete_file, agent_run_command). Mirrors the conversation tool set so MCP clients can call the same agent capabilities.",
      responses: {
        200: {
          description: "Tool execution result",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  result: v.string(),
                }),
              ),
            },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: resolver(v.object({ error: v.string() })),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        tool: v.string(),
        args: v.record(v.string(), v.unknown()),
      }),
    ),
    teamAccess.fromProject("projectId"),
    requireTeamRole("member"),
    async (c) => {
      const projectId = c.req.param("projectId");
      const userId = c.get("userId");
      const { tool, args } = c.req.valid("json");
      return c.json(await executeAgentTool({ tool, args, projectId, userId }));
    },
  )
  .delete(
    "/project/:projectId",
    describeRoute({
      operationId: "clearChatMessages",
      tags: ["Chat"],
      description: "Clear the conversation history for a project",
      responses: {
        200: {
          description: "Chat history cleared",
          content: {
            "application/json": {
              schema: resolver(v.object({ cleared: v.boolean() })),
            },
          },
        },
      },
    }),
    teamAccess.fromProject("projectId"),
    requireTeamRole("member"),
    async (c) => {
      const projectId = c.req.param("projectId");
      await clearMessages(projectId);
      return c.json({ cleared: true });
    },
  );

export default chat;
