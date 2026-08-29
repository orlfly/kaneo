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

  it("returns all 5 skill templates", async () => {
    const skills = await listSkillTemplates();
    expect(skills).toHaveLength(5);
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

  it("zip contains skills and install.sh", async () => {
    const zip = await buildAgentConfigZip();
    const text = new TextDecoder("latin1").decode(zip);
    expect(text).toContain("skills/claim-task/SKILL.md");
    expect(text).toContain("install.sh");
  });
});
