const API_BASE =
  (import.meta as unknown as { env: Record<string, string> }).env
    ?.VITE_API_URL ?? "http://localhost:1337";

export type AgentConfigTemplates = {
  roles: { name: string; description: string }[];
  skills: { name: string; description: string }[];
};

export async function getAgentConfigTemplates(): Promise<AgentConfigTemplates> {
  const res = await fetch(`${API_BASE}/api/agent/agents-config/templates`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function downloadAgentConfig(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agent/agents-config/download`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kaneo-agent-config.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
