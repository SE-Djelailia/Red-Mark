import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { Search, AlertCircle, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { getAllUserIssues, type Issue } from "../../lib/issuesApi";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/useAuth";
import { parseLocalDate } from "../../lib/dateUtils";

type IssueWithProject = Issue & { projectName: string };

// Cross-project issue list. Clicking a row navigates to the real
// IssueDetail route (which hosts the canonical IssueView, with its own
// edit → IssueForm affordance) rather than a separate read-only modal —
// same page every other surface uses, so view/edit stays fully consistent
// without duplicating IssueView-hosting logic here.
export default function IssueManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [issues, setIssues] = useState<IssueWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Issue["status"] | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Issue["priority"] | "all">("all");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadIssues = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getAllUserIssues(user.id);
      setIssues(data);
      setError(null);
    } catch {
      setError("Impossible de charger les déficiences.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Chargement initial + rechargement quand l'onglet redevient visible
  useEffect(() => {
    loadIssues();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadIssues();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadIssues]);

  // Mise à jour automatique en temps réel sur la table issues
  useEffect(() => {
    if (!user?.id) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => loadIssues(), 600);
    };
    const channel = supabase
      .channel("issues-management-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadIssues]);

  const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
    open: { label: "Ouvert", icon: AlertCircle, color: "text-red-600 bg-red-50" },
    resolved: { label: "Résolu", icon: CheckCircle2, color: "text-green-600 bg-green-50" },
  };

  const priorityConfig: Record<string, { label: string; color: string }> = {
    low: { label: "Faible", color: "bg-gray-500" },
    medium: { label: "Moyenne", color: "bg-blue-500" },
    high: { label: "Élevée", color: "bg-orange-500" },
    critical: { label: "Critique", color: "bg-red-600" },
  };

  const filteredIssues = issues.filter((issue) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      issue.title.toLowerCase().includes(q) ||
      (issue.description ?? "").toLowerCase().includes(q) ||
      issue.projectName.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || issue.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const countByStatus = (status: string) => issues.filter((i) => i.status === status).length;

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <h1 className="text-2xl md:text-3xl mb-4">Déficiences</h1>
        <div className="grid grid-cols-2 gap-3">
          {["open", "resolved"].map((s) => (
            <div key={s} className="bg-white/10 rounded-lg p-3">
              <div className="text-2xl font-bold">{countByStatus(s)}</div>
              <div className="text-xs text-gray-400">{statusConfig[s]?.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 bg-white border-b border-gray-200 space-y-3">
        <div className="relative max-w-2xl mx-auto">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par titre, description, projet..."
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
          />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 max-w-2xl mx-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Issue["status"] | "all")}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
          >
            <option value="all">Tous les statuts</option>
            <option value="open">Ouvert</option>
            <option value="resolved">Résolu</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Issue["priority"] | "all")}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
          >
            <option value="all">Toutes les priorités</option>
            <option value="critical">Critique</option>
            <option value="high">Élevée</option>
            <option value="medium">Moyenne</option>
            <option value="low">Faible</option>
          </select>
        </div>
      </div>

      <div className="px-4 py-6 space-y-3 max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
            <Loader2 size={24} className="animate-spin" />
            <span>Chargement des déficiences...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-red-300 mb-4" />
            <p className="text-red-600">{error}</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600">Aucune déficience trouvée</p>
          </div>
        ) : (
          filteredIssues.map((issue) => {
            const sc = statusConfig[issue.status] ?? statusConfig.open;
            const StatusIcon = sc.icon;
            const pc = priorityConfig[issue.priority] ?? priorityConfig.medium;
            return (
              <div
                key={issue.id}
                onClick={() => navigate(`/app/projects/${issue.projectId}/issues/${issue.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-[#E10600] hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="text-base font-medium text-[#1A1A1A] mb-1">{issue.title}</h3>
                    <p className="text-sm text-gray-500">{issue.projectName}</p>
                  </div>
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ml-2 mt-1 ${pc.color}`}
                    title={pc.label}
                  />
                </div>

                {issue.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{issue.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${sc.color}`}>
                    <StatusIcon size={12} />
                    <span>{sc.label}</span>
                  </div>
                  {issue.discipline && (
                    <div className="flex items-center gap-1 text-gray-500">
                      <MapPin size={12} />
                      <span>{issue.discipline}</span>
                    </div>
                  )}
                  <span className="text-gray-400 ml-auto">
                    {parseLocalDate(issue.createdDate).toLocaleDateString("fr-CA")}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
