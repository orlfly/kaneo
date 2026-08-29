import {
  type AgentRole,
  HUMAN_REQUIRED_ROLE,
  isAgentRole,
  isHumanRequiredRole,
} from "@kaneo/permissions";
import { BotIcon, UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const ROLE_BADGE_CLASS: Record<AgentRole, string> = {
  coding: "border-sky-300/60 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "product-design":
    "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "architecture-design":
    "border-violet-300/60 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  devops:
    "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "ui-design":
    "border-pink-300/60 bg-pink-500/10 text-pink-700 dark:text-pink-300",
  testing: "border-cyan-300/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  "code-review":
    "border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

type TaskRoleBadgeProps = {
  requiredRole: AgentRole | string | null;
  className?: string;
};

export function TaskRoleBadge({ requiredRole, className }: TaskRoleBadgeProps) {
  const { t } = useTranslation();
  if (!requiredRole) return null;

  // Human-only tasks get a distinct neutral badge so they stand apart from
  // the agent-role badges. The agentRole branches below fall through to a
  // role-coloured badge.
  if (isHumanRequiredRole(requiredRole)) {
    return (
      <span
        data-testid="task-role-badge"
        data-role={HUMAN_REQUIRED_ROLE}
        className={cn(
          "inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium",
          "border-zinc-300/60 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
          className,
        )}
      >
        <UserIcon className="w-3 h-3" />
        <span>
          {t("tasks:agentRoles.human.name", { defaultValue: "Human-only" })}
        </span>
      </span>
    );
  }

  if (!isAgentRole(requiredRole)) return null;
  const role = requiredRole;
  return (
    <span
      data-testid="task-role-badge"
      data-role={role}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium",
        ROLE_BADGE_CLASS[role],
        className,
      )}
    >
      <BotIcon className="w-3 h-3" />
      <span>{t(`tasks:agentRoles.${role}.name`, { defaultValue: role })}</span>
    </span>
  );
}

export default TaskRoleBadge;
