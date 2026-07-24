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
  Search,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import FloatingActions from "./FloatingActions";

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-100 text-red-700 border-red-300";
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "critical":
        return "Critique";
      case "high":
        return "Élevé";
      case "medium":
        return "Moyen";
      default:
        return "Faible";
    }
  };

  const visibleActivity = activityExpanded ? activity : activity.slice(0, ACTIVITY_PREVIEW_COUNT);

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-start justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl md:text-2xl mb-1 font-medium">Tableau de bord</h1>
            <p className="text-xs md:text-sm text-gray-400">
              Vue d'ensemble de vos projets RedMark
            </p>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Actualiser"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:items-start">
          {/* Main column: quick actions, stats, activity */}
          <div className="lg:col-span-2 space-y-4">
            {/* Quick Actions — one prominent primary action, two secondary */}
            <div className="space-y-2">
              <button
                onClick={() => navigate("/app/new-visit")}
                className="w-full p-4 bg-[#E10600] text-white rounded-2xl hover:bg-[#C00500] active:scale-[0.99] transition-all flex items-center gap-3 shadow-md"
              >
                <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar size={20} />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold">Nouvelle visite</div>
                  <div className="text-xs text-white/80">Démarrer une visite de chantier</div>
                </div>
                <ChevronRight size={20} className="text-white/70" />
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate("/app/projects?new=1")}
                  className="p-3 bg-white rounded-xl border border-gray-200 hover:border-[#E10600] hover:shadow-md transition-all flex items-center gap-2 text-left"
                >
                  <div className="w-8 h-8 bg-[#E10600]/10 rounded-lg flex items-center justify-center text-[#E10600] flex-shrink-0">
                    <Plus size={16} />
                  </div>
                  <span className="text-sm font-medium text-[#1A1A1A]">Nouveau projet</span>
                </button>
                <button
                  onClick={() => navigate("/app/search")}
                  className="p-3 bg-white rounded-xl border border-gray-200 hover:border-[#E10600] hover:shadow-md transition-all flex items-center gap-2 text-left"
                >
                  <div className="w-8 h-8 bg-[#E10600]/10 rounded-lg flex items-center justify-center text-[#E10600] flex-shrink-0">
                    <Search size={16} />
                  </div>
                  <span className="text-sm font-medium text-[#1A1A1A]">Rechercher</span>
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                onClick={() => navigate("/app/projects")}
                className="bg-white rounded-xl p-3 border border-gray-200 cursor-pointer hover:border-[#E10600] hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FolderKanban size={14} className="text-blue-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-[#1A1A1A]">
                  {loading ? "—" : stats.totalProjects}
                </div>
                <div className="text-xs text-gray-500">Projets</div>
              </div>

              <div className="bg-white rounded-xl p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Camera size={14} className="text-purple-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-[#1A1A1A]">
                  {loading ? "—" : stats.photosThisWeek}
                </div>
                <div className="text-xs text-gray-500">Photos cette semaine</div>
              </div>

              <div
                onClick={() => navigate("/app/issues")}
                className="bg-white rounded-xl p-3 border border-gray-200 cursor-pointer hover:border-[#E10600] hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText size={14} className="text-green-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-[#1A1A1A]">
                  {loading ? "—" : stats.openIssues}
                </div>
                <div className="text-xs text-gray-500">Déficiences ouvertes</div>
              </div>

              <div className="bg-white rounded-xl p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
                    <TrendingUp size={14} className="text-orange-600" />
                  </div>
                </div>
                <div className="text-xl font-semibold text-[#1A1A1A]">
                  {loading ? "—" : stats.totalVisits}
                </div>
                <div className="text-xs text-gray-500">Visites</div>
              </div>
            </div>

            {/* Recent Activity — merges new issues, resolved issues, new visits
                across every project the user is a member of. Capped to 5 by
                default; "Voir tout" expands in place (data's already fetched). */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-2.5 border-b border-gray-200">
                <h2 className="text-base font-semibold text-[#1A1A1A]">Activité récente</h2>
              </div>

              {loading ? (
                <div className="py-6 text-center text-sm text-gray-400">Chargement...</div>
              ) : activity.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">
                  Aucune activité récente
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {visibleActivity.map((entry) => {
                    const Icon = ACTIVITY_ICON[entry.kind];
                    return (
                      <div
                        key={entry.id}
                        onClick={() => navigate(entry.linkPath)}
                        className="px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-3"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ACTIVITY_ICON_COLOR[entry.kind]}`}
                        >
                          <Icon size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#1A1A1A] truncate">
                            {entry.title}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {entry.projectName}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                          {formatRelativeDate(entry.timestamp)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activity.length > ACTIVITY_PREVIEW_COUNT && (
                <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                  <button
                    onClick={() => setActivityExpanded((v) => !v)}
                    className="text-sm text-[#E10600] font-medium hover:underline"
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
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-4 py-2.5 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Projets récents</h2>
                </div>
                {loading ? (
                  <div className="py-5 text-center text-sm text-gray-400">Chargement...</div>
                ) : recentProjects.length === 0 ? (
                  <div className="py-5 text-center text-sm text-gray-500">Aucun projet</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {recentProjects.map((project) => (
                      <div
                        key={project.id}
                        onClick={() => navigate(`/app/projects/${project.id}`)}
                        className="px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="text-sm font-medium text-[#1A1A1A] truncate">
                          {project.name}
                        </div>
                        {project.address && (
                          <div className="text-xs text-gray-500 truncate">{project.address}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-4 py-2.5 border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-[#1A1A1A]">Visites récentes</h2>
                </div>
                {loading ? (
                  <div className="py-5 text-center text-sm text-gray-400">Chargement...</div>
                ) : recentVisits.length === 0 ? (
                  <div className="py-5 text-center text-sm text-gray-500">Aucune visite</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {recentVisits.map((visit) => (
                      <div
                        key={visit.id}
                        onClick={() =>
                          navigate(`/app/projects/${visit.project_id}/visits/${visit.id}`)
                        }
                        className="px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <div className="text-sm font-medium text-[#1A1A1A] truncate">
                          {visit.projectName}
                          {visit.phase ? ` — ${visit.phase}` : ""}
                        </div>
                        <div className="text-xs text-gray-500">
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
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-2.5 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-[#1A1A1A]">Déficiences ouvertes</h2>
              </div>

              {loading ? (
                <div className="py-6 text-center text-sm text-gray-400">Chargement...</div>
              ) : recentIssues.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">
                  Aucune déficience ouverte
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recentIssues.map((issue) => (
                    <div
                      key={issue.id}
                      onClick={() =>
                        navigate(`/app/projects/${issue.projectId}/issues/${issue.id}`)
                      }
                      className="px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-medium text-[#1A1A1A] line-clamp-1">
                          {issue.title}
                        </h3>
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0 ${getPriorityColor(
                            issue.priority,
                          )}`}
                        >
                          {getPriorityLabel(issue.priority)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="truncate">{issue.projectName}</span>
                        <span className="text-gray-400 ml-auto flex-shrink-0">
                          {formatDateShort(issue.createdDate)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => navigate("/app/issues")}
                  className="text-sm text-[#E10600] font-medium hover:underline"
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
