import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/team/$teamId/project/$projectId/",
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/team/$teamId/project/$projectId/board",
      replace: true,
    });
  },
});
