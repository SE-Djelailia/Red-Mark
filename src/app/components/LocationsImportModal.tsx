import { useRef, useState } from "react";
import {
  X,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";
import { getLevels, getLocations } from "../../lib/locationsApi";
import {
  parseWorkbookFile,
  downloadLocationImportTemplate,
  type ParseRowError,
} from "../../lib/locationImportParser";
import { buildImportPlan, type ImportPlan } from "../../lib/locationImportPlanner";
import { executeImportPlan, type ExecuteResult } from "../../lib/locationImportExecutor";
import { LOCATION_TYPE_LABELS } from "../../lib/locationTypes";
import XSpinner from "./ui-kit/XSpinner";

interface Props {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

type Step = "select" | "preview" | "result";

export default function LocationsImportModal({ projectId, onClose, onImported }: Props) {
  useModalOpen();
  const [step, setStep] = useState<Step>("select");
  const [isLoading, setIsLoading] = useState(false);
  const [fileErrors, setFileErrors] = useState<ParseRowError[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setIsLoading(true);
    setHeaderError(null);
    setFileErrors([]);

    try {
      const parsed = await parseWorkbookFile(file);
      if (parsed.headerError) {
        setHeaderError(parsed.headerError);
        return;
      }

      const [existingLevels, existingLocations] = await Promise.all([
        getLevels(projectId),
        getLocations(projectId),
      ]);

      const importPlan = buildImportPlan(parsed.rows, existingLevels, existingLocations);
      setFileErrors([...parsed.errors, ...importPlan.duplicateErrors]);
      setPlan(importPlan);
      setStep("preview");
    } catch (err) {
      console.error("Error parsing import file:", err);
      toast.error("Impossible de lire le fichier. Vérifiez qu'il s'agit bien d'un fichier Excel valide.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirm = async () => {
    if (!plan) return;
    setIsCommitting(true);
    try {
      const executeResult = await executeImportPlan(projectId, plan);
      setResult(executeResult);
      setStep("result");
      if (executeResult.errors.length === 0) {
        toast.success("Importation terminée avec succès!");
        onImported();
      } else {
        toast.warning("Importation terminée avec des erreurs — voir le détail.");
        onImported();
      }
    } catch (err) {
      console.error("Error executing import plan:", err);
      toast.error("Erreur lors de l'importation. Réessayez.");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleStartOver = () => {
    setStep("select");
    setPlan(null);
    setResult(null);
    setFileErrors([]);
    setHeaderError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
        <div
          className="bg-surface rounded-[4px] max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 border-b border-line flex items-center justify-between sticky top-0 bg-surface rounded-t-xl">
            <h2 className="text-lg font-semibold text-ink">Importer les emplacements</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center hover:bg-subtle rounded-[4px] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-5">
            {step === "select" && (
              <div className="space-y-4">
                <p className="text-sm text-body">
                  Importez un fichier Excel pour créer et mettre à jour les emplacements
                  (pièces et éléments) de ce projet. Les niveaux sont créés automatiquement.
                  Rien n'est supprimé — les emplacements absents du fichier restent inchangés.
                </p>

                <button
                  type="button"
                  onClick={downloadLocationImportTemplate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors text-sm font-medium min-h-[44px]"
                >
                  <Download size={20} />
                  Télécharger le modèle
                </button>

                {headerError && (
                  <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-3 text-sm text-brand-strong flex items-start gap-2">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{headerError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 disabled:opacity-50 transition-colors text-sm font-medium min-h-[44px]"
                >
                  {isLoading ? (
                    <>
                      <XSpinner size={20} label={null} />
                      Analyse en cours…
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Choisir un fichier Excel
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
                />
              </div>
            )}

            {step === "preview" && plan && (
              <div className="space-y-4">
                <div className="bg-subtle border border-line rounded-[4px] p-4">
                  <p className="text-sm font-semibold text-ink">
                    {plan.summary.newLocations} nouveau(x), {plan.summary.updatedLocations} mis à
                    jour, {plan.summary.untouchedLocations} inchangé(s), 0 supprimé.
                  </p>
                  {plan.summary.newLevels > 0 && (
                    <p className="text-xs text-body mt-1">
                      {plan.summary.newLevels} nouveau(x) niveau(x) seront créés.
                    </p>
                  )}
                </div>

                {plan.locations.filter((l) => l.kind === "new" || l.changed === true).length > 0 && (
                  <div className="border border-line rounded-[4px] overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-canvas sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-body">Niveau</th>
                            <th className="text-left px-3 py-2 font-medium text-body">Numéro</th>
                            <th className="text-left px-3 py-2 font-medium text-body">Nom</th>
                            <th className="text-left px-3 py-2 font-medium text-body">Type</th>
                            <th className="text-left px-3 py-2 font-medium text-body">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {plan.locations
                            .filter((l) => l.kind === "new" || l.changed === true)
                            .map((l) => (
                              <tr key={l.rowNumber}>
                                <td className="px-3 py-2">{l.levelName}</td>
                                <td className="px-3 py-2 font-medium">{l.locationNumber}</td>
                                <td className="px-3 py-2 text-body">{l.name || "—"}</td>
                                <td className="px-3 py-2 text-body">
                                  {LOCATION_TYPE_LABELS[l.type]}
                                </td>
                                <td className="px-3 py-2">
                                  {l.kind === "new" ? (
                                    <span className="text-resolved font-medium">Nouveau</span>
                                  ) : (
                                    <span className="text-body font-medium">Mis à jour</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(fileErrors.length > 0 || plan.parentWarnings.length > 0) && (
                  <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-3 space-y-1 max-h-40 overflow-y-auto">
                    <p className="text-xs font-semibold text-ink mb-1">
                      {fileErrors.length} ligne(s) ignorée(s), {plan.parentWarnings.length}{" "}
                      avertissement(s) :
                    </p>
                    {fileErrors.map((e, i) => (
                      <p key={`err-${i}`} className="text-xs text-body">
                        Ligne {e.rowNumber} : {e.message}
                      </p>
                    ))}
                    {plan.parentWarnings.map((w, i) => (
                      <p key={`warn-${i}`} className="text-xs text-body">
                        Ligne {w.rowNumber} : {w.message}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleStartOver}
                    disabled={isCommitting}
                    className="flex-1 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors font-medium disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isCommitting}
                    className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCommitting && <XSpinner size={20} label={null} />}
                    Confirmer l'importation
                  </button>
                </div>
              </div>
            )}

            {step === "result" && result && (
              <div className="space-y-4">
                <div className="bg-resolved/10 border border-resolved/20 rounded-[4px] p-4 flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-resolved flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-resolved">
                    <p className="font-semibold">Importation terminée</p>
                    <p className="mt-1">
                      {result.levelsCreated} niveau(x) créé(s), {result.locationsCreated}{" "}
                      emplacement(s) créé(s), {result.locationsUpdated} mis à jour,{" "}
                      {result.parentLinksSet} lien(s) parent établi(s).
                    </p>
                  </div>
                </div>

                {result.errors.length > 0 && (
                  <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-3 space-y-1 max-h-40 overflow-y-auto">
                    <p className="text-xs font-semibold text-brand-strong mb-1">
                      {result.errors.length} erreur(s) :
                    </p>
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-brand-strong">
                        {e}
                      </p>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors font-medium"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
