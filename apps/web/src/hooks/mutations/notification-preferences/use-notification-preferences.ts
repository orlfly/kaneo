import { useMutation, useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import { BellIcon, BellOffIcon } from "lucide-react";
import deleteNotificationTeamRule from "@/fetchers/notification-preferences/delete-notification-team-rule";
import updateNotificationPreferences, {
  type UpdateNotificationPreferencesRequest,
} from "@/fetchers/notification-preferences/update-notification-preferences";
import upsertNotificationTeamRule, {
  type UpsertNotificationTeamRuleRequest,
} from "@/fetchers/notification-preferences/upsert-notification-team-rule";
import { toast } from "@/lib/toast";

export function useUpdateNotificationPreferences({
  silent = false,
}: {
  silent?: boolean;
} = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (json: UpdateNotificationPreferencesRequest) =>
      updateNotificationPreferences(json),
    onSuccess: (preferences) => {
      queryClient.setQueryData(["notification-preferences"], preferences);
      void queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      if (!silent) {
        toast.success(
          i18n.t("settings:notificationsPage.toastPreferencesSaved"),
          { icon: BellIcon },
        );
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : i18n.t("settings:notificationsPage.toastPreferencesSaveFailed"),
      );
    },
  });
}

export function useUpsertNotificationTeamRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      teamId,
      json,
    }: {
      teamId: string;
      json: UpsertNotificationTeamRuleRequest;
    }) => upsertNotificationTeamRule(teamId, json),
    onSuccess: (preferences) => {
      queryClient.setQueryData(["notification-preferences"], preferences);
      void queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      toast.success(
        i18n.t("settings:notificationsPage.toastRuleSavedGeneric"),
        { icon: BellIcon },
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : i18n.t("settings:notificationsPage.toastRuleSaveFailed", {}),
      );
    },
  });
}

export function useDeleteNotificationTeamRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) => deleteNotificationTeamRule(teamId),
    onSuccess: (preferences) => {
      queryClient.setQueryData(["notification-preferences"], preferences);
      void queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
      toast.success(
        i18n.t("settings:notificationsPage.toastRuleRemovedGeneric"),
        { icon: BellOffIcon },
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : i18n.t("settings:notificationsPage.toastRuleRemoveFailed", {}),
      );
    },
  });
}
