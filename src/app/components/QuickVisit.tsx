import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Search, Building2 } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { getProjects } from "../../lib/supabaseApi";
import type { Project } from "../../lib/supabase";
import VisitForm from "./VisitForm";

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

  if (selectedProjectId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
          <button
            onClick={() => setSelectedProjectId(null)}
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
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
        <h1 className="text-2xl md:text-3xl">Nouvelle visite</h1>
        <p className="text-gray-400 mt-1 text-sm">Sélectionner un projet</p>

        <div className="relative mt-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un projet…"
            className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-white/40 focus:bg-white/15"
          />
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">
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
              className="w-full flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-[#E10600] hover:shadow-md transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
                <Building2 size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#1A1A1A] truncate">{project.name}</div>
                {project.address && (
                  <div className="text-xs text-gray-500 truncate">{project.address}</div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
