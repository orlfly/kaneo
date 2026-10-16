import { describe, expect, it } from "vitest";
import type { BlockingRelation, DependencyBar } from "./dependency-links";
import { buildDependencyLinks } from "./dependency-links";

function bar(
  taskId: string,
  left: number,
  right: number,
  centerY: number,
): DependencyBar {
  return { taskId, left, right, centerY };
}

function relation(
  id: string,
  sourceTaskId: string,
  targetTaskId: string,
  conflict = false,
): BlockingRelation {
  return {
    id,
    sourceTaskId,
    targetTaskId,
    conflict,
    title: `${sourceTaskId} blocks ${targetTaskId}`,
  };
}

describe("buildDependencyLinks", () => {
  it("routes a connector from the blocker's end into the blocked task's start", () => {
    const links = buildDependencyLinks(
      {
        blocker: bar("blocker", 0, 100, 20),
        blocked: bar("blocked", 200, 300, 80),
      },
      [relation("r1", "blocker", "blocked")],
    );

    expect(links).toHaveLength(1);
    // Leaves the blocker's right edge, turns down at x2 - stub, arrives at the
    // blocked task's left edge.
    expect(links[0].d).toContain("M 100 20");
    expect(links[0].d).toContain("190 80");
    expect(links[0].d).toMatch(/L 200 80$/);
    // Arrow head sits on the target's left edge, pointing right.
    expect(links[0].arrow).toContain("M 200 80");
    expect(links[0].conflict).toBe(false);
    expect(links[0].title).toBe("blocker blocks blocked");
  });

  it("turns upward when the blocked task sits above the blocker", () => {
    const links = buildDependencyLinks(
      {
        blocker: bar("blocker", 0, 100, 80),
        blocked: bar("blocked", 200, 300, 20),
      },
      [relation("r1", "blocker", "blocked")],
    );

    expect(links[0].d).toContain("M 100 80");
    // The vertical run goes from the blocker up to the blocked task's centre.
    expect(links[0].d).toContain("Q 190 80");
    expect(links[0].d).toMatch(/L 200 20$/);
  });

  it("still turns a corner when the two bars sit only a few pixels apart", () => {
    // A wide timeline window can leave a one-day gap between a blocker and a
    // task that follows it. That must not collapse into a bezier.
    const links = buildDependencyLinks(
      {
        blocker: bar("blocker", 0, 100, 20),
        blocked: bar("blocked", 108, 200, 80),
      },
      [relation("r1", "blocker", "blocked")],
    );

    expect(links[0].d).not.toContain("C");
    // There is no room for a horizontal run, so it drops straight down from the
    // blocker's right edge and then runs into the blocked task's left edge.
    expect(links[0].d).toBe("M 100 20 L 100 80 L 108 80");
  });

  it("draws a straight run when both bars share a row (same centre line)", () => {
    const links = buildDependencyLinks(
      {
        blocker: bar("blocker", 0, 100, 44),
        blocked: bar("blocked", 220, 320, 44),
      },
      [relation("r1", "blocker", "blocked")],
    );

    expect(links[0].d).toBe("M 100 44 L 220 44");
  });

  it("falls back to a curve when the blocked task starts before the blocker ends", () => {
    const links = buildDependencyLinks(
      {
        blocker: bar("blocker", 0, 200, 20),
        blocked: bar("blocked", 150, 260, 80),
      },
      [relation("r1", "blocker", "blocked")],
    );

    // An orthogonal route would fold back through its own elbows here.
    expect(links[0].d).toContain("C");
    expect(links[0].d).toMatch(/L 150 80$| 150 80$/);
  });

  it("skips relations whose endpoint has no measured bar", () => {
    const links = buildDependencyLinks(
      { blocker: bar("blocker", 0, 100, 20) },
      [
        relation("r1", "blocker", "not-on-timeline"),
        relation("r2", "also-missing", "blocker"),
      ],
    );

    expect(links).toEqual([]);
  });

  it("keeps the conflict flag for the caller to style", () => {
    const links = buildDependencyLinks(
      {
        blocker: bar("blocker", 0, 100, 20),
        blocked: bar("blocked", 200, 300, 80),
      },
      [relation("r1", "blocker", "blocked", true)],
    );

    expect(links[0].conflict).toBe(true);
  });
});
