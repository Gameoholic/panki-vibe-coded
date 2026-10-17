import { MARK_DOT_CENTER, MARK_PARTS, MARK_RADIUS, MARK_SIZE } from "./geometry";

type Props = {
  className?: string;
  /** Side of the square, in px. */
  size?: number;
};

const BOX = `0 0 ${MARK_SIZE} ${MARK_SIZE}`;

/**
 * The Panki mark, drawn as four stacked layers (the tile, the two strokes of ハ, the ring) so a moment such as
 * `Intro` can move each part on its own. Still, by default. Colours are the --mark-* tokens.
 */
export function Mark({ className, size = 48 }: Props) {
  return (
    <span className={["mark", className].filter(Boolean).join(" ")} style={{ width: size, height: size }} aria-hidden="true">
      <svg className="mark-tile" viewBox={BOX}>
        <rect width={MARK_SIZE} height={MARK_SIZE} rx={MARK_RADIUS} />
      </svg>
      <svg className="mark-left" viewBox={BOX}>
        <path d={MARK_PARTS.left} />
      </svg>
      <svg className="mark-right" viewBox={BOX}>
        <path d={MARK_PARTS.right} />
      </svg>
      <svg className="mark-dot" viewBox={BOX} style={{ transformOrigin: `${MARK_DOT_CENTER.x * 100}% ${MARK_DOT_CENTER.y * 100}%` }}>
        <path d={MARK_PARTS.dot} />
      </svg>
    </span>
  );
}
