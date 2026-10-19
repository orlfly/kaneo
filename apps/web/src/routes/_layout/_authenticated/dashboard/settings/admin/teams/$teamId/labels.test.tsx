import enUS from "@i18n/en-US.json";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import i18next from "i18next";
import type { ComponentType } from "react";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./labels";

// The UI primitives read the app singleton directly for aria-labels; point it
// at the test instance so those strings are real copy too.
vi.mock("@/lib/i18n", () => ({ i18n: i18next }));

const m = vi.hoisted(() => ({
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  pending: false,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ teamId: "team-1" }),
  }),
  useNavigate: () => () => {},
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
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
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    workspace: { id: "workspace" },
    canCreateLabels: () => true,
    canUpdateLabels: () => true,
    canDeleteLabels: () => true,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({}),
}));
vi.mock("@/hooks/queries/label/use-get-labels-by-team", () => ({
  default: () => ({
    data: [
      {
        id: "root",
        name: "bug",
        color: "red",
        taskId: null,
        deletionStartedAt: "2026-09-19T12:00:00Z",
      },
    ],
  }),
}));
vi.mock("@/hooks/mutations/label/use-create-label", () => ({
  default: () => ({}),
}));
vi.mock("@/hooks/mutations/label/use-update-label", () => ({
  default: () => ({}),
}));
vi.mock("@/hooks/mutations/label/use-delete-label", () => ({
  default: () => ({ mutateAsync: m.remove, isPending: m.pending }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));
const Component = Route.options.component as ComponentType;
afterEach(cleanup);
beforeEach(async () => {
  await translations;
  vi.clearAllMocks();
  m.pending = false;
});
describe("resuming workspace label deletion", () => {
  it("shows persisted deletion state, prevents editing and resumes after confirmation", async () => {
    m.remove.mockResolvedValue({ id: "root" });
    render(<Component />);
    expect(screen.getByText("Deletion in progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Label" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Resume deletion",
      }),
    );
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Resume deletion",
      }),
    );
    await waitFor(() => expect(m.remove).toHaveBeenCalledWith({ id: "root" }));
    await waitFor(() =>
      expect(m.success).toHaveBeenCalledWith("Label deleted"),
    );
  });
  it("keeps the confirmation available and never reports success on another connection failure", async () => {
    m.remove.mockRejectedValue(new Error("Connection lost"));
    render(<Component />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Resume deletion",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Resume deletion",
      }),
    );
    await waitFor(() =>
      expect(m.error).toHaveBeenCalledWith("Connection lost"),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(m.success).not.toHaveBeenCalled();
  });
});
