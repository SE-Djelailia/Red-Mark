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
import {
  AlertCircle,
  CheckCircle,
  TrendingUp,
  FolderKanban,
  Camera,
  FileText,
  Calendar,
  Plus,
  RefreshCw,
} from "lucide-react";
import FloatingActions from "./FloatingActions";
import { PriorityBadge } from "./ui-kit/Badge";

type RecentIssue = Awaited<ReturnType<typeof getRecentIssuesAcrossProjects>>[number];
type RecentVisit = Awaited<ReturnType<typeof getRecentVisitsAcrossProjects>>[number];

const ACTIVITY_ICON: Record<ActivityEntry["kind"], typeof AlertCircle> = {
  issue_created: AlertCircle,
  issue_resolved: CheckCircle,
  visit_created: Calendar,
};

const ACTIVITY_ICON_COLOR: Record<ActivityEntry["kind"], string> = {
  issue_created: "bg-red-100 text-red-600",
  issue_resolved: "bg-green-100 text-green-600",
  visit_created: "bg-blue-100 text-blue-600",
};

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

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      {/* Header — lightened per the design system (Step 2 proof screen):
          surface background with a hairline rule instead of the dark slab. */}
      <div className="bg-surface border-b border-line px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-start justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl md:text-2xl mb-1 font-semibold text-ink">Tableau de bord</h1>
            <p className="text-xs md:text-sm text-muted">Vue d'ensemble de vos projets RedMark</p>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 text-faint hover:text-brand-600 transition-colors disabled:opacity-50"
            aria-label="Actualiser"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:items-start">
          {/* Main column: stats, activity */}
          <div className="lg:col-span-2 space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                onClick={() => navigate("/app/projects")}
                className="bg-surface rounded-xl p-3 border border-line cursor-pointer hover:border-brand-600 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FolderKanban size={14} className="text-blue-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-ink">
                  {loading ? "—" : stats.totalProjects}
                </div>
                <div className="text-xs text-muted">Projets</div>
              </div>

              <div className="bg-surface rounded-xl p-3 border border-line">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Camera size={14} className="text-purple-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-ink">
                  {loading ? "—" : stats.photosThisWeek}
                </div>
                <div className="text-xs text-muted">Photos cette semaine</div>
              </div>

              <div
                onClick={() => navigate("/app/issues")}
                className="bg-surface rounded-xl p-3 border border-line cursor-pointer hover:border-brand-600 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText size={14} className="text-green-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-ink">
                  {loading ? "—" : stats.openIssues}
                </div>
                <div className="text-xs text-muted">Déficiences ouvertes</div>
              </div>

              <div className="bg-surface rounded-xl p-3 border border-line">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
                    <TrendingUp size={14} className="text-orange-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-ink">
                  {loading ? "—" : stats.totalVisits}
                </div>
                <div className="text-xs text-muted">Visites</div>
              </div>
            </div>

            {/* Recent Activity — merges new issues, resolved issues, new visits
                across every project the user is a member of. Capped to 5 by
                default; "Voir tout" expands in place (data's already fetched). */}
            <div className="bg-surface rounded-xl border border-line">
              <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                <span className="w-1 h-5 bg-brand-600 rounded-full" />
                <h2 className="text-base font-semibold text-ink">Activité récente</h2>
              </div>

              {loading ? (
                <div className="py-6 text-center text-sm text-faint">Chargement...</div>
              ) : activity.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  Aucune activité récente
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {visibleActivity.map((entry) => {
                    const Icon = ACTIVITY_ICON[entry.kind];
                    return (
                      <div
                        key={entry.id}
                        onClick={() => navigate(entry.linkPath)}
                        className="px-4 py-2.5 hover:bg-subtle transition-colors cursor-pointer flex items-center gap-3"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ACTIVITY_ICON_COLOR[entry.kind]}`}
                        >
                          <Icon size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink truncate">
                            {entry.title}
                          </div>
                          <div className="text-xs text-muted truncate">
                            {entry.projectName}
                          </div>
                        </div>
                        <div className="text-xs text-faint flex-shrink-0 whitespace-nowrap">
                          {formatRelativeDate(entry.timestamp)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activity.length > ACTIVITY_PREVIEW_COUNT && (
                <div className="px-4 py-2 border-t border-line bg-canvas">
                  <button
                    onClick={() => setActivityExpanded((v) => !v)}
                    className="text-sm text-brand-600 font-medium hover:underline"
                  >
                    {activityExpanded ? "Réduire" : `Voir tout (${activity.length})`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: recent projects, recent visits, open deficiencies —
              stacked on mobile/tablet, alongside the main column on desktop. */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <div className="bg-surface rounded-xl border border-line">
                <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                  <span className="w-1 h-5 bg-brand-600 rounded-full" />
                  <h2 className="text-base font-semibold text-ink">Projets récents</h2>
                </div>
                {loading ? (
                  <div className="py-5 text-center text-sm text-faint">Chargement...</div>
                ) : recentProjects.length === 0 ? (
                  <div className="py-5 text-center text-sm text-muted">Aucun projet</div>
                ) : (
                  <div className="divide-y divide-line">
                    {recentProjects.map((project) => (
                      <div
                        key={project.id}
                        onClick={() => navigate(`/app/projects/${project.id}`)}
                        className="px-4 py-2.5 hover:bg-subtle transition-colors cursor-pointer"
                      >
                        <div className="text-sm font-medium text-ink truncate">
                          {project.name}
                        </div>
                        {project.address && (
                          <div className="text-xs text-muted truncate">{project.address}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-surface rounded-xl border border-line">
                <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                  <span className="w-1 h-5 bg-brand-600 rounded-full" />
                  <h2 className="text-base font-semibold text-ink">Visites récentes</h2>
                </div>
                {loading ? (
                  <div className="py-5 text-center text-sm text-faint">Chargement...</div>
                ) : recentVisits.length === 0 ? (
                  <div className="py-5 text-center text-sm text-muted">Aucune visite</div>
                ) : (
                  <div className="divide-y divide-line">
                    {recentVisits.map((visit) => (
                      <div
                        key={visit.id}
                        onClick={() =>
                          navigate(`/app/projects/${visit.project_id}/visits/${visit.id}`)
                        }
                        className="px-4 py-2.5 hover:bg-subtle transition-colors cursor-pointer"
                      >
                        <div className="text-sm font-medium text-ink truncate">
                          {visit.projectName}
                          {visit.phase ? ` — ${visit.phase}` : ""}
                        </div>
                        <div className="text-xs text-muted">
                          {formatDateShort(visit.visit_date)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Open deficiencies — distinct from "Activité récente": an
                actionable "still needs attention" list, not a chronological
                feed, so only open (non-resolved) issues appear here. */}
            <div className="bg-surface rounded-xl border border-line">
              <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                <span className="w-1 h-5 bg-brand-600 rounded-full" />
                <h2 className="text-base font-semibold text-ink">Déficiences ouvertes</h2>
              </div>

              {loading ? (
                <div className="py-6 text-center text-sm text-faint">Chargement...</div>
              ) : recentIssues.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  Aucune déficience ouverte
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {recentIssues.map((issue) => (
                    <div
                      key={issue.id}
                      onClick={() =>
                        navigate(`/app/projects/${issue.projectId}/issues/${issue.id}`)
                      }
                      className="px-4 py-2.5 hover:bg-subtle transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-medium text-ink line-clamp-1">
                          {issue.title}
                        </h3>
                        <PriorityBadge priority={issue.priority} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="truncate">{issue.projectName}</span>
                        <span className="text-faint ml-auto flex-shrink-0">
                          {formatDateShort(issue.createdDate)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-2 border-t border-line bg-canvas">
                <button
                  onClick={() => navigate("/app/issues")}
                  className="text-sm text-brand-600 font-medium hover:underline"
                >
                  Voir toutes les déficiences →
                </button>
              </div>
            </div>
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
