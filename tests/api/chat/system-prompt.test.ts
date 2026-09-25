import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../apps/api/src/chat/controllers/send-message";

describe("buildSystemPrompt", () => {
  it("includes the project name and team name", () => {
    const prompt = buildSystemPrompt("Website Redesign", "Acme");
    expect(prompt).toContain('project "Website Redesign"');
    expect(prompt).toContain('team "Acme"');
  });

  it("establishes the pi-agent role as a project management assistant", () => {
    const prompt = buildSystemPrompt("P", "T");
    expect(prompt).toMatch(/pi-agent, an AI project management assistant/i);
  });

  it("instructs the assistant to use tools for real data", () => {
    const prompt = buildSystemPrompt("P", "T");
    expect(prompt).toContain("use the provided tools");
    expect(prompt).toContain("create_task");
    expect(prompt).toContain("update_task_status");
    expect(prompt).toContain("list_tasks");
    expect(prompt).toContain("get_project_summary");
  });

  it("instructs the assistant it can update task status via the tool", () => {
    const prompt = buildSystemPrompt("P", "T");
    expect(prompt).toContain("update_task_status");
    expect(prompt).toContain("'done' to complete a task");
    expect(prompt).toContain("'archived' to close it");
  });

  it("declares the limitation that tasks cannot be deleted", () => {
    const prompt = buildSystemPrompt("P", "T");
    expect(prompt).toContain("cannot delete tasks");
  });

  it("handles empty names gracefully", () => {
    const prompt = buildSystemPrompt("", "");
    expect(prompt).toContain('project ""');
    expect(prompt).toContain('team ""');
  });
});
