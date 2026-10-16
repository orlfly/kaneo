import { z } from "../openapi";

export const taskIdParam = z.object({ taskId: z.string() });

export const taskRelationParam = z.object({ id: z.string() });

export const taskRelationTypeSchema = z.enum(["subtask", "blocks", "related"]);

/**
 * A relation declared together with task creation: the new task is the source,
 * the referenced task the target.
 */
export const taskRelationInputSchema = z.object({
  targetTaskId: z.string(),
  relationType: taskRelationTypeSchema,
});

export const createTaskRelationBody = z.object({
  sourceTaskId: z.string(),
  targetTaskId: z.string(),
  relationType: taskRelationTypeSchema,
});
