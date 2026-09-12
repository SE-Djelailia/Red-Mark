// Construction phases for a project.
//
// A phase is a CONTRACTUAL grouping — "Fondations", "Phase 2 — Enveloppe" —
// optionally carried out by one company from the firm's directory. It
// complements issues.discipline rather than replacing it:
//
//   discipline = trade taxonomy   (Architecture, Plomberie, …)
//   phase      = contractual unit (tied to a company, tied to this project)
//
// PERMISSIONS mirror the RLS policies so the UI never shows a control the
// database would refuse: reading is any project member, writing is
// owner/editor only. A commenter sees the list, read-only, with no add button
// and no row actions.
//
// ORDERING is explicit rather than drag-and-drop. Phases are named by number
// as often as by word ("1", "2", "Phase 3"), the list is short, and a
// drag interaction on a scrolling touch surface fights the scroll. Up/down
// controls are unambiguous with a stylus, a gloved hand, or a mouse.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createPhase,
  deletePhase,
  getPhases,
  reorderPhases,
  updatePhase,
  type Company,
  type Phase,
  type PhaseInput,
} from "../../lib/phasesApi";
import CompanyPicker from "./CompanyPicker";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./ui-kit/EmptyState";
import XSpinner from "./ui-kit/XSpinner";
import { inputClassName, labelClassName, textareaClassName } from "./ui-kit/Input";
import { IconVisit } from "./ui-kit/RedMarkIcons";

interface Props {
  projectId: string;
  /** Owner or editor. Commenters get a read-only list. */
  canEdit: boolean;
}

type Draft = { phase: Phase | null; input: PhaseInput; company: Company | null };

