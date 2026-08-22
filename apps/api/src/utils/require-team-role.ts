import type { TeamRole } from "@kaneo/permissions";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

const RANK: Record<TeamRole, number> = { owner: 2, member: 1 };

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
    if (!role || !(role in RANK)) {
      throw new HTTPException(403, { message: "Insufficient team role" });
    }

    if (RANK[role as TeamRole] < RANK[required]) {
      throw new HTTPException(403, {
        message: `Requires team role: ${required}`,
      });
    }

    return next();
  };
}
