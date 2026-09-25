import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regressions guard: Hono matches routes in registration order, so the
// literal `/active` routes must be registered before the parameterized
// `/:teamId` routes. If `/:teamId` comes first, `PUT /api/team/active` is
// captured with `teamId === "active"` and the caller is rejected with 403
// "Not a member of this team", breaking the active-team switcher.
const teamRoutes = readFileSync(
  resolve(__dirname, "../../apps/api/src/team/index.ts"),
  "utf8",
);

const lines = teamRoutes.split("\n");

// Index of the `.put("...` registration that a given path belongs to: scan
// for the path string and return the line of the nearest preceding `.put(`.
// The `.put(` chain segment that registers `path` sits on two lines
// (`.put(` then `"path",`), so locate the path string and return the line of
// the nearest preceding `.put(`.
function putLineForRoute(path: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`"/${path}",`)) {
      for (let j = i; j >= 0; j--) {
        if (lines[j].trim() === ".put(") {
          return j;
        }
      }
    }
  }
  return -1;
}

describe("team route registration order", () => {
  it("registers literal /active before parameterized /:teamId", () => {
    const activeLine = putLineForRoute("active");
    const teamIdLine = putLineForRoute(":teamId");
    expect(activeLine).toBeGreaterThanOrEqual(0);
    expect(teamIdLine).toBeGreaterThanOrEqual(0);
    expect(activeLine).toBeLessThan(teamIdLine);
  });

  it("keeps /active on the team router (not shadowed elsewhere)", () => {
    expect(teamRoutes).toContain('"/active"');
    expect(teamRoutes).toContain('operationId: "setActiveTeam"');
    expect(teamRoutes).toContain('operationId: "clearActiveTeam"');
  });
});
