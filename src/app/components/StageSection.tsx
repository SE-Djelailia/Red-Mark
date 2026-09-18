// PER-PROJECT CONSTRUCTION STAGES — the "when in the build" axis.
//
// Lives beside the lots section on the "Lots et étapes" tab. The two are the
// project's two organising axes and are genuinely different things, which is
// why they share a tab but not a list:
//
//   LOT   — a contractual division. Says WHO is responsible; carries a company.
//   ÉTAPE — a construction stage. Says WHEN in the build; carries nothing but
//           its position in the sequence.
//
// A déficience carries both, independently.
//
// WHY THESE ARE EDITABLE AT ALL, AND WHY IT IS SAFE
//
// project_stages is a COPY of the firm's master list, not a reference (see
// stagesApi's header). So a project may rename "Enveloppe" to "Enveloppe et
// toiture" without touching the firm's list or any other project, and visits
// and déficiences follow the rename because they reference the stage by id.
// Renaming a stage never rewrites history; it relabels one project's own copy.
//
// The list is seeded on first view by ensureProjectStages, so a project created
// before this tab existed fills itself in rather than showing an empty list the
// user has to repair by hand.
//
// PERMISSIONS mirror the RLS policies exactly — read: any project member,
// write: owner/editor — so a commenter sees the list with no controls rather
// than buttons the database would refuse.
//
// ORDERING is up/down, not drag, for the reason LotTab gives: a drag gesture on
// a scrolling touch surface fights the scroll, and these lists are short.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createProjectStage,
  deleteProjectStage,
  ensureProjectStages,
  getStageUsage,
  isDuplicateStageName,
  renameProjectStage,
  reorderProjectStages,
  type ProjectStage,
  type StageUsage,
} from "../../lib/stagesApi";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./ui-kit/EmptyState";
import XSpinner from "./ui-kit/XSpinner";
import { inputClassName } from "./ui-kit/Input";
import { IconStage } from "./ui-kit/RedMarkIcons";

interface Props {
  projectId: string;
  /** Owner or editor. Commenters get a read-only list. */
  canEdit: boolean;
}

/** The stage queued for deletion, with what it is attached to. */
type PendingDelete = { stage: ProjectStage; usage: StageUsage };

