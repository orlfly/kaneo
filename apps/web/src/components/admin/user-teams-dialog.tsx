import { UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
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
import useAdminRemoveUserFromTeam from "@/hooks/mutations/admin/use-remove-user-from-team";
import useAdminUserTeams from "@/hooks/queries/admin/use-admin-user-teams";
import useGetTeams from "@/hooks/queries/team/use-get-teams";

type UserTeamsDialogProps = {
  userId: string | null;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function UserTeamsDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: UserTeamsDialogProps) {
  const { t } = useTranslation();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const { data: allTeams = [] } = useGetTeams();
  const { data: userTeams = [], isLoading } = useAdminUserTeams(
    userId ?? undefined,
  );
  const addUserToTeam = useAdminAddUserToTeam();
  const removeUserFromTeam = useAdminRemoveUserFromTeam();

  const userTeamIds = new Set(userTeams.map((team) => team.id));
  const availableTeams = allTeams.filter((team) => !userTeamIds.has(team.id));

  const handleAdd = async () => {
    if (!userId || !selectedTeamId) return;
    try {
      await addUserToTeam.mutateAsync({ userId, teamId: selectedTeamId });
      setSelectedTeamId("");
    } catch {
      // error toast already handled in the hook
    }
  };

  const handleRemove = async (teamId: string) => {
    if (!userId) return;
    try {
      await removeUserFromTeam.mutateAsync({ userId, teamId });
    } catch {
      // error toast already handled in the hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" />
            {t("admin:teams.userTeamsTitle", {
              defaultValue: "Teams",
              name: userName,
            })}
          </DialogTitle>
          <DialogDescription>
            {t("admin:teams.userTeamsDescription", {
              defaultValue: "Manage which teams this user belongs to.",
              name: userName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-6 pt-1">
          <div className="space-y-2">
            <span className="text-sm font-medium">
              {t("admin:teams.userTeamsCurrent", {
                defaultValue: "Current teams",
              })}
            </span>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("common:states.loading", { defaultValue: "Loading…" })}
              </p>
            ) : userTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin:teams.userTeamsEmpty", {
                  defaultValue: "This user is not a member of any team.",
                })}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {userTeams.map((team) => (
                  <Badge
                    key={team.id}
                    variant="outline"
                    className="gap-1 p-1.5 pl-2"
                  >
                    <span>{team.name}</span>
                    <button
                      type="button"
                      title={t("admin:teams.userTeamsRemove", {
                        defaultValue: "Remove from team",
                      })}
                      onClick={() => handleRemove(team.id)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {availableTeams.length > 0 ? (
            <div className="space-y-2">
              <span className="text-sm font-medium">
                {t("admin:teams.userTeamsAdd", {
                  defaultValue: "Add to team",
                })}
              </span>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedTeamId}
                  onValueChange={(value) => {
                    if (value) setSelectedTeamId(value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t("admin:teams.userTeamsChoose", {
                        defaultValue: "Choose a team…",
                      })}
                    >
                      {
                        allTeams.find((team) => team.id === selectedTeamId)
                          ?.name
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAdd}
                  disabled={!selectedTeamId || addUserToTeam.isPending}
                  size="sm"
                >
                  {addUserToTeam.isPending
                    ? t("common:actions.adding", { defaultValue: "Adding…" })
                    : t("admin:teams.userTeamsAddButton", {
                        defaultValue: "Add",
                      })}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("admin:teams.userTeamsNoAvailable", {
                defaultValue: "This user is already in every team.",
              })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UserTeamsDialog;
