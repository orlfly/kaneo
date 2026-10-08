import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import getProjects from "@/fetchers/project/get-projects";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/team/$teamId",
)({
  beforeLoad: async ({ params, location, context }) => {
    const currentPath = location.pathname.replace(/\/+$/, "");
    const teamPath = `/dashboard/team/${params.teamId}`;

    if (currentPath !== teamPath) return;

    let projects: Awaited<ReturnType<typeof getProjects>> | undefined;
    try {
      projects = await context.queryClient.fetchQuery({
        queryKey: ["projects", params.teamId],
        queryFn: () => getProjects({ teamId: params.teamId }),
      });
    } catch {
      return;
    }

    if (projects?.length !== 1) return;

    throw redirect({
      to: "/dashboard/team/$teamId/project/$projectId/board",
      params: {
        teamId: params.teamId,
        projectId: projects[0].id,
      },
      replace: true,
    });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
