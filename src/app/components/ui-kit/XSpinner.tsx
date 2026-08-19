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

const LEN = 19.8; // path length of a 5,5→19,19 diagonal: √(14² + 14²)

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
      className={`lucide ${className}`}
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      // Consumed by the rm-draw keyframes. Inline so the animation is driven
      // by the real path length rather than a value hardcoded in the CSS.
      style={{ "--x-len": LEN } as React.CSSProperties}
    >
      <path className="rm-x-bar" d="M5 5 L19 19" />
      <path className="rm-x-bar rm-x-bar-b" d="M19 5 L5 19" />
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
