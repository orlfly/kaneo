import enUS from "@i18n/en-US.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GiteaRepositoryBrowserModal } from "./gitea-repository-browser-modal";

const m = vi.hoisted(() => ({ list: vi.fn(), userId: "user-1" }));
vi.mock("@/fetchers/gitea-integration/list-gitea-repositories", () => ({
  default: m.list,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: m.userId } } }) },
}));
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
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
});
beforeEach(async () => {
  await translations;
  vi.resetAllMocks();
  m.userId = "user-1";
});
const result = (name: string) => ({
  repositories: [
    {
      id: 1,
      name,
      full_name: `owner/${name}`,
      owner: { login: "owner" },
      private: true,
      html_url: "https://gitea.example/owner/repo",
    },
  ],
});
function show() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        placeholderData: (previous: unknown) => previous,
      },
    },
  });
  clients.push(client);
  const node = (accessToken: string) => (
    <QueryClientProvider client={client}>
      <GiteaRepositoryBrowserModal
        open
        projectId="project"
        baseUrl="https://gitea.example"
        accessToken={accessToken}
        onOpenChange={vi.fn()}
        onSelectRepository={vi.fn()}
      />
    </QueryClientProvider>
  );
  const view = render(node("privileged-secret"));
  return { client, change: (token: string) => view.rerender(node(token)) };
}

describe("Gitea repository credential isolation", () => {
  it("hides privileged cached repositories immediately when a token changes, including on errors", async () => {
    m.list
      .mockResolvedValueOnce(result("private-repo"))
      .mockRejectedValueOnce(new Error("Unauthorized"));
    const { client, change } = show();
    await screen.findByText("owner/private-repo");
    change("unprivileged-secret");
    expect(screen.queryByText("owner/private-repo")).toBeNull();
    await screen.findByText("Unauthorized");
    expect(screen.queryByText("owner/private-repo")).toBeNull();
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
      ),
    ).not.toMatch(/privileged-secret/);
  });

  it("cannot display a late response from the previous token", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    m.list
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(result("allowed-repo"));
    const { change } = show();
    await waitFor(() => expect(m.list).toHaveBeenCalledTimes(1));
    change("restricted-token");
    await screen.findByText("owner/allowed-repo");
    await act(async () => {
      resolve(result("private-repo"));
    });
    expect(screen.queryByText("owner/private-repo")).toBeNull();
    expect(screen.getByText("owner/allowed-repo")).toBeInTheDocument();
  });

  it("isolates sessions even when the token and project props stay unchanged", async () => {
    m.list
      .mockResolvedValueOnce(result("private-repo"))
      .mockResolvedValueOnce(result("new-session-repo"));
    const { change } = show();
    await screen.findByText("owner/private-repo");
    m.userId = "user-2";
    change("privileged-secret");
    expect(screen.queryByText("owner/private-repo")).toBeNull();
    await screen.findByText("owner/new-session-repo");
    change("");
    expect(screen.queryByText("owner/new-session-repo")).toBeNull();
  });
});
