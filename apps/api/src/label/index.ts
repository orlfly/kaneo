import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { labelSchema } from "../schemas";
import { requireTeamRole } from "../utils/require-team-role";
import { teamAccess } from "../utils/team-access-middleware";
import assignLabelToTask from "./controllers/assign-label-to-task";
import createLabel from "./controllers/create-label";
import deleteLabel from "./controllers/delete-label";
import getLabel from "./controllers/get-label";
import getLabelsByTaskId from "./controllers/get-labels-by-task-id";
import getLabelsByTeamId from "./controllers/get-labels-by-team-id";
import unassignLabelFromTask from "./controllers/unassign-label-from-task";
import updateLabel from "./controllers/update-label";

const label = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/task/:taskId",
    describeRoute({
      operationId: "getTaskLabels",
      tags: ["Labels"],
      description: "Get all labels assigned to a specific task",
      responses: {
        200: {
          description: "List of labels for the task",
          content: {
            "application/json": { schema: resolver(v.array(labelSchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    teamAccess.fromTaskId(),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const labels = await getLabelsByTaskId(taskId);
      return c.json(labels);
    },
  )
  .get(
    "/team/:teamId",
    describeRoute({
      operationId: "getTeamLabels",
      tags: ["Labels"],
      description: "Get all labels for a specific team",
      responses: {
        200: {
          description: "List of labels in the team",
          content: {
            "application/json": { schema: resolver(v.array(labelSchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ teamId: v.string() })),
    teamAccess.fromTeam(),
    async (c) => {
      const { teamId } = c.req.valid("param");
      const labels = await getLabelsByTeamId(teamId);
      return c.json(labels);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createLabel",
      tags: ["Labels"],
      description: "Create a new label in a team",
      responses: {
        200: {
          description: "Label created successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        name: v.string(),
        color: v.string(),
        teamId: v.string(),
        taskId: v.optional(v.string()),
      }),
    ),
    teamAccess.fromBody(),
    requireTeamRole("member"),
    async (c) => {
      const { name, color, teamId, taskId } = c.req.valid("json");
      const userId = c.get("userId");
      const label = await createLabel(name, color, taskId, teamId, userId);
      return c.json(label);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getLabel",
      tags: ["Labels"],
      description: "Get a specific label by ID",
      responses: {
        200: {
          description: "Label details",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    teamAccess.fromLabel(),
    async (c) => {
      const { id } = c.req.valid("param");
      const label = await getLabel(id);
      return c.json(label);
    },
  )
  .put(
    "/:id/task",
    describeRoute({
      operationId: "attachLabelToTask",
      tags: ["Labels"],
      description: "Attach an existing label to a task",
      responses: {
        200: {
          description: "Label attached to task successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ taskId: v.string() })),
    teamAccess.fromLabel(),
    requireTeamRole("member"),
    async (c) => {
      const { id } = c.req.valid("param");
      const { taskId } = c.req.valid("json");
      const userId = c.get("userId");
      const label = await assignLabelToTask(id, taskId, userId);
      return c.json(label);
    },
  )
  .delete(
    "/:id/task",
    describeRoute({
      operationId: "detachLabelFromTask",
      tags: ["Labels"],
      description: "Detach a label from its current task",
      responses: {
        200: {
          description: "Label detached from task successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    teamAccess.fromLabel(),
    requireTeamRole("member"),
    async (c) => {
      const { id } = c.req.valid("param");
      const userId = c.get("userId");
      const label = await unassignLabelFromTask(id, userId);
      return c.json(label);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateLabel",
      tags: ["Labels"],
      description: "Update an existing label",
      responses: {
        200: {
          description: "Label updated successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        color: v.string(),
      }),
    ),
    teamAccess.fromLabel(),
    requireTeamRole("member"),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name, color } = c.req.valid("json");
      const label = await updateLabel(id, name, color);
      return c.json(label);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteLabel",
      tags: ["Labels"],
      description: "Delete a label by ID",
      responses: {
        200: {
          description: "Label deleted successfully",
          content: {
            "application/json": { schema: resolver(labelSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    teamAccess.fromLabel(),
    requireTeamRole("member"),
    async (c) => {
      const { id } = c.req.valid("param");
      const userId = c.get("userId");
      const label = await deleteLabel(id, userId);
      return c.json(label);
    },
  );

export default label;
