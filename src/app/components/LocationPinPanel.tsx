import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { X, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";
import type { Location } from "../../lib/locationsApi";
import { createIssue, getIssuesByLocation, type Issue } from "../../lib/issuesApi";

const PRIORITIES: { value: Issue["priority"]; label: string; dot: string }[] = [
  { value: "low", label: "Faible", dot: "bg-gray-500" },
  { value: "medium", label: "Moyenne", dot: "bg-blue-500" },
  { value: "high", label: "Élevée", dot: "bg-orange-500" },
  { value: "critical", label: "Critique", dot: "bg-red-600" },
];

const STATUS_LABEL: Record<Issue["status"], string> = {
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Résolue",
};

interface Props {
  open: boolean;
  projectId: string;
  location: Location | null;
  onClose: () => void;
}

// Shown when the user taps an existing pin on a plan: location metadata, a
// flat list of issues already attached to this location (title/status/date
// — deliberately not the interwoven timeline view, which stays deferred),
// and a minimal quick-create form (title/description/priority) that creates
// a new issue with issues.location_id set to this location.
export default function LocationPinPanel({ open, projectId, location, onClose }: Props) {
  useModalOpen(open);
  const navigate = useNavigate();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Issue["priority"]>("medium");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !location) return;
    setShowCreateForm(false);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setLoadingIssues(true);
    getIssuesByLocation(location.id)
      .then(setIssues)
      .finally(() => setLoadingIssues(false));
  }, [open, location]);

  if (!open || !location) return null;

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Le titre est requis.");
      return;
    }
    setCreating(true);
    try {
      const issue = await createIssue({
        visitId: "",
        projectId,
        title: title.trim(),
        description: description.trim(),
        priority,
        status: "open",
        photos: [],
        tags: [],
        location: location.name || location.locationNumber,
        locationId: location.id,
      });
      toast.success("Déficience créée");
      navigate(`/app/projects/${projectId}/issues/${issue.id}`);
    } catch (e: any) {
      toast.error("Création échouée : " + e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
              <MapPin size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-medium text-[#1A1A1A] truncate">
                {location.locationNumber}
                {location.name ? ` — ${location.name}` : ""}
              </div>
              {location.discipline && (
                <div className="text-xs text-gray-500 truncate">{location.discipline}</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-[#1A1A1A] rounded-lg flex-shrink-0"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <h4 className="text-sm font-medium text-[#1A1A1A] mb-2">
              Déficiences ({loadingIssues ? "…" : issues.length})
            </h4>
            {loadingIssues ? (
              <div className="text-sm text-gray-500">Chargement…</div>
            ) : issues.length === 0 ? (
              <div className="text-sm text-gray-500">Aucune déficience à ce local pour le moment.</div>
            ) : (
              <div className="space-y-1.5">
                {issues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => navigate(`/app/projects/${projectId}/issues/${issue.id}`)}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#E10600] hover:bg-gray-50 min-h-[44px]"
                  >
                    <div className="text-sm text-[#1A1A1A] font-medium truncate">{issue.title}</div>
                    <div className="text-xs text-gray-500">
                      {STATUS_LABEL[issue.status]} · {issue.createdDate}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-[#1A1A1A] hover:border-[#E10600] hover:text-[#E10600] min-h-[44px]"
            >
              <Plus size={16} />
              Créer une déficience
            </button>
          ) : (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <div>
                <label className="block text-sm text-[#1A1A1A] mb-2">Titre</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-[#1A1A1A] mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                />
              </div>
              <div>
                <label className="block text-sm text-[#1A1A1A] mb-2">Priorité</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={`py-2.5 px-3 rounded-lg border-2 transition-all flex items-center gap-2 justify-center ${
                        priority === p.value
                          ? "border-[#E10600] bg-[#E10600]/10"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${p.dot}`} />
                      <span className="text-sm">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 font-medium min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-50 font-medium min-h-[44px]"
                >
                  {creating ? "Création…" : "Créer"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
