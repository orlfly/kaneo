import { useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import NotificationDropdown from "@/components/notification/notification-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { shortcuts } from "@/constants/shortcuts";
import type { ListTeamsResponse } from "@/fetchers/team/list-teams";
import useSetActiveTeam from "@/hooks/mutations/team/use-set-active-team";
import useActiveTeam from "@/hooks/queries/team/use-active-team";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import {
  getModifierKeyText,
  useRegisterShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import CreateTeamModal from "./shared/modals/create-team-modal";

export function TeamSwitcher() {
  const { t } = useTranslation();
  const { data: activeTeam } = useActiveTeam();

  // User-scoped WebSocket for real-time events (e.g. NOTIFICATION_CREATED)
  useUserWebSocket();
  const { data: teams } = useGetTeams();
  const navigate = useNavigate();
  const { mutateAsync: setActiveTeamMutation } = useSetActiveTeam();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] =
    React.useState(false);
  const [isSwitching, setIsSwitching] = React.useState(false);

  const handleTeamChange = React.useCallback(
    async (selectedTeam: ListTeamsResponse) => {
      if (isSwitching) return;

      setIsSwitching(true);
      try {
        await setActiveTeamMutation({ teamId: selectedTeam.id });

        setTimeout(() => {
          navigate({
            to: "/dashboard/team/$teamId",
            params: { teamId: selectedTeam.id },
          });
        }, 50);
      } catch (error) {
        console.error("Failed to switch team:", error);
      } finally {
        setTimeout(() => setIsSwitching(false), 100);
      }
    },
    [navigate, isSwitching, setActiveTeamMutation],
  );

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!teams || teams.length === 0) return;

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key >= "1" &&
        event.key <= "9"
      ) {
        event.preventDefault();
        const index = Number.parseInt(event.key, 10) - 1;
        if (index < teams.length) {
          handleTeamChange(teams[index]);
          setIsOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, teams, handleTeamChange]);

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.team.prefix]: {
        [shortcuts.team.switch]: () => {
          setIsOpen(true);
        },
        [shortcuts.team.create]: () => {
          setIsCreateTeamModalOpen(true);
        },
      },
    },
  });

  if (!activeTeam) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between w-full gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className="group h-8 w-full rounded-md px-2 text-sidebar-foreground data-[active=true]:bg-sidebar-accent/50"
                    size="default"
                  />
                }
              >
                <div className="flex items-center min-w-0 w-full">
                  <span
                    className={`truncate text-sm font-medium text-foreground ${isSwitching ? "opacity-50" : ""}`}
                  >
                    {activeTeam.name}
                  </span>
                </div>
                <ChevronDown
                  className={`ml-1 size-3.5 text-foreground/70 opacity-90 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:rotate-180 transition-[rotate,opacity] duration-200 ease-out ${isSwitching ? "animate-spin" : ""}`}
                  data-state={isOpen ? "open" : "closed"}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-(--anchor-width) text-sidebar-foreground"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {t("navigation:teamSwitcher.teams")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                {teams?.map((team: ListTeamsResponse, index: number) => (
                  <DropdownMenuItem
                    key={team.id}
                    onClick={() => {
                      if (!isSwitching && team.id !== activeTeam.id) {
                        handleTeamChange(team);
                        setIsOpen(false);
                      }
                    }}
                    disabled={isSwitching || team.id === activeTeam.id}
                    className="h-7 text-sm data-highlighted:bg-sidebar-accent data-highlighted:text-sidebar-accent-foreground"
                  >
                    <span className="flex-1 text-left">
                      {isSwitching && team.id === activeTeam?.id
                        ? t("navigation:teamSwitcher.switching")
                        : team.name}
                    </span>
                    <DropdownMenuShortcut>
                      {getModifierKeyText()} {index > 8 ? "0" : index + 1}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setIsCreateTeamModalOpen(true);
                    setIsOpen(false);
                  }}
                  className="h-7 text-sm data-highlighted:bg-sidebar-accent data-highlighted:text-sidebar-accent-foreground"
                >
                  <span>{t("navigation:teamSwitcher.addTeam")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center gap-1">
          <NotificationDropdown />
          <div className="h-8 w-8 shrink-0">
            <UserAvatar />
          </div>
        </div>
      </div>

      <CreateTeamModal
        open={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
      />
    </>
  );
}
