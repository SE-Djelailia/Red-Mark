import { useState } from "react";
import { X, Check } from "lucide-react";
import { updateProject, type Project } from "../../lib/supabaseApi";
import { useAuth } from "../../contexts/useAuth";
import { useModalOpen } from "../../hooks/useModalOpen";
import { toast } from "sonner";

interface ProjectEditModalProps {
  project: Project;
  onClose: () => void;
  onSave: (project: Project) => void;
}

export default function ProjectEditModal({ project, onClose, onSave }: ProjectEditModalProps) {
  useModalOpen();
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: project.name,
    address: project.address || "",
    client: project.client_name || "",
    startDate: project.start_date || "",
    status: project.status,
    fileNumber: project.file_number || "",
    contractorName: project.contractor_name || "",
    contractorContact: project.contractor_contact || "",
    contractorAddress: project.contractor_address || "",
    contractorPhone: project.contractor_phone || "",
    contractorEmail: project.contractor_email || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name || !formData.address || !user) {
      toast.error("Veuillez remplir les champs requis");
      return;
    }

    setIsSaving(true);
    try {
      const updatedProject = await updateProject(project.id, {
        name: formData.name,
        address: formData.address,
        client_name: formData.client,
        start_date: formData.startDate || undefined,
        status: formData.status,
        file_number: formData.fileNumber || undefined,
        contractor_name: formData.contractorName || undefined,
        contractor_contact: formData.contractorContact || undefined,
        contractor_address: formData.contractorAddress || undefined,
        contractor_phone: formData.contractorPhone || undefined,
        contractor_email: formData.contractorEmail || undefined,
      });

      onSave(updatedProject);
      toast.success("Projet mis à jour avec succès!");
      onClose();
    } catch (error) {
      console.error("Erreur lors de la mise à jour du projet:", error);
      toast.error("Erreur lors de la mise à jour du projet");
    } finally {
      setIsSaving(false);
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

    return {
      style: styles[status],
      label: labels[status],
    };
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 py-4 sm:py-8 pb-20 flex items-center justify-center safe-area-bottom">
        <div
          className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 my-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[#1A1A1A]">Modifier le projet</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
              aria-label="Fermer"
            >
              <X size={24} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du projet *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
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
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
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
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
                placeholder="Nom du client"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Numéro de dossier
              </label>
              <input
                type="text"
                value={formData.fileNumber}
                onChange={(e) => setFormData({ ...formData, fileNumber: e.target.value })}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
                placeholder="Ex: JLPa-4521"
              />
            </div>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-3 mt-4">
                Entrepreneur (pré-rempli dans les rapports)
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de l'entreprise
                  </label>
                  <input
                    type="text"
                    value={formData.contractorName}
                    onChange={(e) => setFormData({ ...formData, contractorName: e.target.value })}
                    className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
                    placeholder="Ex: Construction ABC inc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact (nom, titre)
                  </label>
                  <input
                    type="text"
                    value={formData.contractorContact}
                    onChange={(e) =>
                      setFormData({ ...formData, contractorContact: e.target.value })
                    }
                    className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
                    placeholder="Ex: Jean Tremblay, Surintendant"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Adresse</label>
                  <input
                    type="text"
                    value={formData.contractorAddress}
                    onChange={(e) =>
                      setFormData({ ...formData, contractorAddress: e.target.value })
                    }
                    className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
                    placeholder="Ex: 456 Boul. Industriel, Laval"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
                  <input
                    type="tel"
                    value={formData.contractorPhone}
                    onChange={(e) => setFormData({ ...formData, contractorPhone: e.target.value })}
                    className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
                    placeholder="Ex: 450-555-1234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Courriel</label>
                  <input
                    type="email"
                    value={formData.contractorEmail}
                    onChange={(e) => setFormData({ ...formData, contractorEmail: e.target.value })}
                    className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
                    placeholder="Ex: jtremblay@abc.ca"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date de début</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as Project["status"] })
                }
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[48px]"
              >
                <option value="planning">Planification</option>
                <option value="in-progress">En cours</option>
                <option value="on-hold">En pause</option>
                <option value="completed">Complété</option>
              </select>
              <div className="mt-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(formData.status).style}`}
                >
                  {getStatusBadge(formData.status).label}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[48px] disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] active:bg-[#A00400] transition-colors flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Enregistrer
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
