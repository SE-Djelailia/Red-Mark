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
// MICROPHONE PERMISSION: WHY THIS IS NOT THE SAME PROBLEM AS THE CAMERA
//
// useCameraCapture fixed its re-prompt by reading navigator.permissions before
// calling getUserMedia, because a getUserMedia grant IS persisted per origin.
// SpeechRecognition does not work that way, and the same fix does NOT apply:
//
//   · The permission this app can grant is "microphone". On iOS Safari,
//     SpeechRecognition ALSO requires Apple's separate Speech Recognition
//     consent, which is a system-level permission the page cannot query, is
//     granted per app (Safari itself, or this PWA), and is prompted by the
//     platform — not by us, and not on our schedule.
//   · navigator.permissions.query({name:"microphone"}) is not implemented in
//     WebKit. It rejects. So there is no state to read before starting, and
//     pre-checking cannot suppress a prompt the way it does for the camera.
//   · We never call getUserMedia for dictation at all. The engine opens the
//     mic itself, so there is no speculative capture call to remove.
//
// WHAT WE CAN CONTROL, AND DO: how MANY sessions a single dictation opens.
// Every new SpeechRecognition session is a fresh mic acquisition, and on iOS
// that is what the user perceives as "asking again" — the in-use indicator
// dropping and returning, and in a PWA sometimes a fresh prompt. The old code
// ended the session after the first phrase and, on a silent mic, could churn
// sessions; the restart path below is now bounded and deliberate.
//
// If iPad still prompts once per dictation after this, that is Apple's
// Speech Recognition consent model and NOT something this code can fix. See
// the report accompanying this change. Do not add a permission pre-check here
// expecting it to help — it was tried and it cannot query.
// ---------------------------------------------------------------------------

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

/** Gap before reopening a session that ended on its own.
 *
 *  Not zero. WebKit refuses a new session while the previous one is still
 *  tearing down, and a 0ms timer can still land inside that window; a short
 *  delay makes the restart reliable. It is also the audible gap between
 *  phrases on iPad, so it stays as small as it can be. */
const RESTART_DELAY_MS = 250;

/** How many consecutive sessions may end with NOTHING heard before giving up.
 *  Bounds the auto-restart loop on a muted or dead microphone. */
