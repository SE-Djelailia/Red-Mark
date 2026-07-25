import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router";
import { Plus, Building2, MapPin, Calendar, Users, Search, X } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import {
  getProjects as getProjectsFromSupabase,
  createProject,
  deleteProject as deleteProjectFromSupabase,
  type Project,
} from "../../lib/supabaseApi";
import { supabase } from "../../lib/supabase";
import { getRlsErrorMessage } from "../../lib/rlsErrors";
import { getTodayForInput, formatDateShort } from "../../lib/dateUtils";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";
import ConfirmDialog from "./ConfirmDialog";
import FloatingActions from "./FloatingActions";
import { inputClassName } from "./ui-kit/Input";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { ProjectStatusBadge } from "./ui-kit/ProjectStatus";

const STATUS_FILTERS: { value: Project["status"] | "all"; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "planning", label: "Planification" },
  { value: "in-progress", label: "En cours" },
  { value: "on-hold", label: "En pause" },
  { value: "completed", label: "Complété" },
];

export default function ProjectList() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  // ?new=1 (e.g. from the Dashboard's "Nouveau projet" quick action) opens
  // the create modal immediately instead of requiring an extra tap here.
  const [showCreateModal, setShowCreateModal] = useState(searchParams.get("new") === "1");
  useModalOpen(showCreateModal);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<Project["status"] | "all">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    client: "",
    contractor: "",
    startDate: getTodayForInput(),
    status: "planning" as Project["status"],
  });

  console.log("🏗️ ProjectList render - user:", user, "loading:", loading);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    if (!user?.id) return;
    try {
      const userProjects = await getProjectsFromSupabase(user.id);
      setProjects(userProjects);
    } catch (error) {
      console.error("❌ Error loading projects:", error);
      toast.error("Erreur lors du chargement des projets");
    }
  }, [user?.id]);

  // Strip ?new=1 from the URL once consumed so a refresh/back doesn't reopen it.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chargement initial
  useEffect(() => {
    if (user?.id) loadProjects();
  }, [user?.id, loadProjects]);

  // Realtime — toute modification de projects déclenche un rechargement
  useEffect(() => {
    if (!user?.id) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => loadProjects(), 500);
    };
    const channel = supabase
      .channel("projectlist-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadProjects]);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name || !formData.address || !user) {
      toast.error("Veuillez remplir les champs requis");
      return;
    }

    try {
      const newProject = await createProject({
        user_id: user.id,
        name: formData.name,
        address: formData.address,
        client_name: formData.client,
        status: formData.status,
        start_date: formData.startDate,
      });

      // The handle_new_project DB trigger auto-enrolls the creator as
      // project_members owner — no client-side seeding needed.
      await loadProjects();

      // Reset form
      setFormData({
        name: "",
        address: "",
        client: "",
        contractor: "",
        startDate: getTodayForInput(),
        status: "planning",
      });
      setShowCreateModal(false);

      toast.success(`Projet "${newProject.name}" créé avec succès!`);
    } catch (error) {
      console.error("❌ Error creating project:", error);
      toast.error("Erreur lors de la création du projet");
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (!user) return;
    setDeleteTarget(null);

    try {
      await deleteProjectFromSupabase(projectId);
      await loadProjects();
      toast.success("Projet supprimé");
    } catch (error) {
      console.error("❌ Error deleting project:", error);
      toast.error(
        getRlsErrorMessage(
          error,
          "Erreur lors de la suppression",
          "Seul le propriétaire ou un administrateur peut supprimer ce projet.",
        ),
      );
    }
  }

  // Declared before the early returns below — a hook must run on every
  // render, and the auth-loading / signed-out branches return early.
  usePageHeader("Mes projets", "Gérez vos projets de construction");

  // Show loading while auth is initializing
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-body">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-muted text-lg mb-4">Veuillez vous connecter</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
        >
          Aller à la connexion
        </button>
      </div>
    );
  }

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      searchQuery === "" ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.address ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.client_name ?? "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === "all" || project.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 sm:pb-28">
      {/* Search and Filters */}
      {projects.length > 0 && (
        <div className="mb-6 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom, adresse, client..."
              className={`${inputClassName} pl-10`}
            />
          </div>

          {/* Status filters. The design system uses one neutral pill shape
              with a dark active state — the five different hues these used
              to carry (blue/green/yellow/grey/red) encoded nothing the label
              didn't already say. */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            {STATUS_FILTERS.map((f) => {
              const count =
                f.value === "all"
                  ? projects.length
                  : projects.filter((p) => p.status === f.value).length;
              const active = filterStatus === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilterStatus(f.value)}
                  className={`px-3.5 h-9 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap flex items-center ${
                    active
                      ? "bg-ink text-white"
                      : "bg-subtle text-body hover:bg-line active:bg-line-strong"
                  }`}
                >
                  {f.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Active Filters */}
          {(searchQuery || filterStatus !== "all") && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-body">
                {filteredProjects.length} résultat{filteredProjects.length > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                }}
                className="text-sm text-brand-strong hover:text-brand-800 flex items-center gap-1"
              >
                <X size={14} />
                Réinitialiser
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="text-center py-16 bg-canvas rounded-xl">
          <Building2 size={64} className="mx-auto text-faint mb-4" />
          <h3 className="text-xl font-semibold text-ink mb-2">Aucun projet</h3>
          <p className="text-body mb-6">Commencez par créer votre premier projet</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors inline-flex items-center gap-2"
          >
            <Plus size={20} />
            Créer un projet
          </button>
        </div>
      )}

      {/* Projects Grid */}
      {projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Building2 size={48} className="mx-auto text-faint mb-4" />
              <h3 className="text-lg font-semibold text-ink mb-2">Aucun projet trouvé</h3>
              <p className="text-body mb-4">Essayez de modifier vos critères de recherche</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                }}
                className="text-sm text-brand-strong hover:text-brand-800"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                className="bg-surface rounded-xl shadow-sm border border-line p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-ink flex-1">{project.name}</h3>
                  <ProjectStatusBadge status={project.status} />
                </div>

                <div className="space-y-3 text-sm text-body">
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{project.address}</span>
                  </div>

                  {project.client_name && (
                    <div className="flex items-center gap-2">
                      <Users size={16} className="flex-shrink-0" />
                      <span>{project.client_name}</span>
                    </div>
                  )}

                  {project.start_date && (
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="flex-shrink-0" />
                      <span>{formatDateShort(project.start_date)}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-line">
                  <button
                    onClick={() => (window.location.href = `/app/projects/${project.id}`)}
                    className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm"
                  >
                    Ouvrir
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
                    className="px-4 py-2 border border-line-strong text-body rounded-lg hover:bg-subtle transition-colors text-sm"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <FloatingActions
        menu={
          projects.length > 0
            ? [{ label: "Nouveau projet", icon: Plus, onClick: () => setShowCreateModal(true) }]
            : []
        }
      />

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-ink mb-6">Nouveau Projet</h2>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  Nom du projet *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-line-strong rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                  placeholder="Ex: Tour du Centre-Ville"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">Adresse *</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-3 border border-line-strong rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                  placeholder="123 Rue Saint-Catherine, Montréal"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">Client</label>
                <input
                  type="text"
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  className="w-full px-4 py-3 border border-line-strong rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                  placeholder="Nom du client"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">Entrepreneur</label>
                <input
                  type="text"
                  value={formData.contractor}
                  onChange={(e) => setFormData({ ...formData, contractor: e.target.value })}
                  className="w-full px-4 py-3 border border-line-strong rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                  placeholder="Nom de l'entrepreneur"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  Date de début
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-4 py-3 border border-line-strong rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-2">Statut</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as Project["status"] })
                  }
                  className="w-full px-4 py-3 border border-line-strong rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                >
                  <option value="planning">Planification</option>
                  <option value="in-progress">En cours</option>
                  <option value="on-hold">En pause</option>
                  <option value="completed">Complété</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 border border-line-strong text-body rounded-lg hover:bg-subtle transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `Supprimer le projet « ${deleteTarget.name} » ?` : ""}
        description="Cette action est définitive."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDeleteProject(deleteTarget.id)}
      />
    </div>
  );
}
