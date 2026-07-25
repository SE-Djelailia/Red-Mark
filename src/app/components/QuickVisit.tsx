import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Search, Building2 } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { getProjects } from "../../lib/supabaseApi";
import type { Project } from "../../lib/supabase";
import VisitForm from "./VisitForm";
import { inputClassName } from "./ui-kit/Input";
import { usePageHeader } from "../../contexts/PageHeaderContext";

// Quick-access entry point for "new visit" — reached from the Dashboard's
// quick-action tile and the PWA install shortcut (manifest.shortcuts in
// vite.config.ts), for when there's no project already in context. Picks a
// project first, then hands off to the same VisitForm used everywhere else
// (SiteVisitCreation.tsx, VisitPicker.tsx) — this used to be its own
// disconnected form with a hardcoded fake project list and photos that were
// previewed but never actually uploaded on submit.
export default function QuickVisit() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const projectRole = useProjectRole(selectedProjectId || undefined);

  useEffect(() => {
    if (!user?.id) return;
    getProjects(user.id)
      .then(setProjects)
      .catch((error) => console.error("Error loading projects:", error))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  usePageHeader(
    "Nouvelle visite",
    selectedProjectId ? undefined : "Sélectionner un projet",
  );

  if (selectedProjectId) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="px-4 sm:px-6 pt-4 max-w-2xl mx-auto">
          <button
            onClick={() => setSelectedProjectId(null)}
            className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
          >
            <ArrowLeft size={18} />
            <span>Retour</span>
          </button>
        </div>

        {!projectRole.loading && !projectRole.canCreateIssues ? (
          <div className="px-4 py-6 max-w-2xl mx-auto">
            <div className="bg-surface rounded-xl p-8 border border-line text-center">
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
              projectId={selectedProjectId}
              onCreated={(visit) =>
                navigate(`/app/projects/${selectedProjectId}/visits/${visit.id}`)
              }
              onCancel={() => setSelectedProjectId(null)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-20">
      <div className="px-4 sm:px-6 pt-4 max-w-2xl mx-auto space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
        >
          <ArrowLeft size={18} />
          <span>Retour</span>
        </button>

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un projet…"
            className={`${inputClassName} pl-10`}
          />
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-2">
        {loading ? (
          <div className="text-center py-12 text-muted text-sm">Chargement…</div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <Building2 size={48} className="mx-auto text-faint mb-4" />
            <p className="text-muted">
              {projects.length === 0
                ? "Aucun projet. Créez d'abord un projet."
                : "Aucun projet ne correspond à cette recherche."}
            </p>
          </div>
        ) : (
          filteredProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => setSelectedProjectId(project.id)}
              className="w-full flex items-center gap-3 bg-surface rounded-xl border border-line p-4 hover:border-brand-600 hover:shadow-md transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-600/10 text-brand-600 flex items-center justify-center flex-shrink-0">
                <Building2 size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{project.name}</div>
                {project.address && (
                  <div className="text-xs text-muted truncate">{project.address}</div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