const MAX_EMPTY_RESTARTS = 3;

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
  // Timer for the deferred restart in onend, so unmount/stop can cancel a
  // restart that is already scheduled. Without this, tapping stop during the
  // gap between phrases reopens the mic after the user asked for it to close.
  const restartTimerRef = useRef<number | null>(null);
  // Guards the auto-restart loop. A `no-speech` error on a silent mic ends the
  // session, we restart, it goes silent again — on a device that never hears
  // anything this is an unbounded loop of sessions. Counted restarts that
  // produced NO speech, reset the moment any transcript arrives.
  const emptyRestartsRef = useRef(0);
  // True only while a restart is scheduled between phrases — the window in
  // which `listening` is true but `wantListeningRef` is false. start() treats
  // it as "already going" so a stray tap cannot open a second engine beside
  // the one about to reopen.
  const restartPendingRef = useRef(false);
  // start() is recursive (the fr-FR language retry re-enters it) and is also
  // called from onend. A ref to the latest instance keeps those call sites off
  // the useCallback dependency graph, which would otherwise be circular.
  const startRef = useRef<(isRestart?: boolean) => void>(() => {});

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

  /** Cancels a restart scheduled by onend. Both stop() and unmount need this. */
  const cancelRestart = useCallback(() => {
    restartPendingRef.current = false;
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    cancelRestart();
    const rec = recognitionRef.current;
    if (rec) {
      try {
        // abort(), not stop(). stop() asks the engine to finish processing
        // what it already heard, which fires one more onresult AFTER the user
        // has tapped the button off — text arriving in a field the user
        // believes they closed. abort() discards it.
        rec.abort();
      } catch {
        // Already stopped; nothing to unwind.
      }
    }
    setListening(false);
    setInterim("");
  }, [cancelRestart]);

  const start = useCallback((isRestart = false) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    // "Already going" includes the inter-phrase gap: wantListening is false
    // there, but a session is about to reopen and the button still shows
    // listening, so a start() now would run two engines at once.
    if (wantListeningRef.current || restartPendingRef.current) return;

    // A user-initiated start is a fresh attempt, so the give-up counter starts
    // clean; an auto-restart keeps the count onend just incremented. Passed
    // explicitly rather than inferred from timer state — the two call sites
    // know which they are, and guessing here was a bug waiting to happen.
    if (!isRestart) {
      cancelRestart();
      emptyRestartsRef.current = 0;
      triedFallbackLangRef.current = false;
    }

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
      // Any audio at all — even an uncommitted interim — proves the mic is
      // live, so the give-up counter starts over.
      if (finalText.trim() || interimText.trim()) emptyRestartsRef.current = 0;

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
        // Re-enter with the fallback tag. Goes through the same timer as the
        // ordinary restart so stop() and unmount can cancel it.
        wantListeningRef.current = false;
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          startRef.current(true);
        }, RESTART_DELAY_MS);
        return;
      }

      const message = describeError(event.error);
      if (message) {
        wantListeningRef.current = false;
        restartPendingRef.current = false;
        setListening(false);
        setInterim("");
        onErrorRef.current?.(message);
      }
    };

    rec.onend = () => {
      // iOS Safari is effectively single-shot: it ends the session after a
      // pause even with continuous = true. Restart while the user still wants
      // to dictate, so a long description can be spoken in several breaths.
      //
      // THE BUG THIS REPLACES: the old code called rec.start() on the SAME
      // object that had just ended. WebKit treats a SpeechRecognition instance
      // as spent once it fires onend and throws InvalidStateError on restart —
      // so the catch swallowed it, the session quietly ended, and dictation
      // stopped dead after the first phrase. That is the "dictation has a bug"
      // report. A restart must build a NEW instance, which is what start()
      // does, and it must be deferred: re-entering synchronously from inside
      // the engine's own onend is the case WebKit refuses most reliably.
      if (!wantListeningRef.current) {
        restartPendingRef.current = false;
        setListening(false);
        setInterim("");
        return;
      }

      if (emptyRestartsRef.current >= MAX_EMPTY_RESTARTS) {
        // Nothing has been heard across several sessions: the mic is muted, or
        // covered, or this engine will not produce results here. Stop rather
        // than reopen forever, and say so — a silent give-up would look
        // exactly like the bug being fixed.
        //
        // setListening(false) is what returns the BUTTON to its idle face.
        // Without it the button still reads "listening", so the user's next
        // tap runs stop() instead of start() and appears to do nothing — the
        // "works once, then dead" report. Every terminal path here must clear
        // it; only the restart path below may leave it set.
        wantListeningRef.current = false;
        restartPendingRef.current = false;
        setListening(false);
        setInterim("");
        onErrorRef.current?.(
          "Aucun son détecté. Vérifiez le microphone, puis réessayez.",
        );
        return;
      }

      emptyRestartsRef.current += 1;
      // `wantListening` is cleared here only so the guard at the top of start()
      // does not reject this re-entry; the restart is already committed, and
      // `listening` deliberately stays TRUE across the gap — the user is still
      // dictating, and flickering the button off and on between every phrase
      // would be worse than the pause itself.
      //
      // That divergence is exactly why restartPendingRef exists: for the few
      // hundred milliseconds between sessions, `listening` (what the button
      // shows) and `wantListeningRef` (what start() guards on) disagree, and
      // anything reading only one of them gets a wrong answer.
      wantListeningRef.current = false;
      restartPendingRef.current = true;
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        restartPendingRef.current = false;
        startRef.current(true);
      }, RESTART_DELAY_MS);
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
  }, [lang, cancelRestart]);

  // Keep the ref pointing at the latest start, for onend and the language
  // retry, which must not close over a stale one. In an effect, not during
  // render: a ref written while rendering is torn by StrictMode's double
  // invocation and by any render React discards.
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  // Abort on unmount: a live recognition session holds the microphone, and a
  // form closed mid-dictation must not leave it open.
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
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

  // The public start takes NO argument. `start` itself has an internal
  // isRestart flag, and a caller wiring it straight to onClick would pass a
  // MouseEvent into it — truthy, so the session would be treated as an
  // auto-restart and skip its counter reset. The wrapper closes that door.
  const startPublic = useCallback(() => {
    startRef.current(false);
  }, []);

  return { listening, interim, supported, start: startPublic, stop };
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
