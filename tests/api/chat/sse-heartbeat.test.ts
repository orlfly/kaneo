import type { SSEStreamingApi } from "hono/streaming";
import { describe, expect, it, vi } from "vitest";
import { SSE_HEARTBEAT_INTERVAL_MS } from "../../../apps/api/src/chat/controllers/send-message";

// Minimal double for the stream: capture writeSSE payloads without a real
// transport.
function makeFakeStream() {
  const writes: string[] = [];
  const stream = {
    writeSSE: vi.fn(async (message: { event?: string; data: string }) => {
      writes.push(message.event ?? "message");
      return undefined;
    }),
  };
  return stream as unknown as SSEStreamingApi & {
    writeSSE: ReturnType<typeof vi.fn>;
  };
}

describe("SSE heartbeat", () => {
  it("emits a ping at the documented interval until stopped", async () => {
    vi.useFakeTimers();
    try {
      const { startSseHeartbeat } = await import(
        "../../../apps/api/src/chat/controllers/send-message"
      );
      const stream = makeFakeStream();
      const stop = startSseHeartbeat(stream);

      await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_INTERVAL_MS - 1);
      expect(stream.writeSSE).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(stream.writeSSE).toHaveBeenCalledTimes(1);
      expect(stream.writeSSE.mock.calls[0][0]).toEqual({
        event: "ping",
        data: "",
      });

      await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_INTERVAL_MS * 2);
      expect(stream.writeSSE).toHaveBeenCalledTimes(3);

      stop();
      await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_INTERVAL_MS * 5);
      expect(stream.writeSSE).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps working when a write rejects (client already gone)", async () => {
    vi.useFakeTimers();
    try {
      const { startSseHeartbeat } = await import(
        "../../../apps/api/src/chat/controllers/send-message"
      );
      const stream = makeFakeStream();
      stream.writeSSE.mockRejectedValueOnce(new Error("connection closed"));
      const stop = startSseHeartbeat(stream);

      await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_INTERVAL_MS * 2);
      // The failed write must not stop subsequent heartbeats or crash.
      expect(stream.writeSSE).toHaveBeenCalledTimes(2);

      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
