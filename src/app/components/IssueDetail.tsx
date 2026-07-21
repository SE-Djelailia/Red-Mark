import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
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
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-4 md:py-5">
        <div className="flex items-center justify-between">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white min-h-[44px]"
          >
            <ArrowLeft size={20} />
            <span>Retour</span>
          </button>
          {canEditIssue(projectRole, issue?.createdBy) && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
              title="Supprimer"
            >
              <Trash2 size={20} />
            </button>
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
