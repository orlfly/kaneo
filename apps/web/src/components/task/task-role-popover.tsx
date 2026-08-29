import { AGENT_ROLES, HUMAN_REQUIRED_ROLE } from "@kaneo/permissions";
import { BotIcon, Check, UserIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskRolePopoverProps = {
  task: Task;
  children: React.ReactNode;
};

export default function TaskRolePopover({
  task,
  children,
}: TaskRolePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTask } = useUpdateTask();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();

  const handleRoleChange = async (newRole: string | null) => {
    try {
      await updateTask({
        ...task,
        requiredRole: newRole,
      });
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:popover.role.updateError", {
              defaultValue: "Failed to update agent role",
            }),
      );
    }
  };

  // Read-only: render trigger as plain element so user sees current role
  // but can't open the popover.
  if (!canEdit) return <>{children}</>;

  const options: {
    value: string | null;
    label: string;
    icon: "user" | "bot" | "any";
  }[] = [
    {
      value: null,
      label: t("common:modals.createTask.agentRoleGeneric", {
        defaultValue: "Any agent",
      }),
      icon: "any",
    },
    {
      value: HUMAN_REQUIRED_ROLE,
      label: t("tasks:agentRoles.human.name", {
        defaultValue: "Human-only",
      }),
      icon: "user",
    },
    ...AGENT_ROLES.map((value) => ({
      value,
      label: t(`tasks:agentRoles.${value}.name`, { defaultValue: value }),
      icon: "bot" as const,
    })),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <div>
          {options.map((option) => (
            <Button
              key={String(option.value)}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 px-2 rounded-none first:rounded-t-md last:rounded-b-md"
              onClick={() => handleRoleChange(option.value)}
            >
              {option.icon === "user" ? (
                <UserIcon className="w-3.5 h-3.5" />
              ) : option.icon === "bot" ? (
                <BotIcon className="w-3.5 h-3.5" />
              ) : (
                <span className="w-3.5 h-3.5 flex items-center justify-center text-muted-foreground text-xs">
                  ?
                </span>
              )}
              <span className="text-sm">{option.label}</span>
              {(task.requiredRole ?? null) === option.value && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
