import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Building2, MapPin, Calendar, Users, Search, X } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import {
  getProjects as getProjectsFromSupabase,
  createProject,
  deleteProject as deleteProjectFromSupabase,
  type Project,
} from "../../lib/supabaseApi";
import { supabase } from "../../lib/supabase";
import { getTodayForInput, formatDateShort } from "../../lib/dateUtils";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";

export default function ProjectList() {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  useModalOpen(showCreateModal);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<Project["status"] | "all">("all");
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

  async function handleDeleteProject(projectId: string, projectName: string) {
    if (!user) return;

    if (confirm(`Êtes-vous sûr de vouloir supprimer le projet "${projectName}"?`)) {
      try {
        await deleteProjectFromSupabase(projectId);
        await loadProjects();
        toast.success("Projet supprimé");
      } catch (error) {
        console.error("❌ Error deleting project:", error);
        toast.error("Erreur lors de la suppression");
      }
    }
  }

  const getStatusBadge = (status: Project["status"]) => {
    const styles = {
      planning: "bg-blue-100 text-blue-700",
      "in-progress": "bg-green-100 text-green-700",
      "on-hold": "bg-yellow-100 text-yellow-700",
      completed: "bg-gray-100 text-gray-700",
    };

    const labels = {
      planning: "Planification",
      "in-progress": "En cours",
      "on-hold": "En pause",
      completed: "Complété",
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  // Show loading while auth is initializing
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E10600] mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-gray-500 text-lg mb-4">Veuillez vous connecter</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-6 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors"
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
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1A1A] mb-2">Mes Projets</h1>
        <p className="text-sm sm:text-base text-gray-600">Gérez vos projets de construction</p>
      </div>

      {/* Search and Filters */}
      {projects.length > 0 && (
        <div className="mb-6 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom, adresse, client..."
              className="w-full pl-10 pr-4 py-3 sm:py-3.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent min-h-[48px]"
            />
          </div>

          {/* Status Filters - Horizontal Scroll on Mobile */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] ${
                filterStatus === "all"
                  ? "bg-[#E10600] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
              }`}
            >
              Tous ({projects.length})
            </button>
            <button
              onClick={() => setFilterStatus("planning")}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] ${
                filterStatus === "planning"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200 active:bg-blue-300"
              }`}
            >
              Planification ({projects.filter((p) => p.status === "planning").length})
            </button>
            <button
              onClick={() => setFilterStatus("in-progress")}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] ${
                filterStatus === "in-progress"
                  ? "bg-green-600 text-white"
                  : "bg-green-100 text-green-700 hover:bg-green-200 active:bg-green-300"
              }`}
            >
              En cours ({projects.filter((p) => p.status === "in-progress").length})
            </button>
            <button
              onClick={() => setFilterStatus("on-hold")}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] ${
                filterStatus === "on-hold"
                  ? "bg-yellow-600 text-white"
                  : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 active:bg-yellow-300"
              }`}
            >
              En pause ({projects.filter((p) => p.status === "on-hold").length})
            </button>
            <button
              onClick={() => setFilterStatus("completed")}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] ${
                filterStatus === "completed"
                  ? "bg-gray-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
              }`}
            >
              Complété ({projects.filter((p) => p.status === "completed").length})
            </button>
          </div>

          {/* Active Filters */}
          {(searchQuery || filterStatus !== "all") && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {filteredProjects.length} résultat{filteredProjects.length > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                }}
                className="text-sm text-[#E10600] hover:text-[#C00500] flex items-center gap-1"
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
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <Building2 size={64} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Aucun projet</h3>
          <p className="text-gray-600 mb-6">Commencez par créer votre premier projet</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors inline-flex items-center gap-2"
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
              <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun projet trouvé</h3>
              <p className="text-gray-600 mb-4">Essayez de modifier vos critères de recherche</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                }}
                className="text-sm text-[#E10600] hover:text-[#C00500]"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-[#1A1A1A] flex-1">{project.name}</h3>
                  {getStatusBadge(project.status)}
                </div>

                <div className="space-y-3 text-sm text-gray-600">
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

                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => (window.location.href = `/app/projects/${project.id}`)}
                    className="flex-1 px-4 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors text-sm"
                  >
                    Ouvrir
                  </button>
                  <button
                    onClick={() => handleDeleteProject(project.id, project.name)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Floating Action Button */}
      {projects.length > 0 && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="fixed right-6 bottom-24 w-14 h-14 bg-[#E10600] text-white rounded-full shadow-lg hover:bg-[#C00500] transition-all hover:scale-110 flex items-center justify-center z-40"
          aria-label="Créer un projet"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-[#1A1A1A] mb-6">Nouveau Projet</h2>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du projet *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                  placeholder="Ex: Tour du Centre-Ville"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Adresse *</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                  placeholder="123 Rue Saint-Catherine, Montréal"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Client</label>
                <input
                  type="text"
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                  placeholder="Nom du client"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Entrepreneur</label>
                <input
                  type="text"
                  value={formData.contractor}
                  onChange={(e) => setFormData({ ...formData, contractor: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                  placeholder="Nom de l'entrepreneur"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de début
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as Project["status"] })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
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
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
