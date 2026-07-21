// Generic month-grid date math — no "visit" or "project" concept here, so
// this is reusable by any calendar view (the per-project one now, a future
// cross-project admin one later). Mirrors dateUtils.ts's timezone-safe
// local-date handling (no UTC parsing surprises).
import { formatDateForInput } from "./dateUtils";

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// A Monday-start 6-week (42-day) grid covering the given month, including
// the leading/trailing days from adjacent months needed to fill full weeks.
export function getMonthGridDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=Mon..6=Sun
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return days;
}

// Handles year rollover naturally via Date's own month-overflow arithmetic.
export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

// "Juillet 2026"
export function formatMonthYear(date: Date, locale: string = "fr-CA"): string {
  const s = date.toLocaleDateString(locale, { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dateKey(date: Date): string {
  return formatDateForInput(date);
}