export default function StageSection({ projectId, canEdit }: Props) {
  const navigate = useNavigate();
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  /** Null = not adding. A string = the new stage's name as typed so far. */
  const [adding, setAdding] = useState<string | null>(null);
  /** The stage being renamed, and its name as typed so far. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  /** True while getStageUsage runs, so the row's bin can show it is working. */
  const [checkingUsage, setCheckingUsage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setStages(await ensureProjectStages(projectId));
    } catch (e) {
      console.error("❌ Failed to load project stages:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Declared inside the effect so no setState runs synchronously in the
    // effect body; `cancelled` drops a response that lands after the project
    // changed. Same shape as LotTab.
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        // ensureProjectStages, not getProjectStages: a project with no stages
        // seeds itself from the firm master here rather than needing the visit
        // form to be opened first.
        const rows = await ensureProjectStages(projectId);
        if (!cancelled) setStages(rows);
      } catch (e) {
        console.error("❌ Failed to load project stages:", e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // One past the current maximum, so a new stage lands at the end rather than
  // colliding with an existing position.
  const nextSortOrder = useMemo(
    () => (stages.length === 0 ? 0 : Math.max(...stages.map((s) => s.sortOrder)) + 1),
    [stages],
  );

  const handleCreate = async () => {
    if (adding === null) return;
    if (!adding.trim()) {
      toast.error("Le nom de l'étape est requis.");
      return;
    }
    setSaving(true);
    try {
      await createProjectStage(projectId, adding, nextSortOrder);
      toast.success("Étape ajoutée.");
      setAdding(null);
      await load();
    } catch (e) {
      console.error("❌ Failed to create stage:", e);
      toast.error(
        isDuplicateStageName(e)
          ? "Une étape portant ce nom existe déjà dans ce projet."
          : "Impossible d'ajouter l'étape.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Le nom de l'étape est requis.");
      return;
    }
    setSaving(true);
    try {
      await renameProjectStage(editing.id, editing.name);
      toast.success("Étape renommée.");
      setEditing(null);
      await load();
    } catch (e) {
      console.error("❌ Failed to rename stage:", e);
      toast.error(
        isDuplicateStageName(e)
          ? "Une étape portant ce nom existe déjà dans ce projet."
          : "Impossible de renommer l'étape.",
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * Counts what the stage is attached to BEFORE opening the confirmation, so
   * the dialog can state the consequence in numbers rather than in general
   * terms. An unused stage still confirms, but with the lighter wording.
   */
  const askDelete = async (stage: ProjectStage) => {
    setCheckingUsage(stage.id);
    try {
      const usage = await getStageUsage(stage.id);
      setPendingDelete({ stage, usage });
    } catch (e) {
      console.error("❌ Failed to check stage usage:", e);
      toast.error("Impossible de vérifier l'utilisation de l'étape.");
    } finally {
      setCheckingUsage(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteProjectStage(pendingDelete.stage.id);
      toast.success("Étape supprimée.");
      setPendingDelete(null);
      await load();
    } catch (e) {
      console.error("❌ Failed to delete stage:", e);
      toast.error("Impossible de supprimer l'étape.");
    }
  };

  /**
   * Moves a stage one position and renumbers the whole list.
   *
   * Renumbering rather than swapping keeps sort_order dense (0,1,2…). Sparse or
   * duplicated values would let the name tiebreak in getProjectStages decide
   * the order instead of the user.
   */
  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;

    const next = [...stages];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);

    // Optimistic — waiting for a round trip makes the control feel broken.
    setStages(next.map((s, i) => ({ ...s, sortOrder: i })));
    setReordering(true);
    try {
      await reorderProjectStages(next.map((s, i) => ({ id: s.id, sortOrder: i })));
    } catch (e) {
      console.error("❌ Failed to reorder stages:", e);
      toast.error("Impossible de réordonner les étapes.");
      await load();
    } finally {
      setReordering(false);
    }
  };

  return (
    <section className="space-y-4">
      {/* Header. Deliberately NOT a red button: the tab's one red fill is
          "Nouveau lot" above. A second red primary would make the page read as
          two competing calls to action rather than one screen. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="rm-label">Étapes</p>
          <p className="text-sm text-muted mt-1 text-pretty">
            Étapes de construction du projet, dans l'ordre. Les visites et les déficiences
            s'y rattachent.
          </p>
        </div>
        {canEdit && adding === null && !loading && !loadError && (
          <button
            onClick={() => setAdding("")}
            className="flex-shrink-0 min-h-[44px] px-4 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle active:bg-line transition-colors duration-(--duration-fast) flex items-center gap-2"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nouvelle étape</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center" role="status" aria-label="Chargement des étapes">
          <XSpinner size={28} />
        </div>
      ) : loadError ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted mb-3">Impossible de charger les étapes.</p>
          <button
            onClick={() => void load()}
            className="min-h-[44px] px-4 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle transition-colors duration-(--duration-fast)"
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {adding !== null && (
            <StageNameEditor
              label="Nouvelle étape"
              value={adding}
              saving={saving}
              onChange={setAdding}
              onCancel={() => setAdding(null)}
              onSave={() => void handleCreate()}
            />
          )}

          {stages.length === 0 && adding === null ? (
            <EmptyState
              icon={<IconStage size={40} className="lucide-display" />}
              label="Étapes"
              message={
                canEdit
                  ? "Aucune étape définie. La liste de votre firme est vide — ajoutez les étapes de ce projet."
                  : "Aucune étape définie pour ce projet."
              }
              size="compact"
              action={
                canEdit ? { label: "Ajouter une étape", onClick: () => setAdding("") } : undefined
              }
            />
          ) : (
            // Two columns from md (iPad portrait), matching the lots grid: a
            // stage row is one short line, and one per line wastes a large
            // screen. Below md this is a single column — phone unchanged.
            <div className="grid gap-2 md:grid-cols-2">
              {stages.map((stage, index) =>
                editing?.id === stage.id ? (
                  <div key={stage.id} className="md:col-span-2">
                    <StageNameEditor
                      label="Renommer l'étape"
                      value={editing.name}
                      saving={saving}
                      onChange={(name) => setEditing({ id: stage.id, name })}
                      onCancel={() => setEditing(null)}
                      onSave={() => void handleRename()}
                    />
                  </div>
                ) : (
                  <StageRow
                    key={stage.id}
                    stage={stage}
                    index={index}
                    total={stages.length}
                    canEdit={canEdit}
                    busy={reordering}
                    checking={checkingUsage === stage.id}
                    onOpen={() => navigate(`/app/projects/${projectId}/stages/${stage.id}`)}
                    onEdit={() => setEditing({ id: stage.id, name: stage.name })}
                    onDelete={() => void askDelete(stage)}
                    onMove={(d) => void move(index, d)}
                  />
                ),
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Supprimer l'étape ?"
        description={pendingDelete ? deleteDescription(pendingDelete) : ""}
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

/**
 * What deleting this stage will actually do, in numbers.
 *
 * The in-use wording names both counts and says "dissociera" — the records are
 * NOT deleted, and a dialog that left that ambiguous would make an architect
 * hesitate over a safe action. Verified against the schema: site_visit_stages
 * CASCADEs (the link goes, the visit stays) and issues.stage_id is SET NULL
 * column-scoped (the déficience stays, minus its stage).
 */
function deleteDescription({ stage, usage }: PendingDelete): string {
  const parts: string[] = [];
  if (usage.visits > 0) parts.push(`${usage.visits} visite${usage.visits > 1 ? "s" : ""}`);
  if (usage.issues > 0) parts.push(`${usage.issues} déficience${usage.issues > 1 ? "s" : ""}`);

  if (parts.length === 0) {
    return `« ${stage.name} » sera retirée du projet. Aucune visite ni déficience n'y est rattachée.`;
  }

  return `« ${stage.name} » est utilisée par ${parts.join(" et ")}. La supprimer les dissociera — les visites et les déficiences sont conservées, elles perdent seulement leur étape. Continuer ?`;
}

/* ── ROW ────────────────────────────────────────────────────────────────── */

function StageRow({
  stage,
  index,
  total,
  canEdit,
  busy,
  checking,
  onOpen,
  onEdit,
  onDelete,
  onMove,
}: {
  stage: ProjectStage;
  index: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  checking: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  // Full-card link with the action cluster as a SIBLING, not a descendant —
  // same construction as LotCard, and for the same reason: nesting buttons
  // is invalid and breaks keyboard and screen-reader use. See LotTab.tsx.
  return (
    <div className="relative bg-surface border border-line rounded-[4px] px-3 py-2 flex items-center gap-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ouvrir l'étape ${stage.name}`}
        className="absolute inset-0 z-0 rounded-[4px] hover:bg-subtle active:bg-line/40 transition-colors"
      />

      {/* The ordinal. Tabular figures so a column of numbers aligns — and here
          the number IS the meaning: a stage's position is its sequence. */}
      <span className="rm-figures relative z-10 pointer-events-none text-sm text-faint font-medium w-5 text-right flex-shrink-0">
        {index + 1}
      </span>

      <p className="relative z-10 pointer-events-none text-sm font-medium text-ink truncate flex-1 min-w-0">
        {stage.name}
      </p>

      {canEdit && (
        <div className="relative z-10 flex items-center gap-0.5 flex-shrink-0">
          <StageIconButton label="Monter" disabled={index === 0 || busy} onClick={() => onMove(-1)}>
            <ArrowUp size={16} />
          </StageIconButton>
          <StageIconButton
            label="Descendre"
            disabled={index === total - 1 || busy}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={16} />
          </StageIconButton>
          <StageIconButton label="Renommer" onClick={onEdit}>
            <Pencil size={16} />
          </StageIconButton>
          <StageIconButton label="Supprimer" disabled={checking} onClick={onDelete}>
            {/* The spinner replaces the bin while the usage counts load, so the
                pause before the dialog is explained rather than dead. */}
            {checking ? <XSpinner size={16} tone="current" /> : <Trash2 size={16} />}
          </StageIconButton>
        </div>
      )}
    </div>
  );
}

function StageIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      // Not red, for the reason LotTab's IconButton gives: a row of red bins
      // reads as a row of alarms. The confirmation dialog carries the warning.
      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-[4px] text-muted hover:text-ink hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast)"
    >
      {children}
    </button>
  );
}

/* ── EDITOR ─────────────────────────────────────────────────────────────── */

/**
 * One field, used for both adding and renaming.
 *
 * A stage has exactly one editable property, so this is an inline field rather
 * than LotTab's card editor — a full panel for a single input would be heavier
 * than the thing it edits. Enter saves and Escape cancels, because with one
 * field the keyboard path is the fast one.
 */
function StageNameEditor({
  label,
  value,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  label: string;
  value: string;
  saving: boolean;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-surface border border-line-strong rounded-[4px] p-3 rm-enter">
      <div className="flex items-center justify-between mb-2">
        <p className="rm-label">{label}</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annuler"
          className="text-muted hover:text-ink transition-colors duration-(--duration-fast) min-h-[32px] px-1"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-2 items-start">
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          className={`${inputClassName} flex-1 min-w-0`}
          placeholder="Ex : Fondation, Structure, Enveloppe"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-label="Enregistrer"
          className="flex-shrink-0 min-h-[44px] min-w-[44px] px-3 rounded-[4px] border border-ink text-ink hover:bg-subtle active:bg-line disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast) flex items-center justify-center"
        >
          {saving ? <XSpinner size={16} tone="current" /> : <Check size={16} />}
        </button>
      </div>
    </div>
  );
}
