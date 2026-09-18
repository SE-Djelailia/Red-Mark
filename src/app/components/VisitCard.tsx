import { parseLocalDate } from "../../lib/dateUtils";

export interface VisitCardData {
  id: string;
  /** Stable per-project reference — "Visite n° 4". Assigned by the database
   *  at creation and never renumbered, so it is safe to quote in a report or
   *  an email. Sequential by CREATION, not date: a backdated visit carries a
   *  number higher than its date position suggests, which is why the list is
   *  sorted by date and merely LABELLED by number. */
  visitNumber: number;
  date: string;
  phase: string;
  authorName: string;
}

interface Props {
  visit: VisitCardData;
  onOpen: () => void;
}

// Compact single-line row — number, date, author, phase. No photos, no
// notes, no location: deliberately dense so ~200 visits stay scannable, and
// tappable at the full row width/height for a 44px+ touch target.
//
// The number LEADS the row: it is the thing people say out loud ("la visite
// 4") and the handle they scan for, so it sits where the eye lands first.
export default function VisitCard({ visit, onOpen }: Props) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface border-b border-line hover:bg-subtle transition-colors min-h-[44px] text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Tabular figures so a column of numbers aligns down the list. */}
        <span className="text-sm font-semibold text-ink whitespace-nowrap tabular-nums">
          Visite n°&nbsp;{visit.visitNumber}
        </span>
        <span className="text-sm text-muted whitespace-nowrap">
          {parseLocalDate(visit.date).toLocaleDateString("fr-CA", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        <span className="text-sm text-ink font-medium truncate">{visit.authorName}</span>
      </div>
      {/* Phase is metadata, not an alert — outline and ink, no red tint. */}
      <span className="inline-flex items-center h-5 px-2 border border-line-strong text-muted rounded-[2px] text-[11px] font-semibold uppercase tracking-[0.08em] flex-shrink-0">
        {visit.phase}
      </span>
    </button>
  );
}
