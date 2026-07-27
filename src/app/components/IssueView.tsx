import { useEffect, useState } from "react";
import { Calendar, User, MapPin, Tag, MessageSquare, Camera, Edit, Pencil } from "lucide-react";
import { toast } from "sonner";
import { getCommentsForIssue } from "../../lib/commentsApi";
import { getProjectTeammates, type Comment, type Teammate } from "../../lib/commentsApi";
import { getLocation, type Location } from "../../lib/locationsApi";
import type { Issue } from "../../lib/issuesApi";
import { saveAnnotatedPhoto } from "../../lib/supabaseApi";
import { getRlsErrorMessage } from "../../lib/rlsErrors";
import { useProjectRole, canEditIssue } from "../../hooks/useProjectRole";
import { useAuth } from "../../contexts/useAuth";
import { useModalOpen } from "../../hooks/useModalOpen";
import CommentThread from "./CommentThread";
import SecureImage from "./SecureImage";
import IssueForm from "./IssueForm";
import { PhotoAnnotator } from "./PhotoAnnotator";
import { PriorityBadge, StatusBadge } from "./ui-kit/Badge";

interface Props {
  issue: Issue;
  projectId: string;
  onIssueUpdated: (issue: Issue) => void;
  highlightCommentId?: string | null;
}

// Canonical read view for an issue (déficience) — used everywhere an issue
// is displayed (see Stage 3 of the consolidation plan). Pairs with
// IssueForm for the edit affordance.
export default function IssueView({ issue, projectId, onIssueUpdated, highlightCommentId }: Props) {
  const projectRole = useProjectRole(projectId);
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Issue["photos"][number] | null>(null);
  const [showAnnotator, setShowAnnotator] = useState(false);
  useModalOpen(!!selectedPhoto);

  // Annotation is gated the same way the "Modifier" button above is, so the
  // action set stays consistent within this screen. This is stricter than
  // the storage/RLS policy allows (an editor may annotate a teammate's
  // photo) — deliberately: RLS is the security floor, this is the product
  // decision about who is offered the action.
  const canAnnotate = canEditIssue(projectRole, issue.createdBy);

  const handleSaveAnnotation = async (photoId: string, annotatedImageBlob: Blob) => {
    const target = issue.photos.find((p) => p.id === photoId);
    if (!user?.id || !target) {
      toast.error("Photo introuvable");
      return;
    }
    try {
      const updated = await saveAnnotatedPhoto(
        { id: target.id, storage_path: target.storagePath },
        annotatedImageBlob,
        user.id,
        projectId,
        target.visitId,
      );
      // Push the new path up so IssueDetail re-renders. SecureImage's
      // usePhotoUrl keys its effect on storagePath, so the changed path
      // re-resolves the signed URL on its own — no cache-busting needed.
      onIssueUpdated({
        ...issue,
        photos: issue.photos.map((p) =>
          p.id === photoId ? { ...p, storagePath: updated.storage_path, url: updated.file_url } : p,
        ),
      });
      setSelectedPhoto(null);
      toast.success("Annotations sauvegardées");
    } catch (error) {
      console.error("Error saving annotation:", error);
      toast.error(
        getRlsErrorMessage(
          error,
          "Erreur lors de l'enregistrement de l'annotation",
          "Seul l'auteur de la photo peut enregistrer une annotation pour le moment.",
        ),
      );
    }
  };
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
  const assigneeDisplay = issue.assignedToUserId
    ? assigneeName || "Membre du projet"
    : issue.assignedToName || issue.assignedTo || null;

  if (editing) {
    return (
      <div className="bg-surface rounded-xl border border-line p-5">
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
      <div className="bg-surface rounded-xl border border-line p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-lg font-semibold text-ink">{issue.title}</h1>
          {canEditIssue(projectRole, issue.createdBy) && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-subtle hover:bg-line rounded-lg text-sm font-medium text-ink min-h-[40px] flex-shrink-0"
            >
              <Edit size={14} />
              Modifier
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <PriorityBadge priority={issue.priority} />
          <StatusBadge status={issue.status} />
          {issue.discipline && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line text-xs font-medium text-muted">
              {issue.discipline}
            </span>
          )}
        </div>

        {issue.description && <p className="text-sm text-body mb-4">{issue.description}</p>}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-body">
            <Calendar size={14} className="text-faint flex-shrink-0" />
            Créée le {issue.createdDate}
          </div>
          {issue.dueDate && (
            <div className="flex items-center gap-2 text-body">
              <Calendar size={14} className="text-faint flex-shrink-0" />
              Échéance : {issue.dueDate}
            </div>
          )}
          {assigneeDisplay && (
            <div className="flex items-center gap-2 text-body">
              <User size={14} className="text-faint flex-shrink-0" />
              Assigné à {assigneeDisplay}
            </div>
          )}
          {location && (
            <div className="flex items-center gap-2 text-body">
              <MapPin size={14} className="text-faint flex-shrink-0" />
              {location.locationNumber}
              {location.name ? ` — ${location.name}` : ""}
            </div>
          )}
          {issue.tags.length > 0 && (
            <div className="flex items-start gap-2 text-body">
              <Tag size={14} className="text-faint flex-shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1.5">
                {issue.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-subtle rounded-full text-xs">
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
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <Camera size={18} className="text-muted" />
            Photos ({issue.photos.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {issue.photos.map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-subtle"
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
      <div className="bg-surface rounded-xl border border-line p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <MessageSquare size={18} className="text-muted" />
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
            {canAnnotate && (
              <div className="mt-3 flex" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setShowAnnotator(true)}
                  className="flex-1 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 active:bg-brand-800 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Pencil size={18} />
                  <span>Annoter</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Photo annotation — same canonical annotator and non-destructive
          save path the visit and project screens use. */}
      {showAnnotator && selectedPhoto && (
        <PhotoAnnotator
          photo={{ id: selectedPhoto.id, storage_path: selectedPhoto.storagePath }}
          onClose={() => setShowAnnotator(false)}
          onSave={handleSaveAnnotation}
        />
      )}
    </div>
  );
}
