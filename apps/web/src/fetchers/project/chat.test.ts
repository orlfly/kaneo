import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSSELine, resolveApiBaseUrl } from "./chat";

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

  it("parses an error event", () => {
    expect(
      parseSSELine('data: {"error":"The AI assistant encountered an error."}'),
    ).toEqual({
      kind: "error",
      message: "The AI assistant encountered an error.",
    });
  });
});

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

import { getChatStatus, streamChatMessage } from "./chat";

function stubFetchResponse(init: {
  ok: boolean;
  status?: number;
  json?: unknown;
  body?: ReadableStream;
}) {
  const bodyStream = init.body ?? null;
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => init.json,
    text: async () => JSON.stringify(init.json ?? {}),
    body: bodyStream,
  } as unknown as Response;
}

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      }
      controller.close();
    },
  });
}

/** Emit raw SSE byte chunks without the `data: …` wrapper. */
function rawSseStream(rawChunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of rawChunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("getChatStatus runtime contract", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns enabled from a 200 response", async () => {
    fetchMock.mockResolvedValue(
      stubFetchResponse({ ok: true, json: { enabled: true } }),
    );
    await expect(getChatStatus()).resolves.toEqual({ enabled: true });
  });

  it("returns disabled on a non-200 response", async () => {
    fetchMock.mockResolvedValue(stubFetchResponse({ ok: false, status: 503 }));
    await expect(getChatStatus()).resolves.toEqual({ enabled: false });
  });

  it("returns disabled when fetch throws (network error)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getChatStatus()).resolves.toEqual({ enabled: false });
  });

  it("requests with no-store cache so the enabled flag is not stale", async () => {
    fetchMock.mockResolvedValue(
      stubFetchResponse({ ok: true, json: { enabled: true } }),
    );
    await getChatStatus();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
  });
});

describe("streamChatMessage runtime contract", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws 'not-enabled' on a 503 so the UI can flip the disabled state", async () => {
    fetchMock.mockResolvedValue(stubFetchResponse({ ok: false, status: 503 }));
    await expect(streamChatMessage("p1", "hi", vi.fn())).rejects.toThrow(
      "not-enabled",
    );
  });

  it("accumulates tokens from the SSE stream and calls onToken", async () => {
    fetchMock.mockResolvedValue(
      stubFetchResponse({
        ok: true,
        body: sseStream(["你好", "，我是 pi-agent。", "[DONE]"]),
      }),
    );
    const tokens: string[] = [];
    const result = await streamChatMessage("p1", "hi", (t) => tokens.push(t));
    expect(result.content).toContain("你好");
    expect(result.content).toContain("pi-agent");
    expect(result.progressLog).toEqual([]);
    expect(tokens).toEqual(["你好", "，我是 pi-agent。"]);
  });

  it("captures progress events emitted before the assistant text", async () => {
    fetchMock.mockResolvedValue(
      stubFetchResponse({
        ok: true,
        body: rawSseStream([
          "event: progress\ndata: {\"round\":0,\"tool\":\"list_tasks\",\"label\":\"正在查询任务列表\"}\n\n",
          "data: 你好\n\n",
        ]),
      }),
    );
    const tokens: string[] = [];
    const entries: Array<{ round: number; tool: string; label: string }> = [];
    const result = await streamChatMessage(
      "p1",
      "hi",
      (t) => tokens.push(t),
      (entry) => entries.push(entry),
    );
    expect(result.progressLog).toEqual([
      { round: 0, tool: "list_tasks", label: "正在查询任务列表" },
    ]);
    expect(entries).toEqual(result.progressLog);
    expect(tokens).toEqual(["你好"]);
  });
});
