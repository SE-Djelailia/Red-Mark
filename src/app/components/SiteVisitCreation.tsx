import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useProjectRole } from "../../hooks/useProjectRole";
import { useSmartBack } from "../../hooks/useSmartBack";
import VisitForm from "./VisitForm";
import { usePageHeader } from "../../contexts/PageHeaderContext";

// Thin host for the canonical VisitForm — owns the route, the header/back
// button, and the permission gate. See IssueDetail.tsx for the same
// host/form split applied to issues.
export default function SiteVisitCreation() {
  const navigate = useNavigate();
  const { id } = useParams();
  const projectRole = useProjectRole(id);
  const goBack = useSmartBack(`/app/projects/${id}`);
  const [searchParams] = useSearchParams();
  const prefilledDate = searchParams.get("date") || undefined;

  usePageHeader("Nouvelle visite de chantier");
  return (
    <div className="min-h-screen bg-canvas">
      {/* Toolbar — title now renders in the global light header. */}
      <div className="px-4 sm:px-6 pt-4 max-w-2xl mx-auto">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
        >
          <ArrowLeft size={18} />
          <span>Retour</span>
        </button>
      </div>

      {!projectRole.loading && !projectRole.canCreateIssues ? (
        <div className="px-4 py-6 max-w-2xl mx-auto">
          <div className="bg-surface rounded-[4px] p-8 border border-line text-center">
            <p className="text-base text-ink font-medium mb-2">
              Vous n'avez pas la permission de créer une visite sur ce projet.
            </p>
            <p className="text-sm text-muted">
              Contactez le propriétaire du projet ou un administrateur pour obtenir cet accès.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 max-w-2xl mx-auto pb-32">
          <VisitForm
            projectId={id || ""}
            initialDate={prefilledDate}
            onCreated={() => navigate(`/app/projects/${id}`)}
            onCancel={() => navigate(`/app/projects/${id}`)}
          />
        </div>
      )}
    </div>
  );
}
