import enUS from "@i18n/en-US.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { CreateApiKeyDialog } from "./create-api-key-dialog";

// Real en-US translations so queries match user-visible copy ("My API Key",
// "Create", "All projects", project names). A dedicated i18next instance is
// used because importing the app's @/lib/i18n singleton from inside a
// vi.mock factory hangs the vitest worker.
void i18next.use(initReactI18next).init({
  lng: "en",
  resources: { en: enUS },
  defaultNS: "common",
});

const createApiKey = vi.fn();

vi.mock("@/hooks/mutations/api-key/use-create-api-key", () => ({
  default: () => ({ mutateAsync: createApiKey }),
}));

const listTeams = vi.fn(async () => [
  {
    id: "team-1",
    name: "Team One",
    slug: "team-one",
    description: null,
    role: "owner" as const,
    memberCount: 1,
    createdAt: "2025-01-01",
    archivedAt: null,
  },
]);

const getProjects = vi.fn(async () => [
  { id: "project-1", name: "Alpha Project", teamId: "team-1" },
]);

vi.mock("@/fetchers/team/list-teams", () => ({
  default: (...args: unknown[]) => listTeams(...(args as [])),
}));

vi.mock("@/fetchers/project/get-projects", () => ({
  default: (...args: unknown[]) => getProjects(...(args as [])),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: i18next.t.bind(i18next) }),
  };
});

function renderDialog(onSuccess = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CreateApiKeyDialog open onClose={vi.fn()} onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
}

async function openProjectSelect() {
  // Three comboboxes: expiration, agent role, project scope. The project
  // scope one is last. base-ui opens on the mousedown press sequence, not a
  // bare click, and commits item selection on a pointer-press + click.
  const triggers = screen.getAllByRole("combobox");
  const projectTrigger = triggers[triggers.length - 1];
  fireEvent.pointerDown(projectTrigger, {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
  });
  fireEvent.mouseDown(projectTrigger, { button: 0 });
  fireEvent.click(projectTrigger, { detail: 1, pointerType: "mouse" });
  await screen.findByRole("option", { name: "Alpha Project" });
}

describe("CreateApiKeyDialog project scope", () => {
  beforeEach(() => {
    createApiKey.mockReset();
    createApiKey.mockResolvedValue({ key: "kaneo_x", name: "k" });
    listTeams.mockClear();
    getProjects.mockClear();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("defaults to all projects and does not send a projectId binding", async () => {
    renderDialog();

    await waitFor(() => {
      expect(getProjects).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByPlaceholderText("My API Key"), {
      target: { value: "My Key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalled();
    });
    const payload = createApiKey.mock.calls[0]?.[0] as {
      metadata: Record<string, unknown>;
    };
    expect(payload.metadata.agentRole).toBe("coding");
    expect(payload.metadata.projectId).toBeUndefined();
  });

  it("saves the selected project into metadata.projectId", async () => {
    renderDialog();

    await waitFor(() => {
      expect(getProjects).toHaveBeenCalled();
    });

    await openProjectSelect();
    const option = screen.getByRole("option", { name: "Alpha Project" });
    fireEvent.pointerDown(option, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    });
    fireEvent.click(option, { detail: 1, pointerType: "mouse" });

    fireEvent.change(screen.getByPlaceholderText("My API Key"), {
      target: { value: "Scoped key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalled();
    });
    const payload = createApiKey.mock.calls[0]?.[0] as {
      metadata: Record<string, unknown>;
    };
    expect(payload.metadata.projectId).toBe("project-1");
  });
});
