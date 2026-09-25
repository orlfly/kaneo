import { AGENT_ROLES, HUMAN_REQUIRED_ROLE } from "@kaneo/permissions";
import { z } from "../openapi";
import { MAX_TASK_POSITION } from "./controllers/next-task-position";
import { VALID_PRIORITIES } from "./validate-task-fields";

// A `required_role` column accepts either one of the agent roles or the
// literal "human" marker (reserves the task for a human team member). Omitted
// means "any agent role may claim". See packages/permissions HUMAN_REQUIRED_ROLE.
export const requiredRoleSchema = z
  .union([z.enum(AGENT_ROLES), z.literal(HUMAN_REQUIRED_ROLE)])
  .nullable()
  .openapi({
    description:
      "Agent role required to claim the task, 'human', or null for any",
  });

// --- Task-creation quality guards (see openspec improve-task-creation-quality) ---

/** A title is readable when it is not a pure branch name, ticket id, or SHA-like hex. */
export function titleLooksReadable(title: string): boolean {
  const t = title.trim();
  if (t.length < 8) return false;
  if (/^#?\d+$/.test(t)) return false; // ticket id
  if (/^[0-9a-f]{7,}$/i.test(t)) return false; // SHA-like
  if (/^[a-z][\w-]*\/[\w./-]+$/i.test(t)) return false; // branch-like
  return true;
}

/** Description must carry an Acceptance Criteria section for reviewers. */
export function descHasAcceptanceCriteria(description: string): boolean {
  return /acceptance criteria|验收标准/iu.test(description);
}

export const humanReadableTitleSchema = z
  .string()
  .min(8, "title must be at least 8 characters")
  .refine(
    titleLooksReadable,
    "title must be human-readable (not a branch name, ticket id, or SHA)",
  );

const pagingNumber = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "Expected a positive integer")
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const taskParam = z.object({ id: z.string() });

export const claimNextBody = z.object({
  projectId: z.string().optional(),
  priorities: z.array(z.string()).optional(),
  requiredRole: requiredRoleSchema.optional(),
});

export const pauseTaskBody = z.object({ reason: z.string() });

export const claimResultSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.string(),
  claimed: z.literal(true),
});

export const projectIdParam = z.object({ projectId: z.string() });

const priority = z.enum(VALID_PRIORITIES);

// Required object of optional filters: a RouteParameter cannot itself be optional.
export const listTasksQuery = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  // Number("abc") is NaN, which used to reach the limit/offset clause unchecked.
  page: pagingNumber(1, 1_000_000).optional(),
  relatedPage: pagingNumber(1, 1_000_000).optional(),
  limit: pagingNumber(1, 100).optional(),
  sortBy: z
    .enum(["createdAt", "priority", "dueDate", "position", "title", "number"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  unclaimed: z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false" || value === undefined || value === null) {
      return undefined;
    }
    return value;
  }, z.boolean().optional()),
  requiredRole: requiredRoleSchema.optional(),
});

export const bulkUpdateBody = z.object({
  taskIds: z.array(z.string()).min(1),
  operation: z.enum([
    "updateStatus",
    "updatePriority",
    "updateAssignee",
    "delete",
    "addLabel",
    "removeLabel",
    "updateDueDate",
  ]),
  value: z.string().nullable().optional().openapi({
    description:
      "The new value for the chosen operation. Unused by `delete`; null clears an assignee or due date.",
  }),
});

export const createTaskBody = z.object({
  title: humanReadableTitleSchema,
  description: z.string(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  priority,
  status: z.string().openapi({ description: "The target column's slug." }),
  userId: z.string().optional().openapi({ description: "Assignee, if any." }),
  requiredRole: requiredRoleSchema.optional().openapi({
    description:
      'Agent role needed to claim this task, or the literal "human" marker. Omitted means any agent role may claim.',
  }),
  customFields: z
    .array(z.object({ fieldId: z.string(), value: z.string() }))
    .optional(),
});

export const updateTaskBody = z.object({
  title: z.string(),
  description: z.string().optional().openapi({
    description:
      "Omit to preserve the existing description when updating a list summary.",
  }),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  priority,
  status: z.string(),
  projectId: z.string(),
  position: z.number().int().min(0).max(MAX_TASK_POSITION),
  userId: z.string().optional(),
  requiredRole: requiredRoleSchema.optional(),
});

export const moveTaskBody = z.object({
  destinationProjectId: z.string(),
  destinationStatus: z.string().optional().openapi({
    description: "Defaults to the destination project's first column.",
  }),
});

export const importTasksBody = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string().optional(),
      status: z.string(),
      priority: z.string().optional(),
      startDate: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      userId: z.string().nullable().optional(),
    }),
  ),
});

export const updateStatusBody = z.object({ status: z.string() });
export const updatePriorityBody = z.object({ priority });
export const updateAssigneeBody = z.object({
  userId: z.string().nullable().openapi({ description: "Null unassigns." }),
});
export const updateDueDateBody = z.object({ dueDate: z.string().optional() });
export const updateTitleBody = z.object({ title: z.string() });
export const updateDescriptionBody = z.object({ description: z.string() });

const surface = z.enum(["description", "comment"]).openapi({
  description: "Where the image is used, which decides how it is scoped.",
});

export const imageUploadBody = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  surface,
});

export const finalizeImageUploadBody = z.object({
  key: z
    .string()
    .openapi({ description: "The key returned when the URL was issued." }),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  surface,
});

export const descriptionPageQuery = z.object({
  offset: pagingNumber(0, 2_000_000_000).default(0),
  version: z
    .string()
    .regex(/^[0-9]{1,10}$/)
    .optional(),
});
export const descriptionMatchesQuery = z.object({
  query: z.string().trim().min(1).max(256),
  after: z.string().min(1).max(128).optional(),
});
