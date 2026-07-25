import { parseLocalDate } from "../../lib/dateUtils";

export interface VisitCardData {
  id: string;
  date: string;
  phase: string;
  authorName: string;
}

interface Props {
  visit: VisitCardData;
  onOpen: () => void;
}

// Compact single-line row — date, author, phase only. No photos, no notes,
// no location: deliberately dense so ~200 visits stay scannable, and
// tappable at the full row width/height for a 44px+ touch target.
export default function VisitCard({ visit, onOpen }: Props) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface border-b border-line hover:bg-subtle transition-colors min-h-[44px] text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-muted whitespace-nowrap">
          {parseLocalDate(visit.date).toLocaleDateString("fr-CA", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        <span className="text-sm text-ink font-medium truncate">{visit.authorName}</span>
      </div>
      <span className="px-2 py-1 bg-brand-50 text-brand-600 rounded-md text-xs font-medium flex-shrink-0">
        {visit.phase}
      </span>
    </button>
  );
}
