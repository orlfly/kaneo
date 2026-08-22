import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/team/$teamId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
