import { useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { uploadVoiceNote } from "../../lib/voiceNotesApi";
import { useModalOpen } from "../../hooks/useModalOpen";
import {
  useAudioRecorder,
  formatElapsed,
  MAX_RECORDING_SECONDS,
} from "../../hooks/useAudioRecorder";

interface Props {
  open: boolean;
  visitId: string;
  onClose: () => void;
  /** Fires after a successful upload, so the caller can refresh or navigate. */
  onSaved?: () => void;
}

// The "+" menu's recorder. Shares useAudioRecorder with VoiceNotesSection,
// so there is still exactly one MediaRecorder lifecycle in the app — this
// component only supplies a bigger, single-purpose surface for the case
// where recording is the whole intent.
export default function VoiceRecorderModal({ open, visitId, onClose, onSaved }: Props) {
  const [uploading, setUploading] = useState(false);
  useModalOpen(open);

  const { recording, elapsed, capabilityError, start, stop } = useAudioRecorder({
    onComplete: async (file, durationSeconds) => {
      setUploading(true);
      try {
        await uploadVoiceNote(visitId, file, durationSeconds);
        toast.success("Note vocale enregistrée");
        onSaved?.();
        onClose();
      } catch (e: any) {
        console.error("Voice upload failed", e);
        toast.error("Téléversement échoué : " + e.message);
      } finally {
        setUploading(false);
      }
    },
  });

  if (!open) return null;

  // Closing mid-recording discards: stop() would fire onComplete and upload
  // something the user just cancelled.
  const cancel = () => {
    if (recording || uploading) return;
    onClose();
  };

  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsed);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center"
      onClick={cancel}
    >
      <div
        className="bg-surface rounded-t-2xl sm:rounded-[4px] w-full sm:max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-recorder-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 id="voice-recorder-title" className="text-base font-semibold text-ink">
            Note vocale
          </h2>
          <button
            onClick={cancel}
            disabled={recording || uploading}
            aria-label="Fermer"
            className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink disabled:opacity-30 rounded-[4px]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-5">
          {capabilityError ? (
            <p className="text-sm text-body text-center">{capabilityError}</p>
          ) : (
            <>
              <div className="text-4xl font-semibold tabular-nums text-ink leading-none">
                {formatElapsed(elapsed)}
              </div>

              {recording ? (
                <p className="flex items-center gap-2 text-sm text-brand-strong">
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-open animate-pulse"
                    aria-hidden="true"
                  />
                  Enregistrement en cours
                  {remaining <= 60 && <span className="text-muted">· reste {formatElapsed(remaining)}</span>}
                </p>
              ) : (
                <p className="text-sm text-muted text-center">
                  {uploading ? "Téléversement…" : "Appuyez pour commencer"}
                </p>
              )}

              <button
                onClick={recording ? stop : start}
                disabled={uploading}
                aria-label={recording ? "Arrêter" : "Enregistrer"}
                className={`w-24 h-24 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50 ${
                  recording ? "bg-ink hover:bg-ink/90" : "bg-brand-600 hover:bg-brand-700"
                }`}
              >
                {recording ? <Square size={32} fill="currentColor" /> : <Mic size={32} />}
              </button>

              <button
                onClick={recording ? stop : cancel}
                disabled={uploading}
                className="text-sm font-medium text-body hover:text-ink disabled:opacity-50 min-h-[44px] px-4"
              >
                {recording ? "Arrêter et enregistrer" : "Annuler"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
