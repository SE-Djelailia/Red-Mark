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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-[#1A1A1A] capitalize">
          {formatMonthYear(month)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Mois précédent"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => onMonthChange(new Date())}
            className="px-3 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-600"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Mois suivant"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
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
              className={`min-h-[64px] sm:min-h-[96px] border-b border-r border-gray-100 p-1.5 sm:p-2 [&:nth-child(7n)]:border-r-0 ${
                clickable ? "cursor-pointer hover:bg-gray-50" : ""
              } ${!inMonth ? "bg-gray-50/50" : ""}`}
            >
              <div className="flex items-center justify-center mb-1">
                <span
                  className={`text-xs sm:text-sm w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${
                    isToday
                      ? "bg-[#E10600] text-white font-semibold"
                      : inMonth
                        ? "text-[#1A1A1A]"
                        : "text-gray-300"
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
                      className={`w-full truncate text-left px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-medium ${
                        pill.color === "red" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
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
                      className={`hidden sm:block w-full truncate text-left px-1.5 py-0.5 rounded-md text-xs font-medium ${
                        pills[2].color === "red" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      }`}
                    >
                      {pills[2].label}
                    </button>
                  )}
                  {pills.length > 2 && (
                    <div className="sm:hidden text-[10px] text-gray-500 px-1.5">
                      +{pills.length - 2}
                    </div>
                  )}
                  {pills.length > 3 && (
                    <div className="hidden sm:block text-xs text-gray-500 px-1.5">
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
