import { describe, expect, it } from "vitest";
import { completionUrl } from "../../../apps/api/src/chat/pi-agent-client";

describe("completionUrl", () => {
  it("appends /v1/chat/completions when base lacks /v1", () => {
    expect(completionUrl("https://api.example.com")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("does not duplicate /v1 when base already ends with it", () => {
    expect(completionUrl("https://opencode.ai/zen/go/v1")).toBe(
      "https://opencode.ai/zen/go/v1/chat/completions",
    );
  });

  it("strips trailing slashes before appending", () => {
    expect(completionUrl("https://api.example.com/")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(completionUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("handles a plain host with no path", () => {
    expect(completionUrl("https://llm.local")).toBe(
      "https://llm.local/v1/chat/completions",
    );
  });
});
