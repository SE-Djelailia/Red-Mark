import { useState, useEffect, useCallback, useRef } from "react";
import { Search, AlertCircle, Clock, CheckCircle2, X, MapPin, Loader2, MessageSquare } from "lucide-react";
import { getAllUserIssues } from "../../lib/supabaseApi";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/useAuth";
import type { Issue } from "../../lib/supabase";
import { getCommentsForIssue, type Comment } from "../../lib/commentsApi";
import CommentThread from "./CommentThread";
import { useModalOpen } from "../../hooks/useModalOpen";

type IssueWithProject = Issue & { projectName: string };

export default function IssueManagement() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<IssueWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Issue["status"] | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Issue["priority"] | "all">("all");
  const [selectedIssue, setSelectedIssue] = useState<IssueWithProject | null>(null);
  useModalOpen(!!selectedIssue);
  const [issueComments, setIssueComments] = useState<Comment[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedIssue) {
      setIssueComments([]);
      return;
    }
    getCommentsForIssue(selectedIssue.id).then(setIssueComments);
  }, [selectedIssue]);

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
    in_progress: { label: "En cours", icon: Clock, color: "text-blue-600 bg-blue-50" },
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
        <div className="grid grid-cols-3 gap-3">
          {["open", "in_progress", "resolved"].map((s) => (
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
            <option value="in_progress">En cours</option>
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
            const loc = issue.location as any;
            const locText =
              loc?.label || (loc?.floor ? `${loc.floor}${loc.room ? ` · ${loc.room}` : ""}` : "");
            return (
              <div
                key={issue.id}
                onClick={() => setSelectedIssue(issue)}
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
                  {locText && (
                    <div className="flex items-center gap-1 text-gray-500">
                      <MapPin size={12} />
                      <span>{locText}</span>
                    </div>
                  )}
                  <span className="text-gray-400 ml-auto">
                    {new Date(issue.created_at).toLocaleDateString("fr-CA")}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedIssue &&
        (() => {
          const sc = statusConfig[selectedIssue.status] ?? statusConfig.open;
          const StatusIcon = sc.icon;
          const pc = priorityConfig[selectedIssue.priority] ?? priorityConfig.medium;
          const loc = selectedIssue.location as any;
          const locText =
            loc?.label || (loc?.floor ? `${loc.floor}${loc.room ? ` · ${loc.room}` : ""}` : "");
          return (
            <div
              className="fixed inset-0 bg-black/50 z-50 overflow-y-auto"
              onClick={() => setSelectedIssue(null)}
            >
              <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
                <div
                  className="bg-white rounded-xl max-w-2xl w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
                    <h2 className="text-xl font-medium text-[#1A1A1A]">Détails de la déficience</h2>
                    <button
                      onClick={() => setSelectedIssue(null)}
                      className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                    <div>
                      <h3 className="text-xl text-[#1A1A1A] mb-1">{selectedIssue.title}</h3>
                      <p className="text-sm text-gray-500">{selectedIssue.projectName}</p>
                    </div>

                    {selectedIssue.description && (
                      <div>
                        <h4 className="text-sm text-gray-500 mb-1">Description</h4>
                        <p className="text-[#1A1A1A]">{selectedIssue.description}</p>
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Statut</p>
                        <div
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ${sc.color}`}
                        >
                          <StatusIcon size={14} />
                          <span className="text-sm">{sc.label}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Priorité</p>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${pc.color}`} />
                          <span className="text-sm text-[#1A1A1A]">{pc.label}</span>
                        </div>
                      </div>
                      {locText && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Localisation</p>
                          <p className="text-sm text-[#1A1A1A]">{locText}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Créée le</p>
                        <p className="text-sm text-[#1A1A1A]">
                          {new Date(selectedIssue.created_at).toLocaleDateString("fr-CA")}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
                        <MessageSquare size={18} className="text-gray-500" />
                        Commentaires
                      </h4>
                      <CommentThread
                        comments={issueComments}
                        issueId={selectedIssue.id}
                        projectId={selectedIssue.project_id}
                        visitId={selectedIssue.visit_id || undefined}
                        issueCreatedBy={selectedIssue.user_id}
                        onCommentsUpdate={setIssueComments}
                      />
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t border-gray-200 bg-white rounded-b-xl">
                    <button
                      onClick={() => setSelectedIssue(null)}
                      className="w-full py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[48px]"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
