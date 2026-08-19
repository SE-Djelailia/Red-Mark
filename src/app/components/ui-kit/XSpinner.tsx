// THE X LOADER — the app's one loading indicator.
//
// A rotating ring is generic chrome; this is the brand's own mark being
// made. The two bars of the X draw themselves on and then lift off, in
// sequence, like a red pen marking a drawing and being raised again.
//
// WHY THIS IS ALLOWED TO BE RED. The red budget permits the mark itself,
// and this IS the mark. It is also, in practice, alone on screen: a loading
// state has nothing else competing for attention, so the "two red fills
// co-visible" test is not at risk. The `tone` prop exists for the one case
// that breaks — a spinner inside an already-red primary button, where the
// mark must read as white-on-red instead.
//
// The geometry, stroke and caps are the Phase 1 icon system: 24 viewBox,
// currentColor, butt caps and miter joins inherited from the `.lucide`
// rule, which this carries for exactly that reason.

// WEIGHT AND EXTENT ARE MEASURED FROM THE LOGO, not chosen to taste.
//
// Logo.tsx draws the X as filled polygons; this draws it as strokes, because
// stroke-dashoffset is what makes the draw-on animation possible. So the
// match cannot be a copied number — it has to be derived.
//
//   THICKNESS. Measuring Logo.tsx's BAR_A polygon (perpendicular distance
//   between its two long edges) gives 23.999 units on its 0–100 viewBox —
//   24% of the box, confirming the "24%" its own comment claims. On this
//   0–24 viewBox the same fraction is 0.24 × 24 = 5.76. Rendered at any
//   size the two then have identical on-screen thickness: at 40px both are
//   9.60px.
//
//   EXTENT. Thickness alone is not enough. The logo's bars reach 4..96 —
//   a 4% inset. Stroked bars from 5,5→19,19 at this weight would span only
//   2.96..21.04, making the loader read 18% SMALLER than the logo beside
//   it. Extending them to 3,3→21,21 puts the outer edge at 0.96..23.04,
//   a 4.01% inset: the same mark, not a shrunken one.
//
// A stroke's width extends perpendicular to the line, so on a 45° bar it
// adds (w/2)/√2 ≈ 2.036 units in x and y beyond each endpoint. Butt caps
// mean the ENDS stay flat and do not extend along the line — which is
// exactly the flat cut the logo achieves with polygons.
const STROKE = 5.76; // 24% of the 24-unit viewBox — the logo's bar thickness
const P0 = 3;
const P1 = 21;
const LEN = Math.hypot(P1 - P0, P1 - P0); // 25.456 — drives the dash animation

export interface XSpinnerProps {
  /** Px. Defaults to 24 — the icon scale's `lg`. */
  size?: number;
  /**
   * `brand` (default) draws the mark in red; `current` inherits the parent's
   * text colour, for spinners sitting inside a filled button or on a dark
   * ground where red would not read.
   */
  tone?: "brand" | "current";
  /** Announced to screen readers. Set null when an adjacent label says it. */
  label?: string | null;
  className?: string;
}

export default function XSpinner({
  size = 24,
  tone = "brand",
  label = "Chargement…",
  className = "",
}: XSpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      // The bars inherit this, so `tone` switches both at once.
      stroke={tone === "brand" ? "var(--color-brand-600)" : "currentColor"}
      xmlns="http://www.w3.org/2000/svg"
      // NOT `lucide`: that rule sets stroke-width to the 1.5 icon weight,
      // which is the whole thing this component must not inherit. Caps and
      // joins are declared here instead so the flat ends survive.
      className={className}
      strokeWidth={STROKE}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      // Consumed by the rm-draw keyframes. Inline so the animation is driven
      // by the real path length rather than a value hardcoded in the CSS.
      style={{ "--x-len": LEN } as React.CSSProperties}
    >
      <path className="rm-x-bar" d={`M${P0} ${P0} L${P1} ${P1}`} />
      <path className="rm-x-bar rm-x-bar-b" d={`M${P1} ${P0} L${P0} ${P1}`} />
    </svg>
  );
}

/**
 * Centred block form, for the full-page and full-panel loading states that
 * currently render a 40–48px ring in the middle of an empty screen.
 */
export function XSpinnerBlock({
  size = 40,
  label = "Chargement…",
  className = "",
}: {
  size?: number;
  label?: string | null;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <XSpinner size={size} label={label} />
    </div>
  );
}
