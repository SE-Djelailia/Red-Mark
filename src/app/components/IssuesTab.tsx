import { useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  Clock,
  FileText,
  MapPin,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PriorityBadge, StatusBadge, PRIORITY_OPTIONS } from "./ui-kit/Badge";
import { type IssuePriority, PRIORITY_RANK } from "../../lib/issuePriority";
import { StatGrid, StatTile } from "./ui-kit/StatTile";
import { parseLocalDate } from "../../lib/dateUtils";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { disciplineOptions } from "../../lib/disciplines";
import { MarkX, StatusGlyph } from "./ui-kit/RedMarkIcons";
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
  priority: IssuePriority;
  status: IssueStatus;
  discipline?: string;
  dueDate?: string | null;
  createdDate: string;
  createdAt?: string;
  photos: { id: string }[];
  locationId?: string | null;
  // Both are columns on issues (Stage 24 added stage_id beside lot_id) and
  // are already mapped by issuesApi's rowToIssueBase, so filtering by them
  // needs no query change — the values are on the rows this tab already has.
  lotId?: string | null;
  stageId?: string | null;
}

type SortKey = "age" | "dueDate" | "priority" | "status";

const SORT_LABEL: Record<SortKey, string> = {
  age: "Plus anciennes",
  dueDate: "Échéance",
  priority: "Priorité",
  status: "État",
};

// Rank comes from the canonical two-level module; see lib/issuePriority.ts.

interface Props {
  issues: IssueRow[];
  locations: { id: string; locationNumber: string; name?: string | null }[];
  /** Filter options for the lot/étape selects. Empty arrays simply hide the
   *  corresponding select, so a project with no lots shows no lot filter
   *  rather than an empty dropdown. */
  lots: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  loadError: string | null;
  onRetry: () => void;
  onOpenIssue: (issueId: string) => void;
  // Takes only the field it reads, not a whole IssueRow: function
  // parameters are contravariant, so a caller whose own Issue type has a
  // richer `photos` shape could not otherwise pass its existing helper.
  resolveLocationLabel: (issue: { locationId?: string | null }) => string | null;
  /** Opens the punch-list generation options. Omitted when the caller has no
   *  project to generate for, so the button simply does not render. */
  onGeneratePunchList?: () => void;
}

