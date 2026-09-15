import { useCallback, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { useSpeechDictation } from "../../../hooks/useSpeechDictation";

// Shown once, ever, the first time anyone dictates on this device.
//
// The wording is deliberate. Safari and Chrome both stream the audio to a
// vendor server in their default mode, so calling this "on-device" would be
// untrue — and this app already took a position on exactly that question for
// voice notes (TranscriptionDisclosure). Dictation is a far smaller exposure:
// a sentence the architect is deliberately speaking to be written down, not
// ambient site conversation. So it gets one honest line instead of a blocking
// modal — but the line must not over-claim.
const NOTICE_KEY = "dictation_notice_seen";
const NOTICE_TEXT =
  "La dictée utilise la reconnaissance vocale de votre appareil, qui peut traiter l'audio en ligne.";

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    // Private mode / blocked storage: show the notice every time rather than
    // suppressing it. Over-informing is the safe failure here.
    return false;
  }
}

function rememberNotice(): void {
  try {
    localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // Nothing to do — the notice simply shows again next time.
  }
}

interface Props {
  /** Receives each finalized phrase, to append wherever the caller keeps it. */
  onTranscript: (text: string) => void;
  /** Names the target field for screen readers ("Dicter la description"). */
  fieldLabel: string;
  className?: string;
}

/**
 * Mic button for a text field.
 *
 * Renders NOTHING when the browser has no Speech Recognition — iOS
 * Chrome/Firefox and Firefox everywhere. Those platforms still have the
 * system keyboard's own mic key, so a disabled button would be strictly worse
 * than no button: it would advertise a capability the user cannot reach and
 * imply dictation is unavailable when it is not.
 *
 * INK, NOT RED — including while recording. Per DESIGN-SYSTEM.md red is for
 * the primary action (one per view: that is Enregistrer), deficiency/alert
 * state, active nav, and the logo. A mic is a tertiary input affordance. A red
 * recording dot would also put a second red element in a form that already has
 * a red save button, failing the "two red fills at once" test. The listening
 * state is carried by an ink FILL INVERSION plus a pulsing ring, which is
 * unambiguous without spending the budget.
 */
export default function DictationButton({ onTranscript, fieldLabel, className = "" }: Props) {
  const [showNotice, setShowNotice] = useState(false);

  const handleResult = useCallback(
    (text: string) => {
      onTranscript(text);
    },
    [onTranscript],
  );

  const handleError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  const { listening, interim, supported, start, stop } = useSpeechDictation({
    onResult: handleResult,
    onError: handleError,
  });

  // Checked at render, not in an effect: an unsupported browser must render no
  // markup at all rather than mount and then disappear.
  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      stop();
      return;
    }
    if (!noticeSeen()) {
      rememberNotice();
      setShowNotice(true);
    }
    start();
  };

  return (
    <span className="relative inline-flex flex-shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? `Arrêter la dictée` : `Dicter ${fieldLabel}`}
        aria-pressed={listening}
        title={listening ? "Arrêter la dictée" : `Dicter ${fieldLabel}`}
        className={`relative inline-flex items-center justify-center w-11 h-11 rounded-[4px] border transition-colors flex-shrink-0 ${
          listening
            ? "bg-ink text-surface border-ink"
            : "bg-surface text-muted border-line hover:text-ink hover:border-line-strong"
        } ${className}`}
      >
        {listening ? <Square size={14} /> : <Mic size={16} />}
        {listening && (
          // Ink ring, not red. Sits OUTSIDE the button box so it never
          // changes the 44px touch target.
          <span className="absolute inset-0 rounded-[4px] ring-2 ring-ink/30 animate-ping pointer-events-none" />
        )}
      </button>

      {/* Live feedback. Without this, a mic that is listening but hearing
          nothing looks identical to a broken one. Anchored to the button's
          RIGHT edge and given real width, so it reads as a phrase rather than
          being truncated into the 44px button box; it floats above the layout
          so it never reflows the form under the user's thumb. */}
      {listening && (
        <span
          role="status"
          aria-live="polite"
          className="absolute right-0 top-full mt-1 w-[60vw] max-w-[16rem] text-right text-xs text-faint italic pointer-events-none line-clamp-2"
        >
          {interim || "Dictée en cours…"}
        </span>
      )}

      {showNotice && (
        <div className="fixed inset-x-0 bottom-0 z-[60] p-4 pointer-events-none safe-area-bottom">
          <div className="mx-auto max-w-md bg-surface border border-line rounded-[4px] shadow-lg p-3 flex items-start gap-2 pointer-events-auto">
            <p className="text-xs text-muted leading-relaxed flex-1">{NOTICE_TEXT}</p>
            <button
              type="button"
              onClick={() => setShowNotice(false)}
              className="text-xs font-medium text-ink hover:text-brand-600 px-2 py-1 flex-shrink-0"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
