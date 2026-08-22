export type TeamMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

// Back-compat alias — old code referenced `WorkspaceUser`. The new fetcher
// returns the same shape directly so callers don't need to map.
export type WorkspaceUser = TeamMember;

export type ActiveTeamMember = TeamMember | null;

// Back-compat alias.
export type ActiveWorkspaceUser = ActiveTeamMember;

export default WorkspaceUser;
