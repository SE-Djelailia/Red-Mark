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
import {
  ISSUE_STATUS_LABEL as STATUS_LABEL,
  TERMINAL_ISSUE_STATUS,
} from "../../../lib/issueStatus";

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

// Dot colours for priority pickers, keyed to the badge palette above so a
// form's swatch matches the badge the issue will actually render with.
const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-open",
  high: "bg-warn",
  medium: "bg-line-strong",
  low: "bg-line",
};

// Ordered options for the priority pickers in IssueForm / LocationPinPanel.
//
// Both files previously hand-wrote this list and had drifted: each omitted
// "critical" entirely (so the most urgent priority could be filtered and
// displayed but never SET), and IssueForm carried `bg-subtle0`/`bg-canvas0`
// — non-existent classes left by a find-replace during the design refresh,
// which rendered the dots invisible.
//
// The Record<Priority, number> forces exhaustiveness: adding a priority to
// the union without ranking it here is a compile error.
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const PRIORITY_OPTIONS: { value: Priority; label: string; dot: string }[] = (
  Object.keys(PRIORITY_RANK) as Priority[]
)
  .sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])
  .map((value) => ({ value, label: PRIORITY_LABEL[value], dot: PRIORITY_DOT[value] }));

// The four lifecycle states read as a progression from "needs attention"
// to "closed": brand red while nobody has acted, amber once correction is
// underway, neutral when the contractor says it is fixed but nobody has
// confirmed, and the resolved green only at "Vérifié".
//
// "Corrigé" deliberately gets NO green treatment — it is a claim, not a
// confirmation, and colouring it like a finished item is precisely the
// misreading the lifecycle was introduced to prevent.
const STATUS_STYLE: Record<Status, string> = {
  signale: "bg-brand-50 border-brand-100 text-brand-strong",
  a_corriger: "bg-amber-50 border-amber-200 text-warn",
  corrige: "bg-subtle border-line text-body",
  verifie: "bg-subtle border-line text-body",
};

// A small filled dot marks the states that carry the most weight —
// "Critique" and "Vérifié". It does the colour-coding work for "Vérifié",
// whose neutral chip would otherwise give no hint that it means closed.
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
      {status === TERMINAL_ISSUE_STATUS && <Dot className="bg-resolved" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

// Exported for the few places that need the words without the pill (e.g.
// filter dropdowns, select options) so labels can't drift again.
// STATUS_LABEL is re-exported from lib/issueStatus, which is the single
// definition shared by the API layer and the UI.
export { PRIORITY_LABEL, STATUS_LABEL };
