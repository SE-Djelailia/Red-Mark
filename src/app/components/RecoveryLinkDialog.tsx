import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";
import Button from "./ui-kit/Button";

/**
 * Shows a set-password link that the admin must pass on themselves.
 *
 * A MODAL, deliberately. This started as a quiet grey panel under the invite
 * form, and an admin read "Créer le compte" as "create the account and email
 * them" — provisioning sends no mail at all, so the link on screen was the
 * ONLY way that person could ever reach their account, and it scrolled past
 * unnoticed. A link that is the sole path to an account cannot be an aside.
 *
 * Reused for re-issuing a lost link from the roster, so both paths present it
 * identically.
 */
export default function RecoveryLinkDialog({
  open,
  link,
  recipient,
  isReissue = false,
  onClose,
}: {
  open: boolean;
  link: string | null;
  /** Name or email of the person the link is for — used in the instruction. */
  recipient: string;
  /** Changes the wording from "account created" to "new link". */
  isReissue?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useModalOpen(open);

  if (!open || !link) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link!);
      setCopied(true);
      toast.success("Lien copié");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // The Clipboard API is unavailable in some iOS standalone contexts.
      // The link is already select-all on screen, so say that rather than
      // failing silently.
      toast.error("Copie impossible — sélectionnez le lien et copiez-le à la main");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-link-title"
    >
      <div className="bg-surface rounded-[4px] max-w-lg w-full p-6 border border-line shadow-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-[4px] bg-subtle flex items-center justify-center flex-shrink-0">
            <KeyRound size={20} className="text-ink" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="recovery-link-title" className="text-base font-semibold text-ink">
              {isReissue ? "Nouveau lien de connexion" : "Compte créé"}
            </h2>
            <p className="text-sm text-muted mt-1">
              Envoyez ce lien à <span className="text-ink">{recipient}</span> pour qu'elle
              définisse son mot de passe.
            </p>
          </div>
        </div>

        {/* The warning sits ABOVE the link, not below it: an admin who copies
            and closes without scrolling must still have seen it.

            The expiry line matters more than it looks: these links carry
            Supabase's email-OTP lifetime (one hour by default), so a link
            copied now and emailed this evening will already be dead when it
            is opened. If that happens, re-issue it from the roster. */}
        <div className="flex items-start gap-2 rounded-[4px] border border-line-strong bg-subtle px-3 py-2.5 mb-3">
          <AlertTriangle size={16} className="text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-warn">
            Aucun courriel n'a été envoyé. Ce lien ne sera plus affiché — copiez-le maintenant, et
            transmettez-le sans tarder&nbsp;: il expire après environ une heure. Passé ce délai,
            regénérez-en un avec « Lien de connexion ».
          </p>
        </div>

        <div className="rounded-[4px] border border-line bg-subtle p-3 mb-4">
          <p className="text-xs text-muted font-mono break-all select-all leading-relaxed">
            {link}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => void copy()} fullWidth>
            {copied ? (
              <>
                <Check size={16} aria-hidden="true" />
                Copié
              </>
            ) : (
              <>
                <Copy size={16} aria-hidden="true" />
                Copier le lien
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={onClose} fullWidth>
            {copied ? "Terminé" : "Fermer sans copier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
