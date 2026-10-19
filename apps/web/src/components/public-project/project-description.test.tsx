import enUS from "@i18n/en-US.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPublicProjectDescription } from "@/fetchers/task/get-description-pages";
import { PublicProjectDescription } from "./project-description";

vi.mock("@/fetchers/task/get-description-pages", () => ({
  getPublicProjectDescription: vi.fn(),
}));
// A dedicated instance: the app singleton must not be imported beside a
// react-i18next mock. Inline resources keep the copy available synchronously.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

beforeEach(async () => {
  await translations;
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Bind once: a fresh `t` on every render re-creates anything keyed on it.
  const t = i18next.t.bind(i18next);
  return { ...actual, useTranslation: () => ({ t, i18n: i18next }) };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("loads deferred project text, with an explicit retry after failure", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.mocked(getPublicProjectDescription)
    .mockRejectedValueOnce(new Error("changed"))
    .mockResolvedValueOnce("Full project description");
  render(
    <QueryClientProvider client={client}>
      <PublicProjectDescription
        project={{
          id: "project",
          description: null,
          descriptionDeferred: true,
        }}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Retry"));
  expect(await screen.findByText("Full project description")).toBeTruthy();
  client.clear();
});
it("keeps ordinary project descriptions immediate", () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PublicProjectDescription
        project={{ id: "project", description: "Small description" }}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Small description")).toBeTruthy();
  expect(getPublicProjectDescription).not.toHaveBeenCalled();
  client.clear();
});
