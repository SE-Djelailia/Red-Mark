import { useState } from "react";
import { toast } from "sonner";
import type { Project } from "../../lib/supabase";
import { generatePunchList } from "../../lib/punchListGenerator";
import { TemplateMissingError } from "../../lib/docxEngine";
import type { PunchListCut } from "../../lib/punchListData";
import { useAuth } from "../../contexts/useAuth";
import { useModalOpen } from "../../hooks/useModalOpen";
import XSpinner from "./ui-kit/XSpinner";
import { MarkX } from "./ui-kit/RedMarkIcons";
import { X } from "lucide-react";

// Generation options for the punch list.
//
// Two decisions, both made at generation time rather than stored: which cut
// (one trade, or everything) and whether verified items ride along as a
// closeout appendix. The document is ephemeral — nothing here is persisted,
// and no report number is allocated.

interface Props {
  open: boolean;
  onClose: () => void;
  project: Project;
  /** Disciplines present on the project's OUTSTANDING déficiences, from the
   *  issues the tab has already loaded — no extra fetch. */
  disciplines: string[];
}

export default function PunchListModal({ open, onClose, project, disciplines }: Props) {
  const { user } = useAuth();
  const [scope, setScope] = useState<"complete" | "discipline">("complete");
  const [discipline, setDiscipline] = useState("");
  const [includeVerified, setIncludeVerified] = useState(false);
  const [generating, setGenerating] = useState(false);

  useModalOpen(open);

  if (!open) return null;

  // Default to the first available trade so choosing "par discipline" is
  // never an invalid state. Derived rather than seeded through an effect:
  // an effect that setState's on open causes a cascading render, and the
  // fallback is exact here — `discipline` is only ever "" before a choice.
  const effectiveDiscipline = discipline || disciplines[0] || "";

  const canGenerate = scope === "complete" || effectiveDiscipline !== "";

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const cut: PunchListCut =
        scope === "complete"
          ? { kind: "complete" }
          : { kind: "discipline", discipline: effectiveDiscipline };

      const { itemCount } = await generatePunchList(
        project,
        { cut, includeVerified },
        {
          // Same sources as the note de visite, so both documents are signed
          // by the account that produced them rather than by typed text.
          firmName: (user?.user_metadata?.organization as string) || "",
          preparedByNameTitle:
            (user?.user_metadata?.name as string) || user?.email?.split("@")[0] || "",
        },
      );

      if (itemCount === 0) {
        toast.info("Aucune déficience en cours pour ce filtre — document vide généré.");
      } else {
        toast.success(`Liste générée — ${itemCount} déficience${itemCount > 1 ? "s" : ""}.`);
      }
      onClose();
    } catch (e) {
      console.error("❌ Punch list generation failed:", e);
      toast.error(
        e instanceof TemplateMissingError
          ? "Le gabarit de la liste est introuvable."
          : "Impossible de générer la liste.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const segment = (active: boolean) =>
    `flex-1 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-(--duration-fast) ease-out ${
      active ? "bg-ink text-white" : "bg-surface text-muted hover:text-ink"
    }`;

  return (
    <div
      className="fixed inset-0 bg-ink/40 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="rm-enter bg-surface w-full sm:max-w-md rounded-t-[4px] sm:rounded-[4px] border border-line max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Générer une liste de déficiences"
      >
        <div className="flex items-start justify-between p-5 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            <MarkX size={20} className="text-ink flex-shrink-0" />
            <div className="min-w-0">
              <p className="rm-label">Liste de déficiences</p>
              <p className="text-sm text-muted mt-0.5 truncate">{project.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle active:bg-line rounded-[4px] transition-colors duration-(--duration-fast) ease-out flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div>
            <p className="rm-label mb-2">Portée</p>
            <div className="flex rounded-[4px] border border-line-strong overflow-hidden divide-x divide-line-strong">
              <button onClick={() => setScope("complete")} className={segment(scope === "complete")}>
                Complète
              </button>
              <button
                onClick={() => setScope("discipline")}
                disabled={disciplines.length === 0}
                className={`${segment(scope === "discipline")} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Par discipline
              </button>
            </div>
            {disciplines.length === 0 && (
              <p className="text-xs text-muted mt-2">
                Aucune discipline n'est renseignée sur les déficiences en cours.
              </p>
            )}
          </div>

          {scope === "discipline" && disciplines.length > 0 && (
            <div className="rm-fade">
              <label className="rm-label mb-2 block" htmlFor="pl-discipline">
                Discipline
              </label>
              <select
                id="pl-discipline"
                value={effectiveDiscipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface border border-line-strong rounded-[4px] text-sm min-h-11 focus:outline-none focus:border-ink"
              >
                {disciplines.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeVerified}
              onChange={(e) => setIncludeVerified(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[var(--color-ink)] flex-shrink-0"
            />
            <span className="min-w-0">
              <span className="text-sm text-ink font-medium block">
                Inclure les déficiences vérifiées
              </span>
              <span className="text-xs text-muted">
                En annexe de fermeture, jamais mêlées aux travaux à faire.
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-3 p-5 border-t border-line">
          <button
            onClick={onClose}
            className="flex-1 min-h-11 rounded-[4px] border border-ink text-ink text-sm font-medium hover:bg-subtle active:bg-line transition-colors duration-(--duration-fast) ease-out"
          >
            Annuler
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate || generating}
            className="flex-1 min-h-11 rounded-[4px] bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast) ease-out inline-flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <XSpinner size={16} tone="current" label={null} />
                Génération…
              </>
            ) : (
              "Générer"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
