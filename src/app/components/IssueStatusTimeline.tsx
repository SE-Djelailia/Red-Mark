import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { getIssueStatusEvents, type IssueStatusEvent } from "../../lib/issuesApi";
import { ISSUE_STATUS_LABEL, TERMINAL_ISSUE_STATUS } from "../../lib/issueStatus";
import { formatDateLong } from "../../lib/dateUtils";

// The status history of one déficience, read from `issue_status_events`.
//
// That table is append-only at the database level — a SELECT policy and
// nothing else, with the trigger as its sole writer — so this is a record
// of what happened, not a client-maintained log that could drift from the
// issue's real state. Every transition appears, including ones made by a
// bare UPDATE that never went through the app.
export default function IssueStatusTimeline({ issueId }: { issueId: string }) {
  // One piece of state, not a (loading, events) pair: they only ever change
  // together, and splitting them lets a render observe "done loading, no
  // events" in the instant between two setStates — which renders "Aucun
  // changement" over a timeline that is about to appear.
  const [state, setState] = useState<
    { phase: "loading" } | { phase: "ready"; events: IssueStatusEvent[] }
  >({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await getIssueStatusEvents(issueId);
      if (!cancelled) setState({ phase: "ready", events: rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  const loading = state.phase === "loading";
  const events = state.phase === "ready" ? state.events : [];

  // Newest first: the current state is what a reader is looking for, and
  // the migration guarantees every issue has at least a creation event.
  const ordered = [...events].reverse();

  return (
    <div className="bg-surface rounded-[4px] border border-line p-5">
      <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
        <History size={18} className="text-muted" />
        Historique des états
      </h2>

      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted">Aucun changement d'état enregistré.</p>
      ) : (
        <ol className="space-y-3">
          {ordered.map((ev, i) => (
            <li key={ev.id} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <span
                  className={`w-2 h-2 rounded-full mt-1.5 ${
                    ev.toStatus === TERMINAL_ISSUE_STATUS ? "bg-resolved" : "bg-brand-600"
                  }`}
                  aria-hidden="true"
                />
                {i < ordered.length - 1 && <span className="w-px flex-1 bg-line mt-1" />}
              </div>
              <div className="flex-1 pb-1 min-w-0">
                <div className="text-sm text-ink">
                  {ev.fromStatus ? (
                    <>
                      <span className="text-muted">{ISSUE_STATUS_LABEL[ev.fromStatus]}</span>
                      <span className="text-faint mx-1.5">→</span>
                      <span className="font-medium">{ISSUE_STATUS_LABEL[ev.toStatus]}</span>
                    </>
                  ) : (
                    // No prior status: the déficience was created here.
                    <>
                      Créée · <span className="font-medium">{ISSUE_STATUS_LABEL[ev.toStatus]}</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {formatDateLong(ev.createdAt)}
                  {/* changed_by is nullable: SET NULL on user deletion, and
                      events written outside a user session carry none. */}
                  {ev.changedByName ? ` · ${ev.changedByName}` : ""}
                </div>
                {ev.note && <p className="text-sm text-body mt-1 break-words">« {ev.note} »</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
