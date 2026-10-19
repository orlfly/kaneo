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
import { ApiKeyCreatedModal } from "./api-key-created-modal";

const m = vi.hoisted(() => ({
  copy: vi.fn(),
  select: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
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
vi.mock("@/lib/copy-to-clipboard", () => ({
  copyToClipboard: m.copy,
  selectElementText: m.select,
}));
// The UI primitives read the app singleton directly for aria-labels; point it
// at the test instance so those strings are real copy too.
vi.mock("@/lib/i18n", () => ({ i18n: i18next }));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const COPY_BUTTON = "Copy";
const COPIED_LABEL = "Copied";
const CONTINUE_LABEL = "Copy key to continue";

function renderModal() {
  return render(
    <ApiKeyCreatedModal
      apiKey="kaneo_secret_key"
      keyName="my key"
      open
      onClose={() => {}}
    />,
  );
}

describe("ApiKeyCreatedModal", () => {
  beforeEach(async () => {
    await translations;
    m.copy.mockReset();
    m.select.mockReset();
    m.success.mockReset();
    m.error.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("copies through the helper that works outside secure contexts", async () => {
    m.copy.mockResolvedValue(true);
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: COPY_BUTTON }));

    await waitFor(() =>
      expect(m.copy).toHaveBeenCalledWith("kaneo_secret_key"),
    );
    // The dialog only unlocks "Done" once the copy reported success.
    await waitFor(() => expect(screen.getByText(COPIED_LABEL)).toBeDefined());
    expect(m.success).toHaveBeenCalledWith("API key copied to clipboard");
    expect(m.error).not.toHaveBeenCalled();
    expect(m.select).not.toHaveBeenCalled();
  });

  it("reports a copy that failed on every route and stays on the copy step", async () => {
    m.copy.mockResolvedValue(false);
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: COPY_BUTTON }));

    await waitFor(() =>
      expect(m.error).toHaveBeenCalledWith(
        "Couldn't copy the key. Select it and copy it manually.",
      ),
    );
    expect(screen.queryByText(COPIED_LABEL)).toBeNull();
    expect(m.success).not.toHaveBeenCalled();
    // The key is left selected so the copy can be finished with the keyboard...
    expect(m.select).toHaveBeenCalledWith(
      expect.objectContaining({ tagName: "CODE" }),
    );
    // ...and the dialog can still be dismissed instead of trapping the user.
    const done = screen.getByRole("button", {
      name: CONTINUE_LABEL,
    }) as HTMLButtonElement;
    expect(done.disabled).toBe(false);
  });
});
