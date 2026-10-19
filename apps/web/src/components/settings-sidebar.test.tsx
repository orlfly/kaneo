import enUS from "@i18n/en-US.json";
import { cleanup, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsSidebar, {
  SettingsSidebarProvider,
} from "@/components/SettingsSidebar";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet } from "@/components/ui/sheet";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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

function renderSettings({ menuOpen }: { menuOpen: boolean }) {
  return render(
    <SettingsSidebarProvider
      teamId="workspace-1"
      menuOpen={menuOpen}
      setMenuOpen={vi.fn()}
    >
      <div className="flex">
        <SettingsSidebar>
          <span>Account nav</span>
        </SettingsSidebar>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingsSidebarProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("SettingsSidebar", () => {
  it("renders only the desktop sidebar while the mobile menu is closed", () => {
    renderSettings({ menuOpen: false });

    expect(screen.getAllByText("Account nav")).toHaveLength(1);
  });

  it("renders the nav in the mobile sheet when the menu is open", () => {
    renderSettings({ menuOpen: true });

    expect(screen.getAllByText("Account nav")).toHaveLength(2);
  });

  it("keeps page dialogs out of the settings sheet's dialog tree", () => {
    renderSettings({ menuOpen: false });

    expect(screen.getByText("Delete your account?")).toBeTruthy();
    expect(
      document.querySelector('[data-slot="alert-dialog-backdrop"]'),
    ).not.toBeNull();
    expect(
      document
        .querySelector('[data-slot="alert-dialog-popup"]')
        ?.hasAttribute("data-nested"),
    ).toBe(false);
  });

  it("treats a dialog inside the sheet's root as nested, which is what the old layout did", () => {
    render(
      <Sheet open={false}>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nested</AlertDialogTitle>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      </Sheet>,
    );

    expect(
      document
        .querySelector('[data-slot="alert-dialog-popup"]')
        ?.hasAttribute("data-nested"),
    ).toBe(true);
  });
});
