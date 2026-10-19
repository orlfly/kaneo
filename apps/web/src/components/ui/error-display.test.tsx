import enUS from "@i18n/en-US.json";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { ErrorDisplay } from "./error-display";

// A dedicated instance: the app singleton must not be imported beside a
// react-i18next mock. The error screen hands keys to `t` through
// `parseApiError`, so these tests are what keeps those keys resolving.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: i18next.t.bind(i18next) }),
}));

describe("ErrorDisplay", () => {
  it("explains a CORS failure instead of showing the message key", async () => {
    await translations;
    render(<ErrorDisplay error={new Error("Failed to fetch")} />);

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(
      screen.getByText(
        "Unable to connect to the server. This might be due to CORS configuration issues.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Make sure your API server is running"),
    ).toBeTruthy();
    expect(screen.queryByText(/common:error\./)).toBeNull();
  });

  it("explains a network failure with its own steps", async () => {
    await translations;
    render(<ErrorDisplay error={new Error("Load failed")} />);

    expect(
      screen.getByText(
        "Network error. Please check your internet connection and try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Check your internet connection")).toBeTruthy();
  });
});
