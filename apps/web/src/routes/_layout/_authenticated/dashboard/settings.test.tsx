import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({
    to,
    activeProps: _activeProps,
    children,
    ...props
  }: {
    to: string;
    activeProps?: unknown;
    children?: ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useLocation: () => ({
    pathname: "/dashboard/settings/account/developer",
  }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: { role: "member" } }),
}));

vi.mock("@/hooks/queries/team/use-active-team", () => ({
  default: () => ({ data: { id: "team-1" } }),
}));

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [{ id: "project-1" }] }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/page-title", () => ({
  default: () => null,
}));

vi.mock("@/components/SettingsSidebar", () => ({
  SettingsSidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
}));

import { Route } from "./settings";

type RouteWithComponent = {
  component: () => ReactNode;
};

const SettingsLayout = (Route as unknown as RouteWithComponent).component;

describe("settings account navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores the account sub-navigation including the API keys page", () => {
    render(<SettingsLayout />);

    expect(screen.getByText("settings:information")).toHaveAttribute(
      "href",
      "/dashboard/settings/account/information",
    );
    expect(screen.getByText("settings:notifications")).toHaveAttribute(
      "href",
      "/dashboard/settings/account/notifications",
    );
    expect(screen.getByText("settings:preferences")).toHaveAttribute(
      "href",
      "/dashboard/settings/account/preferences",
    );
    expect(screen.getByText("settings:apiKeys")).toHaveAttribute(
      "href",
      "/dashboard/settings/account/developer",
    );
  });
});
