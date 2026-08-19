import { useMemo, useState } from "react";
import { AlertCircle, MapPin, Camera, Clock, SlidersHorizontal } from "lucide-react";
import { PriorityBadge, StatusBadge, PRIORITY_LABEL } from "./ui-kit/Badge";
import { StatGrid, StatTile } from "./ui-kit/StatTile";
import { parseLocalDate } from "../../lib/dateUtils";
import { disciplineOptions } from "../../lib/disciplines";
import {
  ISSUE_STATUSES,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUS_RANK,
  OUTSTANDING_ISSUE_STATUSES,
  ageInDays,
  isOverdue,
  type IssueStatus,
} from "../../lib/issueStatus";

// The project's déficiences list, with the filtering and sorting a punch
// list actually needs. Split out of ProjectDetail (already ~1,800 lines)
// rather than grown inside it — this is the one tab with real view state
// of its own, and none of it is shared with the other four.

// Structural subset of issuesApi's Issue. Declared here rather than
// imported so ProjectDetail can keep passing its own local Issue shape.
export interface IssueRow {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  status: IssueStatus;
  discipline?: string;
  dueDate?: string | null;
  createdDate: string;
  createdAt?: string;
  photos: { id: string }[];
  locationId?: string | null;
}

type SortKey = "age" | "dueDate" | "priority" | "status";

const SORT_LABEL: Record<SortKey, string> = {
  age: "Plus anciennes",
  dueDate: "Échéance",
  priority: "Priorité",
  status: "État",
};

const PRIORITY_RANK: Record<IssueRow["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface Props {
  issues: IssueRow[];
  locations: { id: string; locationNumber: string; name?: string | null }[];
  loadError: string | null;
  onRetry: () => void;
  onOpenIssue: (issueId: string) => void;
  // Takes only the field it reads, not a whole IssueRow: function
  // parameters are contravariant, so a caller whose own Issue type has a
  // richer `photos` shape could not otherwise pass its existing helper.
  resolveLocationLabel: (issue: { locationId?: string | null }) => string | null;
}