export default function IssuesTab({
  issues,
  locations,
  lots,
  stages,
  loadError,
  onRetry,
  onOpenIssue,
  resolveLocationLabel,
  onGeneratePunchList,
}: Props) {
  // Defaults to the three non-verified states: opening this tab should show
  // outstanding work, not a history of everything ever recorded. Verified
  // items stay one click away rather than padding the default view.
  const [statusFilter, setStatusFilter] = useState<IssueStatus[]>([...OUTSTANDING_ISSUE_STATUSES]);
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [lotFilter, setLotFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [showFilters, setShowFilters] = useState(false);

  // MASTER/DETAIL, lg and up only.
  //
  // Below lg a row navigates away, exactly as it always has — the phone is
  // the quick-consult device and its behaviour is deliberately untouched.
  // At lg the same tap selects into the pane beside the list instead, so
  // reviewing twenty déficiences is twenty taps rather than twenty
  // round trips that each lose the filter position.
  //
  // The breakpoint is read in JS because the BEHAVIOUR forks, not just the
  // layout: CSS alone cannot make one tap navigate on a phone and select on
  // an iPad. It is kept in sync with the `lg:` classes below by hand — the
  // 1024px literal is the same number Tailwind's lg represents.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const splitView = useMediaQuery("(min-width: 1024px)");

  // A selection made on iPad must not survive a rotation into portrait, or
  // the pane would vanish while the row still looked selected.
  const selected = splitView ? (issues.find((i) => i.id === selectedId) ?? null) : null;

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
      // Nullable columns: a déficience with no lot must not match a specific
      // lot, and `(issue.lotId ?? "")` makes that explicit rather than
      // relying on undefined !== "lot-id" happening to be true.
      if (lotFilter && (issue.lotId ?? "") !== lotFilter) return false;
      if (stageFilter && (issue.stageId ?? "") !== stageFilter) return false;
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
  }, [
    issues,
    statusFilter,
    disciplineFilter,
    locationFilter,
    priorityFilter,
    lotFilter,
    stageFilter,
    overdueOnly,
    sortKey,
    now,
  ]);

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
    !!lotFilter ||
    !!stageFilter ||
    overdueOnly ||
    statusFilter.length !== OUTSTANDING_ISSUE_STATUSES.length ||
    !OUTSTANDING_ISSUE_STATUSES.every((s) => statusFilter.includes(s));

  const clearFilters = () => {
    setStatusFilter([...OUTSTANDING_ISSUE_STATUSES]);
    setDisciplineFilter("");
    setLocationFilter("");
    setPriorityFilter("");
    setLotFilter("");
    setStageFilter("");
    setOverdueOnly(false);
  };

  // An empty list must not be able to mean "load failed" — on site that
  // reads as "nothing outstanding".
  if (loadError) {
    return (
      <div className="text-center py-12">
        <MarkX size={48} className="mx-auto text-faint mb-4 lucide-display" />
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

      {onGeneratePunchList && (
        <button
          onClick={onGeneratePunchList}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[4px] border border-ink text-ink text-sm font-medium min-h-11 hover:bg-subtle active:bg-line transition-colors duration-(--duration-base) ease-out"
        >
          <FileText size={16} />
          Générer une liste de déficiences
        </button>
      )}

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
                <StatusGlyph status={s} size={12} className="inline-block mr-1.5 -mt-px flex-shrink-0" />
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
            <SlidersHorizontal size={16} />
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
          // Was sm:grid-cols-3 for three selects. Five would cram at tablet
          // width, so the grid opens to four from 700px (the device boundary
          // the type scale uses — iPad mini is 744px) and five at xl. Below
          // that it stays one per row, as on the phone today.
          <div className="grid gap-3 sm:grid-cols-2 min-[700px]:grid-cols-3 xl:grid-cols-5 p-4 bg-subtle rounded-[4px] border border-line">
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
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {/* Lot and étape are the project's two organising axes — WHO is
                responsible and WHEN in the build. Rendered only when the
                project actually has some, so a project that uses neither is
                not offered two empty dropdowns. */}
            {lots.length > 0 && (
              <select
                value={lotFilter}
                onChange={(e) => setLotFilter(e.target.value)}
                className={selectClass}
                aria-label="Lot"
              >
                <option value="">Tous les lots</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.name}
                  </option>
                ))}
              </select>
            )}
            {stages.length > 0 && (
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className={selectClass}
                aria-label="Étape"
              >
                <option value="">Toutes les étapes</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* LIST | DETAIL from lg. One grid column below it, so the phone gets
          the same full-width list it always had. items-start keeps the pane
          from stretching to the list's full height, and the sticky offset
          lets a long list scroll past a pinned detail. */}
      <div className="grid gap-4 lg:grid-cols-12 items-start">
        <div className={selected ? "lg:col-span-7" : "lg:col-span-12"}>
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <MarkX size={40} className="mx-auto text-faint mb-3 lucide-display" />
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
                  onClick={() =>
                    splitView ? setSelectedId(issue.id) : onOpenIssue(issue.id)
                  }
                  aria-current={selected?.id === issue.id ? "true" : undefined}
                  // The selected row takes the system's 2px leading rule —
                  // the same marker a marked row uses everywhere else. Not a
                  // fill: a red-filled row would put a second red on a screen
                  // that already spends its budget on the déficience state.
                  // The selection marker is scoped to lg: below it `selected`
                  // is always null, so the border would only ever be a 2px
                  // transparent inset shifting every row on the phone. The
                  // phone row is therefore byte-identical to what it was.
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b border-line hover:bg-subtle transition-colors min-h-[44px] text-left lg:border-l-2 ${
                    selected?.id === issue.id
                      ? "bg-subtle lg:border-l-brand-600"
                      : "bg-surface lg:border-l-transparent"
                  }`}
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
                          <Clock size={12} />
                          En retard
                        </span>
                      )}
                      {issue.discipline && (
                        <span className="truncate">· {issue.discipline}</span>
                      )}
                      {locationLabel && (
                        <span className="flex items-center gap-1 min-w-0">
                          <span>·</span>
                          <MapPin size={12} className="flex-shrink-0" />
                          <span className="truncate">{locationLabel}</span>
                        </span>
                      )}
                      {issue.photos.length > 0 && (
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <span>·</span>
                          <Camera size={12} />
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

        {/* The detail pane. Rendered only when a row is selected AND the
            viewport is wide enough — `selected` is already null below lg, so
            this cannot appear on a phone even mid-rotation. */}
        {selected && (
          <div className="hidden lg:block lg:col-span-5 lg:sticky lg:top-4">
            <IssueDetailPane
              issue={selected}
              locationLabel={resolveLocationLabel(selected)}
              onOpenFull={() => onOpenIssue(selected.id)}
              onClose={() => setSelectedId(null)}
              now={now}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The déficience preview shown beside the list on iPad.
 *
 * Deliberately a PREVIEW, not the full IssueDetail screen: that component
 * reads its own route params, so embedding it would mean either changing
 * routing (explicitly out of scope) or rendering a second router context.
 * What it shows instead is everything the list row already has in memory —
 * enough to triage without a round trip — plus one obvious way through to
 * the full record for the things that need it (photos, comments, history,
 * status changes).
 *
 * That division is honest about what the pane is for: scanning a list and
 * deciding which item deserves the full screen.
 */
function IssueDetailPane({
  issue,
  locationLabel,
  onOpenFull,
  onClose,
  now,
}: {
  issue: IssueRow;
  locationLabel: string | null;
  onOpenFull: () => void;
  onClose: () => void;
  now: Date;
}) {
  // The same two helpers the list row uses, so the pane and the row it came
  // from can never disagree about age or overdue state.
  const age = ageInDays(issue.createdAt ?? issue.createdDate, now);
  const overdue = isOverdue(issue.dueDate, issue.status, now);

  return (
    <div className="bg-surface border border-line rounded-[4px] overflow-hidden rm-fade">
      {/* Title block, in the drawing-sheet voice. */}
      <div className="px-4 py-3 border-b border-line flex items-start gap-3">
        <StatusGlyph status={issue.status} size={20} className="text-ink mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="rm-label">Déficience</p>
          <h3 className="text-base font-semibold text-ink mt-0.5 text-balance">{issue.title}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="text-muted hover:text-ink transition-colors duration-(--duration-fast) flex-shrink-0 min-h-[32px] px-1"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <PriorityBadge priority={issue.priority} />
          <StatusBadge status={issue.status} />
          {overdue && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong">
              <Clock size={12} />
              En retard
            </span>
          )}
        </div>

        {/* Metadata as label/value pairs — the title-block treatment used
            everywhere else a record is summarised. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <Pair label="Signalée le">
            {parseLocalDate(issue.createdDate).toLocaleDateString("fr-CA", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Pair>
          {age !== null && age > 0 && <Pair label="Âge">{age} jours</Pair>}
          {issue.discipline && <Pair label="Discipline">{issue.discipline}</Pair>}
          {issue.dueDate && (
            <Pair label="Échéance">
              {parseLocalDate(issue.dueDate).toLocaleDateString("fr-CA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Pair>
          )}
          {locationLabel && <Pair label="Local">{locationLabel}</Pair>}
          {issue.photos.length > 0 && (
            <Pair label="Photos">
              {issue.photos.length} photo{issue.photos.length > 1 ? "s" : ""}
            </Pair>
          )}
        </dl>
      </div>

      {/* The way through to the full record. Ink outline, not a red fill:
          the screen's red is already spent on the déficience state, and the
          punch-list action above is the tab's one primary. */}
      <div className="px-4 py-3 border-t border-line">
        <button
          onClick={onOpenFull}
          className="w-full min-h-[44px] px-4 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle active:bg-line/50 transition-colors duration-(--duration-fast) flex items-center justify-center gap-2"
        >
          Ouvrir la fiche complète
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="rm-label">{label}</dt>
      <dd className="text-ink mt-0.5 truncate">{children}</dd>
    </div>
  );
}
