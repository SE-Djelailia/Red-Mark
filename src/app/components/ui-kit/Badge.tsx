// Canonical priority/status badges for déficiences.
//
// Replaces nine hand-rolled implementations that had drifted apart in both
// colour and wording ("Moyen" vs "Moyenne", "Élevé" vs "Élevée", solid
// bg-red-600 pills in one screen vs bordered bg-red-100 in another).
//
// Follows the design system's four-tier treatment: a tinted background, a
// matching 1px border, and text dark enough to read on it. Amber is the
// system's single warm tint and is reserved for "Élevé" — medium and low
// are deliberately neutral, so urgency reads as a colour gradient (red →
// amber → grey → white) rather than four competing hues.
import type { Issue } from "../../../lib/issuesApi";

type Priority = Issue["priority"];
type Status = Issue["status"];

// h-[22px] with centred content rather than vertical padding, so every
// badge is the same height regardless of its label.
const BASE =
  "inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border text-[11px] font-medium whitespace-nowrap";

const PRIORITY_STYLE: Record<Priority, string> = {
  critical: "bg-brand-50 border-brand-100 text-brand-strong",
  high: "bg-amber-50 border-amber-200 text-warn",
  medium: "bg-subtle border-line text-body",
  low: "bg-surface border-line text-muted",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critique",
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
};

const STATUS_STYLE: Record<Status, string> = {
  open: "bg-brand-50 border-brand-100 text-brand-strong",
  resolved: "bg-subtle border-line text-body",
};

const STATUS_LABEL: Record<Status, string> = {
  open: "Ouvert",
  resolved: "Résolu",
};

// A small filled dot marks the two states that carry the most weight —
// "Critique" and "Résolu". It does the colour-coding work for "Résolu",
// whose neutral chip would otherwise give no hint that it means resolved.
function Dot({ className }: { className: string }) {
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${className}`} aria-hidden="true" />;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`${BASE} ${PRIORITY_STYLE[priority]}`}>
      {priority === "critical" && <Dot className="bg-open" />}
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`${BASE} ${STATUS_STYLE[status]}`}>
      {status === "resolved" && <Dot className="bg-resolved" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

// Exported for the few places that need the words without the pill (e.g.
// filter dropdowns, select options) so labels can't drift again.
export { PRIORITY_LABEL, STATUS_LABEL };
