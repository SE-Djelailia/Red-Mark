import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { updateSiteVisit } from "../../lib/supabaseApi";
import type { VisitAttendee } from "../../lib/supabase";
import { getRlsErrorMessage } from "../../lib/rlsErrors";
import { Card, ListRow, ListRows } from "./ui-kit/Card";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import ConfirmDialog from "./ConfirmDialog";
import type { Json } from "../../lib/database.types";

interface Props {
  visitId: string;
  attendees: VisitAttendee[];
  /** Creator-or-admin. Mirrors the "Creator can update their visits" policy. */
  canEdit: boolean;
  /** Receives the saved list so the host can keep its own visit state in sync. */
  onChanged: (attendees: VisitAttendee[]) => void;
}

const EMPTY: VisitAttendee = { name: "", organization: "", role: "", initials: "" };

// Derives "JS" from "Julie Simard" so the report's narrow initials column
// isn't a field anyone has to think about. Overwritable — some people go by
// three initials, and a company attendee may want none.
function autoInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// "ASSISTAIENT" — who was on site. Lives on the visit rather than on the
// report form: it is a fact about the day, and every report generated from
// this visit should agree about it.
//
// The whole array is written at once (a jsonb column, not rows), so each
// save is a single updateSiteVisit call.
export default function VisitAttendeesSection({ visitId, attendees, canEdit, onChanged }: Props) {
  // null = closed; "new" = the add form; otherwise the index being edited.
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<VisitAttendee>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const persist = async (next: VisitAttendee[]) => {
    setSaving(true);
    try {
      // Cast through unknown: `attendees` is a jsonb column typed `Json` by
      // the generator, and VisitAttendee[] is a structural subset of it that
      // TypeScript will not narrow to automatically.
      await updateSiteVisit(visitId, { attendees: next as unknown as Json });
      onChanged(next);
      setEditing(null);
      setDraft(EMPTY);
      return true;
    } catch (error) {
      console.error("Error saving attendees:", error);
      toast.error(
        getRlsErrorMessage(
          error,
          "Impossible d'enregistrer les participants.",
          "Seul l'auteur de la visite peut modifier les participants.",
        ),
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startAdd = () => {
    setDraft(EMPTY);
    setEditing("new");
  };

  const startEdit = (index: number) => {
    setDraft(attendees[index]);
    setEditing(index);
  };

  const submit = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Le nom est requis.");
      return;
    }
    const entry: VisitAttendee = {
      name,
      organization: draft.organization.trim(),
      role: draft.role.trim(),
      // Falls back to the derived initials rather than shipping a blank cell.
      initials: draft.initials.trim() || autoInitials(name),
    };
    const next =
      editing === "new"
        ? [...attendees, entry]
        : attendees.map((a, i) => (i === editing ? entry : a));
    await persist(next);
  };

  const confirmDelete = async () => {
    if (deleteIndex === null) return;
    const ok = await persist(attendees.filter((_, i) => i !== deleteIndex));
    if (ok) toast.success("Participant retiré");
    setDeleteIndex(null);
  };

  const form = (
    <div className="p-4 space-y-3 bg-canvas">
      <div>
        <label className={labelClassName}>Nom</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={inputClassName}
          placeholder="Julie Simard"
          autoFocus
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClassName}>Organisation</label>
          <input
            type="text"
            value={draft.organization}
            onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
            className={inputClassName}
            placeholder="Ville de Montréal"
          />
        </div>
        <div>
          <label className={labelClassName}>Rôle</label>
          <input
            type="text"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            className={inputClassName}
            placeholder="Gestionnaire de projet"
          />
        </div>
      </div>
      <div className="sm:max-w-[9rem]">
        <label className={labelClassName}>Initiales</label>
        <input
          type="text"
          value={draft.initials}
          onChange={(e) => setDraft({ ...draft, initials: e.target.value })}
          className={inputClassName}
          placeholder={autoInitials(draft.name) || "JS"}
          maxLength={5}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => {
            setEditing(null);
            setDraft(EMPTY);
          }}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-2 text-sm text-body hover:bg-subtle rounded-[4px] disabled:opacity-50 min-h-[44px]"
        >
          <X size={16} />
          Annuler
        </button>
        <button
          onClick={() => void submit()}
          disabled={saving || !draft.name.trim()}
          className="flex items-center gap-1 px-4 py-2 text-sm bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 disabled:opacity-50 min-h-[44px]"
        >
          <Check size={16} />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {attendees.length === 0 && editing !== "new" ? (
        <p className="text-sm text-muted">Aucun participant enregistré pour cette visite.</p>
      ) : (
        attendees.length > 0 && (
          <Card className="overflow-hidden">
            <ListRows>
              {attendees.map((a, index) =>
                editing === index ? (
                  <div key={index}>{form}</div>
                ) : (
                  <ListRow key={index} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-subtle border border-line flex items-center justify-center text-[11px] font-semibold text-body flex-shrink-0">
                      {a.initials || autoInitials(a.name) || "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{a.name}</div>
                      {(a.organization || a.role) && (
                        <div className="text-xs text-muted truncate">
                          {[a.organization, a.role].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex items-center flex-shrink-0">
                        <button
                          onClick={() => startEdit(index)}
                          className="w-11 h-11 flex items-center justify-center text-faint hover:text-ink"
                          aria-label={`Modifier ${a.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteIndex(index)}
                          className="w-11 h-11 flex items-center justify-center text-faint hover:text-brand-600"
                          aria-label={`Retirer ${a.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </ListRow>
                ),
              )}
            </ListRows>
          </Card>
        )
      )}

      {editing === "new" && <Card className="overflow-hidden">{form}</Card>}

      {canEdit && editing === null && (
        <button
          onClick={startAdd}
          className="w-full py-3 min-h-11 flex items-center justify-center gap-2 bg-surface border border-line rounded-[4px] text-sm font-medium text-ink hover:border-brand-600 hover:text-brand-600 transition-colors"
        >
          <Plus size={16} />
          Ajouter un participant
        </button>
      )}

      <ConfirmDialog
        open={deleteIndex !== null}
        title="Retirer ce participant ?"
        description="Il ne figurera plus dans les rapports générés à partir de cette visite."
        confirmLabel="Retirer"
        destructive
        onCancel={() => setDeleteIndex(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
