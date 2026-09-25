import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TeamMembersDialog from "@/components/admin/team-members-dialog";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useDeleteTeam from "@/hooks/mutations/team/use-delete-team";
import useSetActiveTeam from "@/hooks/mutations/team/use-set-active-team";
import useUpdateTeam from "@/hooks/mutations/team/use-update-team";
import useCreateTeam from "@/hooks/queries/team/use-create-team";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/admin/teams",
)({
  component: AdminTeamsPage,
});

function AdminTeamsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: teams = [], isLoading } = useGetTeams();
  const { mutateAsync: createTeam, isPending: isCreating } = useCreateTeam();
  const { mutateAsync: deleteTeam, isPending: isDeleting } = useDeleteTeam();
  const { mutateAsync: updateTeam, isPending: isUpdating } = useUpdateTeam();
  const { mutateAsync: setActiveTeam } = useSetActiveTeam();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [membersTarget, setMembersTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (createOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [createOpen]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const team = await createTeam({ name });
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success(t("admin:teams.toast.created", { name: team.name }));
      setCreateOpen(false);
      setNewName("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("admin:teams.toast.createError"),
      );
    }
  };

  const handleEnter = async (teamId: string) => {
    try {
      await setActiveTeam({ teamId });
    } catch {
      // Continue even if setting the active team fails; the route param is
      // sufficient to address the team.
    }
    navigate({ to: "/dashboard/team/$teamId", params: { teamId } });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTeam({ teamId: deleteId });
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success(t("admin:teams.toast.deleted"));
      setDeleteId(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("admin:teams.toast.deleteError"),
      );
    }
  };

  const handleRename = async () => {
    if (!editId) return;
    const name = editTeamName.trim();
    if (!name) return;
    try {
      await updateTeam({ teamId: editId, name });
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      await queryClient.invalidateQueries({ queryKey: ["team", "full"] });
      toast.success(t("admin:teams.toast.renamed"));
      setEditId(null);
      setEditTeamName("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("admin:teams.toast.renameError"),
      );
    }
  };

  return (
    <>
      <PageTitle title={t("admin:teams.pageTitle")} />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {t("admin:teams.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("admin:teams.description")}
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            size="xs"
            className="text-xs"
          >
            <PlusIcon className="size-3.5" />
            {t("admin:teams.create")}
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin:teams.columns.name")}</TableHead>
                <TableHead>{t("admin:teams.columns.role")}</TableHead>
                <TableHead>{t("admin:teams.columns.members")}</TableHead>
                <TableHead className="w-32 text-right">
                  {t("admin:teams.columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {t("common:states.loading")}
                  </TableCell>
                </TableRow>
              ) : teams.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {t("admin:teams.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t(`team:roles.${team.role}`, {
                        defaultValue: team.role,
                      })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {team.memberCount}
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t("admin:teams.manageMembers", {
                          defaultValue: "Manage members",
                        })}
                        onClick={() =>
                          setMembersTarget({ id: team.id, name: team.name })
                        }
                      >
                        <UsersIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t("admin:teams.enter")}
                        onClick={() => handleEnter(team.id)}
                      >
                        <ExternalLinkIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t("admin:teams.labels")}
                        onClick={() =>
                          navigate({
                            to: "/dashboard/settings/admin/teams/$teamId/labels",
                            params: { teamId: team.id },
                          })
                        }
                      >
                        <TagIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t("admin:teams.rename")}
                        onClick={() => {
                          setEditId(team.id);
                          setEditTeamName(team.name);
                        }}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t("admin:teams.delete")}
                        onClick={() => setDeleteId(team.id)}
                        disabled={isDeleting}
                      >
                        <TrashIcon className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">{t("admin:teams.hint")}</p>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin:teams.createDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin:teams.createDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="admin-team-name">
              {t("admin:teams.nameLabel")}
            </Label>
            <Input
              id="admin-team-name"
              ref={inputRef}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t("admin:teams.namePlaceholder")}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreate();
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" size="sm" disabled={isCreating} />
              }
            >
              {t("common:actions.cancel")}
            </DialogClose>
            <Button onClick={handleCreate} disabled={isCreating} size="sm">
              {isCreating
                ? t("common:actions.creating")
                : t("admin:teams.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin:teams.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin:teams.deleteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteId(null)}
              disabled={isDeleting}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {t("admin:teams.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditId(null);
            setEditTeamName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin:teams.renameDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin:teams.renameDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6">
            <Label htmlFor="admin-team-rename">
              {t("admin:teams.nameLabel")}
            </Label>
            <Input
              id="admin-team-rename"
              value={editTeamName}
              onChange={(event) => setEditTeamName(event.target.value)}
              placeholder={t("admin:teams.namePlaceholder")}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleRename();
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUpdating}
                  onClick={() => {
                    setEditId(null);
                    setEditTeamName("");
                  }}
                />
              }
            >
              {t("common:actions.cancel")}
            </DialogClose>
            <Button onClick={handleRename} disabled={isUpdating} size="sm">
              {isUpdating
                ? t("common:actions.saving")
                : t("admin:teams.rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TeamMembersDialog
        teamId={membersTarget?.id ?? null}
        teamName={membersTarget?.name ?? ""}
        open={!!membersTarget}
        onOpenChange={(open) => {
          if (!open) setMembersTarget(null);
        }}
      />
    </>
  );
}
