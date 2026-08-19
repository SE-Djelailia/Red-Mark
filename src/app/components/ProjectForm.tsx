import { useState } from "react";
import { X, Check } from "lucide-react";
import { toast } from "sonner";
import { createProject, updateProject, type Project } from "../../lib/supabaseApi";
import { useAuth } from "../../contexts/useAuth";
import { useModalOpen } from "../../hooks/useModalOpen";
import { getTodayForInput } from "../../lib/dateUtils";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import {
  ProjectStatusBadge,
  PROJECT_STATUS_OPTIONS,
  normalizeProjectStatus,
} from "./ui-kit/ProjectStatus";
import type { ProjectStatus } from "../../lib/supabase";

interface Props {
  // When present, the form edits this project; when absent, it creates a
  // new one. Same shape as IssueForm's `issue` prop.
  project?: Project | null;
  onSaved: (project: Project) => void;
  onCancel: () => void;
}

// Single project form, shared by create and edit.
//
// These were two separate implementations: an inline modal in ProjectList
// (create) and ProjectEditModal (edit). They had drifted badly — create was
// missing all six report fields (file_number + the five contractor fields),
// and rendered an "Entrepreneur" input whose value was never passed to
// createProject, so anything typed there was silently discarded.
//
// Create and edit now differ in exactly three things: initial values, which
// API call runs on submit, and the title/button labels.
export default function ProjectForm({ project, onCancel, onSaved }: Props) {
  useModalOpen();
  const { user } = useAuth();
  const isEdit = !!project;
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: project?.name ?? "",
    address: project?.address ?? "",
    client: project?.client_name ?? "",
    // Create seeds today's date as a convenience; edit shows whatever is
    // stored, including empty.
    startDate: project ? (project.start_date ?? "") : getTodayForInput(),
    status: project?.status ?? ("planning" as Project["status"]),
    fileNumber: project?.file_number ?? "",
    contractorName: project?.contractor_name ?? "",
    contractorContact: project?.contractor_contact ?? "",
    contractorAddress: project?.contractor_address ?? "",
    contractorPhone: project?.contractor_phone ?? "",
    contractorEmail: project?.contractor_email ?? "",
  });

  const set = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    if (!formData.name || !formData.address || !user) {
      toast.error("Veuillez remplir les champs requis");
      return;
    }

    // One payload for both paths, so a field can never be wired into the
    // form but dropped on the way to the database.
    const fields = {
      name: formData.name,
      address: formData.address,
      client_name: formData.client,
      // `|| null`, not `|| undefined`: these columns are nullable, and an
      // undefined value is DROPPED from the JSON payload rather than sent.
      // On an edit that meant clearing a field left the old value in place —
      // the user blanked the contractor's phone, saw it disappear from the
      // form, and it was still in the database.
      start_date: formData.startDate || null,
      status: formData.status,
      file_number: formData.fileNumber || null,
      contractor_name: formData.contractorName || null,
      contractor_contact: formData.contractorContact || null,
      contractor_address: formData.contractorAddress || null,
      contractor_phone: formData.contractorPhone || null,
      contractor_email: formData.contractorEmail || null,
    };

    setIsSaving(true);
    try {
      const saved = project
        ? await updateProject(project.id, fields)
        : // The handle_new_project DB trigger auto-enrols the creator as a
          // project_members owner — no client-side seeding needed.
          await createProject({ user_id: user.id, ...fields });

      onSaved(saved);
      toast.success(isEdit ? "Projet mis à jour avec succès!" : `Projet "${saved.name}" créé avec succès!`);
      onCancel();
    } catch (error) {
      console.error(isEdit ? "Erreur lors de la mise à jour du projet:" : "❌ Error creating project:", error);
      toast.error(
        isEdit ? "Erreur lors de la mise à jour du projet" : "Erreur lors de la création du projet",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onCancel}>
      <div className="min-h-screen px-4 py-4 sm:py-8 pb-20 flex items-center justify-center safe-area-bottom">
        <div
          className="bg-surface rounded-[4px] max-w-md w-full p-5 sm:p-6 my-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-ink">
              {isEdit ? "Modifier le projet" : "Nouveau projet"}
            </h2>
            <button
              onClick={onCancel}
              className="w-10 h-10 flex items-center justify-center hover:bg-subtle rounded-full transition-colors flex-shrink-0"
              aria-label="Fermer"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClassName}>Nom du projet *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => set("name", e.target.value)}
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
                onChange={(e) => set("address", e.target.value)}
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
                onChange={(e) => set("client", e.target.value)}
                className={inputClassName}
                placeholder="Nom du client"
              />
            </div>

            <div>
              <label className={labelClassName}>Numéro de dossier</label>
              <input
                type="text"
                value={formData.fileNumber}
                onChange={(e) => set("fileNumber", e.target.value)}
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
                  <label className={labelClassName}>Nom de l'entreprise</label>
                  <input
                    type="text"
                    value={formData.contractorName}
                    onChange={(e) => set("contractorName", e.target.value)}
                    className={inputClassName}
                    placeholder="Ex: Construction ABC inc."
                  />
                </div>

                <div>
                  <label className={labelClassName}>Contact (nom, titre)</label>
                  <input
                    type="text"
                    value={formData.contractorContact}
                    onChange={(e) => set("contractorContact", e.target.value)}
                    className={inputClassName}
                    placeholder="Ex: Jean Tremblay, Surintendant"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Adresse</label>
                  <input
                    type="text"
                    value={formData.contractorAddress}
                    onChange={(e) => set("contractorAddress", e.target.value)}
                    className={inputClassName}
                    placeholder="Ex: 456 Boul. Industriel, Laval"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Téléphone</label>
                  <input
                    type="tel"
                    value={formData.contractorPhone}
                    onChange={(e) => set("contractorPhone", e.target.value)}
                    className={inputClassName}
                    placeholder="Ex: 450-555-1234"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Courriel</label>
                  <input
                    type="email"
                    value={formData.contractorEmail}
                    onChange={(e) => set("contractorEmail", e.target.value)}
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
                onChange={(e) => set("startDate", e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className={labelClassName}>Statut</label>
              {/* Options come from the ui-kit map rather than a hand-written
                  list. Both previous forms offered only 4 of the 6 statuses,
                  so opening an `archived` project and saving silently reset
                  it to whichever option happened to be selected. */}
              <select
                value={normalizeProjectStatus(formData.status)}
                onChange={(e) => set("status", e.target.value as ProjectStatus)}
                className={inputClassName}
              >
                {PROJECT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="mt-2">
                <ProjectStatusBadge status={formData.status} />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="flex-1 px-4 py-3 border border-line-strong text-body rounded-[4px] hover:bg-subtle active:bg-subtle transition-colors min-h-[48px] disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-[#A00400] transition-colors flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    {isEdit ? "Enregistrer" : "Créer"}
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
