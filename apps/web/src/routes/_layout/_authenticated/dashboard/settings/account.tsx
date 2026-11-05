import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { Bell, KeyRound, SlidersHorizontal, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import SettingsSidebar from "@/components/SettingsSidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account",
)({
  beforeLoad: ({ location }) => {
    if (
      location.pathname.replace(/\/$/, "") === "/dashboard/settings/account"
    ) {
      throw redirect({ to: "/dashboard/settings/account/information" });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();

  const menuItems = [
    {
      title: t("settings:information"),
      icon: User,
      segment: "information",
    },
    {
      title: t("settings:notifications"),
      icon: Bell,
      segment: "notifications",
    },
    {
      title: t("settings:preferences"),
      icon: SlidersHorizontal,
      segment: "preferences",
    },
    {
      title: t("settings:apiKeys"),
      icon: KeyRound,
      segment: "developer",
    },
  ];

  const selectedSegment =
    location.pathname.match(/^\/dashboard\/settings\/account\/([^/]+)/)?.[1] ||
    "information";

  return (
    <div className="flex h-full gap-6">
      <SettingsSidebar>
        <div className="p-2">
          <div className="mb-1 flex items-center gap-3 rounded-md px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="border border-sidebar-border/70 bg-sidebar-accent/70 text-xs font-medium text-sidebar-accent-foreground">
                {getInitials(user?.name, "U")}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col md:min-w-fit">
              <p className="truncate text-sm md:overflow-visible md:text-clip md:whitespace-normal">
                {user?.name}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60 md:overflow-visible md:text-clip md:whitespace-normal">
                {user?.email}
              </p>
            </div>
          </div>

          <SidebarGroup className="gap-1 p-1">
            <SidebarGroupLabel className="h-7 px-2 text-xs uppercase tracking-wide text-sidebar-foreground/70">
              {t("settings:account")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {menuItems.map((item) => {
                  const isActive = selectedSegment === item.segment;

                  return (
                    <SidebarMenuItem key={item.segment}>
                      <Button
                        render={
                          <Link
                            to={`/dashboard/settings/account/${item.segment}`}
                          />
                        }
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-full justify-start gap-2 rounded-lg px-2 text-sm font-normal text-sidebar-foreground/80",
                          isActive &&
                            "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        <span>{item.title}</span>
                      </Button>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SettingsSidebar>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
