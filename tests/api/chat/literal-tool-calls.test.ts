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
    expect(
      parseLiteralToolCalls(
        '<invoke><parameter name="x">1</parameter></invoke>',
      ),
    ).toEqual([]);
  });

  it("parses the DeepSeek DSML dialect with fullwidth bar prefix", () => {
    const content =
      '继续核对剩余 2 个服务。<｜DSML｜tool_calls><｜DSML｜invoke name="agent_list_files"><｜DSML｜parameter name="path" string="true">repo/services/java/knowledge-service</｜DSML｜parameter></｜DSML｜invoke><｜DSML｜invoke name="agent_list_files"><｜DSML｜parameter name="path" string="true">repo/services/java/skill-service</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>';
    const calls = parseLiteralToolCalls(content);
    expect(calls).toHaveLength(2);
    expect(calls[0].function.name).toBe("agent_list_files");
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      path: "repo/services/java/knowledge-service",
    });
    expect(JSON.parse(calls[1].function.arguments)).toEqual({
      path: "repo/services/java/skill-service",
    });
  });

  it("parses DSML parameters whose values contain angle-bracket markup", () => {
    const content =
      '<｜DSML｜invoke name="create_task"><｜DSML｜parameter name="title">Fix <b>bold</b> title</｜DSML｜parameter></｜DSML｜invoke>';
    const calls = parseLiteralToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].function.arguments).title).toBe(
      "Fix <b>bold</b> title",
    );
  });

  it("does not treat a normal invoke as part of a DSML block", () => {
    const content =
      '<invoke name="list_tasks"></invoke><｜DSML｜invoke name="get_project_summary"></｜DSML｜invoke>';
    const calls = parseLiteralToolCalls(content);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.function.name)).toEqual([
      "list_tasks",
      "get_project_summary",
    ]);
  });
});
