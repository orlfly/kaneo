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
import { GenericWebhookIntegrationSettings } from "./generic-webhook-integration-settings";

const createIntegration = vi.fn();

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
  "@/hooks/queries/generic-webhook-integration/use-get-generic-webhook-integration",
  () => ({ default: () => ({ data: null, isLoading: false }) }),
);

vi.mock(
  "@/hooks/mutations/generic-webhook-integration/use-generic-webhook-integration",
  () => ({
    useCreateGenericWebhookIntegration: () => ({
      mutateAsync: createIntegration,
      isPending: false,
    }),
    useUpdateGenericWebhookIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useDeleteGenericWebhookIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }),
);

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const EVENT_LABELS: Record<string, string> = {
  taskDeleted: "Task deleted",
  taskMoved: "Task moved",
  taskDueDateChanged: "Due date changed",
  taskAssigneeChanged: "Assignee changed",
  taskUnassigned: "Task unassigned",
};

describe("GenericWebhookIntegrationSettings", () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await translations;
    createIntegration.mockReset();
    createIntegration.mockResolvedValue(undefined);
  });

  it("creates an opt-in project reminder webhook with its lead time", async () => {
    render(<GenericWebhookIntegrationSettings projectId="project-1" />);

    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://example.com/hooks/kaneo" },
    });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Due-date reminders",
      }),
    );
    fireEvent.change(
      screen.getByLabelText("Send the webhook this many hours before"),
      { target: { value: "48" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Connect webhook",
      }),
    );

    await waitFor(() =>
      expect(createIntegration).toHaveBeenCalledWith({
        projectId: "project-1",
        data: expect.objectContaining({
          webhookUrl: "https://example.com/hooks/kaneo",
          dueDateReminderLeadTimeMinutes: 2880,
          events: expect.objectContaining({
            dueDateReminder: true,
            taskDeleted: false,
            taskMoved: false,
            taskDueDateChanged: false,
            taskAssigneeChanged: false,
            taskUnassigned: false,
          }),
        }),
      }),
    );
  });

  it("creates a webhook with the opt-in task lifecycle events enabled", async () => {
    render(<GenericWebhookIntegrationSettings projectId="project-1" />);

    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://example.com/hooks/kaneo" },
    });
    for (const event of [
      "taskDeleted",
      "taskMoved",
      "taskDueDateChanged",
      "taskAssigneeChanged",
      "taskUnassigned",
    ]) {
      fireEvent.click(
        screen.getByRole("switch", {
          name: EVENT_LABELS[event],
        }),
      );
    }
    fireEvent.click(
      screen.getByRole("button", {
        name: "Connect webhook",
      }),
    );

    await waitFor(() =>
      expect(createIntegration).toHaveBeenCalledWith({
        projectId: "project-1",
        data: expect.objectContaining({
          events: expect.objectContaining({
            taskDeleted: true,
            taskMoved: true,
            taskDueDateChanged: true,
            taskAssigneeChanged: true,
            taskUnassigned: true,
          }),
        }),
      }),
    );
  });

  it("submits other webhook settings after an invalid reminder time is disabled", async () => {
    render(<GenericWebhookIntegrationSettings projectId="project-1" />);

    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://example.com/hooks/kaneo" },
    });
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Due-date reminders",
      }),
    );
    fireEvent.change(
      screen.getByLabelText("Send the webhook this many hours before"),
      { target: { value: "0" } },
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Due-date reminders",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Connect webhook",
      }),
    );

    await waitFor(() =>
      expect(createIntegration).toHaveBeenCalledWith({
        projectId: "project-1",
        data: expect.objectContaining({
          webhookUrl: "https://example.com/hooks/kaneo",
          events: expect.objectContaining({ dueDateReminder: false }),
        }),
      }),
    );
    expect(createIntegration.mock.calls[0]?.[0].data).not.toHaveProperty(
      "dueDateReminderLeadTimeMinutes",
    );
  });
});
