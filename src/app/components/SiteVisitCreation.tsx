import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useProjectRole } from "../../hooks/useProjectRole";
import { useSmartBack } from "../../hooks/useSmartBack";
import VisitForm from "./VisitForm";

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
        <h1 className="text-2xl md:text-3xl">Nouvelle visite de chantier</h1>
      </div>

      {!projectRole.loading && !projectRole.canCreateIssues ? (
        <div className="px-4 py-6 max-w-2xl mx-auto">
          <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
            <p className="text-base text-[#1A1A1A] font-medium mb-2">
              Vous n'avez pas la permission de créer une visite sur ce projet.
            </p>
            <p className="text-sm text-gray-500">
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
