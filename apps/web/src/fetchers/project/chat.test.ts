import { afterEach, describe, expect, it } from "vitest";
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

import { resolveApiBaseUrl } from "./chat";

describe("resolveApiBaseUrl", () => {
  const original = import.meta.env.VITE_API_URL;

  afterEach(() => {
    // Restore whatever vitest provided (may be undefined).
    import.meta.env.VITE_API_URL = original;
  });

  it("appends /api when VITE_API_URL has no path", () => {
    import.meta.env.VITE_API_URL = "http://localhost:1337";
    expect(resolveApiBaseUrl()).toBe("http://localhost:1337/api");
  });

  it("keeps VITE_API_URL unchanged when it already ends with /api", () => {
    import.meta.env.VITE_API_URL = "http://api.example.com/api";
    expect(resolveApiBaseUrl()).toBe("http://api.example.com/api");
  });

  it("strips trailing slashes before appending /api", () => {
    import.meta.env.VITE_API_URL = "http://localhost:1337/";
    expect(resolveApiBaseUrl()).toBe("http://localhost:1337/api");
  });

  it("returns a real API origin (not the web origin) so /chat/status is reachable", () => {
    // Regression: the old relative fetch('/api/...') hit the Vite dev server
    // (no proxy) and returned HTML, so the chat panel showed not-enabled.
    import.meta.env.VITE_API_URL = "http://api.internal:1337";
    const url = resolveApiBaseUrl();
    expect(url).toMatch(/^http:\/\/api\.internal:1337\/api$/);
    expect(url.startsWith("http://localhost:5173")).toBe(false);
  });
});
