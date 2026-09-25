import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { sessionTable, teamMemberTable } from "../database/schema";
import { publishEvent } from "../events";
import { requireTeamRole } from "../utils/require-team-role";
import { teamAccess } from "../utils/team-access-middleware";
import {
  addTeamMember,
  archiveTeam,
  createTeam,
  deleteTeam,
  getTeam,
  listTeamMembers,
  listTeamsForUser,
  removeTeamMember,
  unarchiveTeam,
  updateTeam,
  updateTeamMemberRole,
} from "./controllers/index";

const teamSchema = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  description: v.nullable(v.string()),
  role: v.picklist(["owner", "member"] as const),
  memberCount: v.number(),
  createdAt: v.date(),
  archivedAt: v.nullable(v.date()),
});

const teamMemberSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.nullable(v.string()),
  role: v.picklist(["owner", "member"] as const),
  joinedAt: v.date(),
});

const httpError = v.object({ message: v.string() });

const team = new Hono<{
  Variables: {
    userId: string;
    teamId: string;
    teamRole: "owner" | "member";
  };
}>()
  // List teams the caller belongs to.
  .get(
    "/",
    describeRoute({
      operationId: "listTeams",
      tags: ["Teams"],
      description: "List teams the calling user is a member of",
      responses: {
        200: {
          description: "Teams the caller belongs to",
          content: {
            "application/json": { schema: resolver(v.array(teamSchema)) },
          },
        },
      },
    }),
    validator("query", v.object({ includeArchived: v.optional(v.string()) })),
    async (c) => {
      const userId = c.get("userId");
      const { includeArchived } = c.req.valid("query");
      const teams = await listTeamsForUser(userId, {
        includeArchived: includeArchived === "true",
      });
      return c.json(teams);
    },
  )

  // Create a team (caller becomes owner).
  .post(
    "/",
    describeRoute({
      operationId: "createTeam",
      tags: ["Teams"],
      description: "Create a new team; the caller is added as owner",
      responses: {
        200: {
          description: "Team created",
          content: { "application/json": { schema: resolver(teamSchema) } },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": { schema: resolver(httpError) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
      }),
    ),
    async (c) => {
      const userId = c.get("userId");
      const { name } = c.req.valid("json");
      const { team } = await createTeam(userId, name);
      publishEvent("team.created", {
        teamId: team.id,
        teamName: team.name,
        ownerId: userId,
      });
      return c.json(team);
    },
  )

  // Read the caller's persisted active team id. Registered before `/:teamId`
  // so the literal path "active" is not consumed by the param route.
  .get(
    "/active",
    describeRoute({
      operationId: "getActiveTeam",
      tags: ["Teams"],
      description: "Read the caller's persisted active team id.",
      responses: {
        200: {
          description: "Active team id (null when none)",
          content: {
            "application/json": {
              schema: resolver(v.object({ teamId: v.nullable(v.string()) })),
            },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const [row] = await db
        .select({ activeTeamId: sessionTable.activeTeamId })
        .from(sessionTable)
        .where(eq(sessionTable.userId, userId))
        .orderBy(sessionTable.createdAt)
        .limit(1);
      return c.json({ teamId: row?.activeTeamId ?? null });
    },
  )

  // Get a single team the caller belongs to.
  .get(
    "/:teamId",
    describeRoute({
      operationId: "getTeam",
      tags: ["Teams"],
      description: "Get the details of a team the caller belongs to",
      responses: {
        200: {
          description: "Team details",
          content: { "application/json": { schema: resolver(teamSchema) } },
        },
        403: {
          description: "Authorization error",
          content: {
            "application/json": { schema: resolver(httpError) },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    teamAccess.fromTeam(),
    async (c) => {
      const { teamId } = c.req.valid("param");
      const userId = c.get("userId");
      const team = await getTeam(teamId, userId);
      if (!team) {
        return c.json({ message: "Team not found" }, 404);
      }
      return c.json(team);
    },
  )
  // Persist the active team on the user's most recent session.
  // Used by the web app to remember which team the caller is currently viewing.
  .put(
    "/active",
    describeRoute({
      operationId: "setActiveTeam",
      tags: ["Teams"],
      description: "Mark a team as the caller's active team.",
      responses: {
        200: {
          description: "Active team updated",
          content: {
            "application/json": {
              schema: resolver(v.object({ teamId: v.string() })),
            },
          },
        },
      },
    }),
    validator("json", v.object({ teamId: v.string() })),
    async (c) => {
      const userId = c.get("userId");
      const { teamId } = c.req.valid("json");

      // Verify the caller actually belongs to this team before marking it
      // active. Without this guard any authenticated user could spoof the
      // session column.
      const [membership] = await db
        .select({ id: teamMemberTable.id })
        .from(teamMemberTable)
        .where(
          and(
            eq(teamMemberTable.teamId, teamId),
            eq(teamMemberTable.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        return c.json({ message: "Not a member of this team" }, 403);
      }

      const [latestSession] = await db
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(eq(sessionTable.userId, userId))
        .orderBy(sessionTable.createdAt)
        .limit(1);

      if (latestSession) {
        await db
          .update(sessionTable)
          .set({ activeTeamId: teamId })
          .where(eq(sessionTable.id, latestSession.id));
      }

      return c.json({ teamId });
    },
  )
  .delete(
    "/active",
    describeRoute({
      operationId: "clearActiveTeam",
      tags: ["Teams"],
      description: "Clear the caller's active team marker.",
      responses: {
        200: {
          description: "Active team cleared",
          content: {
            "application/json": {
              schema: resolver(v.object({ cleared: v.boolean() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const [latestSession] = await db
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(eq(sessionTable.userId, userId))
        .orderBy(sessionTable.createdAt)
        .limit(1);

      if (latestSession) {
        await db
          .update(sessionTable)
          .set({ activeTeamId: null })
          .where(eq(sessionTable.id, latestSession.id));
      }

      return c.json({ cleared: true });
    },
  )

  // Update a team (owner only).
  .put(
    "/:teamId",
    describeRoute({
      operationId: "updateTeam",
      tags: ["Teams"],
      description: "Update the name or slug of a team (owner only)",
      responses: {
        200: {
          description: "Team updated",
          content: { "application/json": { schema: resolver(teamSchema) } },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.string()),
        slug: v.optional(v.string()),
      }),
    ),
    teamAccess.fromTeam(),
    requireTeamRole("owner"),
    async (c) => {
      const { teamId } = c.req.valid("param");
      const input = c.req.valid("json");
      await updateTeam(teamId, input);
      const userId = c.get("userId");
      const team = await getTeam(teamId, userId);
      return c.json(team);
    },
  )

  // Delete a team (owner only).
  .delete(
    "/:teamId",
    describeRoute({
      operationId: "deleteTeam",
      tags: ["Teams"],
      description:
        "Delete a team. Cascades to projects, columns, tasks, and memberships (owner only).",
      responses: {
        200: {
          description: "Team deleted",
          content: {
            "application/json": {
              schema: resolver(v.object({ deleted: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    teamAccess.fromTeam(),
    requireTeamRole("owner"),
    async (c) => {
      const { teamId } = c.req.valid("param");
      await deleteTeam(teamId);
      return c.json({ deleted: true });
    },
  )

  // Archive a team (owner only).
  .put(
    "/:teamId/archive",
    describeRoute({
      operationId: "archiveTeam",
      tags: ["Teams"],
      description: "Archive a team (owner only).",
      responses: {
        200: {
          description: "Team archived",
          content: {
            "application/json": {
              schema: resolver(v.object({ archived: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    teamAccess.fromTeam(),
    requireTeamRole("owner"),
    async (c) => {
      const { teamId } = c.req.valid("param");
      await archiveTeam(teamId);
      return c.json({ archived: true });
    },
  )

  // Unarchive a team (owner only).
  .put(
    "/:teamId/unarchive",
    describeRoute({
      operationId: "unarchiveTeam",
      tags: ["Teams"],
      description: "Unarchive a team (owner only).",
      responses: {
        200: {
          description: "Team unarchived",
          content: {
            "application/json": {
              schema: resolver(v.object({ archived: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    teamAccess.fromTeam(),
    requireTeamRole("owner"),
    async (c) => {
      const { teamId } = c.req.valid("param");
      await unarchiveTeam(teamId);
      return c.json({ archived: false });
    },
  )

  // List team members (any role).
  .get(
    "/:teamId/members",
    describeRoute({
      operationId: "listTeamMembers",
      tags: ["Teams"],
      description: "List members of a team",
      responses: {
        200: {
          description: "Team members",
          content: {
            "application/json": {
              schema: resolver(v.array(teamMemberSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    teamAccess.fromTeam(),
    async (c) => {
      const { teamId } = c.req.valid("param");
      const members = await listTeamMembers(teamId);
      return c.json(members);
    },
  )

  // Add a user to the team (owner only).
  .post(
    "/:teamId/members",
    describeRoute({
      operationId: "addTeamMember",
      tags: ["Teams"],
      description: "Add a user to a team with a role (owner only).",
      responses: {
        200: {
          description: "Membership added",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ added: v.boolean(), role: v.string() }),
              ),
            },
          },
        },
        409: {
          description: "User is already a member",
          content: {
            "application/json": { schema: resolver(httpError) },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    validator(
      "json",
      v.object({
        userId: v.string(),
        role: v.picklist(["owner", "member"] as const),
      }),
    ),
    teamAccess.fromTeam(),
    requireTeamRole("owner"),
    async (c) => {
      const { teamId } = c.req.valid("param");
      const { userId, role } = c.req.valid("json");
      const result = await addTeamMember(teamId, userId, role);
      if (!result.added) {
        return c.json({ message: "User is already a member" }, 409);
      }
      return c.json({ added: true, role: result.role });
    },
  )

  // Change a member's role (owner only).
  .patch(
    "/:teamId/members/:userId",
    describeRoute({
      operationId: "updateTeamMember",
      tags: ["Teams"],
      description: "Change a member's role (owner only).",
      responses: {
        200: {
          description: "Role updated",
          content: {
            "application/json": {
              schema: resolver(v.object({ role: v.string() })),
            },
          },
        },
        409: {
          description: "Last owner protection",
          content: {
            "application/json": { schema: resolver(httpError) },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string(), userId: v.string() })),
    validator(
      "json",
      v.object({ role: v.picklist(["owner", "member"] as const) }),
    ),
    teamAccess.fromTeam(),
    requireTeamRole("owner"),
    async (c) => {
      const { teamId, userId } = c.req.valid("param");
      const { role } = c.req.valid("json");
      const result = await updateTeamMemberRole(teamId, userId, role);
      if (!result.updated) {
        return c.json({ message: `Cannot change role: ${result.reason}` }, 409);
      }
      return c.json({ role: result.role });
    },
  )

  // Remove a member (owner only).
  .delete(
    "/:teamId/members/:userId",
    describeRoute({
      operationId: "removeTeamMember",
      tags: ["Teams"],
      description: "Remove a member from a team (owner only).",
      responses: {
        200: {
          description: "Member removed",
          content: {
            "application/json": {
              schema: resolver(v.object({ removed: v.boolean() })),
            },
          },
        },
        409: {
          description: "Last owner protection",
          content: {
            "application/json": { schema: resolver(httpError) },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string(), userId: v.string() })),
    teamAccess.fromTeam(),
    requireTeamRole("owner"),
    async (c) => {
      const { teamId, userId } = c.req.valid("param");
      const result = await removeTeamMember(teamId, userId);
      if (!result.removed) {
        return c.json(
          { message: `Cannot remove member: ${result.reason}` },
          409,
        );
      }
      return c.json({ removed: true });
    },
  );

export default team;
