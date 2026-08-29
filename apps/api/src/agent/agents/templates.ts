import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_ROLES } from "@kaneo/permissions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");

export type RoleTemplate = {
  name: string;
  description: string;
};

export type SkillTemplate = {
  name: string;
  description: string;
  forRoles: string[] | null;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FOR_ROLES_RE = /^for_roles:\s*\[([^\]]*)\]\s*$/m;

/**
 * Parse the YAML frontmatter at the top of a SKILL.md file.
 * Returns the `for_roles` array (lower-cased, trimmed) or null when
 * the frontmatter or the `for_roles` key is absent.
 */
export function parseSkillFrontmatter(content: string): {
  forRoles: string[] | null;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { forRoles: null };

  const fm = match[1] ?? "";
  const lineMatch = fm.match(FOR_ROLES_RE);
  if (!lineMatch) return { forRoles: null };

  const raw = lineMatch[1] ?? "";
  const roles = raw
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return { forRoles: roles.length > 0 ? roles : null };
}

/**
 * Filter `for_roles` to only the values that match a known Kaneo role.
 * Invalid values are dropped silently to fail-open (skill is treated as
 * not applicable to the unknown role).
 */
export function validateRoles(roles: string[] | null): string[] | null {
  if (roles === null) return null;
  const known = new Set<string>(AGENT_ROLES);
  const filtered = roles.filter((r) => known.has(r));
  return filtered.length > 0 ? filtered : null;
}

/**
 * Check whether `forRoles` declares that the skill applies to `role`.
 * A skill with `forRoles === null` (missing frontmatter) is treated as
 * universal — applicable to every role.
 */
export function skillAppliesToRole(
  forRoles: string[] | null,
  role: string,
): boolean {
  if (forRoles === null) return true;
  return forRoles.includes(role);
}

/**
 * Scan the templates/roles directory and return one entry per role.
 * Each role directory contains an AGENTS.md file.
 */
export async function listRoleTemplates(): Promise<RoleTemplate[]> {
  const rolesDir = path.join(TEMPLATES_DIR, "roles");

  const entries = await readdir(rolesDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  const templates: RoleTemplate[] = [];
  for (const dir of dirs) {
    const agentsPath = path.join(rolesDir, dir.name, "AGENTS.md");
    try {
      const content = await readFile(agentsPath, "utf8");
      const firstLine = content.split("\n").find((l) => l.startsWith("# "));
      const description = firstLine
        ? firstLine.replace(/^#\s+/, "").trim()
        : dir.name;
      templates.push({ name: dir.name, description });
    } catch {
      // AGENTS.md missing for this role dir, skip
    }
  }

  return templates;
}

/**
 * Scan the templates/skills directory and return one entry per skill.
 * Each skill directory contains a SKILL.md file with optional YAML
 * frontmatter declaring its `for_roles` scope.
 */
export async function listSkillTemplates(): Promise<SkillTemplate[]> {
  return listSkillTemplatesFiltered();
}

/**
 * Return only the skills whose `for_roles` includes `role`.
 * Skills with no frontmatter are treated as universal and included.
 */
export async function listSkillsForRole(
  role: string,
): Promise<SkillTemplate[]> {
  return listSkillTemplatesFiltered(role);
}

async function listSkillTemplatesFiltered(
  role?: string,
): Promise<SkillTemplate[]> {
  const skillsDir = path.join(TEMPLATES_DIR, "skills");

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  const templates: SkillTemplate[] = [];
  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir.name, "SKILL.md");
    try {
      const content = await readFile(skillPath, "utf8");
      const firstLine = content.split("\n").find((l) => l.startsWith("# "));
      const description = firstLine
        ? firstLine.replace(/^#\s+Skill:\s*/, "").trim()
        : dir.name;
      const { forRoles } = parseSkillFrontmatter(content);
      const validated = validateRoles(forRoles);
      if (role !== undefined && !skillAppliesToRole(validated, role)) {
        continue;
      }
      templates.push({ name: dir.name, description, forRoles: validated });
    } catch {
      // SKILL.md missing, skip
    }
  }

  return templates;
}

/**
 * Read a role template's full content by role name.
 */
export async function readRoleTemplate(
  roleName: string,
): Promise<string | null> {
  const agentsPath = path.join(TEMPLATES_DIR, "roles", roleName, "AGENTS.md");
  try {
    return await readFile(agentsPath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Read a skill template's full content by skill name.
 */
export async function readSkillTemplate(
  skillName: string,
): Promise<string | null> {
  const skillPath = path.join(TEMPLATES_DIR, "skills", skillName, "SKILL.md");
  try {
    return await readFile(skillPath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Check whether the templates directory exists (for health checks).
 */
export async function templatesExist(): Promise<boolean> {
  try {
    const s = await stat(TEMPLATES_DIR);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export { AGENT_ROLES, TEMPLATES_DIR };
