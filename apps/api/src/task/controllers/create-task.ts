import type { AgentRole } from "@kaneo/permissions";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  customFieldDefinitionTable,
  customFieldValueTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import {
  assertAssignableUser,
  getProjectTeamId,
} from "../../utils/assert-assignable-user";
import {
  assertRequiredCustomFields,
  assertValidTaskStatus,
} from "../validate-task-fields";
import { claimTaskNumber } from "./claim-task-numbers";
import { nextTaskPosition } from "./next-task-position";
import { withTaskNumberRetry } from "./with-task-number-retry";

type CustomFieldInput = {
  fieldId: string;
  value: string;
};

function deduplicateCustomFields(
  customFields?: CustomFieldInput[],
): CustomFieldInput[] | undefined {
  if (!customFields) {
    return undefined;
  }

  const fieldsById = new Map<string, CustomFieldInput>();

  for (const customField of customFields) {
    fieldsById.set(customField.fieldId, customField);
  }

  return Array.from(fieldsById.values());
}

async function createTask({
  projectId,
  currentUserId,
  userId,
  title,
  status,
  startDate,
  dueDate,
  description,
  priority,
  customFields,
  requiredRole,
  agentRole,
}: {
  projectId: string;
  currentUserId: string;
  userId?: string;
  title: string;
  status: string;
  startDate?: Date;
  dueDate?: Date;
  description?: string;
  priority?: string;
  customFields?: CustomFieldInput[];
  requiredRole?: string | null;
  agentRole?: AgentRole;
}) {
  const resolvedStatus = status || "to-do";
  const resolvedPriority = priority || "no-priority";
  // When an agent creates a task without an explicit requiredRole, default it
  // to the agent's own role so the same-role agent handles it.
  const resolvedRequiredRole = requiredRole ?? agentRole ?? null;
  const normalizedCustomFields = deduplicateCustomFields(customFields);

  const normalizedUserId = userId?.trim() || undefined;

  await assertValidTaskStatus(resolvedStatus, projectId);

  const allFields = await db
    .select()
    .from(customFieldDefinitionTable)
    .where(eq(customFieldDefinitionTable.projectId, projectId));

  const mergedCustomFields: CustomFieldInput[] = normalizedCustomFields ?? [];
  const providedFieldIds = new Set(mergedCustomFields.map((f) => f.fieldId));

  for (const field of allFields) {
    if (
      !providedFieldIds.has(field.id) &&
      field.required &&
      field.defaultValue != null &&
      field.defaultValue.trim() !== ""
    ) {
      mergedCustomFields.push({
        fieldId: field.id,
        value: field.defaultValue,
      });
    }
  }

  await assertRequiredCustomFields(projectId, mergedCustomFields);

  let assignee: { name: string } | undefined;

  if (normalizedUserId) {
    await assertAssignableUser(
      normalizedUserId,
      await getProjectTeamId(projectId),
    );

    [assignee] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, normalizedUserId));
  }

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, resolvedStatus),
    ),
  });

  const createdTask = await withTaskNumberRetry(
    () =>
      db.transaction(async (tx) => {
        const taskNumber = await claimTaskNumber(projectId, tx);
        const nextPosition = await nextTaskPosition(
          tx,
          projectId,
          resolvedStatus,
          column?.id ?? null,
        );

        const [task] = await tx
          .insert(taskTable)
          .values({
            projectId,
            userId: normalizedUserId ?? null,
            title: title || "",
            status: resolvedStatus,
            columnId: column?.id ?? null,
            startDate: startDate || null,
            dueDate: dueDate || null,
            description: description || "",
            priority: resolvedPriority,
            number: taskNumber,
            position: nextPosition,
            requiredRole: resolvedRequiredRole,
          })
          .returning();

        if (task && mergedCustomFields.length) {
          await tx.insert(customFieldValueTable).values(
            mergedCustomFields.map(({ fieldId, value }) => ({
              taskId: task.id,
              fieldId,
              value: value.trim(),
            })),
          );
        }

        return task;
      }),
    {
      projectId,
      onRetry: (attempt) => {
        if (process.env.NODE_ENV !== "test") {
          // eslint-disable-next-line no-console
          console.warn(
            `[create-task] task_number_retry project=${projectId} attempt=${attempt}`,
          );
        }
      },
    },
  );

  if (!createdTask) {
    throw new HTTPException(500, {
      message: "Failed to create task",
    });
  }

  await publishEvent("task.created", {
    ...createdTask,
    taskId: createdTask.id,
    userId: createdTask.userId ?? "",
    currentUserId: currentUserId,
    type: "created",
    content: null,
  });

  return {
    ...createdTask,
    assigneeName: assignee?.name,
  };
}

export default createTask;
