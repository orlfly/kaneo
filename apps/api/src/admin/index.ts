import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import createUser from "./controllers/create-user";
import deleteUser from "./controllers/delete-user";
import listUsers from "./controllers/list-users";
import resetUserPassword from "./controllers/reset-password";
import updateUser from "./controllers/update-user";
import {
  addUserToTeam,
  changeTeamMemberRole,
  listMembersForTeam,
  listUserTeams,
  removeUserFromTeam,
} from "./controllers/user-teams";
import { requireAdminHandler } from "./require-admin";

const createUserSchema = v.object({
  username: v.pipe(v.string(), v.trim(), v.minLength(1)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  email: v.optional(v.pipe(v.string(), v.email())),
  password: v.pipe(v.string(), v.minLength(8)),
  role: v.optional(v.picklist(["user", "admin"]), "user"),
  teamId: v.optional(v.string()),
  teamRole: v.optional(v.string()),
});

const updateUserSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  role: v.optional(v.picklist(["user", "admin"])),
  banned: v.optional(v.boolean()),
  teamId: v.optional(v.string()),
  teamRole: v.optional(v.string()),
});

const resetPasswordSchema = v.object({
  password: v.pipe(v.string(), v.minLength(8)),
});

const idParamSchema = v.object({ id: v.string() });

const teamIdParamSchema = v.object({ id: v.string(), teamId: v.string() });

const addTeamMemberSchema = v.object({
  role: v.optional(v.picklist(["owner", "member"]), "member"),
});

function toHttpError(error: unknown): HTTPException {
  if (error instanceof HTTPException) {
    return error;
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return new HTTPException(400, { message });
}

const adminRoutes = new Hono()
  .get("/users", async (c) => {
    await requireAdminHandler(c);
    const users = await listUsers();
    return c.json({ users });
  })
  .post("/users", validator("json", createUserSchema), async (c) => {
    try {
      await requireAdminHandler(c);
      const { email, ...rest } = c.req.valid("json");
      const result = await createUser({ email: email || undefined, ...rest });
      return c.json({ user: result }, 201);
    } catch (error) {
      throw toHttpError(error);
    }
  })
  .patch(
    "/users/:id",
    validator("param", idParamSchema),
    validator("json", updateUserSchema),
    async (c) => {
      try {
        await requireAdminHandler(c);
        const { id } = c.req.valid("param");
        const result = await updateUser(id, c.req.valid("json"));
        return c.json({ user: result });
      } catch (error) {
        throw toHttpError(error);
      }
    },
  )
  .post(
    "/users/:id/password",
    validator("param", idParamSchema),
    validator("json", resetPasswordSchema),
    async (c) => {
      try {
        await requireAdminHandler(c);
        const { id } = c.req.valid("param");
        await resetUserPassword(id, c.req.valid("json").password);
        return c.json({ ok: true });
      } catch (error) {
        throw toHttpError(error);
      }
    },
  )
  .delete("/users/:id", validator("param", idParamSchema), async (c) => {
    try {
      await requireAdminHandler(c);
      const { id } = c.req.valid("param");
      await deleteUser(id);
      return c.json({ ok: true });
    } catch (error) {
      throw toHttpError(error);
    }
  })
  .get("/users/:id/teams", validator("param", idParamSchema), async (c) => {
    try {
      await requireAdminHandler(c);
      const { id } = c.req.valid("param");
      const teams = await listUserTeams(id);
      return c.json({ teams });
    } catch (error) {
      throw toHttpError(error);
    }
  })
  .post(
    "/users/:id/teams/:teamId",
    validator("param", teamIdParamSchema),
    validator("json", addTeamMemberSchema),
    async (c) => {
      try {
        await requireAdminHandler(c);
        const { id, teamId } = c.req.valid("param");
        const { role } = c.req.valid("json");
        const result = await addUserToTeam(id, teamId, role);
        return c.json({ result }, 201);
      } catch (error) {
        throw toHttpError(error);
      }
    },
  )
  .delete(
    "/users/:id/teams/:teamId",
    validator("param", teamIdParamSchema),
    async (c) => {
      try {
        await requireAdminHandler(c);
        const { id, teamId } = c.req.valid("param");
        const result = await removeUserFromTeam(id, teamId);
        return c.json({ result });
      } catch (error) {
        throw toHttpError(error);
      }
    },
  )
  .get(
    "/teams/:teamId/members",
    validator("param", v.object({ teamId: v.string() })),
    async (c) => {
      try {
        await requireAdminHandler(c);
        const { teamId } = c.req.valid("param");
        const members = await listMembersForTeam(teamId);
        return c.json({ members });
      } catch (error) {
        throw toHttpError(error);
      }
    },
  )
  .patch(
    "/teams/:teamId/members/:userId",
    validator("param", v.object({ teamId: v.string(), userId: v.string() })),
    validator("json", v.object({ role: v.picklist(["owner", "member"]) })),
    async (c) => {
      try {
        await requireAdminHandler(c);
        const { teamId, userId } = c.req.valid("param");
        const { role } = c.req.valid("json");
        const result = await changeTeamMemberRole(teamId, userId, role);
        if (!result.updated) {
          return c.json(
            { message: `Cannot change role: ${result.reason}` },
            409,
          );
        }
        return c.json({ role: result.role });
      } catch (error) {
        throw toHttpError(error);
      }
    },
  );

export default adminRoutes;
