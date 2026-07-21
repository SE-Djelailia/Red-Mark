import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/useAuth";
import { getDashboardStats, type DashboardStats } from "../../lib/supabaseApi";
import { getAllUserIssues } from "../../lib/issuesApi";
import { supabase } from "../../lib/supabase";
import { formatDateShort } from "../../lib/dateUtils";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  AlertCircle,
  CheckCircle,
  TrendingUp,
  FolderKanban,
  Camera,
  FileText,
  Users,
  RefreshCw,
} from "lucide-react";

type RecentIssue = Awaited<ReturnType<typeof getAllUserIssues>>[number];

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(
    async (showSpinner = false) => {
      if (!user?.id) return;
      if (showSpinner) setRefreshing(true);
      try {
        const [statsData, issuesData] = await Promise.all([
          getDashboardStats(user.id),
          getAllUserIssues(user.id),
        ]);
        setStats(statsData);
        setRecentIssues(issuesData.slice(0, 5));
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-red-50 text-red-700";
      case "resolved":
        return "bg-green-50 text-green-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "open":
        return "Ouvert";
      case "resolved":
        return "Résolu";
      default:
        return status;
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

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl mb-2 font-medium">Tableau de bord</h1>
            <p className="text-sm text-gray-400">Vue d'ensemble de vos projets RedMark</p>
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

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Top Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div
            onClick={() => navigate("/app/projects")}
            className="bg-white rounded-xl p-4 border border-gray-200 cursor-pointer hover:border-[#E10600] hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <FolderKanban size={16} className="text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-[#1A1A1A]">
              {loading ? "—" : stats.totalProjects}
            </div>
            <div className="text-xs text-gray-500">Projets</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Camera size={16} className="text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-[#1A1A1A]">
              {loading ? "—" : stats.photosThisWeek}
            </div>
            <div className="text-xs text-gray-500">Photos cette semaine</div>
          </div>

          <div
            onClick={() => navigate("/app/issues")}
            className="bg-white rounded-xl p-4 border border-gray-200 cursor-pointer hover:border-[#E10600] hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <FileText size={16} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-[#1A1A1A]">
              {loading ? "—" : stats.openIssues}
            </div>
            <div className="text-xs text-gray-500">Déficiences ouvertes</div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <TrendingUp size={16} className="text-orange-600" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-[#1A1A1A]">
              {loading ? "—" : stats.totalVisits}
            </div>
            <div className="text-xs text-gray-500">Visites</div>
          </div>
        </div>

        {/* Issues Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1A1A1A] flex items-center gap-2">
              <AlertCircle size={20} className="text-[#E10600]" />
              Déficiences
            </h2>
            <span className="text-2xl font-semibold text-[#1A1A1A]">
              {loading ? "—" : stats.openIssues + stats.resolvedIssues}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={16} className="text-red-600" />
                <span className="text-xs text-red-600 font-medium">Ouvert</span>
              </div>
              <div className="text-xl font-semibold text-red-700">
                {loading ? "—" : stats.openIssues}
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-xs text-green-600 font-medium">Résolu</span>
              </div>
              <div className="text-xl font-semibold text-green-700">
                {loading ? "—" : stats.resolvedIssues}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Issues */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">Déficiences récentes</h2>
            <p className="text-xs text-gray-500 mt-1">Tous projets confondus</p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Chargement...</div>
          ) : recentIssues.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Aucune déficience pour le moment
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentIssues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => navigate(`/app/projects/${issue.projectId}/issues/${issue.id}`)}
                  className="p-5 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 pr-3">
                      <h3 className="text-sm font-medium text-[#1A1A1A] mb-1 line-clamp-1">
                        {issue.title}
                      </h3>
                      <p className="text-xs text-gray-500 mb-2">{issue.projectName}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(
                          issue.priority,
                        )}`}
                      >
                        {getPriorityLabel(issue.priority)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className={`px-2 py-0.5 rounded ${getStatusColor(issue.status)}`}>
                      {getStatusLabel(issue.status)}
                    </span>
                    <span className="text-gray-400 ml-auto">
                      {formatDateShort(issue.createdDate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => navigate("/app/issues")}
              className="text-sm text-[#E10600] font-medium hover:underline"
            >
              Voir toutes les déficiences →
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-[#1A1A1A] mb-4">Actions rapides</h2>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => navigate("/app/projects")}
              className="p-4 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex flex-col items-center gap-2"
            >
              <FolderKanban size={24} />
              <span className="text-sm font-medium">Voir mes projets</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
