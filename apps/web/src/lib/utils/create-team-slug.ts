import { createSlug } from "./create-slug";

const RANDOM_SUFFIX_LENGTH = 12;

export function createTeamBaseSlug(value: string): string {
  return createSlug(value) || "team";
}

function createRandomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, RANDOM_SUFFIX_LENGTH);
}

export function createUniqueTeamSlug(
  value: string,
  existingSlugs: Iterable<string | null | undefined>,
): string {
  const baseSlug = createTeamBaseSlug(value);
  const usedSlugs = new Set(
    Array.from(existingSlugs, (slug) => slug?.toLowerCase()).filter(Boolean),
  );

  if (!usedSlugs.has(baseSlug.toLowerCase())) {
    return baseSlug;
  }

  let slug = `${baseSlug}-${createRandomSuffix()}`;

  while (usedSlugs.has(slug.toLowerCase())) {
    slug = `${baseSlug}-${createRandomSuffix()}`;
  }

  return slug;
}

export function isTeamSlugCollisionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("already exists") ||
    message.includes("team exists") ||
    message.includes("slug")
  );
}
