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
    <div className={`bg-surface border border-line rounded-xl ${className}`}>{children}</div>
  );
}

// Section headers were called out as not standing out enough. The accent
// bar + semibold ink title gives the eye a consistent left-edge marker to
// scan for, without resorting to a heavier type size that would fight the
// compact density.
export function SectionHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-line flex items-center gap-2">
      <span className="w-1 h-5 bg-brand-600 rounded-full flex-shrink-0" aria-hidden="true" />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {meta && <span className="text-xs text-faint">{meta}</span>}
      {action && <div className="ml-auto flex items-center">{action}</div>}
    </div>
  );
}

// Compact, tappable list row — thin divider between rows rather than
// card-per-item padding. Matches the density already used on the visits
// and déficiences lists.
export function ListRow({
  onClick,
  className = "",
  children,
}: {
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const interactive = onClick ? "hover:bg-subtle cursor-pointer transition-colors" : "";
  return (
    <div onClick={onClick} className={`px-4 py-2.5 ${interactive} ${className}`}>
      {children}
    </div>
  );
}

// Wraps a set of ListRows with the hairline dividers.
export function ListRows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}
