import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { Search, AlertCircle, Loader2, MapPin } from "lucide-react";
import { getAllUserIssues, type Issue } from "../../lib/issuesApi";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/useAuth";
import { parseLocalDate } from "../../lib/dateUtils";
import { PriorityBadge, StatusBadge, PRIORITY_LABEL, STATUS_LABEL } from "./ui-kit/Badge";
import { StatGrid, StatTile } from "./ui-kit/StatTile";
import { inputClassName } from "./ui-kit/Input";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { ISSUE_STATUS_OPTIONS, TERMINAL_ISSUE_STATUS } from "../../lib/issueStatus";

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

  // "À traiter" spans the three non-verified states, not a single one:
  // counting only "Signalé" would hide everything already in progress.
  const verifiedCount = issues.filter((i) => i.status === TERMINAL_ISSUE_STATUS).length;
  const outstandingCount = issues.length - verifiedCount;

  usePageHeader("Déficiences", "Toutes vos déficiences, tous projets confondus");

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      <div className="px-4 sm:px-6 py-5 max-w-2xl mx-auto space-y-5">
        <StatGrid className="grid-cols-2">
          <StatTile label="À traiter" value={outstandingCount} emphasis />
          <StatTile label={STATUS_LABEL.verifie} value={verifiedCount} />
        </StatGrid>

        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par titre, description, projet..."
              className={`${inputClassName} pl-10`}
            />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Issue["status"] | "all")}
              className="h-10 px-3 bg-subtle border border-line-strong rounded-[4px] text-sm text-ink focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
            >
              <option value="all">Tous les états</option>
              {ISSUE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as Issue["priority"] | "all")}
              className="h-10 px-3 bg-subtle border border-line-strong rounded-[4px] text-sm text-ink focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
            >
              <option value="all">Toutes les priorités</option>
              <option value="critical">{PRIORITY_LABEL.critical}</option>
              <option value="high">{PRIORITY_LABEL.high}</option>
              <option value="medium">{PRIORITY_LABEL.medium}</option>
              <option value="low">{PRIORITY_LABEL.low}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-6 space-y-3 max-w-2xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted">
            <Loader2 size={24} className="animate-spin" />
            <span>Chargement des déficiences...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-brand-100 mb-4" />
            <p className="text-brand-strong">{error}</p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-faint mb-4" />
            <p className="text-body">Aucune déficience trouvée</p>
          </div>
        ) : (
          filteredIssues.map((issue) => {
            return (
              <div
                key={issue.id}
                onClick={() => navigate(`/app/projects/${issue.projectId}/issues/${issue.id}`)}
                // Leading rule on hover rather than a full red outline: hovering a
                // list of deficiencies should not repaint the whole card edge.
                className="bg-surface rounded-[4px] border border-line border-l-2 border-l-transparent hover:border-l-brand-600 hover:bg-subtle/40 p-4 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="text-base font-medium text-ink mb-1">{issue.title}</h3>
                    <p className="text-sm text-muted">{issue.projectName}</p>
                  </div>
                  <div className="flex-shrink-0 ml-2">
                    <PriorityBadge priority={issue.priority} />
                  </div>
                </div>

                {issue.description && (
                  <p className="text-sm text-body mb-3 line-clamp-2">{issue.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <StatusBadge status={issue.status} />
                  {issue.discipline && (
                    <div className="flex items-center gap-1 text-muted">
                      <MapPin size={12} />
                      <span>{issue.discipline}</span>
                    </div>
                  )}
                  <span className="text-faint ml-auto">
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
