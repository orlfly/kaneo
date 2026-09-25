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
        {/* 100dvh minus sidebar inset margins (1rem), border (2px), and the
            h-11 header (2.75rem) so the input bar sits flush with the panel
            bottom instead of leaving a gap under it. */}
        <div className="h-[calc(100dvh-3.875rem)]">
          <ChatPanel projectId={projectId} />
        </div>
      </ProjectLayout>
    </>
  );
}
