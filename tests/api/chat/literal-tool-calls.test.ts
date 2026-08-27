import { describe, expect, it } from "vitest";
import { parseLiteralToolCalls } from "../../../apps/api/src/chat/controllers/send-message";

describe("parseLiteralToolCalls", () => {
  it("parses a single <invoke> block with parameters", () => {
    const content =
      '<tool_calls><invoke name="agent_read_file"><parameter name="path">repo/docs/01.md</parameter></invoke></tool_calls>';
    const calls = parseLiteralToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe("agent_read_file");
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      path: "repo/docs/01.md",
    });
  });

  it("parses multiple <invoke> blocks", () => {
    const content = [
      '<invoke name="agent_read_file"><parameter name="path">a.md</parameter></invoke>',
      '<invoke name="agent_read_file"><parameter name="path">b.md</parameter></invoke>',
    ].join("");
    const calls = parseLiteralToolCalls(content);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0].function.arguments).path).toBe("a.md");
    expect(JSON.parse(calls[1].function.arguments).path).toBe("b.md");
  });

  it("returns empty for plain text without invoke blocks", () => {
    expect(parseLiteralToolCalls("just some prose")).toEqual([]);
  });

  it("skips invoke blocks with no name", () => {
    expect(parseLiteralToolCalls('<invoke><parameter name="x">1</parameter></invoke>')).toEqual([]);
  });
});
