import type { TeamRole } from "@kaneo/permissions";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

const RANK: Record<TeamRole, number> = { owner: 2, member: 1 };

// Legacy workspaces→teams migration rows may still carry "viewer"/"admin".
// "admin" had owner-tier management powers; "viewer" had member-tier read
// access. Map them onto the closest team role instead of failing closed on
// an unknown rank, which would lock legacy members out entirely.
const LEGACY_RANK: Record<string, number> = { admin: 2, viewer: 1 };

function rankOf(role: string | undefined): number | undefined {
  if (role && role in RANK) return RANK[role as TeamRole];
  if (role && role in LEGACY_RANK) return LEGACY_RANK[role];
  return undefined;
}

// requireTeamRole ensures the caller holds at least the given role within the
// team resolved by the upstream teamAccess middleware. The role is stored on
// the context as `teamRole`. Callers MUST have run teamAccess.* first.
//
// Example: requireTeamRole("owner") — only owners pass.
//          requireTeamRole("member") — both members and owners pass.
export function requireTeamRole(required: TeamRole) {
  return async (c: Context, next: Next) => {
    if (!c.get("teamId")) {
      throw new HTTPException(500, {
        message: "teamId not set in context; missing teamAccess middleware",
      });
    }

    const role = c.get("teamRole") as TeamRole | string | undefined;
    const rank = rankOf(role);
    if (rank === undefined) {
      throw new HTTPException(403, { message: "Insufficient team role" });
    }

    if (rank < RANK[required]) {
      throw new HTTPException(403, {
        message: `Requires team role: ${required}`,
      });
    }

    return next();
  };
}
