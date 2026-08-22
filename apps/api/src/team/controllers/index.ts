import type { TeamRole } from "@kaneo/permissions";
import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, sql } from "drizzle-orm";
import db from "../../database";
import { teamMemberTable, teamTable, userTable } from "../../database/schema";

export type { TeamRole };

export type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  role: TeamRole;
  memberCount: number;
  createdAt: Date;
  archivedAt: Date | null;
};

export type TeamDetail = TeamSummary & {
  description: string | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

async function uniqueSlug(baseName: string): Promise<string> {
  const base = slugify(baseName) || "team";
  let candidate = base;
  let suffix = 1;
  // Try the base first, then append an incrementing suffix until we find a free one.
  // Bounded loop to avoid runaway in pathological cases.
  while (suffix < 1_000) {
    const existing = await db
      .select({ id: teamTable.id })
      .from(teamTable)
      .where(eq(teamTable.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  // Fallback: append a short random suffix.
  return `${base}-${createId().slice(0, 6)}`;
}

export type CreateTeamResult = {
  team: TeamDetail;
  teamMemberId: string;
};

export async function createTeam(
  ownerId: string,
  name: string,
): Promise<CreateTeamResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Team name is required");
  }

  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(trimmed);
    const now = new Date();
    const [created] = await tx
      .insert(teamTable)
      .values({
        name: trimmed,
        slug,
        createdAt: now,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create team");
    }

    const teamMemberId = createId();
    await tx.insert(teamMemberTable).values({
      id: teamMemberId,
      teamId: created.id,
      userId: ownerId,
      role: "owner",
      joinedAt: now,
    });

    return {
      team: {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        role: "owner",
        memberCount: 1,
        createdAt: created.createdAt,
        archivedAt: created.archivedAt,
      },
      teamMemberId,
    };
  });
}

export async function listTeamsForUser(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<TeamSummary[]> {
  const memberRows = await db
    .select({
      id: teamTable.id,
      name: teamTable.name,
      slug: teamTable.slug,
      role: teamMemberTable.role,
      createdAt: teamTable.createdAt,
      archivedAt: teamTable.archivedAt,
      memberCount: count(teamMemberTable.id),
    })
    .from(teamMemberTable)
    .innerJoin(teamTable, eq(teamMemberTable.teamId, teamTable.id))
    .where(
      and(
        eq(teamMemberTable.userId, userId),
        options.includeArchived
          ? sql`true`
          : sql`${teamTable.archivedAt} IS NULL`,
      ),
    )
    .groupBy(
      teamTable.id,
      teamTable.name,
      teamTable.slug,
      teamMemberTable.role,
      teamTable.createdAt,
      teamTable.archivedAt,
    )
    .orderBy(desc(teamTable.createdAt));

  return memberRows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role as TeamRole,
    memberCount: Number(row.memberCount ?? 0),
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
  }));
}

export async function getTeam(
  teamId: string,
  viewerId: string,
): Promise<TeamDetail | null> {
  const [membership] = await db
    .select({ role: teamMemberTable.role })
    .from(teamMemberTable)
    .where(
      and(
        eq(teamMemberTable.teamId, teamId),
        eq(teamMemberTable.userId, viewerId),
      ),
    )
    .limit(1);

  if (!membership) return null;

  const [team] = await db
    .select({
      id: teamTable.id,
      name: teamTable.name,
      slug: teamTable.slug,
      description: teamTable.description,
      createdAt: teamTable.createdAt,
      archivedAt: teamTable.archivedAt,
      memberCount: count(teamMemberTable.id),
    })
    .from(teamTable)
    .leftJoin(teamMemberTable, eq(teamMemberTable.teamId, teamTable.id))
    .where(eq(teamTable.id, teamId))
    .groupBy(
      teamTable.id,
      teamTable.name,
      teamTable.slug,
      teamTable.description,
      teamTable.createdAt,
      teamTable.archivedAt,
    )
    .limit(1);

  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description,
    role: membership.role as TeamRole,
    memberCount: Number(team.memberCount ?? 0),
    createdAt: team.createdAt,
    archivedAt: team.archivedAt,
  };
}

export type UpdateTeamInput = {
  name?: string;
  slug?: string;
};

