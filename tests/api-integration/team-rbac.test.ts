import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createTeamMember } from "./helpers/fixtures";

async function seedTask(
  projectId: string,
  columnId: string | null,
  userId?: string,
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: "Seeded task",
      description: "Existing",
      priority: "medium",
      status: "to-do",
      columnId,
      number: 1,
      position: 1,
      ...(userId ? { userId } : {}),
    })
    .returning();
  return task;
}

async function postCreateTask(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
) {
  return app.request(`/api/task/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "RBAC probe",
      description: "",
      priority: "low",
      status: "to-do",
    }),
  });
}

function bulkRequest(
  app: ReturnType<typeof createApp>["app"],
  body: { taskIds: string[]; operation: string; value?: string | null },
) {
  return app.request("/api/task/bulk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API integration: team RBAC enforcement", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  describe("member and owner roles", () => {
    it("allows a member to create a task", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project } = await createProjectFixture({
        teamId: member.team.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await postCreateTask(app, project.id);
      expect(response.status).toBe(200);
    });

    it("allows a member to delete a task (the team model does not tier task:delete)", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);

      const stillThere = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      });
      expect(stillThere).toBeUndefined();
    });

    it("allows an owner to delete a task", async () => {
      const owner = await createTeamMember({ role: "owner" });
      const { project, columns } = await createProjectFixture({
        teamId: owner.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      mockAuthenticatedSession(owner.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);
    });

    it("returns 403 for users with no membership row for the team", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project } = await createProjectFixture({
        teamId: member.team.id,
      });

      const stranger = await createTeamMember();
      mockAuthenticatedSession(stranger.user);
      const { app } = createApp();

      const response = await postCreateTask(app, project.id);
      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe("Not a member of this team");

      const persisted = await db.query.taskTable.findFirst({
        where: and(
          eq(schema.taskTable.projectId, project.id),
          eq(schema.taskTable.title, "RBAC probe"),
        ),
      });
      expect(persisted).toBeUndefined();
    });

    it("does not authorize a project through a conflicting teamId query", async () => {
      const member = await createTeamMember({ role: "member" });
      const owner = await createTeamMember();
      // The project lives in the owner's team; the attacker tries to claim
      // their own team via the query parameter and must still be refused.
      const { project } = await createProjectFixture({
        teamId: owner.team.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(
        `/api/task/${project.id}?teamId=${member.team.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Cross-team probe",
            description: "",
            priority: "low",
            status: "to-do",
          }),
        },
      );
      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe("Not a member of this team");
    });
  });

  describe("bulk task mutations", () => {
    it("allows a member to change task priority in bulk", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await bulkRequest(app, {
        taskIds: [task.id],
        operation: "updatePriority",
        value: "high",
      });
      expect(response.status).toBe(200);

      const persisted = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      });
      expect(persisted?.priority).toBe("high");
    });

    it("preserves the not-found response for unknown tasks", async () => {
      const member = await createTeamMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await bulkRequest(app, {
        taskIds: [`missing-${randomUUID()}`],
        operation: "updatePriority",
        value: "high",
      });
      expect(response.status).toBe(404);
    });

    it("rejects bulk mutations that span teams", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);
      const { project: foreignProject, columns: foreignColumns } =
        await createProjectFixture({
          teamId: (await createTeamMember()).team.id,
        });
      const foreignTask = await seedTask(
        foreignProject.id,
        foreignColumns.todo.id,
      );

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await bulkRequest(app, {
        taskIds: [task.id, foreignTask.id],
        operation: "updatePriority",
        value: "high",
      });
      expect(response.status).toBe(400);

      const persisted = await db
        .select({ id: schema.taskTable.id })
        .from(schema.taskTable)
        .where(inArray(schema.taskTable.id, [task.id, foreignTask.id]));
      expect(persisted).toHaveLength(2);
    });

    it("allows a member to delete tasks in bulk", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await bulkRequest(app, {
        taskIds: [task.id],
        operation: "delete",
      });
      expect(response.status).toBe(200);

      const persisted = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      });
      expect(persisted).toBeUndefined();
    });

    it("allows a member to assign a task in bulk", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await bulkRequest(app, {
        taskIds: [task.id],
        operation: "updateAssignee",
        value: member.user.id,
      });
      expect(response.status).toBe(200);

      const persisted = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      });
      expect(persisted?.userId).toBe(member.user.id);
    });

    it("does not copy a label from another team in bulk", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      const foreignMember = await createTeamMember();
      const [foreignLabel] = await db
        .insert(schema.labelTable)
        .values({
          id: `label-${randomUUID()}`,
          teamId: foreignMember.team.id,
          name: "Foreign label",
          color: "#ffffff",
        })
        .returning();

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await bulkRequest(app, {
        taskIds: [task.id],
        operation: "addLabel",
        value: foreignLabel.id,
      });
      expect(response.status).toBe(400);

      const copiedLabel = await db.query.labelTable.findFirst({
        where: and(
          eq(schema.labelTable.taskId, task.id),
          eq(schema.labelTable.name, foreignLabel.name),
        ),
      });
      expect(copiedLabel).toBeUndefined();
    });
  });

  describe("resource coverage", () => {
    it("allows a member to update a task", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated by member",
          description: "",
          priority: "medium",
          status: "to-do",
          projectId: project.id,
          position: 1,
        }),
      });
      expect(response.status).toBe(200);
    });

    it("allows a member to assign a task through full update", async () => {
      const member = await createTeamMember({ role: "member" });
      const { project, columns } = await createProjectFixture({
        teamId: member.team.id,
      });
      const task = await seedTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Assigned by member",
          description: "",
          priority: "medium",
          status: "to-do",
          projectId: project.id,
          position: 1,
          userId: member.user.id,
        }),
      });
      expect(response.status).toBe(200);

      const persisted = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      });
      expect(persisted?.userId).toBe(member.user.id);
    });

    it("allows a member to create, update, and delete a project", async () => {
      const member = await createTeamMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const createResponse = await app.request("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: member.team.id,
          name: "Member-created project",
          icon: "Folder",
          slug: `member-project-${randomUUID()}`,
        }),
      });
      expect(createResponse.status).toBe(200);

      const projectId = (await createResponse.json()).id;
      const updateResponse = await app.request(`/api/project/${projectId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Renamed by member",
          icon: "Folder",
          slug: `member-project-${randomUUID()}`,
          description: "",
          isPublic: false,
        }),
      });
      expect(updateResponse.status).toBe(200);

      const deleteResponse = await app.request(`/api/project/${projectId}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(200);
    });

    it("allows a member to create a label", async () => {
      const member = await createTeamMember({ role: "member" });
      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/label", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: member.team.id,
          name: "Member label",
          color: "#ff0000",
        }),
      });
      expect(response.status).toBe(200);
    });

    it("allows a member to delete a label", async () => {
      const member = await createTeamMember({ role: "member" });
      const [label] = await db
        .insert(schema.labelTable)
        .values({
          id: `label-${randomUUID()}`,
          teamId: member.team.id,
          name: "Member label",
          color: "#ff0000",
        })
        .returning();

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/label/${label.id}`, {
        method: "DELETE",
      });
      expect(response.status).toBe(200);
    });
  });

  describe("instance admin bypass", () => {
    it("bypasses the team membership check when user.role === 'admin'", async () => {
      const member = await createTeamMember({ role: "member" });
      // Promote the user to instance admin.
      await db
        .update(schema.userTable)
        .set({ role: "admin" })
        .where(eq(schema.userTable.id, member.user.id));

      const { project } = await createProjectFixture({
        teamId: member.team.id,
      });

      // Reload the user so the mocked session reflects the admin role.
      const refreshedUser = await db.query.userTable.findFirst({
        where: eq(schema.userTable.id, member.user.id),
      });
      if (!refreshedUser) throw new Error("user vanished after update");

      mockAuthenticatedSession(refreshedUser);
      const { app } = createApp();

      const response = await postCreateTask(app, project.id);
      expect(response.status).toBe(200);
    });

    it("does not bypass for users with no role set", async () => {
      const [noRole] = await db
        .insert(schema.userTable)
        .values({
          id: `rbac-norole-${randomUUID()}`,
          email: `rbac-norole-${randomUUID()}@example.com`,
          emailVerified: true,
          name: "No Role",
        })
        .returning();
      const member = await createTeamMember();
      const { project } = await createProjectFixture({
        teamId: member.team.id,
      });

      mockAuthenticatedSession(noRole);
      const { app } = createApp();

      const response = await postCreateTask(app, project.id);
      expect(response.status).toBe(403);
    });
  });
});
