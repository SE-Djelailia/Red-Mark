import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import MonthCalendar, { type CalendarPill } from "./MonthCalendar";
import { getSiteVisitsForMonth } from "../../lib/supabaseApi";
import { getVisitIdsWithOpenIssues } from "../../lib/issuesApi";
import { formatDateForInput } from "../../lib/dateUtils";
import type { SiteVisit } from "../../lib/supabase";

interface Props {
  projectId: string;
  month: Date;
  onMonthChange: (month: Date) => void;
}

// Per-project wrapper around the generic MonthCalendar: owns the data
// fetch for whatever month is visible (bounded query, not all-visits) and
// wires pill/day clicks to real navigation. Not itself reused by a future
// cross-project admin calendar — that would be its own sibling wrapper
// around the same MonthCalendar, aggregating differently.
export default function ProjectVisitCalendar({ projectId, month, onMonthChange }: Props) {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<(SiteVisit & { authorName: string })[]>([]);
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
    const monthEnd = formatDateForInput(new Date(year, m + 1, 0)); // last day of month

    Promise.all([
      getSiteVisitsForMonth(projectId, monthStart, monthEnd),
      getVisitIdsWithOpenIssues(projectId),
    ])
      .then(([monthVisits, openIds]) => {
        if (cancelled) return;
        setVisits(monthVisits);
        setOpenIssueVisitIds(openIds);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Error loading calendar visits:", e);
        setLoadError("Impossible de charger les visites.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, month]);

  const pillsByDate: Record<string, CalendarPill[]> = {};
  for (const visit of visits) {
    const hasOpenIssues = openIssueVisitIds.has(visit.id);
    (pillsByDate[visit.visit_date] ??= []).push({
      id: visit.id,
      label: visit.authorName,
      color: hasOpenIssues ? "red" : "green",
      onClick: () => navigate(`/app/projects/${projectId}/visits/${visit.id}`),
    });
  }

  return (
    <div>
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-3">
          {loadError}
        </div>
      )}
      <MonthCalendar
        month={month}
        onMonthChange={onMonthChange}
        pillsByDate={pillsByDate}
        onDayClick={(key) => navigate(`/app/projects/${projectId}/visit/new?date=${key}`)}
      />
      {loading && <div className="text-center text-sm text-gray-400 py-3">Chargement...</div>}
    </div>
  );
}
