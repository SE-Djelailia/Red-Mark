import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Calendar,
  User,
  MapPin,
  Tag,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  Camera,
  Edit,
  Trash2,
} from "lucide-react";
import {
  getIssue,
  updateIssue,
  deleteIssue,
  getIssueErrorMessage,
  type Issue,
} from "../../lib/issuesApi";
import { getCommentsForIssue } from "../../lib/commentsApi";
import { parseLocalDate, formatDateLongWithWeekday, formatDateForInput } from "../../lib/dateUtils";
import CommentThread from "./CommentThread";
import type { Comment } from "../../lib/commentsApi";
import { useProjectRole, canEditIssue } from "../../hooks/useProjectRole";

export default function IssueDetail() {
  const navigate = useNavigate();
  const { projectId, visitId, issueId } = useParams();
  const [searchParams] = useSearchParams();
  const highlightCommentId = searchParams.get("commentId");
  const projectRole = useProjectRole(projectId);

  const [comments, setComments] = useState<Comment[]>([]);

  // Issue data and editable state
  const [issue, setIssue] = useState<Issue | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingAssignedTo, setIsEditingAssignedTo] = useState(false);
  const [editedLocation, setEditedLocation] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedAssignedTo, setEditedAssignedTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoadingIssue(true);
    setLoadError(null);

    getIssue(issueId || "")
      .then((loadedIssue) => {
        if (cancelled) return;
        if (loadedIssue) {
          setIssue(loadedIssue);
          setEditedLocation(loadedIssue.location);
          setEditedDate(loadedIssue.createdDate);
          setEditedDescription(loadedIssue.description);
          setEditedAssignedTo(loadedIssue.assignedTo);
        } else {
          setLoadError("Déficience introuvable.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error loading issue:", err);
        setLoadError("Impossible de charger la déficience.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingIssue(false);
      });

    return () => {
      cancelled = true;
    };
  }, [issueId]);

  useEffect(() => {
    getCommentsForIssue(issueId || "").then(setComments);
  }, [issueId]);

  // Empty issue data - will be populated from backend
  const defaultIssue: Issue = {
    id: issueId || "1",
    visitId: visitId || "",
    projectId: "1",
    title: "Chargement...",
    description: "",
    priority: "medium",
    status: "open",
    assignedTo: "",
    createdBy: "",
    photos: [],
    location: "",
    createdDate: new Date().toISOString().split("T")[0],
    tags: [],
  };

  const project = {
    id: projectId,
    name: "CHUM - Centre hospitalier de l'Université de Montréal",
  };

  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case "critical":
        return {
          color: "bg-red-100 text-red-700 border-red-300",
          label: "Critique",
          icon: AlertCircle,
        };
      case "high":
        return {
          color: "bg-orange-100 text-orange-700 border-orange-300",
          label: "Élevé",
          icon: AlertCircle,
        };
      case "medium":
        return {
          color: "bg-yellow-100 text-yellow-700 border-yellow-300",
          label: "Moyen",
          icon: AlertCircle,
        };
      default:
        return {
          color: "bg-gray-100 text-gray-700 border-gray-300",
          label: "Faible",
          icon: AlertCircle,
        };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "open":
        return {
          color: "bg-red-50 text-red-700 border-red-200",
          label: "Ouvert",
          icon: AlertCircle,
        };
      case "in_progress":
        return {
          color: "bg-blue-50 text-blue-700 border-blue-200",
          label: "En cours",
          icon: Clock,
        };
      case "resolved":
        return {
          color: "bg-green-50 text-green-700 border-green-200",
          label: "Résolu",
          icon: CheckCircle,
        };
      default:
        return {
          color: "bg-gray-50 text-gray-700 border-gray-200",
          label: status,
          icon: AlertCircle,
        };
    }
  };

  const priorityConfig = getPriorityConfig(issue?.priority || "medium");
  const statusConfig = getStatusConfig(issue?.status || "open");
  const PriorityIcon = priorityConfig.icon;
  const StatusIcon = statusConfig.icon;

  // Applies a successful updateIssue() result, or surfaces a message if the
  // issue no longer exists (e.g. deleted by someone else since page load —
  // distinct from a permission error, which updateIssue throws instead).
  const applyIssueUpdate = (updated: Issue | null): boolean => {
    if (!updated) {
      setSaveError("Cette déficience n'existe plus.");
      return false;
    }
    setIssue(updated);
    return true;
  };

  const handleSaveLocation = async () => {
    if (!issue || !issueId) return;
    setSaveError(null);
    try {
      const updated = await updateIssue(issueId, { location: editedLocation });
      if (applyIssueUpdate(updated)) setIsEditingLocation(false);
    } catch (err) {
      console.error("Error saving location:", err);
      setSaveError(getIssueErrorMessage(err, "Impossible de sauvegarder l'emplacement. Réessayez."));
    }
  };

  const handleSaveDate = async () => {
    if (!issue || !issueId) return;
    setSaveError(null);
    try {
      const updated = await updateIssue(issueId, { createdDate: editedDate });
      if (applyIssueUpdate(updated)) setIsEditingDate(false);
    } catch (err) {
      console.error("Error saving date:", err);
      setSaveError(getIssueErrorMessage(err, "Impossible de sauvegarder la date. Réessayez."));
    }
  };

  const handleSaveDescription = async () => {
    if (!issue || !issueId) return;
    setSaveError(null);
    try {
      const updated = await updateIssue(issueId, { description: editedDescription });
      if (applyIssueUpdate(updated)) setIsEditingDescription(false);
    } catch (err) {
      console.error("Error saving description:", err);
      setSaveError(
        getIssueErrorMessage(err, "Impossible de sauvegarder la description. Réessayez."),
      );
    }
  };

  const handleSaveAssignedTo = async () => {
    if (!issue || !issueId) return;
    setSaveError(null);
    try {
      const updated = await updateIssue(issueId, { assignedTo: editedAssignedTo });
      if (applyIssueUpdate(updated)) setIsEditingAssignedTo(false);
    } catch (err) {
      console.error("Error saving assignedTo:", err);
      setSaveError(
        getIssueErrorMessage(err, "Impossible de sauvegarder l'assignation. Réessayez."),
      );
    }
  };

  const handleStatusChange = async (newStatus: Issue["status"]) => {
    if (!issue || !issueId) return;
    setSaveError(null);
    try {
      const updated = await updateIssue(issueId, { status: newStatus });
      applyIssueUpdate(updated);
    } catch (err) {
      console.error("Error changing status:", err);
      setSaveError(getIssueErrorMessage(err, "Impossible de changer le statut. Réessayez."));
    }
  };

  const handleDeleteIssue = async () => {
    if (!issueId || !confirm("Supprimer cette déficience?")) return;

    setSaveError(null);
    try {
      await deleteIssue(issueId);
      if (visitId) {
        navigate(`/app/projects/${projectId}/visits/${visitId}`);
      } else {
        navigate(`/app/projects/${projectId}`);
      }
    } catch (err) {
      console.error("Error deleting issue:", err);
      setSaveError(getIssueErrorMessage(err, "Impossible de supprimer la déficience. Réessayez."));
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <button
          onClick={() => {
            // If we have a visitId, navigate back to the visit detail, otherwise to the project
            if (visitId) {
              navigate(`/app/projects/${projectId}/visits/${visitId}`);
            } else {
              navigate(`/app/projects/${projectId}`);
            }
          }}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 min-h-[44px]"
        >
          <ArrowLeft size={20} />
          <span>{visitId ? "Retour à la visite" : "Retour au projet"}</span>
        </button>

        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-sm text-gray-400 mb-2">{project.name}</p>
            <h1 className="text-xl md:text-2xl mb-3">{issue?.title || defaultIssue.title}</h1>

            {/* Status and Priority Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${statusConfig.color}`}
              >
                <StatusIcon size={16} />
                <span className="text-sm font-medium">{statusConfig.label}</span>
              </div>
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${priorityConfig.color}`}
              >
                <PriorityIcon size={16} />
                <span className="text-sm font-medium">{priorityConfig.label}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {canEditIssue(projectRole, issue?.createdBy) && (
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => navigate(`/app/projects/${projectId}/issues/${issueId}/edit`)}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                title="Modifier"
              >
                <Edit size={20} />
              </button>
              <button
                onClick={handleDeleteIssue}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                title="Supprimer"
              >
                <Trash2 size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {isLoadingIssue && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-500 text-center">
            Chargement de la déficience...
          </div>
        )}

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{saveError}</span>
            <button
              onClick={() => setSaveError(null)}
              className="text-red-700 hover:text-red-900 font-medium flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Meta Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <User size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Assigné à</div>
              {isEditingAssignedTo ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editedAssignedTo}
                    onChange={(e) => setEditedAssignedTo(e.target.value)}
                    placeholder="Nom de la personne assignée"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent text-sm"
                  />
                  <button
                    onClick={handleSaveAssignedTo}
                    className="px-3 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium text-xs"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingAssignedTo(false);
                      setEditedAssignedTo(issue?.assignedTo || "");
                    }}
                    className="px-3 py-2 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-[#1A1A1A] font-medium">
                    {issue?.assignedTo || defaultIssue.assignedTo}
                  </div>
                  {canEditIssue(projectRole, issue?.createdBy) && (
                    <button
                      onClick={() => setIsEditingAssignedTo(true)}
                      className="p-2 text-gray-400 hover:text-[#E10600] transition-colors"
                      title="Modifier"
                    >
                      <Edit size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Date de création</div>
              {isEditingDate ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editedDate}
                    onChange={(e) => setEditedDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent text-sm"
                  />
                  <button
                    onClick={handleSaveDate}
                    className="px-3 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium text-xs"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingDate(false);
                      setEditedDate(issue?.createdDate || "");
                    }}
                    className="px-3 py-2 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-[#1A1A1A] font-medium">
                    {formatDateLongWithWeekday(
                      parseLocalDate(issue?.createdDate || defaultIssue.createdDate),
                    )}
                  </div>
                  {canEditIssue(projectRole, issue?.createdBy) && (
                    <button
                      onClick={() => setIsEditingDate(true)}
                      className="p-2 text-gray-400 hover:text-[#E10600] transition-colors"
                      title="Modifier"
                    >
                      <Edit size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Emplacement</div>
              {isEditingLocation ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editedLocation}
                    onChange={(e) => setEditedLocation(e.target.value)}
                    placeholder="Ex: Sous-sol, Zone A"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent text-sm"
                  />
                  <button
                    onClick={handleSaveLocation}
                    className="px-3 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium text-xs"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingLocation(false);
                      setEditedLocation(issue?.location || "");
                    }}
                    className="px-3 py-2 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-[#1A1A1A] font-medium">
                    {issue?.location || defaultIssue.location}
                  </div>
                  {canEditIssue(projectRole, issue?.createdBy) && (
                    <button
                      onClick={() => setIsEditingLocation(true)}
                      className="p-2 text-gray-400 hover:text-[#E10600] transition-colors"
                      title="Modifier"
                    >
                      <Edit size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {issue?.tags && issue.tags.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-2">Catégories</div>
                <div className="flex flex-wrap gap-2">
                  {issue.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <AlertCircle size={18} className="text-gray-500" />
              Description
            </h2>
            {!isEditingDescription && canEditIssue(projectRole, issue?.createdBy) && (
              <button
                onClick={() => setIsEditingDescription(true)}
                className="p-2 text-gray-400 hover:text-[#E10600] transition-colors"
                title="Modifier"
              >
                <Edit size={16} />
              </button>
            )}
          </div>
          {isEditingDescription ? (
            <div className="space-y-2">
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Ajouter une description..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveDescription}
                  className="px-4 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium text-sm"
                >
                  Sauvegarder
                </button>
                <button
                  onClick={() => {
                    setIsEditingDescription(false);
                    setEditedDescription(issue?.description || "");
                  }}
                  className="px-4 py-2 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">
              {issue?.description || defaultIssue.description}
            </p>
          )}
        </div>

        {/* Photos */}
        {issue?.photos && issue.photos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
              <Camera size={18} className="text-gray-500" />
              Photos ({issue.photos.length})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {issue.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-gray-200"
                  onClick={() => {
                    // Open photo lightbox
                    console.log("Open photo:", photo.id);
                  }}
                >
                  <img
                    src={photo.url}
                    alt="Issue photo"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-sm font-medium">Voir</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <MessageSquare size={18} className="text-gray-500" />
              Commentaires ({comments.length})
            </h2>
          </div>

          <CommentThread
            comments={comments}
            issueId={issueId || ""}
            projectId={projectId || ""}
            visitId={visitId}
            issueCreatedBy={issue?.createdBy}
            onCommentsUpdate={setComments}
            highlightCommentId={highlightCommentId}
          />
        </div>

        {/* Change Status */}
        {canEditIssue(projectRole, issue?.createdBy) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Changer le statut</h2>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleStatusChange("open")}
              className={`py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 min-h-[48px] ${
                issue?.status === "open"
                  ? "border-red-500 bg-red-50"
                  : "border-gray-200 hover:border-red-300"
              }`}
            >
              <AlertCircle
                size={20}
                className={issue?.status === "open" ? "text-red-600" : "text-gray-600"}
              />
              <span className="text-xs font-medium">Ouvert</span>
            </button>

            <button
              onClick={() => handleStatusChange("in_progress")}
              className={`py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 min-h-[48px] ${
                issue?.status === "in_progress"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <Clock
                size={20}
                className={issue?.status === "in_progress" ? "text-blue-600" : "text-gray-600"}
              />
              <span className="text-xs font-medium">En cours</span>
            </button>

            <button
              onClick={() => handleStatusChange("resolved")}
              className={`py-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2 min-h-[48px] ${
                issue?.status === "resolved"
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 hover:border-green-300"
              }`}
            >
              <CheckCircle
                size={20}
                className={issue?.status === "resolved" ? "text-green-600" : "text-gray-600"}
              />
              <span className="text-xs font-medium">Résolu</span>
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
