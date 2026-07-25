import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/useAuth";
import {
  getDashboardStats,
  getRecentVisitsAcrossProjects,
  getRecentActivity,
  getProjects,
  type DashboardStats,
  type ActivityEntry,
} from "../../lib/supabaseApi";
import { getRecentIssuesAcrossProjects } from "../../lib/issuesApi";
import { supabase } from "../../lib/supabase";
import { formatDateShort, formatRelativeDate } from "../../lib/dateUtils";
import type { Project } from "../../lib/supabase";
import { useEffect, useState, useCallback, useRef } from "react";
import { Calendar, Plus, RefreshCw } from "lucide-react";
import FloatingActions from "./FloatingActions";
import { PriorityBadge } from "./ui-kit/Badge";
import { Card, Section, SectionAction, ListRow, ListRows } from "./ui-kit/Card";
import { StatGrid, StatTile } from "./ui-kit/StatTile";
import ActivityIcon from "./ui-kit/ActivityIcon";
import { usePageHeader } from "../../contexts/PageHeaderContext";

type RecentIssue = Awaited<ReturnType<typeof getRecentIssuesAcrossProjects>>[number];
type RecentVisit = Awaited<ReturnType<typeof getRecentVisitsAcrossProjects>>[number];

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
    totalVisits: 0,
    photosThisWeek: 0,
    openIssues: 0,
    resolvedIssues: 0,
  });
  const [recentIssues, setRecentIssues] = useState<RecentIssue[]>([]);
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
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
      try {
        const projects = await getProjects(user.id);
        const projectIds = projects.map((p) => p.id);

        const [statsData, issuesData, visitsData, activityData] = await Promise.all([
          getDashboardStats(user.id),
          getRecentIssuesAcrossProjects(projectIds, OPEN_ISSUES_COUNT, "open"),
          getRecentVisitsAcrossProjects(projectIds, 5),
          getRecentActivity(projectIds, 15),
        ]);

        setStats(statsData);
        setRecentIssues(issuesData);
        setRecentVisits(visitsData);
        setActivity(activityData);
        setRecentProjects(
          [...projects]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 5),
        );
      } catch (error) {
        console.error("Erreur lors du chargement du tableau de bord:", error);
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
        <div className="flex justify-end -mb-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface text-[13px] font-medium text-body hover:bg-canvas transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Actualiser
          </button>
        </div>

        {/* Stat tiles — hairline-joined so the four read as one panel.
            Only the open-déficiences figure is red; the rest are ink. */}
        <StatGrid className="grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Déf. ouvertes"
            value={loading ? "—" : stats.openIssues}
            suffix={loading ? undefined : `/ ${stats.openIssues + stats.resolvedIssues}`}
            emphasis
            onClick={() => navigate("/app/issues")}
          />
          <StatTile label="Photos · 7 j" value={loading ? "—" : stats.photosThisWeek} />
          <StatTile
            label="Projets"
            value={loading ? "—" : stats.totalProjects}
            onClick={() => navigate("/app/projects")}
          />
          <StatTile label="Visites" value={loading ? "—" : stats.totalVisits} />
        </StatGrid>

        {/* Wide column carries the two actionable lists (déficiences +
            activité); the narrow rail carries the reference lists. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 lg:items-start">
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
          </div>

          {/* Narrow rail — stacks under the main column on phone, sits
              beside it from lg up. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6">
            <Section title="Projets récents">
              <Card className="overflow-hidden">
                {loading ? (
                  <div className="py-5 text-center text-sm text-faint">Chargement...</div>
                ) : recentProjects.length === 0 ? (
                  <div className="py-5 text-center text-sm text-muted">Aucun projet</div>
                ) : (
                  <ListRows>
                    {recentProjects.map((project) => (
                      <ListRow
                        key={project.id}
                        onClick={() => navigate(`/app/projects/${project.id}`)}
                      >
                        <div className="text-sm font-medium text-ink truncate">{project.name}</div>
                        {project.address && (
                          <div className="text-xs text-muted truncate">{project.address}</div>
                        )}
                      </ListRow>
                    ))}
                  </ListRows>
                )}
              </Card>
            </Section>

            <Section title="Visites récentes">
              <Card className="overflow-hidden">
                {loading ? (
                  <div className="py-5 text-center text-sm text-faint">Chargement...</div>
                ) : recentVisits.length === 0 ? (
                  <div className="py-5 text-center text-sm text-muted">Aucune visite</div>
                ) : (
                  <ListRows>
                    {recentVisits.map((visit) => (
                      <ListRow
                        key={visit.id}
                        onClick={() =>
                          navigate(`/app/projects/${visit.project_id}/visits/${visit.id}`)
                        }
                      >
                        <div className="text-sm font-medium text-ink truncate">
                          {visit.projectName}
                          {visit.phase ? ` — ${visit.phase}` : ""}
                        </div>
                        <div className="text-xs text-muted">
                          {formatDateShort(visit.visit_date)}
                        </div>
                      </ListRow>
                    ))}
                  </ListRows>
                )}
              </Card>
            </Section>
          </div>
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
