import { useMutation, useQuery } from "@tanstack/react-query";
import {
  downloadAgentConfig,
  getAgentConfigTemplates,
} from "@/fetchers/agent/agents-config";

export function useAgentConfigTemplates() {
  return useQuery({
    queryKey: ["agent-config-templates"],
    queryFn: getAgentConfigTemplates,
  });
}

export function useDownloadAgentConfig() {
  return useMutation({
    mutationFn: downloadAgentConfig,
  });
}
