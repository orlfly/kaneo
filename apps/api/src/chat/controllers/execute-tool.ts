import { executeTool } from "../tools";

/**
 * Execute a project-scoped pi-agent tool on behalf of an MCP caller. Only the
 * agent working-dir, clone, and command tools are meant to be routed through
 * here; the endpoint reuses the exact same `executeTool` dispatcher that the
 * chat conversation uses so both surfaces share one implementation.
 */
export async function executeAgentTool({
  tool,
  args,
  projectId,
  userId,
}: {
  tool: string;
  args: Record<string, unknown>;
  projectId: string;
  userId: string;
}): Promise<{ result: string }> {
  const result = await executeTool(tool, args ?? {}, projectId, userId);
  return { result };
}
