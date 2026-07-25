import { useState } from "react";
import { X, Check } from "lucide-react";
import { updateProject, type Project } from "../../lib/supabaseApi";
import { useAuth } from "../../contexts/useAuth";
import { useModalOpen } from "../../hooks/useModalOpen";
import { toast } from "sonner";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import { ProjectStatusBadge } from "./ui-kit/ProjectStatus";

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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 py-4 sm:py-8 pb-20 flex items-center justify-center safe-area-bottom">
        <div
          className="bg-surface rounded-2xl max-w-md w-full p-5 sm:p-6 my-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-ink">Modifier le projet</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-subtle rounded-full transition-colors flex-shrink-0"
              aria-label="Fermer"
            >
              <X size={24} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClassName}>
                Nom du projet *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputClassName}
                placeholder="Ex: Tour du Centre-Ville"
                required
              />
            </div>

            <div>
              <label className={labelClassName}>Adresse *</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className={inputClassName}
                placeholder="123 Rue Saint-Catherine, Montréal"
                required
              />
            </div>

            <div>
              <label className={labelClassName}>Client</label>
              <input
                type="text"
                value={formData.client}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                className={inputClassName}
                placeholder="Nom du client"
              />
            </div>

            <div>
              <label className={labelClassName}>
                Numéro de dossier
              </label>
              <input
                type="text"
                value={formData.fileNumber}
                onChange={(e) => setFormData({ ...formData, fileNumber: e.target.value })}
                className={inputClassName}
                placeholder="Ex: JLPa-4521"
              />
            </div>

            <div className="pt-2 border-t border-line">
              <p className="text-sm font-medium text-body mb-3 mt-4">
                Entrepreneur (pré-rempli dans les rapports)
              </p>
              <div className="space-y-4">
                <div>
                  <label className={labelClassName}>
                    Nom de l'entreprise
                  </label>
                  <input
                    type="text"
                    value={formData.contractorName}
                    onChange={(e) => setFormData({ ...formData, contractorName: e.target.value })}
                    className={inputClassName}
                    placeholder="Ex: Construction ABC inc."
                  />
                </div>

                <div>
                  <label className={labelClassName}>
                    Contact (nom, titre)
                  </label>
                  <input
                    type="text"
                    value={formData.contractorContact}
                    onChange={(e) =>
                      setFormData({ ...formData, contractorContact: e.target.value })
                    }
                    className={inputClassName}
                    placeholder="Ex: Jean Tremblay, Surintendant"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Adresse</label>
                  <input
                    type="text"
                    value={formData.contractorAddress}
                    onChange={(e) =>
                      setFormData({ ...formData, contractorAddress: e.target.value })
                    }
                    className={inputClassName}
                    placeholder="Ex: 456 Boul. Industriel, Laval"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Téléphone</label>
                  <input
                    type="tel"
                    value={formData.contractorPhone}
                    onChange={(e) => setFormData({ ...formData, contractorPhone: e.target.value })}
                    className={inputClassName}
                    placeholder="Ex: 450-555-1234"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Courriel</label>
                  <input
                    type="email"
                    value={formData.contractorEmail}
                    onChange={(e) => setFormData({ ...formData, contractorEmail: e.target.value })}
                    className={inputClassName}
                    placeholder="Ex: jtremblay@abc.ca"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={labelClassName}>Date de début</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className={inputClassName}
              />
            </div>

            <div>
              <label className={labelClassName}>Statut</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as Project["status"] })
                }
                className={inputClassName}
              >
                <option value="planning">Planification</option>
                <option value="in-progress">En cours</option>
                <option value="on-hold">En pause</option>
                <option value="completed">Complété</option>
              </select>
              <div className="mt-2">
                <ProjectStatusBadge status={formData.status} />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 px-4 py-3 border border-line-strong text-body rounded-lg hover:bg-subtle active:bg-subtle transition-colors min-h-[48px] disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 active:bg-[#A00400] transition-colors flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
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