export default function IssuesTab({
  issues,
  locations,
  loadError,
  onRetry,
  onOpenIssue,
  resolveLocationLabel,
}: Props) {
  // Defaults to the three non-verified states: opening this tab should show
  // outstanding work, not a history of everything ever recorded. Verified
  // items stay one click away rather than padding the default view.
  const [statusFilter, setStatusFilter] = useState<IssueStatus[]>([...OUTSTANDING_ISSUE_STATUSES]);
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [showFilters, setShowFilters] = useState(false);

  // One clock for the whole render pass, so age and overdue can't disagree
  // across rows if the render straddles midnight.
  const now = useMemo(() => new Date(), [issues]);

  const disciplines = useMemo(
    () => disciplineOptions(issues.map((i) => i.discipline)),
    [issues],
  );

  const toggleStatus = (s: IssueStatus) =>
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const filtered = useMemo(() => {
    const rows = issues.filter((issue) => {
      // An empty status selection means "no state selected", which honestly
      // matches nothing — treating it as "all" would silently ignore the
      // user having deliberately unticked every box.
      if (!statusFilter.includes(issue.status)) return false;
      if (disciplineFilter && (issue.discipline ?? "") !== disciplineFilter) return false;
      if (locationFilter && issue.locationId !== locationFilter) return false;
      if (priorityFilter && issue.priority !== priorityFilter) return false;
      if (overdueOnly && !isOverdue(issue.dueDate, issue.status, now)) return false;
      return true;
    });

    const byCreatedAsc = (a: IssueRow, b: IssueRow) =>
      Date.parse(a.createdAt ?? a.createdDate) - Date.parse(b.createdAt ?? b.createdDate);

    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "age":
          // Oldest first — the ones that have been waiting longest.
          return byCreatedAsc(a, b);
        case "dueDate": {
          // Soonest first, with undated items last rather than sorted as if
          // due at the epoch (which would park them at the top, above
          // genuinely urgent work).
          const av = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
          const bv = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
          return av === bv ? byCreatedAsc(a, b) : av - bv;
        }
        case "priority": {
          const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          return d !== 0 ? d : byCreatedAsc(a, b);
        }
        case "status": {
          const d = ISSUE_STATUS_RANK[a.status] - ISSUE_STATUS_RANK[b.status];
          return d !== 0 ? d : byCreatedAsc(a, b);
        }
      }
    });
  }, [issues, statusFilter, disciplineFilter, locationFilter, priorityFilter, overdueOnly, sortKey, now]);

  // Tiles summarise the WHOLE project, not the current filter — they are
  // the reference the filters are read against, and would be circular if
  // they only ever restated what was already on screen.
  const counts = useMemo(() => {
    const byStatus = {} as Record<IssueStatus, number>;
    for (const s of ISSUE_STATUSES) byStatus[s] = 0;
    let overdue = 0;
    for (const i of issues) {
      byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
      if (isOverdue(i.dueDate, i.status, now)) overdue += 1;
    }
    return { byStatus, overdue };
  }, [issues, now]);

  const filtersActive =
    !!disciplineFilter ||
    !!locationFilter ||
    !!priorityFilter ||
    overdueOnly ||
    statusFilter.length !== OUTSTANDING_ISSUE_STATUSES.length ||
    !OUTSTANDING_ISSUE_STATUSES.every((s) => statusFilter.includes(s));

  const clearFilters = () => {
    setStatusFilter([...OUTSTANDING_ISSUE_STATUSES]);
    setDisciplineFilter("");
    setLocationFilter("");
    setPriorityFilter("");
    setOverdueOnly(false);
  };

  // An empty list must not be able to mean "load failed" — on site that
  // reads as "nothing outstanding".
  if (loadError) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={48} className="mx-auto text-faint mb-4" />
        <p className="text-muted mb-2">{loadError}</p>
        <button onClick={onRetry} className="text-sm text-brand-strong hover:text-brand-800 font-medium">
          Réessayer
        </button>
      </div>
    );
  }

  const selectClass =
    "w-full px-3 py-2.5 bg-surface border border-line-strong rounded-[4px] text-sm min-h-[44px]";

  return (
    <div className="space-y-4">
      <StatGrid className="grid-cols-2 sm:grid-cols-4">
        <StatTile label={ISSUE_STATUS_LABEL.signale} value={counts.byStatus.signale} emphasis />
        <StatTile label={ISSUE_STATUS_LABEL.a_corriger} value={counts.byStatus.a_corriger} />
        <StatTile label={ISSUE_STATUS_LABEL.corrige} value={counts.byStatus.corrige} />
        <StatTile label={ISSUE_STATUS_LABEL.verifie} value={counts.byStatus.verifie} />
      </StatGrid>

      {counts.overdue > 0 && (
        <button
          onClick={() => setOverdueOnly((v) => !v)}
          aria-pressed={overdueOnly}
          className={`w-full flex items-center gap-2 px-4 py-3 rounded-[4px] border text-sm font-medium min-h-[44px] transition-colors ${
            overdueOnly
              ? "border-line-strong border-l-2 border-l-brand-600 bg-surface text-ink"
              : "border-line bg-surface text-body hover:border-line-strong"
          }`}
        >
          <Clock size={16} className="flex-shrink-0" />
          {counts.overdue} en retard
          <span className="ml-auto text-xs text-muted">
            {overdueOnly ? "Afficher tout" : "Filtrer"}
          </span>
        </button>
      )}

      {/* État is always visible — it is the filter that changes what the
          list means. The rest fold away to keep the tab usable on a phone. */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {ISSUE_STATUSES.map((s) => {
            const on = statusFilter.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                aria-pressed={on}
                className={`px-3 py-2 rounded-[4px] border text-sm min-h-[40px] transition-colors ${
                  on
                    ? "border-line-strong border-l-2 border-l-brand-600 bg-surface text-ink font-medium"
                    : "border-line bg-surface text-muted hover:border-line-strong"
                }`}
              >
                {ISSUE_STATUS_LABEL[s]}
                <span className="ml-1.5 text-xs opacity-70">{counts.byStatus[s]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="flex items-center gap-1.5 text-sm text-brand-strong hover:text-brand-800 font-medium min-h-[40px]"
          >
            <SlidersHorizontal size={15} />
            Filtres
          </button>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="px-3 py-2 bg-surface border border-line rounded-[4px] text-sm min-h-[40px]"
            aria-label="Trier"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="text-sm text-muted hover:text-ink min-h-[40px]"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid gap-3 sm:grid-cols-3 p-4 bg-subtle rounded-[4px] border border-line">
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              className={selectClass}
              aria-label="Discipline"
            >
              <option value="">Toutes les disciplines</option>
              {disciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className={selectClass}
              aria-label="Local"
            >
              <option value="">Tous les locaux</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.locationNumber}
                  {loc.name ? ` — ${loc.name}` : ""}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={selectClass}
              aria-label="Priorité"
            >
              <option value="">Toutes les priorités</option>
              <option value="critical">{PRIORITY_LABEL.critical}</option>
              <option value="high">{PRIORITY_LABEL.high}</option>
              <option value="medium">{PRIORITY_LABEL.medium}</option>
              <option value="low">{PRIORITY_LABEL.low}</option>
            </select>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <MapPin size={40} className="mx-auto text-faint mb-3" />
          <p className="text-muted text-sm mb-2">
            {issues.length === 0
              ? "Aucune déficience pour ce projet"
              : "Aucune déficience ne correspond aux filtres"}
          </p>
          {issues.length > 0 && filtersActive && (
            <button onClick={clearFilters} className="text-sm text-brand-strong hover:text-brand-800">
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="text-xs text-muted">
            {filtered.length} / {issues.length} déficience{issues.length !== 1 ? "s" : ""}
          </div>
          <div className="bg-surface rounded-[4px] border border-line overflow-hidden">
            {filtered.map((issue) => {
              const locationLabel = resolveLocationLabel(issue);
              const age = ageInDays(issue.createdAt ?? issue.createdDate, now);
              const overdue = isOverdue(issue.dueDate, issue.status, now);
              return (
                <button
                  key={issue.id}
                  onClick={() => onOpenIssue(issue.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-surface border-b border-line hover:bg-subtle transition-colors min-h-[44px] text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{issue.title}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5 flex-wrap">
                      <span className="whitespace-nowrap">
                        {parseLocalDate(issue.createdDate).toLocaleDateString("fr-CA", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {age !== null && age > 0 && (
                        <span className="whitespace-nowrap">· {age} j</span>
                      )}
                      {overdue && (
                        <span className="flex items-center gap-1 flex-shrink-0 text-brand-strong font-medium">
                          <span>·</span>
                          <Clock size={10} />
                          En retard
                        </span>
                      )}
                      {issue.discipline && (
                        <span className="truncate">· {issue.discipline}</span>
                      )}
                      {locationLabel && (
                        <span className="flex items-center gap-1 min-w-0">
                          <span>·</span>
                          <MapPin size={10} className="flex-shrink-0" />
                          <span className="truncate">{locationLabel}</span>
                        </span>
                      )}
                      {issue.photos.length > 0 && (
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <span>·</span>
                          <Camera size={10} />
                          {issue.photos.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <PriorityBadge priority={issue.priority} />
                    <StatusBadge status={issue.status} />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
