// Stat tiles, per the design system: an uppercase overline above a large
// tabular number. No icons — the coloured icon chips the Dashboard used
// before are explicitly dropped by the refresh.
//
// The tiles are joined by hairlines rather than each carrying its own
// border: StatGrid paints a 1px gap over a bg-line parent, so adjacent
// tiles share a single-pixel divider and the group reads as one panel.
import type { ReactNode } from "react";

export function StatGrid({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid gap-[1px] bg-line border border-line rounded-[4px] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  /** Secondary text set beside the value, e.g. "/ 41 au total". */
  suffix,
  /**
   * Red value. Reserved for the OUTSTANDING count — the number that means
   * "work remains". Every other tile is ink: a grid of red numbers would
   * make none of them urgent.
   */
  emphasis = false,
  onClick,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  emphasis?: boolean;
  onClick?: () => void;
}) {
  const interactive = onClick ? "cursor-pointer hover:bg-subtle transition-colors" : "";
  return (
    <div onClick={onClick} className={`bg-surface p-4 ${interactive}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-1.5">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-[26px] lg:text-[30px] font-semibold tracking-tight tabular-nums leading-none ${
            emphasis ? "text-brand-strong" : "text-ink"
          }`}
        >
          {value}
        </span>
        {suffix && <span className="text-xs text-faint">{suffix}</span>}
      </div>
    </div>
  );
}
