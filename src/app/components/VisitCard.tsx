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
      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors min-h-[44px] text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-gray-500 whitespace-nowrap">
          {parseLocalDate(visit.date).toLocaleDateString("fr-CA", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        <span className="text-sm text-[#1A1A1A] font-medium truncate">{visit.authorName}</span>
      </div>
      <span className="px-2 py-1 bg-[#E10600]/10 text-[#E10600] rounded-md text-xs font-medium flex-shrink-0">
        {visit.phase}
      </span>
    </button>
  );
}