export async function updateTeam(
  teamId: string,
  input: UpdateTeamInput,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Team name cannot be empty");
    patch.name = trimmed;
  }
  if (typeof input.slug === "string") {
    const trimmed = input.slug.trim();
    if (!trimmed) throw new Error("Team slug cannot be empty");
    patch.slug = trimmed;
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(teamTable).set(patch).where(eq(teamTable.id, teamId));
}

export async function setTeamArchived(
  teamId: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(teamTable)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(teamTable.id, teamId));
}

export const archiveTeam = (teamId: string) => setTeamArchived(teamId, true);
export const unarchiveTeam = (teamId: string) => setTeamArchived(teamId, false);

export async function deleteTeam(teamId: string): Promise<void> {
  await db.delete(teamTable).where(eq(teamTable.id, teamId));
}

type ListTeamMembersRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: TeamRole;
  joinedAt: Date;
};

export async function listTeamMembers(
  teamId: string,
): Promise<ListTeamMembersRow[]> {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      role: teamMemberTable.role,
      joinedAt: teamMemberTable.joinedAt,
    })
    .from(teamMemberTable)
    .innerJoin(userTable, eq(teamMemberTable.userId, userTable.id))
    .where(eq(teamMemberTable.teamId, teamId));
  return rows.map((row) => ({
    ...row,
    role: row.role as TeamRole,
  }));
}

export type AddTeamMemberResult =
  | { added: true; teamMemberId: string; role: TeamRole }
  | { added: false; reason: "already_member" };

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: TeamRole,
): Promise<AddTeamMemberResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: teamMemberTable.id })
      .from(teamMemberTable)
      .where(
        and(
          eq(teamMemberTable.teamId, teamId),
          eq(teamMemberTable.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      return { added: false as const, reason: "already_member" as const };
    }

    const [user] = await tx
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User does not exist");
    }

    const teamMemberId = createId();
    await tx.insert(teamMemberTable).values({
      id: teamMemberId,
      teamId,
      userId,
      role,
      joinedAt: new Date(),
    });

    return {
      added: true as const,
      teamMemberId,
      role,
    };
  });
}

async function countOwners(
  teamId: string,
  tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<number> {
  const [row] = await tx
    .select({ value: count(teamMemberTable.id) })
    .from(teamMemberTable)
    .where(
      and(
        eq(teamMemberTable.teamId, teamId),
        eq(teamMemberTable.role, "owner"),
      ),
    );
  return Number(row?.value ?? 0);
}

export type RemoveTeamMemberResult =
  | { removed: true }
  | { removed: false; reason: "last_owner" | "not_found" };

export async function removeTeamMember(
  teamId: string,
  userId: string,
): Promise<RemoveTeamMemberResult> {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ role: teamMemberTable.role })
      .from(teamMemberTable)
      .where(
        and(
          eq(teamMemberTable.teamId, teamId),
          eq(teamMemberTable.userId, userId),
        ),
      )
      .limit(1);

    if (!member) {
      return { removed: false as const, reason: "not_found" as const };
    }

    if (member.role === "owner") {
      const ownerCount = await countOwners(teamId, tx);
      if (ownerCount <= 1) {
        return { removed: false as const, reason: "last_owner" as const };
      }
    }

    await tx
      .delete(teamMemberTable)
      .where(
        and(
          eq(teamMemberTable.teamId, teamId),
          eq(teamMemberTable.userId, userId),
        ),
      );

    return { removed: true as const };
  });
}

export type UpdateTeamMemberResult =
  | { updated: true; role: TeamRole }
  | { updated: false; reason: "last_owner" | "not_found" };

export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  role: TeamRole,
): Promise<UpdateTeamMemberResult> {
  if (role !== "owner" && role !== "member") {
    throw new Error(`Unknown team role: ${role}`);
  }

  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ role: teamMemberTable.role })
      .from(teamMemberTable)
      .where(
        and(
          eq(teamMemberTable.teamId, teamId),
          eq(teamMemberTable.userId, userId),
        ),
      )
      .limit(1);

    if (!member) {
      return { updated: false as const, reason: "not_found" as const };
    }

    if (member.role === "owner" && role === "member") {
      const ownerCount = await countOwners(teamId, tx);
      if (ownerCount <= 1) {
        return { updated: false as const, reason: "last_owner" as const };
      }
    }

    await tx
      .update(teamMemberTable)
      .set({ role })
      .where(
        and(
          eq(teamMemberTable.teamId, teamId),
          eq(teamMemberTable.userId, userId),
        ),
      );

    return { updated: true as const, role };
  });
}
