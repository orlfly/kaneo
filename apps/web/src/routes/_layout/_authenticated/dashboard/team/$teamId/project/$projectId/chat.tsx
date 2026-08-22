import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import ChatPanel from "@/components/project/chat-panel";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/team/$teamId/project/$projectId/chat",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, teamId } = Route.useParams();

  return (
    <>
      <PageTitle title={t("chat:pageTitle", { defaultValue: "Chat" })} />
      <ProjectLayout
        projectId={projectId}
        teamId={teamId}
        activeView="chat"
        headerActions={null}
      >
        <div className="h-[calc(100vh-8rem)]">
          <ChatPanel projectId={projectId} />
        </div>
      </ProjectLayout>
    </>
  );
}
