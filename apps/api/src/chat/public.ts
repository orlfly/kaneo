import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import * as v from "valibot";
import { isPiAgentConfigured } from "./pi-agent-client";

// Public, unauthenticated chat endpoints. Mounted directly on the top-level
// `app` (not under `/api`) so the global `authenticateApiRequest` middleware
// does not run. Currently exposes only the configuration status.
const chatPublicApi = new Hono().get(
  "/status",
  describeRoute({
    operationId: "getChatStatus",
    tags: ["Chat"],
    description: "Check if the pi-agent is configured",
    security: [],
    responses: {
      200: {
        description: "Configuration status",
        content: {
          "application/json": {
            schema: resolver(v.object({ enabled: v.boolean() })),
          },
        },
      },
    },
  }),
  async (c) => {
    // This reflects a mutable DB value; never let browsers/proxies cache it.
    c.header("Cache-Control", "no-store");
    return c.json({ enabled: await isPiAgentConfigured() });
  },
);

export default chatPublicApi;
