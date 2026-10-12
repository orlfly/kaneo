import { describe, expect, it } from "vitest";
import { buildAgentConfigZip } from "../../apps/api/src/agent/agents/package";
import {
  listRoleTemplates,
  listSkillTemplates,
} from "../../apps/api/src/agent/agents/templates";
import { AGENT_ROLES } from "../../packages/permissions/src/index";

describe("agent config templates", () => {
  it("returns all 7 role templates", async () => {
    const roles = await listRoleTemplates();
    expect(roles).toHaveLength(7);
    const names = roles.map((r) => r.name);
    for (const role of AGENT_ROLES) {
      expect(names).toContain(role);
    }
  });

  it("returns the core skill templates", async () => {
    const skills = await listSkillTemplates();
    expect(skills.length).toBeGreaterThanOrEqual(5);
    const names = skills.map((s) => s.name);
    expect(names).toContain("claim-task");
    expect(names).toContain("repo-sync");
    expect(names).toContain("code-search");
    expect(names).toContain("run-tests");
    expect(names).toContain("submit-pr");
  });

  it("each role template has a description", async () => {
    const roles = await listRoleTemplates();
    for (const role of roles) {
      expect(role.description).toBeTruthy();
      expect(role.description.length).toBeGreaterThan(0);
    }
  });

  it("each skill template has a description", async () => {
    const skills = await listSkillTemplates();
    for (const skill of skills) {
      expect(skill.description).toBeTruthy();
      expect(skill.description.length).toBeGreaterThan(0);
    }
  });

  it("scopes prototype-ui to the two design personas", async () => {
    const skills = await listSkillTemplates();
    const prototype = skills.find((s) => s.name === "prototype-ui");
    expect(prototype).toBeDefined();
    expect(prototype?.forRoles).toEqual(["product-design", "ui-design"]);
  });
});

describe("agent config download package", () => {
  it("builds a zip package with correct content", async () => {
    const zip = await buildAgentConfigZip();
    // ZIP magic bytes: PK\x03\x04
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    expect(zip.length).toBeGreaterThan(1000);
  });

  it("zip contains all 7 role persona sources", async () => {
    const zip = await buildAgentConfigZip();
    const text = new TextDecoder("latin1").decode(zip);
    for (const role of AGENT_ROLES) {
      expect(text).toContain(`roles/${role}/AGENTS.md`);
    }
  });

  it("zip contains skills, install.sh, and install.bat", async () => {
    const zip = await buildAgentConfigZip();
    const text = new TextDecoder("latin1").decode(zip);
    expect(text).toContain("skills/claim-task/SKILL.md");
    expect(text).toContain("install.sh");
    expect(text).toContain("install.bat");
  });

  it("install.bat in the zip uses CRLF line endings", async () => {
    const zip = await buildAgentConfigZip();
    // Write to a temp dir and extract with the system unzip; the zip store is
    // deflated, so raw CRLF bytes are not visible in a plain bytes decode.
    const os = await import("node:os");
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    const { execFileSync } = await import("node:child_process");
    const tmp = await fs.mkdtemp(pathMod.join(os.tmpdir(), "kaneo-bat-"));
    try {
      const zipPath = pathMod.join(tmp, "pkg.zip");
      await fs.writeFile(zipPath, zip);
      execFileSync("unzip", ["-o", "-q", zipPath, "install.bat", "-d", tmp]);
      const bat = await fs.readFile(pathMod.join(tmp, "install.bat"), "utf8");
      expect(bat).toContain("@echo off\r\n");
      expect(bat).toContain("--agent");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("ships prototype-ui to both design personas and to no one else", async () => {
    const decode = (zip: Uint8Array) => new TextDecoder("latin1").decode(zip);
    const entry = "skills/prototype-ui/SKILL.md";

    expect(decode(await buildAgentConfigZip("product-design"))).toContain(
      entry,
    );
    expect(decode(await buildAgentConfigZip("ui-design"))).toContain(entry);

    for (const role of [
      "coding",
      "architecture-design",
      "devops",
      "testing",
      "code-review",
    ]) {
      expect(decode(await buildAgentConfigZip(role))).not.toContain(entry);
    }
  });

  it("prototype-ui documents its deliverable path and fidelity lanes", async () => {
    const fs = await import("node:fs/promises");
    const pathMod = await import("node:path");
    const rel = pathMod.join(
      "apps/api/src/agent/agents/templates/skills/prototype-ui/SKILL.md",
    );
    // Walk up from this test file until the repo root is found, so the
    // assertion does not depend on the runner's cwd or package layout.
    let root = import.meta.dirname;
    let skillPath = "";
    for (;;) {
      const candidate = pathMod.join(root, rel);
      try {
        await fs.access(candidate);
        skillPath = candidate;
        break;
      } catch {
        const parent = pathMod.dirname(root);
        if (parent === root) throw new Error(`skill file not found: ${rel}`);
        root = parent;
      }
    }
    const source = await fs.readFile(skillPath, "utf8");
    expect(source).toContain("repo/docs/prototypes/<feature-slug>/index.html");
    expect(source).toContain("低保真结构原型");
    expect(source).toContain("高保真视觉原型");
  });
});
