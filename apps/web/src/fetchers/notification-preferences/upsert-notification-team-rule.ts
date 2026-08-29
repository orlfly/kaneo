import { getApiUrl } from "@/fetchers/get-api-url";
import type { NotificationPreferences } from "./get-notification-preferences";

export type UpsertNotificationTeamRuleRequest = {
  isActive: boolean;
  ntfyEnabled: boolean;
  gotifyEnabled: boolean;
  webhookEnabled: boolean;
  projectMode: "all" | "selected";
  selectedProjectIds?: string[];
};

async function upsertNotificationTeamRule(
  teamId: string,
  json: UpsertNotificationTeamRuleRequest,
): Promise<NotificationPreferences> {
  const response = await fetch(
    getApiUrl(`/notification-preferences/teams/${teamId}`),
    {
      body: JSON.stringify(json),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as NotificationPreferences;
}

export default upsertNotificationTeamRule;
