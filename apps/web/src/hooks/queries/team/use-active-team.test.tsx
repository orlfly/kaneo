import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import getActiveTeamId from "@/fetchers/team/get-active-team-id";
import listTeams, { type ListTeamsResponse } from "@/fetchers/team/list-teams";
import useActiveTeam from "./use-active-team";

vi.mock("@/fetchers/team/get-active-team-id", () => ({
  default: vi.fn(),
}));

vi.mock("@/fetchers/team/list-teams", () => ({
  default: vi.fn(),
}));

const mockGetActiveTeamId = vi.mocked(getActiveTeamId);
const mockListTeams = vi.mocked(listTeams);

const TEAM_A: ListTeamsResponse = {
  id: "team-a",
  name: "Team A",
  slug: "team-a",
  description: null,
  role: "owner",
  memberCount: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  archivedAt: null,
};

const TEAM_B: ListTeamsResponse = {
  id: "team-b",
  name: "Team B",
  slug: "team-b",
  description: null,
  role: "member",
  memberCount: 2,
  createdAt: "2026-08-02T00:00:00.000Z",
  archivedAt: null,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useActiveTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the team matching the persisted active team id", async () => {
    mockListTeams.mockResolvedValue([TEAM_A, TEAM_B]);
    mockGetActiveTeamId.mockResolvedValue("team-b");
    const { result } = renderHook(() => useActiveTeam(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.id).toBe("team-b");
  });

  it("returns the first team when no active id is persisted", async () => {
    mockListTeams.mockResolvedValue([TEAM_A, TEAM_B]);
    mockGetActiveTeamId.mockResolvedValue(null);
    const { result } = renderHook(() => useActiveTeam(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.id).toBe("team-a");
  });

  it("returns the first team when the persisted id does not match a member team", async () => {
    mockListTeams.mockResolvedValue([TEAM_A, TEAM_B]);
    mockGetActiveTeamId.mockResolvedValue("team-gone");
    const { result } = renderHook(() => useActiveTeam(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.id).toBe("team-a");
  });

  it("returns null when the user has no teams", async () => {
    mockListTeams.mockResolvedValue([]);
    mockGetActiveTeamId.mockResolvedValue(null);
    const { result } = renderHook(() => useActiveTeam(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBeNull();
  });

  it("uses a query key under the teams prefix so shared invalidation works", async () => {
    mockListTeams.mockResolvedValue([TEAM_A]);
    mockGetActiveTeamId.mockResolvedValue(null);
    const { result } = renderHook(() => useActiveTeam(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.id).toBe("team-a");
  });
});
