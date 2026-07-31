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

/** Bar corner points on the 0–100 viewBox, as [x, y] pairs. */
export const BAR_A_POINTS: [number, number][] = [
  [79.03, 96],
  [96, 79.03],
  [20.97, 4],
  [4, 20.97],
]; // "\" diagonal
export const BAR_B_POINTS: [number, number][] = [
  [96, 20.97],
  [79.03, 4],
  [4, 79.03],
  [20.97, 96],
]; // "/" diagonal

/** Scale applied to the bars when they sit on a filled tile, so the X
 *  clears the rounded corners. */
export const TILE_INSET_SCALE = 0.72;
/** Corner radius as a fraction of tile size (22 on the 0–100 viewBox). */
export const TILE_RADIUS_RATIO = 0.22;

const toPoints = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");
const BAR_A = toPoints(BAR_A_POINTS);
const BAR_B = toPoints(BAR_B_POINTS);

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

/**
 * Draw the "app" variant (white X on a red rounded tile) onto a Canvas 2D
 * context, at `size` px square.
 *
 * Shares BAR_A_POINTS/BAR_B_POINTS with the SVG above so the generated PWA
 * icons cannot drift from the in-app mark.
 *
 * Canvas 2D cannot resolve CSS custom properties — `ctx.fillStyle =
 * "var(--color-brand-600)"` fails silently and paints black. Hence the
 * literal BRAND_RED constant rather than a token.
 */
export function drawAppIcon(ctx: CanvasRenderingContext2D, size: number) {
  const u = size / 100; // viewBox unit -> px

  ctx.clearRect(0, 0, size, size);

  // Red tile with the same corner radius ratio the SVG uses.
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, TILE_RADIUS_RATIO * size);
  ctx.fillStyle = BRAND_RED;
  ctx.fill();

  // Bars, inset about the centre exactly as the SVG transform does.
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(TILE_INSET_SCALE, TILE_INSET_SCALE);
  ctx.translate(-size / 2, -size / 2);

  ctx.fillStyle = "#FFFFFF";
  for (const bar of [BAR_A_POINTS, BAR_B_POINTS]) {
    ctx.beginPath();
    bar.forEach(([x, y], i) => {
      const px = x * u;
      const py = y * u;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export default Logo;
