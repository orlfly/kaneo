import enUS from "@i18n/en-US.json";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferencesSettings } from "./notification-preferences-settings";

const updatePreferences = vi.fn();
const preferences = {
  emailAddress: "mina@example.com",
  emailEnabled: false,
  ntfyEnabled: false,
  ntfyConfigured: false,
  ntfyServerUrl: null,
  ntfyTopic: null,
  ntfyTokenConfigured: false,
  maskedNtfyToken: null,
  gotifyEnabled: false,
  gotifyConfigured: false,
  gotifyServerUrl: null,
  gotifyTokenConfigured: false,
  maskedGotifyToken: null,
  webhookEnabled: false,
  webhookConfigured: false,
  webhookUrl: null,
  webhookSecretConfigured: false,
  maskedWebhookSecret: null,
  taskAssignmentEnabled: true,
  taskCommentEnabled: true,
  taskStatusChangeEnabled: true,
  dueDateReminderEnabled: true,
  dueDateReminderLeadTimeMinutes: 1440,
  teams: [],
  createdAt: null,
  updatedAt: null,
};

// A dedicated instance: the app singleton must not be imported beside a
// react-i18next mock. Inline resources keep the copy available synchronously.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Bind once: a fresh `t` on every render re-creates anything keyed on it.
  const t = i18next.t.bind(i18next);
  return { ...actual, useTranslation: () => ({ t, i18n: i18next }) };
});

vi.mock(
  "@/hooks/queries/notification-preferences/use-get-notification-preferences",
  () => ({
    default: () => ({
      data: preferences,
      isLoading: false,
    }),
  }),
);

vi.mock("@/hooks/queries/team/use-get-teams", () => ({
  default: () => ({ data: [] }),
}));

vi.mock(
  "@/hooks/mutations/notification-preferences/use-notification-preferences",
  () => ({
    useUpdateNotificationPreferences: () => ({
      mutateAsync: updatePreferences,
      isPending: false,
    }),
    useUpsertNotificationTeamRule: () => ({ mutateAsync: vi.fn() }),
    useDeleteNotificationTeamRule: () => ({ mutateAsync: vi.fn() }),
  }),
);

describe("NotificationPreferencesSettings", () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await translations;
    updatePreferences.mockReset();
    updatePreferences.mockResolvedValue(undefined);
  });

  it("saves event preferences and a configurable reminder lead time", async () => {
    render(<NotificationPreferencesSettings />);

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Task assignments",
      }),
    );
    fireEvent.change(screen.getByLabelText("Remind me before the due date"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save notification types",
      }),
    );

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({
        taskAssignmentEnabled: false,
        taskCommentEnabled: true,
        taskStatusChangeEnabled: true,
        dueDateReminderEnabled: true,
        dueDateReminderLeadTimeMinutes: 2880,
      }),
    );
  });

  it("blocks saving a cleared reminder lead time", () => {
    render(<NotificationPreferencesSettings />);

    fireEvent.change(screen.getByLabelText("Remind me before the due date"), {
      target: { value: "" },
    });

    expect(
      screen.getByText("Enter a whole number between 1 and 30."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Save notification types",
      }),
    ).toHaveProperty("disabled", true);
  });

  it("saves disabled reminders without validating their retained lead time", async () => {
    render(<NotificationPreferencesSettings />);

    fireEvent.change(screen.getByLabelText("Remind me before the due date"), {
      target: { value: "0" },
    });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Due-date reminders",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save notification types",
      }),
    );

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({
        taskAssignmentEnabled: true,
        taskCommentEnabled: true,
        taskStatusChangeEnabled: true,
        dueDateReminderEnabled: false,
      }),
    );
  });
});
