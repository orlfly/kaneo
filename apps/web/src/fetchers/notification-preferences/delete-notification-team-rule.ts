import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";
import type { NotificationPreferences } from "./get-notification-preferences";

async function deleteNotificationTeamRule(
  teamId: string,
): Promise<NotificationPreferences> {
  const response = await fetch(
    getApiUrl(`/notification-preferences/teams/${teamId}`),
    {
      credentials: "include",
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return (await response.json()) as NotificationPreferences;
}

export default deleteNotificationTeamRule;
