import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import useActiveTeam from "@/hooks/queries/team/use-active-team";

export const Route = createFileRoute("/_layout/_authenticated/dashboard")({
  component: DashboardLayoutComponent,
});

function DashboardLayoutComponent() {
  const { t } = useTranslation();
  const { data: team } = useActiveTeam();

  return (
    <>
      <PageTitle
        title={t("navigation:page.projectsTitle")}
        hideAppName={!team?.name}
      />
      <Outlet />
    </>
  );
}
