import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Shared microphone-recording logic, lifted verbatim out of
// VoiceNotesSection so more than one surface can record without a second
// copy of the MediaRecorder lifecycle (the FAB recorder is the next
// consumer). Behaviour is unchanged apart from the duration cap below.

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // continue
    }
  }
  return null;
}

// The extension is not cosmetic: it is what the storage path is built from,
// and transcription APIs sniff the format from it. The old fallback was
// ".bin", which no transcriber accepts — webm is both the overwhelmingly
// common case here and a format everything understands.
export function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function describeError(e: any): string {
  const name = e?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Accès au microphone refusé. Autorisez l'accès dans les paramètres du navigateur.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "Aucun microphone détecté sur cet appareil.";
  if (name === "NotReadableError") return "Le microphone est utilisé par une autre application.";
  if (name === "AbortError") return "L'accès au microphone a été interrompu. Réessayez.";
  return "Microphone indisponible : " + (e?.message || name || "erreur inconnue");
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const r = Math.floor(seconds % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Hard stop. Keeps a note under both the 25 MiB bucket cap and the 25 MB
 *  transcription limit even at the fattest codec a phone will pick. */
export const MAX_RECORDING_SECONDS = 600;
/** Heads-up before the hard stop, so a long note isn't cut off mid-sentence. */
export const WARN_RECORDING_SECONDS = 480;

interface Options {
  /** Receives the finished recording. Errors here are the caller's to handle. */
  onComplete: (file: File, durationSeconds: number) => void | Promise<void>;
  maxDurationSeconds?: number;
  warnAtSeconds?: number;
}

export interface AudioRecorder {
  recording: boolean;
  elapsed: number;
  /** Non-null when this device/browser cannot record at all. */
  capabilityError: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useAudioRecorder({
  onComplete,
  maxDurationSeconds = MAX_RECORDING_SECONDS,
  warnAtSeconds = WARN_RECORDING_SECONDS,
}: Options): AudioRecorder {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const startedAt = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef(false);

  // onComplete is read through a ref so a caller passing an inline arrow
  // doesn't have to memoize it to keep start/stop stable.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setCapabilityError("L'enregistrement audio nécessite HTTPS (ou localhost).");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCapabilityError("Ce navigateur ne prend pas en charge l'enregistrement audio.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setCapabilityError("MediaRecorder n'est pas disponible sur ce navigateur.");
      return;
    }
    if (!pickMime()) {
      setCapabilityError("Aucun format audio compatible n'est supporté par ce navigateur.");
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stop = useCallback(() => {
    try {
      mediaRecorder.current?.stop();
    } catch (e) {
      console.error("Stop failed", e);
    }
    setRecording(false);
    clearTimer();
  }, [clearTimer]);

  const start = useCallback(async () => {
    if (capabilityError) {
      toast.error(capabilityError);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const mime = pickMime() || "";
      mimeRef.current = mime || "audio/webm";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      warnedRef.current = false;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.current.push(e.data);
      };
      mr.onerror = (ev: any) => {
        console.error("MediaRecorder error", ev);
        toast.error("Erreur d'enregistrement : " + (ev?.error?.message || "inconnue"));
      };
      mr.onstop = async () => {
        const actualMime = mimeRef.current;
        const blob = new Blob(chunks.current, { type: actualMime });
        const durationSec = (Date.now() - startedAt.current) / 1000;
        const ext = extForMime(actualMime);
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: actualMime });
        try {
          await onCompleteRef.current(file, durationSec);
        } finally {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };

      mr.start(250);
      mediaRecorder.current = mr;
      startedAt.current = Date.now();
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsed(secs);

        if (!warnedRef.current && secs >= warnAtSeconds && secs < maxDurationSeconds) {
          warnedRef.current = true;
          const left = Math.max(1, Math.round((maxDurationSeconds - secs) / 60));
          toast.warning(`Enregistrement long — arrêt automatique dans ${left} min.`);
        }
        if (secs >= maxDurationSeconds) {
          toast.info("Durée maximale atteinte — enregistrement arrêté.");
          stop();
        }
      }, 250);
    } catch (e: any) {
      console.error("getUserMedia failed", e);
      toast.error(describeError(e));
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [capabilityError, maxDurationSeconds, warnAtSeconds, stop]);

  return { recording, elapsed, capabilityError, start, stop };
}
