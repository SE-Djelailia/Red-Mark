import { useEffect, useState } from "react";
import { AlertCircle, Calendar, User, MapPin, Tag, CheckCircle, Clock, MessageSquare, Camera, Edit } from "lucide-react";
import { getCommentsForIssue } from "../../lib/commentsApi";
import { getProjectTeammates, type Comment, type Teammate } from "../../lib/commentsApi";
import { getLocation, type Location } from "../../lib/locationsApi";
import type { Issue } from "../../lib/issuesApi";
import { useProjectRole, canEditIssue } from "../../hooks/useProjectRole";
import { useModalOpen } from "../../hooks/useModalOpen";
import CommentThread from "./CommentThread";
import SecureImage from "./SecureImage";
import IssueForm from "./IssueForm";

interface Props {
  issue: Issue;
  projectId: string;
  onIssueUpdated: (issue: Issue) => void;
  highlightCommentId?: string | null;
}

function getPriorityConfig(priority: string) {
  switch (priority) {
    case "critical":
      return { color: "bg-red-100 text-red-700 border-red-300", label: "Critique", icon: AlertCircle };
    case "high":
      return { color: "bg-orange-100 text-orange-700 border-orange-300", label: "Élevé", icon: AlertCircle };
    case "medium":
      return { color: "bg-yellow-100 text-yellow-700 border-yellow-300", label: "Moyen", icon: AlertCircle };
    default:
      return { color: "bg-gray-100 text-gray-700 border-gray-300", label: "Faible", icon: AlertCircle };
  }
}

function getStatusConfig(status: string) {
  switch (status) {
    case "open":
      return { color: "bg-red-50 text-red-700 border-red-200", label: "Ouvert", icon: AlertCircle };
    case "resolved":
      return { color: "bg-green-50 text-green-700 border-green-200", label: "Résolu", icon: CheckCircle };
    default:
      return { color: "bg-gray-50 text-gray-700 border-gray-200", label: status, icon: Clock };
  }
}

// Canonical read view for an issue (déficience) — used everywhere an issue
// is displayed (see Stage 3 of the consolidation plan). Pairs with
// IssueForm for the edit affordance.
export default function IssueView({ issue, projectId, onIssueUpdated, highlightCommentId }: Props) {
  const projectRole = useProjectRole(projectId);
  const [comments, setComments] = useState<Comment[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Issue["photos"][number] | null>(null);
  useModalOpen(!!selectedPhoto);
  const [location, setLocation] = useState<Location | null>(null);
  const [assigneeName, setAssigneeName] = useState<string | null>(null);

  useEffect(() => {
    getCommentsForIssue(issue.id).then(setComments);
  }, [issue.id]);

  useEffect(() => {
    if (!issue.locationId) {
      setLocation(null);
      return;
    }
    getLocation(issue.locationId)
      .then(setLocation)
      .catch((e) => console.error("Error loading linked location:", e));
  }, [issue.locationId]);

  useEffect(() => {
    if (!issue.assignedToUserId) {
      setAssigneeName(null);
      return;
    }
    getProjectTeammates(projectId).then((teammates: Teammate[]) => {
      const match = teammates.find((t) => t.id === issue.assignedToUserId);
      setAssigneeName(match ? match.name || match.email : null);
    });
  }, [issue.assignedToUserId, projectId]);

  const priorityConfig = getPriorityConfig(issue.priority);
  const statusConfig = getStatusConfig(issue.status);
  const PriorityIcon = priorityConfig.icon;
  const StatusIcon = statusConfig.icon;

  const assigneeDisplay = issue.assignedToUserId
    ? assigneeName || "Membre du projet"
    : issue.assignedToName || issue.assignedTo || null;

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <IssueForm
          projectId={projectId}
          visitId={issue.visitId}
          locationId={issue.locationId}
          issue={issue}
          onSaved={(updated) => {
            onIssueUpdated(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-lg font-semibold text-[#1A1A1A]">{issue.title}</h1>
          {canEditIssue(projectRole, issue.createdBy) && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-[#1A1A1A] min-h-[40px] flex-shrink-0"
            >
              <Edit size={14} />
              Modifier
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${priorityConfig.color}`}
          >
            <PriorityIcon size={12} />
            {priorityConfig.label}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${statusConfig.color}`}
          >
            <StatusIcon size={12} />
            {statusConfig.label}
          </span>
          {issue.discipline && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 text-xs font-medium text-gray-600">
              {issue.discipline}
            </span>
          )}
        </div>

        {issue.description && <p className="text-sm text-gray-600 mb-4">{issue.description}</p>}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar size={14} className="text-gray-400 flex-shrink-0" />
            Créée le {issue.createdDate}
          </div>
          {issue.dueDate && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar size={14} className="text-gray-400 flex-shrink-0" />
              Échéance : {issue.dueDate}
            </div>
          )}
          {assigneeDisplay && (
            <div className="flex items-center gap-2 text-gray-600">
              <User size={14} className="text-gray-400 flex-shrink-0" />
              Assigné à {assigneeDisplay}
            </div>
          )}
          {location && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin size={14} className="text-gray-400 flex-shrink-0" />
              {location.locationNumber}
              {location.name ? ` — ${location.name}` : ""}
            </div>
          )}
          {issue.tags.length > 0 && (
            <div className="flex items-start gap-2 text-gray-600">
              <Tag size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1.5">
                {issue.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photos */}
      {issue.photos.length > 0 && (
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
                onClick={() => setSelectedPhoto(photo)}
              >
                <SecureImage
                  storagePath={photo.storagePath}
                  alt="Photo de la déficience"
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
          issueId={issue.id}
          projectId={projectId}
          visitId={issue.visitId}
          issueCreatedBy={issue.createdBy}
          onCommentsUpdate={setComments}
          highlightCommentId={highlightCommentId}
        />
      </div>

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors z-10"
            >
              ✕
            </button>
            <SecureImage
              storagePath={selectedPhoto.storagePath}
              alt="Photo de la déficience"
              className="w-full h-auto rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
