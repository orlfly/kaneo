import { useMemo } from "react";
import type { BlockingRelation, DependencyBar } from "./dependency-links";
import { buildDependencyLinks } from "./dependency-links";

type GanttDependencyLinksProps = {
  /** Measured bar boxes, keyed by task id. */
  bars: Record<string, DependencyBar>;
  relations: BlockingRelation[];
};

/**
 * Draws the `blocks` connectors over the timeline. Bars are opaque siblings in
 * the row layer, so the overlay is a pointer-events-none SVG painted above them
 * (and still left of the sticky task rail, which starts at the overlay's edge).
 */
export function GanttDependencyLinks({
  bars,
  relations,
}: GanttDependencyLinksProps) {
  const links = useMemo(
    () => buildDependencyLinks(bars, relations),
    [bars, relations],
  );

  if (links.length === 0) return null;

  return (
    <svg
      className="h-full w-full overflow-visible"
      aria-hidden="true"
      focusable="false"
    >
      {links.map((link) => (
        <g
          key={link.id}
          className={
            link.conflict ? "text-destructive/70" : "text-muted-foreground/50"
          }
        >
          <title>{link.title}</title>
          <path
            d={link.d}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            className="stroke-current"
          />
          <path d={link.arrow} className="fill-current stroke-none" />
        </g>
      ))}
    </svg>
  );
}
