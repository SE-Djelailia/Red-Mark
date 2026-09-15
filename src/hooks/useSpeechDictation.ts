import { useCallback, useEffect, useRef, useState } from "react";

// Speech-to-text for form fields, via the browser's own recognition engine.
//
// WHY NOT WHISPER: the app already sends voice NOTES to OpenAI
// (voiceNotesApi + TranscriptionDisclosure), which costs money per minute and
// needs a round trip. Dictation is different in kind — short, immediate, and
// worth nothing if it arrives ten seconds later — so it uses the engine that
// ships with the device: free, no key, no upload of a file we then have to
// store and clean up.
//
// HONESTY ABOUT "ON-DEVICE": Safari and Chrome both STREAM AUDIO TO A VENDOR
// SERVER (Apple / Google) for recognition in their default mode. It is free
// and keyless, but it is NOT local. Chrome 137+ can run genuinely on-device
// when a language pack is installed, and we prefer that when available (see
// preferOnDevice below) — but it is Chrome-only, so the feature as a whole
// must not be described to users as on-device. The caller shows a one-line
// notice saying the audio may be processed online; see DictationButton.
//
// This is the same judgement TranscriptionDisclosure makes for voice notes,
// scaled to a much smaller exposure: dictation is a sentence the architect is
// deliberately speaking to be written down, not ambient site conversation, so
// it gets a line of helper text rather than a blocking modal.

// ---------------------------------------------------------------------------
// The Web Speech API is not in TypeScript's DOM lib (it is a draft spec that
// ships only behind a vendor prefix in Safari), so the shapes it actually
// returns are declared here rather than reached for through `any` at each use.
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  /** Chrome 137+ only: ask for the local engine rather than the cloud one. */
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  // Standard name first: Chrome/Edge expose BOTH, and the unprefixed one is
  // the spec-compliant object. Safari exposes only the webkit form.
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * True when this browser can dictate at all.
 *
 * Read at module level by the button so an unsupported browser renders NO
 * control rather than a disabled one: on iOS Chrome/Firefox (WebKit shells
 * that do not expose the API) and on Firefox everywhere, the platform
 * keyboard's own mic key still works, so a dead button would be strictly
 * worse than no button.
 *
 * Recognition also requires a secure context — same rule as getUserMedia.
 */
export function isDictationSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  return getRecognitionCtor() !== null;
}

/** fr-CA is the app's language; fr-FR is the fallback when a device ships
 *  only metropolitan French. Recognition falls back on its own for an
 *  unknown tag, but naming both makes the intent explicit. */
const PRIMARY_LANG = "fr-CA";
const FALLBACK_LANG = "fr-FR";

function describeError(code: string): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Accès au microphone refusé. Autorisez l'accès dans les paramètres du navigateur.";
    case "audio-capture":
      return "Aucun microphone détecté sur cet appareil.";
    case "network":
      return "La reconnaissance vocale nécessite une connexion. Réessayez ou utilisez le clavier.";
    case "language-not-supported":
      return "La dictée en français n'est pas disponible sur cet appareil.";
    case "no-speech":
      // Not an error worth interrupting for: the user tapped the mic and said
      // nothing yet. Silently keep listening.
      return null;
    case "aborted":
      // Fired by our own stop()/abort(). Never a user-facing condition.
      return null;
    default:
      return "Dictée indisponible : " + code;
  }
}

interface Options {
  /** Receives each finalized phrase. The caller decides where it lands —
   *  these hooks never own the field's value. */
  onResult: (text: string) => void;
  /** Surfaced for anything the user must act on. `no-speech` and `aborted`
   *  never reach here. */
  onError?: (message: string) => void;
  lang?: string;
}

export interface SpeechDictation {
  listening: boolean;
  /** The phrase being spoken right now, before the engine commits to it.
   *  Shown live so a silent mic is visibly distinguishable from a working
   *  one — the single most common "is this broken?" moment. */
  interim: string;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

export function useSpeechDictation({
  onResult,
  onError,
  lang = PRIMARY_LANG,
}: Options): SpeechDictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Distinguishes "the engine stopped on its own" from "the user tapped
  // stop". iOS needs that distinction to auto-restart; see onend below.
  const wantListeningRef = useRef(false);
  const triedFallbackLangRef = useRef(false);

  // Read through refs so a caller passing inline arrows doesn't have to
  // memoize them to keep start/stop stable — same convention as
  // useAudioRecorder's onComplete.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const supported = isDictationSupported();

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Already stopped; nothing to unwind.
      }
    }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    if (wantListeningRef.current) return; // already going

    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      onErrorRef.current?.("Dictée indisponible sur ce navigateur.");
      return;
    }

    rec.lang = triedFallbackLangRef.current ? FALLBACK_LANG : lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    // Ask for a continuous session. iOS Safari IGNORES this and ends the
    // session after a pause regardless — handled by the restart in onend.
    rec.continuous = true;
    // Chrome 137+: run the recognition locally when a language pack is
    // present. Ignored everywhere else, which is why it is set optimistically
    // rather than gated on a capability check — a browser that does not know
    // the property simply drops it.
    rec.processLocally = true;

    rec.onstart = () => setListening(true);

    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      // Only results from resultIndex onward are new; earlier entries were
      // already delivered on a previous event.
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText.trim()) {
        onResultRef.current(finalText.trim());
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    rec.onerror = (event) => {
      // A device with no fr-CA pack gets one silent retry at fr-FR before the
      // user is told anything — the failure is ours to absorb, not theirs.
      if (event.error === "language-not-supported" && !triedFallbackLangRef.current) {
        triedFallbackLangRef.current = true;
        try {
          rec.abort();
        } catch {
          // ignore
        }
        // Re-enter with the fallback tag. wantListening stays true so onend
        // does not treat this as a user-initiated stop.
        window.setTimeout(() => {
          if (wantListeningRef.current) {
            wantListeningRef.current = false;
            start();
          }
        }, 0);
        return;
      }

      const message = describeError(event.error);
      if (message) {
        wantListeningRef.current = false;
        setListening(false);
        setInterim("");
        onErrorRef.current?.(message);
      }
    };

    rec.onend = () => {
      // iOS Safari is effectively single-shot: it ends the session after a
      // pause even with continuous = true. Restart while the user still wants
      // to dictate, so a long description can be spoken in several breaths.
      // Expect a brief gap between phrases on iPad — a platform limit.
      if (wantListeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // Some engines refuse an immediate restart; fall through and end
          // the session rather than spin.
        }
      }
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = rec;
    wantListeningRef.current = true;
    try {
      rec.start();
    } catch {
      // Thrown when a session is already running — treat as already started.
      wantListeningRef.current = false;
      onErrorRef.current?.("La dictée est déjà en cours.");
    }
  }, [lang]);

  // Abort on unmount: a live recognition session holds the microphone, and a
  // form closed mid-dictation must not leave it open.
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { listening, interim, supported, start, stop };
}

/**
 * Appends a dictated phrase to whatever the field already holds.
 *
 * Dictation SUPPLEMENTS typing rather than replacing it — someone types half a
 * sentence, dictates the rest, and both must survive. Joining with a single
 * space keeps that readable without guessing at punctuation the engine already
 * inserts for French.
 */
export function appendDictated(existing: string, phrase: string): string {
  const addition = phrase.trim();
  if (!addition) return existing;
  if (!existing.trim()) return addition;
  // Don't double a space the user already left at the caret.
  return existing.replace(/\s+$/, "") + " " + addition;
}
