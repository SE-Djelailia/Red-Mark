import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Search, Building2 } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { getProjects } from "../../lib/supabaseApi";
import type { Project } from "../../lib/supabase";
import VisitForm from "./VisitForm";
import { inputClassName } from "./ui-kit/Input";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { formatDateLongWithWeekday } from "../../lib/dateUtils";

// Quick-access entry point for "new visit" — reached from the Dashboard's
// quick-action tile, the PWA install shortcut (manifest.shortcuts in
// vite.config.ts), and a day-click on the Dashboard calendar, for when
// there's no project already in context. Picks a project first, then hands
// off to the same VisitForm used everywhere else (SiteVisitCreation.tsx,
// VisitPicker.tsx) — this used to be its own disconnected form with a
// hardcoded fake project list and photos that were previewed but never
// actually uploaded on submit.
//
// ?date=YYYY-MM-DD pre-fills the form's date, the same convention
// SiteVisitCreation already uses for the per-project calendar. That is the
// whole of what a calendar day-click does: it is a NEW VISIT dated that day,
// not a planned or scheduled visit. site_visits has no status column and
// every field on it records something observed, so a row here always means
// "a visit with this date" — and it consumes a permanent visit_number
// (Stage 27) the moment it is created. A real planned-visit concept, with
// cancellation that does not burn a number, would be its own staged feature.
//
// A future date is allowed and needs no warning: it is self-evident on the
// form, and VisitForm imposes no max. Validation of the format itself lives
// in VisitForm (it falls back to today for anything malformed), so a
// hand-edited URL cannot produce a broken date field.
export default function QuickVisit() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const projectRole = useProjectRole(selectedProjectId || undefined);
  const [searchParams] = useSearchParams();
  const prefilledDate = searchParams.get("date") || undefined;
  // Only formatted for display when it is a real date — a malformed param
  // must not render "Invalid Date" as a subtitle. VisitForm applies the same
  // test before trusting it.
  const prefilledDateLabel =
    prefilledDate && /^\d{4}-\d{2}-\d{2}$/.test(prefilledDate)
      ? formatDateLongWithWeekday(prefilledDate)
      : null;

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

  // While picking, the subtitle says BOTH what to do and which date it is
  // for — the date is the reason the user is here when they arrived from the
  // calendar, and losing it between the tap and the form would make the
  // pre-fill look like a bug.
  usePageHeader(
    "Nouvelle visite",
    selectedProjectId
      ? (prefilledDateLabel ?? undefined)
      : [prefilledDateLabel, "Sélectionner un projet"].filter(Boolean).join(" · "),
  );

  if (selectedProjectId) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="px-4 sm:px-6 pt-4 max-w-2xl mx-auto">
          <button
            onClick={() => setSelectedProjectId(null)}
            className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
          >
            <ArrowLeft size={20} />
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
              projectId={selectedProjectId}
              initialDate={prefilledDate}
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
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
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
          <div className="rm-fade space-y-2">
          {filteredProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => setSelectedProjectId(project.id)}
              className="w-full flex items-center gap-3 bg-surface rounded-[4px] border border-line p-4 hover:border-brand-600 hover:shadow-md transition-all text-left"
            >
              <div className="w-10 h-10 rounded-[4px] bg-subtle text-ink flex items-center justify-center flex-shrink-0">
                <Building2 size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{project.name}</div>
                {project.address && (
                  <div className="text-xs text-muted truncate">{project.address}</div>
                )}
              </div>
            </button>
          ))}
          </div>
        )}
      </div>
    </div>
  );
}
