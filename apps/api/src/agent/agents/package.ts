import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { AGENT_ROLES } from "@kaneo/permissions";
import {
  parseSkillFrontmatter,
  skillAppliesToRole,
  validateRoles,
} from "./templates";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");
const INSTALL_SH_TEMPLATE = path.join(__dirname, "install.sh.template");

// Fallback for esbuild bundling: use direct path resolution
function getTemplatesDir(): string {
  // In Docker, process.cwd() is /app/apps/api and templates are at agent/agents/templates
  const dockerPath = path.join(process.cwd(), "agent", "agents", "templates");
  if (existsSync(dockerPath)) {
    return dockerPath;
  }

  // Fallback to original __dirname resolution
  return TEMPLATES_DIR;
}

function getInstallShTemplate(): string {
  // In Docker, install.sh.template is at agent/agents/install.sh.template
  const dockerPath = path.join(
    process.cwd(),
    "agent",
    "agents",
    "install.sh.template",
  );
  if (existsSync(dockerPath)) {
    return dockerPath;
  }

  // Fallback to original __dirname resolution
  return INSTALL_SH_TEMPLATE;
}

const FINAL_TEMPLATES_DIR = getTemplatesDir();
const FINAL_INSTALL_SH_TEMPLATE = getInstallShTemplate();

/**
 * Build a zip package containing role definitions (persona sources), skills,
 * and install.sh. When `roleFilter` is provided, only skills whose
 * `for_roles` frontmatter includes that role are staged. When omitted,
 * every skill is staged (backward compatibility).
 *
 * The install.sh script writes the selected role's AGENTS.md to the chosen
 * tool's primary instruction file, so one tool instance works as one
 * persona.
 */
export async function buildAgentConfigZip(
  roleFilter?: string,
): Promise<Buffer> {
  // Create a temp staging directory
  const stagingDir = path.join(
    process.cwd(),
    "data",
    "agent-config-staging",
    `kaneo-agent-config-${Date.now()}`,
  );
  await mkdir(stagingDir, { recursive: true });

  try {
    // Copy roles (each is a persona source)
    const rolesSrc = path.join(FINAL_TEMPLATES_DIR, "roles");
    const rolesDest = path.join(stagingDir, "roles");
    await mkdir(rolesDest, { recursive: true });
    for (const role of AGENT_ROLES) {
      const src = path.join(rolesSrc, role, "AGENTS.md");
      const destDir = path.join(rolesDest, role);
      await mkdir(destDir, { recursive: true });
      const content = await readFile(src, "utf8");
      await writeFile(path.join(destDir, "AGENTS.md"), content, "utf8");
    }

    // Copy skills, filtered by role when roleFilter is provided
    const skillsSrc = path.join(FINAL_TEMPLATES_DIR, "skills");
    const skillsDest = path.join(stagingDir, "skills");
    await mkdir(skillsDest, { recursive: true });
    const skillEntries = await readdir(skillsSrc, { withFileTypes: true });
    for (const entry of skillEntries) {
      if (!entry.isDirectory()) continue;
      const src = path.join(skillsSrc, entry.name, "SKILL.md");
      const content = await readFile(src, "utf8");
      const { forRoles } = parseSkillFrontmatter(content);
      const validated = validateRoles(forRoles);
      if (
        roleFilter !== undefined &&
        !skillAppliesToRole(validated, roleFilter)
      ) {
        continue;
      }
      const destDir = path.join(skillsDest, entry.name);
      await mkdir(destDir, { recursive: true });
      await writeFile(path.join(destDir, "SKILL.md"), content, "utf8");
    }

    // Include the third-party attribution file at the zip root so
    // downstream recipients see upstream licenses and copyrights alongside
    // the SKILL.md files (satisfies MIT §1 and Apache 2.0 §4a/§4b).
    const noticesSrc = path.join(skillsSrc, "THIRD_PARTY_NOTICES.md");
    try {
      const notices = await readFile(noticesSrc, "utf8");
      await writeFile(
        path.join(stagingDir, "THIRD_PARTY_NOTICES.md"),
        notices,
        "utf8",
      );
    } catch {
      // THIRD_PARTY_NOTICES.md is optional: absence is fine when no
      // third-party skills are bundled. Surface only if it is present
      // but unreadable.
    }

    // Copy install.sh template
    const installSh = await readFile(FINAL_INSTALL_SH_TEMPLATE, "utf8");
    await writeFile(path.join(stagingDir, "install.sh"), installSh, "utf8");

    // Zip the staging directory
    const zipPath = `${stagingDir}.zip`;
    await execFileAsync("zip", ["-r", "-q", zipPath, "."], { cwd: stagingDir });

    const zipBuffer = await readFile(zipPath);
    return zipBuffer;
  } finally {
    // Clean up staging dir and zip
    await rm(stagingDir, { recursive: true, force: true });
    await rm(`${stagingDir}.zip`, { force: true });
  }
}
