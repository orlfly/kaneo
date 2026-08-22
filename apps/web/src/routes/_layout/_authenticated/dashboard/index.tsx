import { createFileRoute, redirect } from "@tanstack/react-router";
import listTeams from "@/fetchers/team/list-teams";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_layout/_authenticated/dashboard/")({
  beforeLoad: async () => {
    const teams = await listTeams({});

    if (teams && teams.length > 0) {
      throw redirect({
        to: "/dashboard/team/$teamId",
        params: { teamId: teams[0].id },
      });
    }

    // No team yet. System admins land in the team management area to create
    // or join one; regular users also go there since invitations are removed
    // and team membership is managed by admins.
    const session = await authClient.getSession();
    const isAdmin =
      (session.data?.user as { role?: string | null } | null)?.role === "admin";

    if (isAdmin) {
      throw redirect({ to: "/dashboard/settings/admin/teams" });
    }

    // Regular users with no team are redirected to a notice page.
    throw redirect({ to: "/dashboard/settings/admin/teams" });
  },
});
