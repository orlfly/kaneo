import { cleanup, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => null,
  redirect: (options: unknown) => options,
  useLocation: () => ({
    pathname: "/dashboard/settings/account/developer",
  }),
}));

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({
    user: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "member",
    },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/SettingsSidebar", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarGroup: ({ children, ...props }: { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  SidebarGroupContent: ({ children, ...props }: { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  SidebarGroupLabel: ({ children, ...props }: { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  SidebarMenu: ({ children, ...props }: { children?: ReactNode }) => (
    <ul {...props}>{children}</ul>
  ),
  SidebarMenuItem: ({ children, ...props }: { children?: ReactNode }) => (
    <li {...props}>{children}</li>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    render,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children?: ReactNode;
    render?: ReactElement;
    variant?: string;
    size?: string;
    [key: string]: unknown;
  }) =>
    render ? (
      cloneElement(render, props, children)
    ) : (
      <button {...props}>{children}</button>
    ),
}));

import { Route } from "./account";

type RouteWithComponent = {
  component: () => ReactNode;
};

const AccountLayout = (Route as unknown as RouteWithComponent).component;

describe("account settings navigation", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the account sections as a vertical navigation", () => {
    render(<AccountLayout />);

    expect(
      screen.getByText("settings:information").closest("a"),
    ).toHaveAttribute("href", "/dashboard/settings/account/information");
    expect(
      screen.getByText("settings:notifications").closest("a"),
    ).toHaveAttribute("href", "/dashboard/settings/account/notifications");
    expect(
      screen.getByText("settings:preferences").closest("a"),
    ).toHaveAttribute("href", "/dashboard/settings/account/preferences");
    expect(screen.getByText("settings:apiKeys").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/settings/account/developer",
    );
  });

  it("highlights the current account section", () => {
    render(<AccountLayout />);

    expect(screen.getByText("settings:apiKeys").closest("a")).toHaveClass(
      "bg-sidebar-accent",
    );
    expect(
      screen.getByText("settings:information").closest("a"),
    ).not.toHaveClass("bg-sidebar-accent");
  });
});
