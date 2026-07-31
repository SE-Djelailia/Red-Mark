import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/useAuth";
import {
  getDashboardStats,
  getRecentActivity,
  getProjects,
  type DashboardStats,
  type ActivityEntry,
} from "../../lib/supabaseApi";
import { getRecentIssuesAcrossProjects } from "../../lib/issuesApi";
import { getRlsErrorMessage } from "../../lib/rlsErrors";
import { supabase } from "../../lib/supabase";
import { formatDateShort, formatRelativeDate } from "../../lib/dateUtils";
import { useEffect, useState, useCallback, useRef } from "react";
import { AlertCircle, Calendar, Plus, RefreshCw } from "lucide-react";
import FloatingActions from "./FloatingActions";
import { PriorityBadge } from "./ui-kit/Badge";
import { Card, Section, SectionAction, ListRow, ListRows } from "./ui-kit/Card";
import { StatGrid, StatTile } from "./ui-kit/StatTile";
import ActivityIcon from "./ui-kit/ActivityIcon";
import DashboardVisitCalendar from "./DashboardVisitCalendar";
import { usePageHeader } from "../../contexts/PageHeaderContext";

type RecentIssue = Awaited<ReturnType<typeof getRecentIssuesAcrossProjects>>[number];

// "Mardi 24 mars · 3 projets actifs" — the spec's dateline under the title.
function formatDateline(projectCount: number): string {
  const today = new Date().toLocaleDateString("fr-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const capitalized = today.charAt(0).toUpperCase() + today.slice(1);
  const projects = `${projectCount} projet${projectCount === 1 ? "" : "s"}`;
  return `${capitalized} · ${projects}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    openIssues: 0,
    resolvedIssues: 0,
  });
  const [recentIssues, setRecentIssues] = useState<RecentIssue[]>([]);
  // Lifted out of loadData so the calendar can scope its own month query to
  // the same set of projects the rest of the dashboard is built from.
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ACTIVITY_PREVIEW_COUNT = 5;
  const OPEN_ISSUES_COUNT = 5;

  const loadData = useCallback(
    async (showSpinner = false) => {
      if (!user?.id) return;
      if (showSpinner) setRefreshing(true);
      setLoadError(null);
      try {
        const projects = await getProjects(user.id);
        const ids = projects.map((p) => p.id);

        const [statsData, issuesData, activityData] = await Promise.all([
          getDashboardStats(user.id),
          getRecentIssuesAcrossProjects(ids, OPEN_ISSUES_COUNT, "open"),
          getRecentActivity(ids, 15),
        ]);

        setProjectIds(ids);
        setStats(statsData);
        setRecentIssues(issuesData);
        setActivity(activityData);
      } catch (error) {
        console.error("Erreur lors du chargement du tableau de bord:", error);
        // Without this the dashboard renders zeros and empty lists, which on
        // site reads as "nothing outstanding" rather than "load failed".
        setLoadError(
          getRlsErrorMessage(error, "Impossible de charger le tableau de bord."),
        );
      } finally {
        setLoading(false);
        if (showSpinner) setRefreshing(false);
      }
    },
    [user?.id],
  );

  // Chargement initial + rechargement quand l'onglet redevient visible
  useEffect(() => {
    loadData();

    const onVisible = () => {
      if (document.visibilityState === "visible") loadData(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadData]);

  // Mise à jour automatique en temps réel via Supabase Realtime.
  // Tout INSERT/UPDATE/DELETE sur projets, visites, photos ou déficiences
  // déclenche un rechargement (anti-rebond de 800ms pour regrouper les rafales).
  useEffect(() => {
    if (!user?.id) return;

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => loadData(true), 800);
    };

    const channel = supabase
      .channel("dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_visits" },
        scheduleRefresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadData]);

  const visibleActivity = activityExpanded ? activity : activity.slice(0, ACTIVITY_PREVIEW_COUNT);

  // Title lives in the global AppHeader so the logo row and the page title
  // read as one continuous block of white chrome.
  usePageHeader("Tableau de bord", formatDateline(stats.totalProjects));

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-6xl mx-auto space-y-6">
        {/* Phone has no refresh control in the spec — the tab-visibility and
            realtime listeners already reload; this is a desktop convenience. */}
        <div className="hidden lg:flex justify-end -mb-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface text-[13px] font-medium text-body hover:bg-canvas transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Actualiser
          </button>
        </div>

        {/* Shown above everything: zeros and empty lists below would
            otherwise read as "nothing outstanding" rather than a failure. */}
        {loadError && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertCircle size={18} className="text-brand-strong flex-shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm text-brand-strong">{loadError}</p>
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="text-sm font-medium text-brand-strong hover:underline disabled:opacity-50 flex-shrink-0"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Stat tiles — hairline-joined so the pair reads as one panel.
            Only the open-déficiences figure is red; the rest are ink.
            Photos and visits were dropped: both are per-project concepts,
            and a count summed across every project is not a number anyone
            acts on. What remains is exactly the two that drill down. */}
        <StatGrid className="grid-cols-2">
          <StatTile
            label="Déficiences ouvertes"
            value={loading || loadError ? "—" : stats.openIssues}
            suffix={
              loading || loadError ? undefined : `/ ${stats.openIssues + stats.resolvedIssues}`
            }
            emphasis
            onClick={() => navigate("/app/issues")}
          />
          <StatTile
            label="Projets"
            value={loading || loadError ? "—" : stats.totalProjects}
            onClick={() => navigate("/app/projects")}
          />
        </StatGrid>

        {/* Single column now. The two-column split existed to give the
            narrow rail "Projets récents" and "Visites récentes"; with both
            removed the rail had no content, so the grid went with them. */}
        <div className="space-y-6">
            {/* Open deficiencies — an actionable "still needs attention"
                list, not a chronological feed, so only open issues appear. */}
            <Section
              title="Déficiences ouvertes"
              action={
                <SectionAction onClick={() => navigate("/app/issues")}>Tout voir</SectionAction>
              }
            >
              <Card className="overflow-hidden">
                {loading ? (
                  <div className="py-6 text-center text-sm text-faint">Chargement...</div>
                ) : recentIssues.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted">
                    Aucune déficience ouverte
                  </div>
                ) : (
                  <ListRows>
                    {recentIssues.map((issue) => (
                      <ListRow
                        key={issue.id}
                        onClick={() =>
                          navigate(`/app/projects/${issue.projectId}/issues/${issue.id}`)
                        }
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-medium text-ink truncate">{issue.title}</h3>
                          <span className="ml-auto flex-shrink-0">
                            <PriorityBadge priority={issue.priority} />
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span className="truncate">{issue.projectName}</span>
                          <span className="text-faint ml-auto flex-shrink-0">
                            {formatDateShort(issue.createdDate)}
                          </span>
                        </div>
                      </ListRow>
                    ))}
                  </ListRows>
                )}
              </Card>
            </Section>

            {/* Recent activity — merges new issues, resolved issues and new
                visits across every project the user is a member of. Capped
                to 5; "Voir tout" expands in place (data's already fetched). */}
            <Section
              title="Activité récente"
              action={
                activity.length > ACTIVITY_PREVIEW_COUNT ? (
                  <SectionAction onClick={() => setActivityExpanded((v) => !v)}>
                    {activityExpanded ? "Réduire" : `Voir tout (${activity.length})`}
                  </SectionAction>
                ) : undefined
              }
            >
              <Card className="overflow-hidden">
                {loading ? (
                  <div className="py-6 text-center text-sm text-faint">Chargement...</div>
                ) : activity.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted">Aucune activité récente</div>
                ) : (
                  <ListRows>
                    {visibleActivity.map((entry) => (
                      <ListRow
                        key={entry.id}
                        onClick={() => navigate(entry.linkPath)}
                        className="flex items-center gap-3"
                      >
                        <ActivityIcon kind={entry.kind} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink truncate">{entry.title}</div>
                          <div className="text-xs text-muted truncate">{entry.projectName}</div>
                        </div>
                        <div className="text-xs text-faint flex-shrink-0 whitespace-nowrap">
                          {formatRelativeDate(entry.timestamp)}
                        </div>
                      </ListRow>
                    ))}
                  </ListRows>
                )}
              </Card>
            </Section>

            {/* Cross-project visit calendar — month grid on iPad/desktop,
                agenda list on a phone (see DashboardVisitCalendar). */}
            <Section title="Calendrier des visites">
              <DashboardVisitCalendar projectIds={projectIds} />
            </Section>
        </div>
      </div>

      <FloatingActions
        menu={[
          { label: "Nouvelle visite", icon: Calendar, onClick: () => navigate("/app/new-visit") },
          { label: "Nouveau projet", icon: Plus, onClick: () => navigate("/app/projects?new=1") },
        ]}
      />
    </div>
  );
}
