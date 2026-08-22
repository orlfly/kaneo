import { UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useAdminAddUserToTeam from "@/hooks/mutations/admin/use-add-user-to-team";
import useAdminUpdateTeamMemberRole from "@/hooks/mutations/admin/use-admin-update-team-member-role";
import useAdminRemoveUserFromTeam from "@/hooks/mutations/admin/use-remove-user-from-team";
import useAdminTeamMembers from "@/hooks/queries/admin/use-admin-team-members";
import useAdminUsers from "@/hooks/queries/admin/use-admin-users";
import { getInitials } from "@/lib/get-initials";

type TeamMembersDialogProps = {
  teamId: string | null;
  teamName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function TeamMembersDialog({
  teamId,
  teamName,
  open,
  onOpenChange,
}: TeamMembersDialogProps) {
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: members = [], isLoading } = useAdminTeamMembers(teamId);
  const { data: allUsers = [] } = useAdminUsers();
  const addUserToTeam = useAdminAddUserToTeam();
  const removeUserFromTeam = useAdminRemoveUserFromTeam();
  const updateRole = useAdminUpdateTeamMemberRole();

  const memberIds = new Set(members.map((m) => m.id));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  const handleAdd = async () => {
    if (!teamId || !selectedUserId) return;
    try {
      await addUserToTeam.mutateAsync({ userId: selectedUserId, teamId });
      setSelectedUserId("");
    } catch {
      // error toast handled in hook
    }
  };

  const handleRemove = async (userId: string) => {
    if (!teamId) return;
    try {
      await removeUserFromTeam.mutateAsync({ userId, teamId });
    } catch {
      // error toast handled in hook
    }
  };

  const handleChangeRole = async (userId: string, role: "owner" | "member") => {
    if (!teamId) return;
    try {
      await updateRole.mutateAsync({ teamId, userId, role });
    } catch {
      // error toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" />
            {t("admin:teams.membersTitle", {
              defaultValue: "Members",
              name: teamName,
            })}
          </DialogTitle>
          <DialogDescription>
            {t("admin:teams.membersDescription", {
              defaultValue: "Manage which users belong to this team.",
              name: teamName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-6 pt-1">
          <div className="space-y-2">
            <span className="text-sm font-medium">
              {t("admin:teams.membersCurrent", {
                defaultValue: "Current members",
              })}
            </span>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("common:states.loading", { defaultValue: "Loading…" })}
              </p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin:teams.membersEmpty", {
                  defaultValue: "This team has no members yet.",
                })}
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 rounded-md border p-2"
                  >
                    <Avatar className="size-7 bg-muted text-muted-foreground">
                      <AvatarFallback className="text-[10px] font-medium">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {member.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {member.email}
                      </div>
                    </div>
                    <Select
                      value={member.role}
                      onValueChange={(value) => {
                        if (value === "owner" || value === "member") {
                          handleChangeRole(member.id, value);
                        }
                      }}
                    >
                      <SelectTrigger size="sm" className="h-7 w-28">
                        <SelectValue>
                          {t(`team:roles.${member.role}`, {
                            defaultValue: member.role,
                          })}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">
                          {t("team:roles.owner", { defaultValue: "Owner" })}
                        </SelectItem>
                        <SelectItem value="member">
                          {t("team:roles.member", { defaultValue: "Member" })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      title={t("admin:teams.membersRemove", {
                        defaultValue: "Remove from team",
                      })}
                      onClick={() => handleRemove(member.id)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {availableUsers.length > 0 ? (
            <div className="space-y-2">
              <span className="text-sm font-medium">
                {t("admin:teams.membersAdd", {
                  defaultValue: "Add user to team",
                })}
              </span>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedUserId}
                  onValueChange={(value) => {
                    if (value) setSelectedUserId(value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t("admin:teams.membersChooseUser", {
                        defaultValue: "Choose a user…",
                      })}
                    >
                      {allUsers.find((u) => u.id === selectedUserId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          @{user.displayUsername || user.username}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAdd}
                  disabled={!selectedUserId || addUserToTeam.isPending}
                  size="sm"
                >
                  {addUserToTeam.isPending
                    ? t("common:actions.adding", { defaultValue: "Adding…" })
                    : t("admin:teams.membersAddButton", {
                        defaultValue: "Add",
                      })}
                </Button>
              </div>
            </div>
          ) : members.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin:teams.membersNoAvailable", {
                defaultValue: "All users are already in this team.",
              })}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TeamMembersDialog;
