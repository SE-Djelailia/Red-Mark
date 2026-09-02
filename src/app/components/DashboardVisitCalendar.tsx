import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MonthCalendar, { type CalendarPill } from "./MonthCalendar";
import { getVisitsForMonthAcrossProjects } from "../../lib/supabaseApi";
import { getVisitIdsWithOpenIssuesAcrossProjects } from "../../lib/issuesApi";
import {
  formatDateForInput,
  parseLocalDate,
} from "../../lib/dateUtils";
import { addMonths, formatMonthYear, isSameDay } from "../../lib/calendarUtils";
import type { SiteVisit } from "../../lib/supabase";

interface Props {
  projectIds: string[];
}

// Cross-project sibling of ProjectVisitCalendar — the "admin" view of the
// same idea. MonthCalendar itself needed no changes: it takes generic
// pills, so the only difference here is that a pill is labelled with the
// PROJECT name rather than the visit author, and tapping one navigates
// across projects.
//
// Deliberately no onDayClick: on a per-project calendar an empty day means
// "create a visit here", but cross-project there is no unambiguous project
// to create it in, so empty days stay inert.
export default function DashboardVisitCalendar({ projectIds }: Props) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date());
  const [visits, setVisits] = useState<(SiteVisit & { projectName: string })[]>([]);
  const [openIssueVisitIds, setOpenIssueVisitIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const year = month.getFullYear();
    const m = month.getMonth();
    const monthStart = formatDateForInput(new Date(year, m, 1));
    const monthEnd = formatDateForInput(new Date(year, m + 1, 0)); // last day

    Promise.all([
      getVisitsForMonthAcrossProjects(projectIds, monthStart, monthEnd),
      getVisitIdsWithOpenIssuesAcrossProjects(projectIds),
    ])
      .then(([monthVisits, openIds]) => {
        if (cancelled) return;
        setVisits(monthVisits);
        setOpenIssueVisitIds(openIds);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Error loading dashboard calendar visits:", e);
        setLoadError("Impossible de charger les visites.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // projectIds is rebuilt each load in the parent; joining it keeps this
    // effect from re-firing on every render for an unchanged set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join(","), month]);

  const openVisit = (visit: SiteVisit) =>
    navigate(`/app/projects/${visit.project_id}/visits/${visit.id}`);

  const colorFor = (visit: SiteVisit): "red" | "green" =>
    openIssueVisitIds.has(visit.id) ? "red" : "green";

  // Both views render from this one fetch — the grid consumes pillsByDate,
  // the agenda consumes `visits` directly. Switching is pure CSS, so there
  // is no breakpoint listener and no second data path to keep in sync.
  const pillsByDate: Record<string, CalendarPill[]> = {};
  for (const visit of visits) {
    (pillsByDate[visit.visit_date] ??= []).push({
      id: visit.id,
      label: visit.projectName,
      color: colorFor(visit),
      onClick: () => openVisit(visit),
    });
  }

  // Agenda groups, ascending. visits already arrive ordered by visit_date.
  const byDay: { date: string; visits: (SiteVisit & { projectName: string })[] }[] = [];
  for (const visit of visits) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === visit.visit_date) last.visits.push(visit);
    else byDay.push({ date: visit.visit_date, visits: [visit] });
  }

  const today = new Date();

  return (
    <div>
      {loadError && (
        <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-4 text-sm text-ink mb-3">
          {loadError}
        </div>
      )}

      {/* Month grid — iPad and desktop. A 7-column grid on a phone gives
          each day ~50px, too cramped to read a project name. */}
      <div className="hidden sm:block">
        <MonthCalendar month={month} onMonthChange={setMonth} pillsByDate={pillsByDate} />
      </div>

      {/* Agenda — phones. Same month, same data, chronological list. */}
      <div className="sm:hidden bg-surface rounded-[4px] border border-line overflow-hidden">
        {/* Header mirrors MonthCalendar's so month navigation is identical
            in both views. */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-base font-semibold text-ink capitalize">{formatMonthYear(month)}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMonth(addMonths(month, -1))}
              className="w-9 h-9 flex items-center justify-center rounded-[4px] hover:bg-subtle active:bg-line text-muted"
              aria-label="Mois précédent"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setMonth(new Date())}
              className="px-3 h-9 flex items-center justify-center rounded-[4px] hover:bg-subtle text-sm font-medium text-body"
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => setMonth(addMonths(month, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-[4px] hover:bg-subtle active:bg-line text-muted"
              aria-label="Mois suivant"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-faint">Chargement...</div>
        ) : byDay.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">Aucune visite ce mois-ci</div>
        ) : (
          <div className="divide-y divide-line">
            {byDay.map((group) => {
              const groupDate = parseLocalDate(group.date);
              const isToday = isSameDay(groupDate, today);
              return (
                <div key={group.date}>
                  <div
                    className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] ${
                      isToday ? "bg-subtle text-ink" : "bg-subtle text-muted"
                    }`}
                  >
                    {groupDate.toLocaleDateString("fr-CA", { weekday: "short", day: "numeric" })}
                    {isToday && " · aujourd'hui"}
                  </div>
                  {group.visits.map((visit) => (
                    <button
                      key={visit.id}
                      onClick={() => openVisit(visit)}
                      className="w-full min-h-11 px-4 py-2.5 flex items-center gap-3 text-left hover:bg-subtle transition-colors"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          colorFor(visit) === "red" ? "bg-open" : "bg-resolved"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 min-w-0 text-sm font-medium text-ink truncate">
                        {visit.projectName}
                      </span>
                      {visit.phase && (
                        <span className="text-xs text-muted capitalize flex-shrink-0">
                          {visit.phase}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loading && (
        <div className="hidden sm:block text-center text-sm text-faint py-3">Chargement...</div>
      )}
    </div>
  );
}
