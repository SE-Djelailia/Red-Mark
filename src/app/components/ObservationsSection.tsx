import { useCallback, useEffect, useState } from "react";
import { ClipboardList, ChevronUp, ChevronDown, Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  getObservationsByVisit,
  createObservation,
  updateObservation,
  deleteObservation,
  moveObservation,
  type Observation,
} from "../../lib/observationsApi";
import { getLocations, type Location } from "../../lib/locationsApi";
import { getRlsErrorMessage } from "../../lib/rlsErrors";
import { useAuth } from "../../contexts/useAuth";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  projectId: string;
  visitId: string;
  canEdit: boolean;
  /** Fired after any mutation so the host can refresh dependent views. */
  onChanged?: () => void;
}

// Observations — the factual record of the visit, distinct from the
// déficiences list below it. The report's OBSERVATIONS ET ACTIONS section
// is built from these, numbered 1.1, 1.2… continuously across location
// groups, so the numbers shown here match the generated document.
export default function ObservationsSection({ projectId, visitId, canEdit, onChanged }: Props) {
  const { user } = useAuth();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Observation | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  // null = closed; "new" = the add form; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ text: "", locationId: "", actionBy: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [obs, locs] = await Promise.all([
        getObservationsByVisit(visitId),
        // Locations are optional context; a failure here shouldn't hide the
        // observations themselves.
        getLocations(projectId).catch(() => [] as Location[]),
      ]);
      setObservations(obs);
      setLocations(locs);
    } catch (error) {
      console.error("Error loading observations:", error);
      setLoadError(getRlsErrorMessage(error, "Impossible de charger les observations."));
    } finally {
      setLoading(false);
    }
  }, [visitId, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const locationLabel = (locationId: string | null): string | null => {
    if (!locationId) return null;
    const loc = locations.find((l) => l.id === locationId);
    if (!loc) return null;
    return loc.name ? `${loc.locationNumber} — ${loc.name}` : loc.locationNumber;
  };

  const openNew = () => {
    setDraft({ text: "", locationId: "", actionBy: "" });
    setEditing("new");
  };

  const openEdit = (o: Observation) => {
    setDraft({ text: o.text, locationId: o.locationId ?? "", actionBy: o.actionBy ?? "" });
    setEditing(o.id);
  };

  const handleSave = async () => {
    const text = draft.text.trim();
    if (!text) {
      toast.error("Le texte de l'observation est requis");
      return;
    }
    if (!user?.id) return;

    setSaving(true);
    try {
      if (editing === "new") {
        const created = await createObservation({
          projectId,
          visitId,
          userId: user.id,
          text,
          locationId: draft.locationId || null,
          actionBy: draft.actionBy.trim() || null,
        });
        setObservations((prev) => [...prev, created]);
      } else if (editing) {
        const updated = await updateObservation(editing, {
          text,
          locationId: draft.locationId || null,
          actionBy: draft.actionBy.trim() || null,
        });
        setObservations((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      }
      setEditing(null);
      onChanged?.();
    } catch (error) {
      console.error("Error saving observation:", error);
      toast.error(
        getRlsErrorMessage(
          error,
          "Erreur lors de l'enregistrement de l'observation",
          "Vous n'avez pas les droits pour modifier cette visite.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteObservation(target.id);
      setObservations((prev) => prev.filter((o) => o.id !== target.id));
      toast.success("Observation supprimée");
      onChanged?.();
    } catch (error) {
      console.error("Error deleting observation:", error);
      toast.error(getRlsErrorMessage(error, "Erreur lors de la suppression"));
    }
  };

  const handleMove = async (id: string, direction: "up" | "down") => {
    setMovingId(id);
    const previous = observations;
    try {
      const next = await moveObservation(observations, id, direction);
      setObservations(next);
      onChanged?.();
    } catch (error) {
      console.error("Error reordering observation:", error);
      setObservations(previous); // put the list back if the write failed
      toast.error("Impossible de réordonner l'observation");
    } finally {
      setMovingId(null);
    }
  };

  const form = (
    <div className="border border-line rounded-lg p-3 space-y-3 bg-canvas">
      <div>
        <label className={labelClassName}>Observation *</label>
        <textarea
          autoFocus
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          rows={3}
          className={inputClassName}
          placeholder="Ex : Le cadre de porte en acier a été installé."
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClassName}>Local (optionnel)</label>
          <select
            value={draft.locationId}
            onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}
            className={inputClassName}
          >
            <option value="">Aucun local</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name ? `${l.locationNumber} — ${l.name}` : l.locationNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>Actions par (optionnel)</label>
          <input
            type="text"
            value={draft.actionBy}
            onChange={(e) => setDraft({ ...draft, actionBy: e.target.value })}
            className={inputClassName}
            placeholder="Ex : Entrepreneur"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setEditing(null)}
          disabled={saving}
          className="px-4 min-h-11 rounded-lg border border-line-strong text-body text-sm font-medium hover:bg-subtle transition-colors disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 min-h-11 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-surface rounded-xl border border-line p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <ClipboardList size={18} className="text-muted" />
          Observations ({observations.length})
        </h2>
        {canEdit && editing !== "new" && (
          <button
            onClick={openNew}
            className="py-2.5 px-4 bg-subtle text-ink rounded-lg hover:bg-line transition-colors font-medium flex items-center gap-2 min-h-[44px] flex-shrink-0"
          >
            <Plus size={16} />
            <span>Ajouter</span>
          </button>
        )}
      </div>

      {loadError ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted mb-2">{loadError}</p>
          <button onClick={load} className="text-sm text-brand-strong hover:underline font-medium">
            Réessayer
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-faint text-center py-6">Chargement…</p>
      ) : (
        <div className="space-y-2">
          {editing === "new" && form}

          {observations.length === 0 && editing !== "new" ? (
            <p className="text-sm text-muted text-center py-6">
              Aucune observation pour cette visite.
            </p>
          ) : (
            observations.map((o, i) =>
              editing === o.id ? (
                <div key={o.id}>{form}</div>
              ) : (
                <div
                  key={o.id}
                  className="flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-subtle transition-colors"
                >
                  {/* Numbered to match the report: continuous 1.n across
                      the whole visit, regardless of location grouping. */}
                  <span className="text-xs font-semibold text-muted tabular-nums pt-0.5 w-8 flex-shrink-0">
                    1.{i + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink whitespace-pre-wrap break-words">{o.text}</p>
                    {(locationLabel(o.locationId) || o.actionBy) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {locationLabel(o.locationId) && (
                          <span className="text-xs text-muted">{locationLabel(o.locationId)}</span>
                        )}
                        {o.actionBy && (
                          <span className="text-xs text-muted">Actions par : {o.actionBy}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {/* Up/down rather than drag-and-drop: reliable with
                          gloves on a phone, and needs no library. */}
                      <button
                        onClick={() => handleMove(o.id, "up")}
                        disabled={i === 0 || movingId !== null}
                        aria-label="Monter"
                        title="Monter"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:bg-line disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMove(o.id, "down")}
                        disabled={i === observations.length - 1 || movingId !== null}
                        aria-label="Descendre"
                        title="Descendre"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:bg-line disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        onClick={() => openEdit(o)}
                        aria-label="Modifier"
                        title="Modifier"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:bg-line transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(o)}
                        aria-label="Supprimer"
                        title="Supprimer"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-strong transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ),
            )
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer cette observation ?"
        description={deleteTarget?.text}
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
