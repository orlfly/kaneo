import { EllipsisIcon, ShieldIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useDeleteTeamMember from "@/hooks/mutations/team-member/use-delete-team-member";
import useUpdateTeamMemberRole from "@/hooks/mutations/team-member/use-update-team-member-role";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import type { TeamMember } from "@/types/team-member";
import { useAuth } from "../providers/auth-provider/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type Props = {
  teamId: string;
  users: TeamMember[];
  canManage?: boolean;
};

const AVATAR_TONES = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
] as const;

function toneFor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function MembersTable({ teamId, users, canManage }: Props) {
  const { t } = useTranslation();
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);

  const { user: currentUser } = useAuth();
  const { mutateAsync: deleteTeamMember, isPending: isDeleting } =
    useDeleteTeamMember();
  const { mutateAsync: updateMemberRole } = useUpdateTeamMemberRole();

  const canChangeRoles = Boolean(canManage);
  const canRemove = Boolean(canManage);

  const sortedUsers = [...users].sort((a, b) => {
    if (a.role === b.role) return 0;
    if (a.role === "owner") return -1;
    if (b.role === "owner") return 1;
    return 0;
  });

  const handleChangeRole = async (member: TeamMember, role: string) => {
    if (role === member.role) return;
    if (role !== "owner" && role !== "member") return;
    try {
      await updateMemberRole({
        teamId,
        userId: member.id,
        role: role as "owner" | "member",
      });
      toast.success(t("team:membersTable.roleUpdateSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("team:membersTable.roleUpdateError"),
      );
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    try {
      await deleteTeamMember({
        teamId,
        userId: memberToDelete.id,
      });
      toast.success(t("team:membersTable.removeSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("team:membersTable.removeError"),
      );
    } finally {
      setMemberToDelete(null);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-6 text-foreground font-medium">
              {t("team:membersTable.columns.name", {
                defaultValue: "Member",
              })}
            </TableHead>
            <TableHead className="text-foreground font-medium">
              {t("team:membersTable.columns.role", { defaultValue: "Role" })}
            </TableHead>
            <TableHead className="text-foreground font-medium">
              {t("team:membersTable.columns.joined", {
                defaultValue: "Joined",
              })}
            </TableHead>
            <TableHead className="w-px pe-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedUsers.map((member) => {
            const isSelf = currentUser?.id === member.id;
            const showRoleSelect =
              canChangeRoles && !isSelf && member.role !== "owner";
            const tone = toneFor(member.email);
            return (
              <TableRow key={member.id}>
                <TableCell className="ps-6 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className={cn("size-8", tone)}>
                      <AvatarImage
                        src={member.image ?? ""}
                        alt={member.name ?? ""}
                      />
                      <AvatarFallback className="bg-transparent text-[11px] font-medium">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {member.name}
                        </span>
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">
                            ({t("team:members.you", { defaultValue: "You" })})
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {member.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  {member.role === "owner" ? (
                    <Badge variant="outline" className="gap-1">
                      <ShieldIcon className="size-3" />
                      {t("team:roles.owner", { defaultValue: "Owner" })}
                    </Badge>
                  ) : showRoleSelect ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) => {
                        if (typeof value === "string" && value) {
                          handleChangeRole(member, value);
                        }
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 w-32">
                        <SelectValue>
                          {t(`team:roles.${member.role}`, {
                            defaultValue: capitalize(member.role),
                          })}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">
                          {t("team:roles.member", { defaultValue: "Member" })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="capitalize">
                      {t(`team:roles.${member.role}`, {
                        defaultValue: capitalize(member.role),
                      })}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="py-3 text-sm text-muted-foreground tabular-nums">
                  {member.joinedAt ? formatDateMedium(member.joinedAt) : "–"}
                </TableCell>
                <TableCell className="pe-6 py-3 text-right">
                  {!isSelf && canRemove ? (
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            aria-label={t("team:membersTable.ariaRemoveMember")}
                          />
                        }
                      >
                        <EllipsisIcon className="size-4" />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem onClick={() => setMemberToDelete(member)}>
                          <TrashIcon className="size-4" />
                          {t("team:membersTable.removeMember")}
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}

          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-16 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <p className="text-sm font-medium text-foreground">
                    {t("team:membersTable.emptyTitle")}
                  </p>
                  <p className="text-xs">
                    {t("team:membersTable.emptyDescription")}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!memberToDelete}
        onOpenChange={(open) => !open && setMemberToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("team:membersTable.removeDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("team:membersTable.removeDialogDescription", {
                name: memberToDelete?.name || memberToDelete?.email || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={
                <Button variant="outline" size="sm" disabled={isDeleting} />
              }
            >
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isDeleting}
                  onClick={handleDeleteMember}
                />
              }
            >
              <TrashIcon className="mr-2 size-4" />
              {t("team:membersTable.removeMember")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default MembersTable;
