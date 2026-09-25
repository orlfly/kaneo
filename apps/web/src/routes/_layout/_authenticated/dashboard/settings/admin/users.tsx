import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  EllipsisIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TrashIcon,
  UserRoundPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import UserTeamsDialog from "@/components/admin/user-teams-dialog";
import PageTitle from "@/components/page-title";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useCreateUser from "@/hooks/mutations/admin/use-create-user";
import useDeleteUser from "@/hooks/mutations/admin/use-delete-user";
import useResetUserPassword from "@/hooks/mutations/admin/use-reset-user-password";
import useUpdateUser from "@/hooks/mutations/admin/use-update-user";
import useAdminUsers from "@/hooks/queries/admin/use-admin-users";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/admin/users",
)({
  component: RouteComponent,
});

type CreateForm = {
  username: string;
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  teamId: string;
};

const EMPTY_CREATE: CreateForm = {
  username: "",
  name: "",
  email: "",
  password: "",
  role: "user",
  teamId: "",
};

function RouteComponent() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const { data: users = [], isLoading } = useAdminUsers();
  const { data: teams = [] } = useGetTeams();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const deleteUser = useDeleteUser();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createError, setCreateError] = useState("");
  const queryClient = useQueryClient();

  const [resetTarget, setResetTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    username: string;
  } | null>(null);

  const [teamsTarget, setTeamsTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isBuiltInAdmin = (username: string | null) => username === "admin";

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE);
    setCreateError("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const username = createForm.username.trim().toLowerCase();
    const name = createForm.name.trim();
    if (!username) {
      setCreateError(t("admin:create.validation.usernameRequired"));
      return;
    }
    if (!/^[a-z0-9_]{1,30}$/.test(username)) {
      setCreateError(t("admin:create.validation.usernameInvalid"));
      return;
    }
    if (!name) {
      setCreateError(t("admin:create.validation.nameRequired"));
      return;
    }
    if (createForm.password.length < 8) {
      setCreateError(t("admin:create.validation.passwordShort"));
      return;
    }

    try {
      await createUser.mutateAsync({
        username,
        name,
        email: createForm.email.trim() || undefined,
        password: createForm.password,
        role: createForm.role,
        teamId: createForm.teamId || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "user-teams"] });
      toast.success(t("admin:create.success"));
      setCreateOpen(false);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : t("admin:create.error"),
      );
    }
  };

  const handleToggleRole = async (userId: string, role: "user" | "admin") => {
    try {
      await updateUser.mutateAsync({ userId, role });
      toast.success(t("admin:actions.successRole"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("admin:actions.error"),
      );
    }
  };

  const handleToggleBanned = async (userId: string, banned: boolean) => {
    try {
      await updateUser.mutateAsync({ userId, banned });
      toast.success(t("admin:actions.successStatus"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("admin:actions.error"),
      );
    }
  };

  const openReset = (id: string, username: string) => {
    setResetTarget({ id, username });
    setNewPassword("");
    setResetError("");
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 8) {
      setResetError(t("admin:create.validation.passwordShort"));
      return;
    }
    try {
      await resetPassword.mutateAsync({
        userId: resetTarget.id,
        password: newPassword,
      });
      toast.success(t("admin:resetPassword.success"));
      setResetTarget(null);
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : t("admin:actions.error"),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      toast.success(t("admin:deleteDialog.success"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("admin:actions.error"),
      );
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <PageTitle title={t("admin:page.title")} />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{t("admin:page.title")}</h1>
          <p className="text-muted-foreground">{t("admin:page.description")}</p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {users.length}{" "}
            {t("common:counts.users", {
              defaultValue: "users",
              count: users.length,
            })}
          </span>
          <Button onClick={openCreate} className="gap-2">
            <UserRoundPlusIcon className="size-4" />
            {t("admin:page.createUser")}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-6 text-foreground font-medium">
                {t("admin:columns.user")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("admin:columns.role")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("admin:columns.status")}
              </TableHead>
              <TableHead className="text-foreground font-medium">
                {t("admin:columns.created")}
              </TableHead>
              <TableHead className="w-px pe-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <span className="text-sm text-muted-foreground">
                    {t("common:loading", { defaultValue: "Loading…" })}
                  </span>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <p className="text-sm font-medium text-foreground">
                      {t("admin:page.emptyTitle")}
                    </p>
                    <p className="text-xs">
                      {t("admin:page.emptyDescription")}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((member) => {
                const isSelf = currentUser?.id === member.id;
                const isProtected =
                  member.role === "admin" || isBuiltInAdmin(member.username);
                const role = member.role === "admin" ? "admin" : "user";
                const banned = member.banned === true;
                const displayName =
                  member.displayUsername || member.username || member.name;

                return (
                  <TableRow key={member.id}>
                    <TableCell className="ps-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8 bg-muted text-muted-foreground">
                          <AvatarFallback className="text-[11px] font-medium">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {member.name}
                            </span>
                            {isSelf ? (
                              <span className="text-xs text-muted-foreground">
                                ({t("admin:page.currentUserBadge")})
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            @{displayName}
                            {member.email ? ` · ${member.email}` : ""}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {member.role === "admin" ? (
                        <Badge variant="outline" className="gap-1">
                          <ShieldCheckIcon className="size-3" />
                          {t("admin:role.admin")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t("admin:role.user")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      {banned ? (
                        <Badge variant="destructive">
                          {t("admin:status.disabled")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          {t("admin:status.active")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground tabular-nums">
                      {member.createdAt
                        ? formatDateMedium(member.createdAt)
                        : "–"}
                    </TableCell>
                    <TableCell className="pe-6 py-3 text-right">
                      <Menu>
                        <MenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              aria-label={t("admin:columns.actions", {
                                defaultValue: "Actions",
                              })}
                            />
                          }
                        >
                          <EllipsisIcon className="size-4" />
                        </MenuTrigger>
                        <MenuPopup align="end">
                          <MenuItem
                            onClick={() =>
                              openReset(
                                member.id,
                                member.displayUsername ||
                                  member.username ||
                                  member.name,
                              )
                            }
                          >
                            <KeyRoundIcon className="size-4" />
                            {t("admin:actions.resetPassword")}
                          </MenuItem>

                          <MenuItem
                            onClick={() =>
                              setTeamsTarget({
                                id: member.id,
                                name: member.name,
                              })
                            }
                          >
                            <UsersIcon className="size-4" />
                            {t("admin:actions.manageTeams")}
                          </MenuItem>

                          {!isSelf && !isProtected ? (
                            <>
                              {role === "user" ? (
                                <MenuItem
                                  onClick={() =>
                                    handleToggleRole(member.id, "admin")
                                  }
                                >
                                  <ShieldCheckIcon className="size-4" />
                                  {t("admin:actions.promote")}
                                </MenuItem>
                              ) : (
                                <MenuItem
                                  onClick={() =>
                                    handleToggleRole(member.id, "user")
                                  }
                                >
                                  <ShieldXIcon className="size-4" />
                                  {t("admin:actions.demote")}
                                </MenuItem>
                              )}

                              <MenuItem
                                onClick={() =>
                                  handleToggleBanned(member.id, !banned)
                                }
                              >
                                {banned
                                  ? t("admin:actions.enable")
                                  : t("admin:actions.disable")}
                              </MenuItem>

                              <MenuItem
                                variant="destructive"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: member.id,
                                    name: member.name,
                                    username:
                                      member.displayUsername ||
                                      member.username ||
                                      member.name,
                                  })
                                }
                              >
                                <TrashIcon className="size-4" />
                                {t("admin:actions.delete")}
                              </MenuItem>
                            </>
                          ) : null}
                        </MenuPopup>
                      </Menu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create user dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => !open && setCreateOpen(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin:create.title")}</DialogTitle>
            <DialogDescription>
              {t("admin:create.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-1">
            <div className="space-y-2">
              <Label htmlFor="admin-create-username">
                {t("admin:create.username")}
              </Label>
              <Input
                id="admin-create-username"
                value={createForm.username}
                placeholder={t("admin:create.usernamePlaceholder")}
                onChange={(e) =>
                  setCreateForm({ ...createForm, username: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-create-name">
                {t("admin:create.name")}
              </Label>
              <Input
                id="admin-create-name"
                value={createForm.name}
                placeholder={t("admin:create.namePlaceholder")}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-create-email">
                {t("admin:create.email")}
              </Label>
              <Input
                id="admin-create-email"
                type="email"
                value={createForm.email}
                placeholder={t("admin:create.emailPlaceholder")}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-create-password">
                {t("admin:create.password")}
              </Label>
              <Input
                id="admin-create-password"
                type="password"
                value={createForm.password}
                placeholder={t("admin:create.passwordPlaceholder")}
                onChange={(e) =>
                  setCreateForm({ ...createForm, password: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin:create.role")}</Label>
              <Select
                value={createForm.role}
                onValueChange={(value) =>
                  setCreateForm({
                    ...createForm,
                    role: (value as "user" | "admin") || "user",
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {t(`admin:role.${createForm.role}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("admin:role.user")}</SelectItem>
                  <SelectItem value="admin">{t("admin:role.admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("admin:create.team")}</Label>
              <Select
                value={createForm.teamId}
                onValueChange={(value) =>
                  setCreateForm({ ...createForm, teamId: value || "" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("admin:create.teamPlaceholder")}>
                    {createForm.teamId
                      ? teams.find((team) => team.id === createForm.teamId)
                          ?.name
                      : t("admin:create.teamNone")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("admin:create.teamNone")}</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={createUser.isPending}
                />
              }
            >
              {t("common:actions.cancel")}
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              disabled={createUser.isPending}
              onClick={handleCreate}
            >
              {t("admin:create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin:resetPassword.title")}</DialogTitle>
            <DialogDescription>
              {t("admin:resetPassword.description", {
                username: resetTarget?.username ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 p-6 pt-1">
            <Label htmlFor="admin-reset-password">
              {t("admin:resetPassword.password")}
            </Label>
            <Input
              id="admin-reset-password"
              type="password"
              value={newPassword}
              placeholder={t("admin:create.passwordPlaceholder")}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {resetError ? (
              <p className="text-sm text-destructive">{resetError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resetPassword.isPending}
                />
              }
            >
              {t("common:actions.cancel")}
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              disabled={resetPassword.isPending}
              onClick={handleReset}
            >
              {t("admin:resetPassword.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin:deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin:deleteDialog.description", {
                name: deleteTarget?.name ?? "",
                username: deleteTarget?.username ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleteUser.isPending}
                />
              }
            >
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteUser.isPending}
                  onClick={handleDelete}
                  className={cn("gap-2")}
                />
              }
            >
              <TrashIcon className="size-4" />
              {t("admin:deleteDialog.confirm")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UserTeamsDialog
        userId={teamsTarget?.id ?? null}
        userName={teamsTarget?.name ?? ""}
        open={!!teamsTarget}
        onOpenChange={(open) => {
          if (!open) setTeamsTarget(null);
        }}
      />
    </>
  );
}

export default RouteComponent;
