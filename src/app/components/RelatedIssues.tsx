// The déficience panel shared by the lot and stage detail views.
//
// WHY A SHARED COMPONENT RATHER THAN TWO COPIES
//
// Both views answer the same question — "what is outstanding against this
// thing?" — with the same status vocabulary, the same ordering and the same
// empty/error states. Two copies would drift the moment the lifecycle gains
// a state, and the lifecycle is exactly the thing this app must never let
// drift (see lib/issueStatus.ts). One component, two callers.

import { useMemo } from "react";
import { ISSUE_STATUSES, ISSUE_STATUS_LABEL, TERMINAL_ISSUE_STATUS } from "../../lib/issueStatus";
import type { IssueStatus } from "../../lib/issueStatus";
import type { Issue } from "../../lib/issuesApi";
import { Card } from "./ui-kit/Card";
import { PriorityBadge, StatusBadge } from "./ui-kit/Badge";
import EmptyState from "./ui-kit/EmptyState";
import { MarkX } from "./ui-kit/RedMarkIcons";
import { formatDateLong } from "../../lib/dateUtils";

/**
 * Counts per lifecycle state, in lifecycle order.
 *
 * Every state is present even at zero. A punch list where "À corriger" is
 * simply absent reads as "nothing to correct" at a glance, which is the same
 * sentence as "0 to correct" but far easier to misread — so the zero is
 * stated rather than implied. Derived from ISSUE_STATUSES so a new state
 * appears here automatically.
 */
export function StatusSummary({ issues }: { issues: Issue[] }) {
  const counts = useMemo(() => {
    const out = Object.fromEntries(ISSUE_STATUSES.map((s) => [s, 0])) as Record<
      IssueStatus,
      number
    >;
    for (const issue of issues) out[issue.status] = (out[issue.status] ?? 0) + 1;
    return out;
  }, [issues]);

  const outstanding = issues.filter((i) => i.status !== TERMINAL_ISSUE_STATUS).length;

  return (
    <div>
      {/* The headline is OUTSTANDING, not the total: the number that decides
          whether anyone needs to act. The total is the denominator beside
          it, matching the Dashboard's "8 / 10" stat tile. */}
      <div className="flex items-baseline gap-2 mb-3">
        <span
          className={`rm-figures text-2xl font-semibold ${
            outstanding > 0 ? "text-brand-strong" : "text-ink"
          }`}
        >
          {outstanding}
        </span>
        <span className="text-sm text-muted">
          {outstanding === 1 ? "déficience en cours" : "déficiences en cours"}
          {issues.length > 0 && <span className="text-faint"> · {issues.length} au total</span>}
        </span>
      </div>

      {/* Per-state counts. Wraps rather than scrolls: four short chips fit a
          phone in two rows and a tablet in one. */}
      <div className="flex flex-wrap gap-2">
        {ISSUE_STATUSES.map((status) => (
          <span
            key={status}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] border border-line bg-subtle text-xs"
          >
            <span className="text-muted">{ISSUE_STATUS_LABEL[status]}</span>
            <span className="rm-figures font-semibold text-ink">{counts[status]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface Props {
  issues: Issue[];
  loading: boolean;
  /** True when the fetch threw. Distinct from an empty list — see below. */
  loadError: boolean;
  onRetry: () => void;
  onOpenIssue: (issueId: string) => void;
  /** Names the thing these déficiences belong to, for the empty state. */
  emptyLabel: string;
}

export default function RelatedIssues({
  issues,
  loading,
  loadError,
  onRetry,
  onOpenIssue,
  emptyLabel,
}: Props) {
  if (loading) {
    return (
      <Card className="p-5">
        <div className="text-sm text-muted">Chargement…</div>
      </Card>
    );
  }

  // A failed load and a clean lot are opposite facts and must never render
  // the same way — the API throws instead of returning [] precisely so this
  // branch can exist.
  if (loadError) {
    return (
      <Card className="p-5">
        <div className="text-sm text-brand-strong flex items-center gap-2 flex-wrap">
          Impossible de charger les déficiences.
          <button onClick={onRetry} className="underline font-medium min-h-[44px]">
            Réessayer
          </button>
        </div>
      </Card>
    );
  }

  if (issues.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          size="compact"
          icon={<MarkX size={32} className="text-faint lucide-display" />}
          label="Aucune déficience"
          message={emptyLabel}
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {issues.map((issue) => (
        <button
          key={issue.id}
          onClick={() => onOpenIssue(issue.id)}
          className="w-full text-left px-4 py-3 border-b border-line last:border-b-0 hover:bg-subtle transition-colors min-h-[44px]"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-ink flex-1 min-w-0">{issue.title}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <PriorityBadge priority={issue.priority} />
              <StatusBadge status={issue.status} />
            </div>
          </div>
          {issue.createdAt && (
            <p className="text-xs text-muted mt-1">{formatDateLong(issue.createdAt)}</p>
          )}
        </button>
      ))}
    </Card>
  );
}
