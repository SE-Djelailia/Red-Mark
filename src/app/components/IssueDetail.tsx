import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Trash2, X } from "lucide-react";
import { getIssue, deleteIssue, getIssueErrorMessage, type Issue } from "../../lib/issuesApi";
import { useProjectRole, canEditIssue } from "../../hooks/useProjectRole";
import { useSmartBack } from "../../hooks/useSmartBack";
import ConfirmDialog from "./ConfirmDialog";
import IssueView from "./IssueView";

// Host for the canonical IssueView — owns the route, the fetch/loading/error
// state, the back button, and delete (the one action IssueView doesn't
// have). Field editing, the comment thread, and photos are all IssueView's
// responsibility now (see IssueForm.tsx / IssueView.tsx, Stage 2 of the
// issue consolidation).
export default function IssueDetail() {
  const navigate = useNavigate();
  const { projectId, visitId, issueId } = useParams();
  const goBack = useSmartBack(
    visitId ? `/app/projects/${projectId}/visits/${visitId}` : `/app/projects/${projectId}`,
  );
  const [searchParams] = useSearchParams();
  const highlightCommentId = searchParams.get("commentId");
  const projectRole = useProjectRole(projectId);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingIssue(true);
    setLoadError(null);

    getIssue(issueId || "")
      .then((loadedIssue) => {
        if (cancelled) return;
        if (loadedIssue) {
          setIssue(loadedIssue);
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

  const handleDeleteIssue = async () => {
    setShowDeleteConfirm(false);
    if (!issueId) return;

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
    <div className="min-h-screen pb-20 bg-canvas">
      {/* Toolbar — the dark band is gone; back/delete now sit on the canvas
          directly under the global light header. */}
      <div className="px-4 sm:px-6 pt-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
          >
            <ArrowLeft size={20} />
            <span>Retour</span>
          </button>
          {canEditIssue(projectRole, issue?.createdBy) && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-10 h-10 flex items-center justify-center text-muted hover:text-brand-600 hover:bg-subtle rounded-[4px] transition-colors"
              title="Supprimer"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-5 max-w-2xl mx-auto space-y-6">
        {isLoadingIssue && (
          <div className="bg-surface rounded-[4px] border border-line p-4 text-sm text-muted text-center">
            Chargement de la déficience...
          </div>
        )}

        {loadError && (
          <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-4 text-sm text-brand-strong">
            {loadError}
          </div>
        )}

        {saveError && (
          <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-4 text-sm text-brand-strong flex items-center justify-between gap-3">
            <span>{saveError}</span>
            <button
              onClick={() => setSaveError(null)}
              aria-label="Masquer l'erreur"
              className="text-brand-strong hover:text-brand-800 font-medium flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {issue && (
          <IssueView
            issue={issue}
            projectId={projectId || ""}
            onIssueUpdated={setIssue}
            highlightCommentId={highlightCommentId}
          />
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Supprimer cette déficience ?"
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteIssue}
      />
    </div>
  );
}
