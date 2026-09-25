import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ChevronLeft, PanelLeftIcon, ShieldIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { SettingsSidebarProvider } from "@/components/SettingsSidebar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useActiveTeam from "@/hooks/queries/team/use-active-team";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings",
)({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const { user } = useAuth();
  const { data: team } = useActiveTeam();
  const { data: projects } = useGetProjects({
    teamId: team?.id ?? "",
  });

  const isAdmin = (user as { role?: string | null } | null)?.role === "admin";

  const getActiveTab = () => {
    const pathname = location.pathname;
    if (pathname.includes("/dashboard/settings/account")) {
      return "account";
    }
    if (pathname.includes("/dashboard/settings/projects")) {
      return "project";
    }
    if (pathname.includes("/dashboard/settings/admin")) {
      return "admin";
    }
    return "account";
  };

  const activeTab = getActiveTab();

  useEffect(() => {
    if (location.pathname) {
      setSettingsMenuOpen(false);
    }
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!isMobile) {
      setSettingsMenuOpen(false);
    }
  }, [isMobile]);

  return (
    <>
      <PageTitle title={t("navigation:page.settingsTitle")} />

      <div className="flex h-full w-full flex-col bg-sidebar p-2 sm:p-4">
        <div className="relative flex h-full min-h-0 flex-col gap-6 overflow-hidden rounded-md border border-border bg-card p-3 md:gap-4 sm:p-4">
          <div className="shrink-0">
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 md:hidden"
                aria-label="Open settings menu"
                title="Open settings menu"
                onClick={() => setSettingsMenuOpen(true)}
              >
                <PanelLeftIcon className="size-4" />
              </Button>

              <div className="flex items-center gap-1 md:hidden">
                <ChevronLeft className="size-4 text-muted-foreground" />
                <span className="text-lg font-semibold">
                  {t("navigation:page.settingsTitle")}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                disabled={!team?.id}
                className="hidden md:inline-flex"
                onClick={() => {
                  if (!team?.id) return;

                  navigate({
                    to: "/dashboard/team/$teamId",
                    params: { teamId: team.id },
                  });
                }}
              >
                <ChevronLeft />

                {t("navigation:page.backToTeam")}
              </Button>
            </div>

            <h1 className="mt-4 hidden pl-1 text-2xl font-semibold md:block">
              {t("navigation:page.settingsTitle")}
            </h1>

            <Tabs
              value={activeTab}
              className="w-full pt-4 md:w-[400px] md:pt-2"
            >
              <TabsList className="bg-sidebar gap-2">
                <TabsTrigger
                  value="account"
                  className="[&[data-state=active]]:rounded-md [&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:bg-card"
                  onClick={() =>
                    navigate({
                      to: "/dashboard/settings/account/information",
                    })
                  }
                >
                  {t("settings:account")}
                </TabsTrigger>
                <TabsTrigger
                  disabled={projects?.length === 0}
                  value="project"
                  className="[&[data-state=active]]:rounded-md [&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:bg-card"
                  onClick={() =>
                    navigate({
                      to: "/dashboard/settings/projects",
                    })
                  }
                >
                  {t("navigation:sidebar.projects")}
                </TabsTrigger>
                {isAdmin ? (
                  <TabsTrigger
                    value="admin"
                    className="[&[data-state=active]]:rounded-md [&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:bg-card"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/settings/admin/users",
                      })
                    }
                  >
                    <ShieldIcon className="size-4" />
                    {t("admin:tab")}
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>

            {activeTab === "admin" && isAdmin ? (
              <div className="flex gap-2 pt-2">
                <Link
                  to="/dashboard/settings/admin/users"
                  className="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
                  activeProps={{
                    className:
                      "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  }}
                >
                  {t("admin:users.tab")}
                </Link>
                <Link
                  to="/dashboard/settings/admin/teams"
                  className="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
                  activeProps={{
                    className:
                      "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  }}
                >
                  {t("admin:teams.tab")}
                </Link>
                <Link
                  to="/dashboard/settings/admin/ai"
                  className="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
                  activeProps={{
                    className:
                      "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  }}
                >
                  {t("admin:ai.tab", { defaultValue: "AI" })}
                </Link>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsSidebarProvider
              teamId={team?.id}
              menuOpen={settingsMenuOpen}
              setMenuOpen={setSettingsMenuOpen}
            >
              <Outlet />
            </SettingsSidebarProvider>
          </div>
        </div>
      </div>
    </>
  );
}
