/**
 * Geometry for the Gantt chart's dependency connectors.
 *
 * Bars are measured from the DOM (they live in a CSS grid of day columns, so
 * their pixel box is the only reliable source of truth for zoom, scrolling and
 * the mobile breakpoint alike). This module is pure: given measured boxes and
 * `blocks` relations, it returns the SVG path data to draw.
 */

export type DependencyBar = {
  taskId: string;
  /** Left edge of the bar, in px inside the overlay. */
  left: number;
  /** Right edge of the bar, in px inside the overlay. */
  right: number;
  /** Vertical centre of the bar, in px inside the overlay. */
  centerY: number;
};

export type BlockingRelation = {
  id: string;
  /** The task doing the blocking (`blocks` source). */
  sourceTaskId: string;
  /** The task that is blocked (`blocks` target). */
  targetTaskId: string;
  /** Tooltip, already localised by the caller. */
  title: string;
  /** True when the blocked task is scheduled to start before the blocker ends. */
  conflict: boolean;
};

export type DependencyLink = {
  id: string;
  /** Path from the blocker's right edge into the blocked task's left edge. */
  d: string;
  /** Arrow head polygon, pointing into the blocked task. */
  arrow: string;
  title: string;
  conflict: boolean;
};

/** Horizontal run leaving the blocker before the line turns. */
const EXIT_STUB = 10;
/** Radius of the rounded elbows. */
const CORNER = 6;
/**
 * Minimum gap between the two bars for an orthogonal route. Bars can sit only a
 * day or two apart once the timeline window is wide, so the threshold is about
 * fitting one elbow rather than a comfortable stretch of horizontal run; a curve
 * is reserved for a gap that is zero or negative (an overlapping schedule).
 */
const MIN_ROOM = 6;
/** Arrow head size. */
const ARROW_LENGTH = 5;
const ARROW_HALF_HEIGHT = 3.5;

export function buildDependencyLinks(
  bars: Record<string, DependencyBar>,
  relations: BlockingRelation[],
): DependencyLink[] {
  const links: DependencyLink[] = [];

  for (const relation of relations) {
    const source = bars[relation.sourceTaskId];
    const target = bars[relation.targetTaskId];
    // An endpoint without a measured bar is out of the timeline window, not
    // scheduled, or filtered out by the search box: nothing to draw to.
    if (!source || !target) continue;

    const x1 = source.right;
    const y1 = source.centerY;
    const x2 = target.left;
    const y2 = target.centerY;

    links.push({
      id: relation.id,
      d:
        x2 - x1 >= MIN_ROOM
          ? orthogonalRoute(x1, y1, x2, y2)
          : curvedRoute(x1, y1, x2, y2),
      arrow: arrowHead(x2, y2),
      title: relation.title,
      conflict: relation.conflict,
    });
  }

  return links;
}

/**
 * Right, then down or up, then right into the blocked task. Used whenever the
 * blocked task starts far enough after the blocker for the elbows to fit.
 */
function orthogonalRoute(x1: number, y1: number, x2: number, y2: number) {
  const turnX = x2 - EXIT_STUB;
  const deltaY = y2 - y1;
  if (Math.abs(deltaY) < 1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const direction = deltaY > 0 ? 1 : -1;
  const radius = Math.min(
    CORNER,
    Math.abs(deltaY) / 2,
    Math.max((turnX - x1) / 2, 0),
  );
  if (radius <= 0) {
    // Almost no horizontal run: turn on a hard corner instead of an elbow,
    // without emitting a zero-length horizontal segment first.
    const cornerX = Math.max(turnX, x1);
    return cornerX === x1
      ? `M ${x1} ${y1} L ${cornerX} ${y2} L ${x2} ${y2}`
      : `M ${x1} ${y1} L ${cornerX} ${y1} L ${cornerX} ${y2} L ${x2} ${y2}`;
  }

  return [
    `M ${x1} ${y1}`,
    `L ${turnX - radius} ${y1}`,
    `Q ${turnX} ${y1} ${turnX} ${y1 + direction * radius}`,
    `L ${turnX} ${y2 - direction * radius}`,
    `Q ${turnX} ${y2} ${turnX + radius} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

/**
 * Fallback for a blocked task that starts at or before the blocker's end (an
 * overlapping or reversed schedule). A curve still reads as a dependency, while
 * an orthogonal route would fold back over its own elbows.
 */
function curvedRoute(x1: number, y1: number, x2: number, y2: number) {
  return `M ${x1} ${y1} C ${x1 + EXIT_STUB} ${y1} ${x2 - EXIT_STUB} ${y2} ${x2} ${y2}`;
}

/** Always points right: the incoming tangent is horizontal in both routes. */
function arrowHead(x: number, y: number) {
  return [
    `M ${x} ${y}`,
    `L ${x - ARROW_LENGTH} ${y - ARROW_HALF_HEIGHT}`,
    `L ${x - ARROW_LENGTH} ${y + ARROW_HALF_HEIGHT}`,
    "Z",
  ].join(" ");
}
