// Card + section header primitives.
//
// The design system's card is flat: surface background, one thin line
// border, modest radius, no shadow. Shadows are dropped rather than
// softened — the border alone carries the edge.
import type { ReactNode } from "react";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`bg-surface border border-line rounded-[4px] ${className}`}>{children}</div>
  );
}

// Section overline, per the design system's "key fix" for section titles:
// small uppercase wide-tracked grey text sitting ABOVE and OUTSIDE the
// card, not a bordered row inside it. Counter-intuitively this makes
// sections easier to scan — the title stops competing with the row titles
// beneath it, and the card itself becomes the visual unit.
//
// Renders a <section> wrapper so the heading and its card are one landmark
// and the optional action lands in the header rather than a footer strip.
export function Section({
  title,
  action,
  className = "",
  children,
}: {
  title: string;
  /** Optional right-aligned link, e.g. "Tout voir". */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// The red "Tout voir"-style link that pairs with a Section overline. Uses
// brand-strong rather than brand-600: at 12px on white, the base red is
// too light to read comfortably.
export function SectionAction({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-brand-strong hover:underline flex-shrink-0"
    >
      {children}
    </button>
  );
}

// Compact, tappable list row. py-3 + min-h-11 meets the 44px touch target
// the design system specifies (the previous py-2.5 fell short of it).
//
// THE REDMARK MOVE lives here. Every row carries a 2px leading edge that is
// transparent at rest and red when `marked` — so the bar never changes the
// row's geometry, only its colour. That is what lets a list of twenty rows
// show one marked item without anything shifting.
//
// `marked` means active, urgent, or outstanding — the caller decides which
// of those applies on its screen. It is the ONLY red a list row may carry.
export function ListRow({
  onClick,
  marked = false,
  className = "",
  children,
}: {
  onClick?: () => void;
  /** Draws the red leading rule. Use for active/urgent/outstanding rows. */
  marked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const interactive = onClick ? "hover:bg-subtle cursor-pointer transition-colors" : "";
  // border-l-2 is always present so marking a row cannot reflow the list.
  const rule = marked ? "border-l-brand-600" : "border-l-transparent";
  return (
    <div
      onClick={onClick}
      className={`border-l-2 ${rule} px-4 py-3 min-h-11 ${interactive} ${className}`}
    >
      {children}
    </div>
  );
}

// Wraps a set of ListRows with the hairline dividers.
export function ListRows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}
