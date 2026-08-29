import { AGENT_ROLES } from "@kaneo/permissions";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import * as v from "valibot";
import { buildAgentConfigZip } from "./package";
import { listRoleTemplates, listSkillTemplates } from "./templates";

const app = new Hono();

const RoleQuery = v.object({
  role: v.optional(v.string()),
});

function isValidRole(value: string): boolean {
  return (AGENT_ROLES as readonly string[]).includes(value);
}

/**
 * GET /api/agent/agents-config/templates
 * Returns bundled role and skill template metadata. Each skill entry
 * includes a `forRoles` field listing every Kaneo role the skill applies
 * to (or `null` when no `for_roles` frontmatter is declared).
 */
app.get(
  "/templates",
  describeRoute({
    operationId: "getAgentConfigTemplates",
    tags: ["Agent Config"],
    description: "List bundled agent role definitions and skill templates",
    responses: {
      200: {
        description: "Template list",
        content: {
          "application/json": {
            schema: resolver(
              v.object({
                roles: v.array(
                  v.object({
                    name: v.string(),
                    description: v.string(),
                  }),
                ),
                skills: v.array(
                  v.object({
                    name: v.string(),
                    description: v.string(),
                    forRoles: v.union([v.array(v.string()), v.null()]),
                  }),
                ),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const roles = await listRoleTemplates();
    const skills = await listSkillTemplates();
    return c.json({ roles, skills });
  },
);

/**
 * GET /api/agent/agents-config/download
 * Returns a zip package containing role definitions, role-scoped skills,
 * and install.sh for manual installation. When `?role=<name>` is provided,
 * the zip only includes skills whose `for_roles` frontmatter includes
 * that role; otherwise every skill is included.
 */
app.get(
  "/download",
  describeRoute({
    operationId: "downloadAgentConfig",
    tags: ["Agent Config"],
    description:
      "Download a zip package of agent role definitions, role-scoped skills, and install script. Use ?role=<name> to filter skills to a single persona.",
    responses: {
      200: {
        description: "Zip package",
        content: {
          "application/zip": {
            schema: resolver(v.any()),
          },
        },
      },
      400: {
        description: "Invalid role value",
        content: {
          "application/json": {
            schema: resolver(
              v.object({
                message: v.string(),
                validRoles: v.array(v.string()),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const query = c.req.query();
    const parsed = v.safeParse(RoleQuery, query);
    if (!parsed.success) {
      return c.json(
        {
          message: "Invalid query parameters",
          validRoles: [...AGENT_ROLES],
        },
        400,
      );
    }
    const role = parsed.output.role;
    if (role !== undefined && !isValidRole(role)) {
      return c.json(
        {
          message: `Invalid role: ${role}`,
          validRoles: [...AGENT_ROLES],
        },
        400,
      );
    }
    const zipBuffer = await buildAgentConfigZip(role);
    const body = new Uint8Array(zipBuffer);
    const filename = role
      ? `kaneo-agent-config-${role}.zip`
      : "kaneo-agent-config.zip";
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.length),
      },
    });
  },
);

export default app;
