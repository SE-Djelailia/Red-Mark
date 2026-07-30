// RedMark's mark: a bold X — the brand is literally a "red mark", and a red
// X is the universal inspection/deficiency notation.
//
// GEOMETRY. The X is two rectangles rotated ±45°, expressed as explicit
// polygons rather than <line> with a stroke. That is deliberate: a stroked
// line can only have butt/round/square caps, and none of those give a clean
// mitered corner where the bar ends meet the diagonal. Drawing the bars as
// four-point polygons makes the ends true flat cuts.
//
// Coordinates are computed on a 0–100 viewBox, centred on (50,50), with the
// corners reaching to 4/96 so the mark keeps a little breathing room inside
// its box. Bar thickness is 24% of the mark's width, in the middle of the
// requested 22–26% range.
//
//   half-thickness h = 12
//   corner reach     = 46 (50 − 4 inset)
//   half-length  L/2 = (46 − h·sin45°) / cos45° ≈ 53.06
//
// Verified symmetric: the union of both bars has bbox 4..96 on both axes,
// centred on 50,50.

const BAR_A = "79.03,96 96,79.03 20.97,4 4,20.97"; // "\" diagonal
const BAR_B = "96,20.97 79.03,4 4,79.03 20.97,96"; // "/" diagonal

/** Brand red. Literal hex — this value is also consumed by Canvas 2D in the
 *  icon generator, which cannot resolve CSS custom properties. */
export const BRAND_RED = "#E10600";
export const INK = "#1A1A1A";

export type LogoVariant = "mark" | "app" | "mono" | "inverse";

interface LogoProps {
  /** Rendered width/height in px. */
  size?: number;
  variant?: LogoVariant;
  /** Only used by the "mono" variant; defaults to currentColor so the mark
   *  inherits the surrounding text colour. */
  color?: string;
  className?: string;
  /** Set when the logo sits beside the wordmark, which already names the
   *  brand — avoids a screen reader announcing "RedMark" twice. */
  decorative?: boolean;
}

export function Logo({
  size = 24,
  variant = "mark",
  color,
  className = "",
  decorative = false,
}: LogoProps) {
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": "RedMark" };

  // The app variant is the home-screen lockup: white X on a red rounded
  // square. Everything else draws the bars alone on a transparent field.
  const isApp = variant === "app";
  const isInverse = variant === "inverse";
  const barFill = isApp || isInverse ? "#FFFFFF" : variant === "mono" ? color || "currentColor" : BRAND_RED;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...a11y}
    >
      {isApp && <rect width="100" height="100" rx="22" fill={BRAND_RED} />}
      {isInverse && <rect width="100" height="100" rx="22" fill={INK} />}
      {/* Inset the bars when they sit on a filled tile, so the X doesn't
          run into the rounded corners. */}
      <g transform={isApp || isInverse ? "translate(50,50) scale(0.72) translate(-50,-50)" : undefined}>
        <polygon points={BAR_A} fill={barFill} />
        <polygon points={BAR_B} fill={barFill} />
      </g>
    </svg>
  );
}

interface LockupProps {
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number;
  className?: string;
  /** Dark-background lockup — "Mark" flips from ink to white. */
  inverse?: boolean;
}

// Mark + wordmark, horizontally. "Red" in brand red, "Mark" in ink, so the
// name reads as the two halves it is made of.
export function LogoLockup({ size = 24, className = "", inverse = false }: LockupProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo size={size} variant="mark" decorative />
      <span
        className="font-semibold tracking-tight leading-none"
        style={{ fontSize: Math.round(size * 0.72) }}
      >
        <span style={{ color: BRAND_RED }}>Red</span>
        <span className={inverse ? "text-white" : "text-ink"}>Mark</span>
      </span>
    </span>
  );
}

export default Logo;
