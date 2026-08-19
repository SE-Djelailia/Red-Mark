import { AlertTriangle } from "lucide-react";
import { useModalOpen } from "../../hooks/useModalOpen";
import Button from "./ui-kit/Button";
import type { FirmProject } from "../../lib/firmProjectsApi";

/**
 * Confirmation for revoking someone's firm access.
 *
 * The whole point is that the admin SEES the blast radius before agreeing to
 * it. Removing someone is now one action that cuts their firm membership and
 * every project assignment at once — which is what an admin actually wants
 * when a person leaves, but it is also irreversible and easy to fire by
 * accident on someone carrying a lot of access.
 *
 * So the projects are listed by name, not merely counted. "Retirer de 7
 * projets" is a number; seeing the seven names is what makes an admin stop
 * and check they picked the right person.
 */
export default function RemoveMemberDialog({
  open,
  memberName,
  projects,
  loading,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  memberName: string;
  /** Projects the person will lose. Empty array = a simpler confirmation. */
  projects: FirmProject[];
  /** True while the project list is still being fetched. */
  loading: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useModalOpen(open);
  if (!open) return null;

  const count = projects.length;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-surface rounded-[4px] max-w-md w-full p-6 border border-line shadow-sm max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-member-title"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-[4px] bg-open/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-open" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="remove-member-title" className="text-base font-semibold text-ink">
              Retirer {memberName} de la firme ?
            </h2>
            <p className="text-sm text-muted mt-1">
              {loading
                ? "Vérification de ses accès…"
                : count === 0
                  ? "Cette personne n'est assignée à aucun projet."
                  : `Cela la retirera aussi de ${count} projet${count > 1 ? "s" : ""} :`}
            </p>
          </div>
        </div>

        {!loading && count > 0 && (
          <ul className="mb-4 rounded-[4px] border border-line bg-subtle divide-y divide-line max-h-56 overflow-y-auto">
            {projects.map((p) => (
              <li key={p.id} className="px-3 py-2 text-sm text-ink truncate">
                {p.name}
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-open mb-2">Cette action est irréversible.</p>

        {/* Stated because "retirer" reasonably reads as "delete the account",
            and it does not. Someone who needs the login gone too has to do
            that separately — better said here than discovered later. */}
        <p className="text-xs text-muted mb-5">
          Son compte de connexion continuera d'exister, mais sans firme : elle n'aura plus accès à
          rien dans RedMark. La suppression complète du compte est une démarche distincte.
        </p>

        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy} fullWidth>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy || loading} fullWidth>
            {busy
              ? "Retrait…"
              : count > 0
                ? `Retirer et révoquer ${count} accès`
                : "Retirer de la firme"}
          </Button>
        </div>
      </div>
    </div>
  );
}
