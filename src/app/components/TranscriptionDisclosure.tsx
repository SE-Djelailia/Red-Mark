import { useState } from "react";
import { Info } from "lucide-react";
import { useModalOpen } from "../../hooks/useModalOpen";

const STORAGE_KEY = "voice_transcription_disclosed";

// Whether the one-time disclosure has already been accepted with "ne plus
// demander". Read defensively: a private-mode browser can throw on access.
export function transcriptionDisclosureAccepted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDisclosure() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage unavailable — the dialog simply shows again next time, which
    // is the safe direction for a data-disclosure prompt.
  }
}

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Shown the first time transcription is requested, ever. The point is that
// the audio leaves the app for a third party — a site recording can carry
// client and contractor conversation, so this is stated plainly before the
// first upload rather than buried in a settings page.
export default function TranscriptionDisclosure({ open, onCancel, onConfirm }: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(true);
  useModalOpen(open);

  if (!open) return null;

  const confirm = () => {
    if (dontAskAgain) rememberDisclosure();
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-t-2xl sm:rounded-[4px] w-full sm:max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transcription-disclosure-title"
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-[4px] bg-subtle text-ink flex items-center justify-center flex-shrink-0">
              <Info size={16} />
            </span>
            <div className="min-w-0">
              <h2
                id="transcription-disclosure-title"
                className="text-base font-semibold text-ink mb-1"
              >
                Transcrire cette note ?
              </h2>
              <p className="text-sm text-body leading-relaxed">
                L'audio de cette note sera envoyé à OpenAI pour être transcrit en texte. Les
                enregistrements de chantier peuvent contenir des conversations avec le client ou
                l'entrepreneur — ne transcrivez que les notes que vous souhaitez transmettre.
              </p>
              <p className="text-xs text-muted mt-2">
                La transcription se fait note par note. Rien n'est envoyé automatiquement.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-body cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="w-4 h-4 accent-brand-600 flex-shrink-0"
            />
            Ne plus demander
          </label>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 bg-surface border border-line text-ink rounded-[4px] hover:bg-subtle font-medium min-h-[48px]"
            >
              Annuler
            </button>
            <button
              onClick={confirm}
              className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 font-medium min-h-[48px]"
            >
              Continuer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
