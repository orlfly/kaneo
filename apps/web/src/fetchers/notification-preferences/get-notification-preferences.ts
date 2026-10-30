import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";

export type NotificationPreferenceTeamRule = {
  id: string;
  teamId: string;
  teamName: string;
  isActive: boolean;
  ntfyEnabled: boolean;
  gotifyEnabled: boolean;
  webhookEnabled: boolean;
  projectMode: "all" | "selected";
  selectedProjectIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type NotificationPreferences = {
  ntfyEnabled: boolean;
  ntfyConfigured: boolean;
  ntfyServerUrl: string | null;
  ntfyTopic: string | null;
  ntfyTokenConfigured: boolean;
  maskedNtfyToken: string | null;
  gotifyEnabled: boolean;
  gotifyConfigured: boolean;
  gotifyServerUrl: string | null;
  gotifyTokenConfigured: boolean;
  maskedGotifyToken: string | null;
  webhookEnabled: boolean;
  webhookConfigured: boolean;
  webhookUrl: string | null;
  webhookSecretConfigured: boolean;
  maskedWebhookSecret: string | null;
  taskAssignmentEnabled: boolean;
  taskCommentEnabled: boolean;
  taskStatusChangeEnabled: boolean;
  dueDateReminderEnabled: boolean;
  dueDateReminderLeadTimeMinutes: number;
  teams: NotificationPreferenceTeamRule[];
  createdAt: string | null;
  updatedAt: string | null;
};

async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await fetch(getApiUrl("/notification-preferences"), {
    credentials: "include",
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return (await response.json()) as NotificationPreferences;
}

export default getNotificationPreferences;
