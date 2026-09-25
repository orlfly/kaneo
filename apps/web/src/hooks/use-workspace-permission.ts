import { useMemo } from "react";
import useActiveTeam from "@/hooks/queries/team/use-active-team";
import useGetActiveTeamMember from "@/hooks/queries/team-member/use-active-team-member";

export type PermissionLevel = "owner" | "member";

// The simplified model only has two roles: owner and member. Owners can do
// everything; members can do the day-to-day task/project work. Custom roles
// were removed along with better-auth's organization plugin, so the
// server-side capability matrix no longer exists.
//
// Keeping a thin permission helper around so component code can ask the same
// questions (`canManageWorkspace()`, etc.) it used to ask of the richer API.
// The defaults reflect "owner is all-powerful, member is read-mostly".
export function useWorkspacePermission() {
  const { data: activeWorkspace } = useActiveTeam();
  const { data: activeMember } = useGetActiveTeamMember();
  const role = activeMember?.role;
  const isOwner = role === "owner";

  const capabilities = useMemo(() => {
    return {
      manageProjects: isOwner,
      createProjects: true,
      updateProjects: true,
      deleteProjects: isOwner,
      updateTasks: true,
      createTasks: true,
      deleteTasks: isOwner,
      assignTasks: true,
      createLabels: true,
      updateLabels: true,
      deleteLabels: isOwner,
      manageWorkspace: isOwner,
      deleteWorkspace: isOwner,
      inviteUsers: isOwner,
      manageTeam: isOwner,
      removeMembers: isOwner,
    };
  }, [isOwner]);

  const helpers = useMemo(() => {
    return {
      canManageProjects: () => capabilities.manageProjects,
      canCreateProjects: () => capabilities.createProjects,
      canUpdateProjects: () => capabilities.updateProjects,
      canDeleteProjects: () => capabilities.deleteProjects,
      canUpdateTasks: () => capabilities.updateTasks,
      canCreateTasks: () => capabilities.createTasks,
      canDeleteTasks: () => capabilities.deleteTasks,
      canAssignTasks: () => capabilities.assignTasks,
      canCreateLabels: () => capabilities.createLabels,
      canUpdateLabels: () => capabilities.updateLabels,
      canDeleteLabels: () => capabilities.deleteLabels,
      canManageWorkspace: () => capabilities.manageWorkspace,
      canDeleteWorkspace: () => capabilities.deleteWorkspace,
      canInviteUsers: () => capabilities.inviteUsers,
      canManageTeam: () => capabilities.manageTeam,
      canRemoveMembers: () => capabilities.removeMembers,
      // Escape hatch kept for back-compat; now resolves to the static matrix.
      hasPermission: async (permissions: Record<string, string[]>) => {
        const isManagementOnly = Object.values(permissions).some((actions) =>
          actions.some((a) =>
            ["delete", "manage_settings", "update", "assign"].includes(a),
          ),
        );
        return isManagementOnly ? isOwner : true;
      },
    };
  }, [capabilities, isOwner]);

  return {
    ...helpers,
    workspace: activeWorkspace,
    member: activeMember,
    role,
    isOwner,
    isAdmin: isOwner,
    isCheckingPermissions: false,
    isRefetchingPermissions: false,
  };
}
