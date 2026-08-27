import { spawn } from "node:child_process";

const MAX_OUTPUT_BYTES = 256 * 1024;

export type AgentRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
};

/**
 * Run a shell command inside the project working directory with a timeout and
 * output cap. Uses spawn (streams) rather than exec so large output is never
 * fully buffered into memory before the cap is applied.
 */
export function agentRunCommand(
  cwd: string,
  command: string,
  timeoutMs: number,
): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;

    const onData = (side: "stdout" | "stderr") => (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const target = side === "stdout" ? "stdout" : "stderr";
      const current = target === "stdout" ? stdout : stderr;
      if (current.length + text.length > MAX_OUTPUT_BYTES) {
        // Keep the tail so the important trailing output survives.
        if (target === "stdout") stdout = text;
        else stderr = text;
        truncated = true;
        return;
      }
      if (target === "stdout") stdout += text;
      else stderr += text;
    };

    child.stdout?.on("data", onData("stdout"));
    child.stderr?.on("data", onData("stderr"));

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ stdout, stderr, exitCode: null, timedOut: true, truncated });
    }, timeoutMs);

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut: false, truncated });
    });

    child.on("error", (_err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: null, timedOut: false, truncated });
    });
  });
}
