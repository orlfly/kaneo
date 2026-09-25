import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import TeamLayout from "@/components/common/team-layout";
import PageTitle from "@/components/page-title";
import MembersTable from "@/components/team/members-table";
import useGetFullTeam from "@/hooks/queries/team/use-get-full-team";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/team/$teamId/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { teamId } = Route.useParams();
  const { data: team } = useGetFullTeam({ teamId });
  const { canManageTeam } = useWorkspacePermission();
  const canManage = Boolean(canManageTeam());

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <TeamLayout title={t("team:members.pageTitle")} headerActions={null}>
        <MembersTable
          teamId={teamId}
          users={team?.members ?? []}
          canManage={canManage}
        />
      </TeamLayout>
    </>
  );
}
