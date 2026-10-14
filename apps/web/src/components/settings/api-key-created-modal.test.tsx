import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiKeyCreatedModal } from "./api-key-created-modal";

const m = vi.hoisted(() => ({
  copy: vi.fn(),
  select: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));
vi.mock("@/lib/copy-to-clipboard", () => ({
  copyToClipboard: m.copy,
  selectElementText: m.select,
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const COPY_BUTTON = "settings:apiKey.createdModal.copy";
const COPIED_LABEL = "settings:apiKey.createdModal.copied";
const CONTINUE_LABEL = "settings:apiKey.createdModal.copyToContinue";

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
  beforeEach(() => {
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
    expect(m.success).toHaveBeenCalledWith(
      "settings:apiKey.createdModal.toastCopied",
    );
    expect(m.error).not.toHaveBeenCalled();
    expect(m.select).not.toHaveBeenCalled();
  });

  it("reports a copy that failed on every route and stays on the copy step", async () => {
    m.copy.mockResolvedValue(false);
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: COPY_BUTTON }));

    await waitFor(() =>
      expect(m.error).toHaveBeenCalledWith(
        "settings:apiKey.createdModal.toastCopyFailed",
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
