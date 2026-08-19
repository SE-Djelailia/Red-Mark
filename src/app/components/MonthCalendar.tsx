import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getMonthGridDays,
  addMonths,
  isSameMonth,
  isSameDay,
  formatMonthYear,
  dateKey,
  WEEKDAY_LABELS,
} from "../../lib/calendarUtils";

export interface CalendarPill {
  id: string;
  label: string;
  color: "red" | "green";
  onClick: () => void;
}

interface MonthCalendarProps {
  // Any date within the visible month — only year/month are read.
  month: Date;
  onMonthChange: (newMonth: Date) => void;
  // Keyed by "YYYY-MM-DD". Deliberately generic — no "visit" or "project"
  // concept here, so this same grid can be reused by a future cross-project
  // admin calendar (pills would just carry project names instead).
  pillsByDate: Record<string, CalendarPill[]>;
  // Fires when an empty current-month day is tapped (e.g. to open a
  // "create new" form pre-filled with that date). Adjacent-month (muted)
  // days are never clickable, keeping the visible month as the sole context.
  onDayClick?: (dateKey: string) => void;
}

// Generic, Notion-style month grid. No data-fetching or navigation of its
// own — the caller supplies pills and handles what tapping one means.
export default function MonthCalendar({
  month,
  onMonthChange,
  pillsByDate,
  onDayClick,
}: MonthCalendarProps) {
  const today = new Date();
  const days = getMonthGridDays(month.getFullYear(), month.getMonth());

  return (
    <div className="bg-surface rounded-[4px] border border-line overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h2 className="text-base font-semibold text-ink capitalize">
          {formatMonthYear(month)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-[4px] hover:bg-subtle text-muted"
            aria-label="Mois précédent"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => onMonthChange(new Date())}
            className="px-3 h-9 flex items-center justify-center rounded-[4px] hover:bg-subtle text-sm font-medium text-body"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-[4px] hover:bg-subtle text-muted"
            aria-label="Mois suivant"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-faint">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const pills = pillsByDate[key] || [];
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          const isEmpty = pills.length === 0;
          const clickable = inMonth && isEmpty && !!onDayClick;

          return (
            <div
              key={key}
              onClick={() => clickable && onDayClick?.(key)}
              className={`min-h-[64px] sm:min-h-[96px] border-b border-r border-line p-1.5 sm:p-2 [&:nth-child(7n)]:border-r-0 ${
                clickable ? "cursor-pointer hover:bg-subtle" : ""
              } ${!inMonth ? "bg-canvas/50" : ""}`}
            >
              <div className="flex items-center justify-center mb-1">
                <span
                  // Today is INK, not red. A red disc on every calendar
                  // permanently spends the mark on "the date is today",
                  // which is never the thing needing attention. Square-cut
                  // to match the system's 4px ceiling.
                  className={`text-xs sm:text-sm w-6 h-6 flex items-center justify-center rounded-[2px] flex-shrink-0 rm-figures ${
                    isToday
                      ? "bg-ink text-white font-semibold"
                      : inMonth
                        ? "text-ink"
                        : "text-faint"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>

              {inMonth && pills.length > 0 && (
                <div className="space-y-1">
                  {pills.slice(0, 2).map((pill) => (
                    <button
                      key={pill.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        pill.onClick();
                      }}
                      title={pill.label}
                      // THE REDMARK MOVE at pill scale: a 2px leading rule
                      // instead of a tinted fill. A month of red and green
                      // blocks was a wall of colour in which nothing stood
                      // out; a ruled edge marks the days with outstanding
                      // work and leaves the rest as quiet ink.
                      className={`w-full truncate text-left border-l-2 pl-1.5 pr-1 py-0.5 text-[10px] sm:text-xs font-medium text-ink hover:bg-subtle ${
                        pill.color === "red" ? "border-l-brand-600" : "border-l-line-strong"
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                  {/* Third pill slot — desktop only, mobile stays at 2 */}
                  {pills[2] && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        pills[2].onClick();
                      }}
                      title={pills[2].label}
                      className={`hidden sm:block w-full truncate text-left border-l-2 pl-1.5 pr-1 py-0.5 text-xs font-medium text-ink hover:bg-subtle ${
                        pills[2].color === "red" ? "border-l-brand-600" : "border-l-line-strong"
                      }`}
                    >
                      {pills[2].label}
                    </button>
                  )}
                  {pills.length > 2 && (
                    <div className="sm:hidden text-[10px] text-muted px-1.5">
                      +{pills.length - 2}
                    </div>
                  )}
                  {pills.length > 3 && (
                    <div className="hidden sm:block text-xs text-muted px-1.5">
                      +{pills.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
