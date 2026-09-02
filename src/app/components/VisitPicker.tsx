import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { getSiteVisitsPage } from "../../lib/supabaseApi";
import { parseLocalDate } from "../../lib/dateUtils";
import { useModalOpen } from "../../hooks/useModalOpen";
import VisitForm from "./VisitForm";
import type { SiteVisit } from "../../lib/supabase";
import XSpinner from "./ui-kit/XSpinner";

const RECENT_VISITS_LIMIT = 20;

interface Props {
  open: boolean;
  projectId: string;
  // Fires with either an existing visit (tapped from the list) or a
  // freshly-created one (via the inline "Nouvelle visite" form) — the
  // caller doesn't need to distinguish the two.
  onSelect: (visit: SiteVisit) => void;
  onClose: () => void;
}

// "À quelle visite ?" — shared by any action that needs a visit_id before
// proceeding (add deficiency / add photos at a location, so far). Lists
// the project's recent visits plus a "Nouvelle visite" option that swaps
// in VisitForm inline, so creating a visit doesn't navigate away from
// whatever the caller was in the middle of doing.
export default function VisitPicker({ open, projectId, onSelect, onClose }: Props) {
  useModalOpen(open);
  const [visits, setVisits] = useState<(SiteVisit & { authorName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showNewVisitForm, setShowNewVisitForm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowNewVisitForm(false);
    setLoading(true);
    setLoadError(null);
    getSiteVisitsPage(projectId, { offset: 0, limit: RECENT_VISITS_LIMIT })
      .then(({ visits }) => setVisits(visits))
      .catch((e) => {
        console.error("Error loading visits for picker:", e);
        setLoadError("Impossible de charger les visites.");
      })
      .finally(() => setLoading(false));
  }, [open, projectId, reloadKey]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-2xl sm:rounded-[4px] w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-medium text-ink">
            {showNewVisitForm ? "Nouvelle visite" : "À quelle visite ?"}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-faint hover:text-ink rounded-[4px] flex-shrink-0"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {showNewVisitForm ? (
            <VisitForm
              projectId={projectId}
              onCreated={(visit) => onSelect(visit)}
              onCancel={() => setShowNewVisitForm(false)}
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted text-sm">
              <XSpinner size={20} label={null} />
              Chargement…
            </div>
          ) : loadError ? (
            <div className="bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px] p-4 text-sm text-brand-strong flex items-center justify-between gap-3">
              <span>{loadError}</span>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="text-sm font-medium text-brand-strong hover:text-brand-800 flex-shrink-0"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setShowNewVisitForm(true)}
                className="w-full inline-flex items-center justify-center gap-2 py-3 border-2 border-dashed border-line-strong rounded-[4px] text-sm font-medium text-ink hover:border-brand-600 hover:text-brand-600 min-h-[44px]"
              >
                <Plus size={16} />
                Nouvelle visite
              </button>

              {visits.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">
                  Aucune visite pour ce projet — créez la première ci-dessus.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {visits.map((visit) => (
                    <button
                      key={visit.id}
                      onClick={() => onSelect(visit)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] border border-line hover:border-brand-600 hover:bg-subtle min-h-[44px] text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-ink font-medium truncate">
                          {parseLocalDate(visit.visit_date).toLocaleDateString("fr-CA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-muted truncate">{visit.authorName}</div>
                      </div>
                      {visit.phase && (
                        <span className="px-2 py-1 border border-line-strong text-body rounded-[4px] rm-label flex-shrink-0">
                          {visit.phase}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
