// Canonical priority/status badges for déficiences.
//
// Replaces nine hand-rolled implementations that had drifted apart in both
// colour and wording ("Moyen" vs "Moyenne", "Élevé" vs "Élevée", solid
// bg-red-600 pills in one screen vs bordered bg-red-100 in another).
//
// Per the design system these are restrained: a tinted background derived
// from the semantic token plus matching text, no border, no solid fills.
import type { Issue } from "../../../lib/issuesApi";

type Priority = Issue["priority"];
type Status = Issue["status"];

const BASE = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap";

// `critical` and `high` both read as urgent, so they share the open/red
// token and are separated by weight of tint rather than by hue — keeps the
// palette to the three semantic colours the design system defines.
const PRIORITY_STYLE: Record<Priority, string> = {
  critical: "bg-open/15 text-open",
  high: "bg-open/10 text-open",
  medium: "bg-warn/10 text-warn",
  low: "bg-subtle text-muted",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critique",
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
};

const STATUS_STYLE: Record<Status, string> = {
  open: "bg-open/10 text-open",
  resolved: "bg-resolved/10 text-resolved",
};

const STATUS_LABEL: Record<Status, string> = {
  open: "Ouvert",
  resolved: "Résolu",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`${BASE} ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`${BASE} ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

// Exported for the few places that need the words without the pill (e.g.
// filter dropdowns, select options) so labels can't drift again.
export { PRIORITY_LABEL, STATUS_LABEL };
