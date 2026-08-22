import { describe, expect, it } from "vitest";
import { parseSSELine } from "./chat";

describe("parseSSELine", () => {
  it("parses a plain-text token", () => {
    expect(parseSSELine("data: 你好")).toEqual({ kind: "token", text: "你好" });
  });

  it("parses a JSON-string token (quoted payload)", () => {
    expect(parseSSELine('data: "quoted"')).toEqual({
      kind: "token",
      text: "quoted",
    });
  });

  it("skips the [DONE] sentinel", () => {
    expect(parseSSELine("data: [DONE]")).toBeNull();
  });

  it("skips non-data lines", () => {
    expect(parseSSELine("event: token")).toBeNull();
    expect(parseSSELine("")).toBeNull();
  });

  it("treats the done event as done (not a token)", () => {
    expect(parseSSELine('data: {"messageId":"abc123"}')).toEqual({
      kind: "done",
    });
  });

  it("does not append [object Object] when a JSON primitive object arrives", () => {
    // The payload is always one of our two known shapes; this guards against
    // re-introducing the bug where a parsed object was stringified into the
    // message text.
    const parsed = parseSSELine('data: {"messageId":"m1"}');
    expect(parsed).toEqual({ kind: "done" });
  });

  it("treats JSON primitives other than strings as raw text", () => {
    expect(parseSSELine("data: 123")).toEqual({ kind: "token", text: "123" });
    expect(parseSSELine("data: null")).toEqual({
      kind: "token",
      text: "null",
    });
  });
});