export default function PhasesTab({ projectId, canEdit }: Props) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Phase | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setPhases(await getPhases(projectId));
    } catch (e) {
      console.error("❌ Failed to load phases:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // The async work is declared inside the effect so no setState runs
    // synchronously in the effect body. `cancelled` drops a response that
    // arrives after the project changed, which would otherwise render one
    // project's phases under another's id.
    let cancelled = false;
    void (async () => {
      // Every setState lives inside this callback, so none runs synchronously
      // during the effect. `loading` already starts true, and is re-raised
      // here for the project-change case.
      setLoading(true);
      setLoadError(false);
      try {
        const rows = await getPhases(projectId);
        if (!cancelled) setPhases(rows);
      } catch (e) {
        console.error("❌ Failed to load phases:", e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // The next phase's sort_order: one past the current maximum, so a new
  // phase lands at the end rather than colliding with an existing position.
  const nextSortOrder = useMemo(
    () => (phases.length === 0 ? 0 : Math.max(...phases.map((p) => p.sortOrder)) + 1),
    [phases],
  );

  const startCreate = () =>
    setDraft({
      phase: null,
      input: { name: "", description: "", companyId: null, sortOrder: nextSortOrder },
      company: null,
    });

  const startEdit = (p: Phase) =>
    setDraft({
      phase: p,
      input: {
        name: p.name,
        description: p.description ?? "",
        companyId: p.companyId,
        sortOrder: p.sortOrder,
      },
      company: p.company,
    });

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.input.name.trim()) {
      toast.error("Le nom de la phase est requis.");
      return;
    }
    setSaving(true);
    try {
      if (draft.phase) {
        await updatePhase(draft.phase.id, draft.input);
        toast.success("Phase modifiée.");
      } else {
        await createPhase(projectId, draft.input);
        toast.success("Phase créée.");
      }
      setDraft(null);
      await load();
    } catch (e) {
      console.error("❌ Failed to save phase:", e);
      const msg = String((e as { message?: string })?.message ?? "");
      toast.error(
        msg.includes("phases_project_name_key") || msg.includes("duplicate")
          ? "Une phase portant ce nom existe déjà dans ce projet."
          : "Impossible d'enregistrer la phase.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deletePhase(pendingDelete.id);
      toast.success("Phase supprimée.");
      setPendingDelete(null);
      await load();
    } catch (e) {
      console.error("❌ Failed to delete phase:", e);
      toast.error("Impossible de supprimer la phase.");
    }
  };

  /**
   * Moves a phase one position and renumbers the whole list.
   *
   * Renumbering everything rather than swapping two values keeps sort_order
   * dense (0,1,2…). Sparse or duplicated values would make the name tiebreak
   * decide order, which is not what the user just asked for.
   */
  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= phases.length) return;

    const next = [...phases];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);

    // Optimistic: the reorder is the one action where waiting for a round
    // trip makes the control feel broken.
    setPhases(next.map((p, i) => ({ ...p, sortOrder: i })));
    setReordering(true);
    try {
      await reorderPhases(next.map((p, i) => ({ id: p.id, sortOrder: i })));
    } catch (e) {
      console.error("❌ Failed to reorder phases:", e);
      toast.error("Impossible de réordonner les phases.");
      await load();
    } finally {
      setReordering(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center" role="status" aria-label="Chargement des phases">
        <XSpinner size={32} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-muted mb-3">Impossible de charger les phases.</p>
        <button
          onClick={() => void load()}
          className="min-h-[44px] px-4 rounded-[4px] border border-ink text-ink text-sm font-semibold hover:bg-subtle transition-colors duration-(--duration-fast)"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header. The add button is the tab's one primary action, so it takes
          the red fill — and nothing else on this tab does. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="rm-label">Phases</p>
          <p className="text-sm text-muted mt-1 text-pretty">
            Regroupements contractuels du projet, chacun optionnellement confié à une
            entreprise.
          </p>
        </div>
        {canEdit && !draft && (
          <button
            onClick={startCreate}
            className="flex-shrink-0 min-h-[44px] px-4 rounded-[4px] bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:bg-brand-800 transition-colors duration-(--duration-fast) flex items-center gap-2"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nouvelle phase</span>
          </button>
        )}
      </div>

      {draft && (
        <PhaseEditor
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => void handleSave()}
        />
      )}

      {phases.length === 0 && !draft ? (
        <EmptyState
          icon={<IconVisit size={40} className="lucide-display" />}
          label="Phases"
          message="Aucune phase définie pour ce projet."
          action={
            canEdit
              ? { label: "Créer la première phase", onClick: startCreate }
              : undefined
          }
        />
      ) : (
        // Two columns from md (iPad portrait): a phase row is short, and one
        // per line leaves most of a large screen empty. Below md this is a
        // single column — the phone list is unchanged.
        <div className="grid gap-3 md:grid-cols-2">
          {phases.map((phase, index) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              index={index}
              total={phases.length}
              canEdit={canEdit}
              busy={reordering}
              onEdit={() => startEdit(phase)}
              onDelete={() => setPendingDelete(phase)}
              onMove={(d) => void move(index, d)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Supprimer la phase ?"
        description={
          pendingDelete
            ? `« ${pendingDelete.name} » sera retirée du projet. Les déficiences et visites qui y sont rattachées sont conservées — elles perdent seulement leur phase.`
            : ""
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/* ── ROW ────────────────────────────────────────────────────────────────── */

function PhaseCard({
  phase,
  index,
  total,
  canEdit,
  busy,
  onEdit,
  onDelete,
  onMove,
}: {
  phase: Phase;
  index: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-[4px] p-3 flex items-start gap-3">
      {/* The ordinal. Tabular figures so a column of numbers aligns. */}
      <span className="rm-figures text-sm text-faint font-medium mt-0.5 w-5 text-right flex-shrink-0">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{phase.name}</p>
        {phase.company ? (
          <p className="text-xs text-body mt-0.5 truncate">
            {phase.company.name}
            {phase.company.trade && <span className="text-muted"> · {phase.company.trade}</span>}
          </p>
        ) : (
          <p className="text-xs text-faint mt-0.5">Aucune entreprise</p>
        )}
        {phase.description && (
          <p className="text-xs text-muted mt-1 line-clamp-2 text-pretty">{phase.description}</p>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <IconButton
            label="Monter"
            disabled={index === 0 || busy}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={16} />
          </IconButton>
          <IconButton
            label="Descendre"
            disabled={index === total - 1 || busy}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={16} />
          </IconButton>
          <IconButton label="Modifier" onClick={onEdit}>
            <Pencil size={16} />
          </IconButton>
          <IconButton label="Supprimer" onClick={onDelete}>
            <Trash2 size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function IconButton({
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
      // Destructive actions are NOT red here: the tab's red is spent on the
      // primary "Nouvelle phase", and a row of red bins would read as four
      // alarms. The confirmation dialog carries the warning instead.
      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-[4px] text-muted hover:text-ink hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast)"
    >
      {children}
    </button>
  );
}

/* ── EDITOR ─────────────────────────────────────────────────────────────── */

function PhaseEditor({
  draft,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  saving: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<PhaseInput>) =>
    onChange({ ...draft, input: { ...draft.input, ...patch } });

  return (
    <div className="bg-surface border border-line-strong rounded-[4px] p-4 rm-enter">
      <div className="flex items-center justify-between mb-4">
        <p className="rm-label">{draft.phase ? "Modifier la phase" : "Nouvelle phase"}</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annuler"
          className="text-muted hover:text-ink transition-colors duration-(--duration-fast) min-h-[32px] px-1"
        >
          <X size={16} />
        </button>
      </div>

      {/* Two columns from md: name and company are the two decisions, and on
          iPad they belong side by side rather than stacked. */}
      <div className="grid gap-4 md:grid-cols-2 items-start">
        <div>
          <label className={labelClassName}>Nom de la phase *</label>
          <input
            autoFocus
            value={draft.input.name}
            onChange={(e) => set({ name: e.target.value })}
            className={inputClassName}
            placeholder="Ex : 1, Fondations, Phase 2 — Enveloppe"
          />
        </div>

        <CompanyPicker
          value={draft.company}
          onChange={(company) =>
            onChange({ ...draft, company, input: { ...draft.input, companyId: company?.id ?? null } })
          }
        />
      </div>

      <div className="mt-4">
        <label className={labelClassName}>Description</label>
        <textarea
          value={draft.input.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          rows={2}
          className={textareaClassName}
          placeholder="Optionnel — portée de la phase"
        />
      </div>

      <div className="flex gap-2 mt-4 md:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 md:flex-none md:px-6 min-h-[44px] px-4 rounded-[4px] border border-line-strong text-ink text-sm font-medium hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast)"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-1 md:flex-none md:px-6 min-h-[44px] px-4 rounded-[4px] bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 active:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-(--duration-fast) flex items-center justify-center gap-2"
        >
          {saving && <XSpinner size={16} tone="current" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
