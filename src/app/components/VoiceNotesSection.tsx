import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Play, Pause, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  deleteVoiceNote,
  getFloorPlanSignedUrl,
  listVoiceNotes,
  uploadVoiceNote,
} from "../../lib/floorPlansApi";
import type { VoiceNote } from "../../lib/floorPlansApi";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  visitId: string;
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMime(): string | null {
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

function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
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

export default function VoiceNotesSection({ visitId }: Props) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VoiceNote | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const startedAt = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  async function refresh() {
    try {
      const list = await listVoiceNotes(visitId);
      setNotes(list);
    } catch (e: any) {
      console.error("Voice notes load failed", e);
    }
  }

  useEffect(() => {
    refresh();
  }, [visitId]);

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

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = async () => {
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
          const note = await uploadVoiceNote(visitId, file, durationSec);
          setNotes((n) => [note, ...n]);
          toast.success("Note vocale enregistrée");
        } catch (e: any) {
          console.error("Voice upload failed", e);
          toast.error("Téléversement échoué : " + e.message);
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start(250);
      mediaRecorder.current = mr;
      startedAt.current = Date.now();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);
    } catch (e: any) {
      console.error("getUserMedia failed", e);
      toast.error(describeError(e));
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const stop = () => {
    try {
      mediaRecorder.current?.stop();
    } catch (e) {
      console.error("Stop failed", e);
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteVoiceNote(deleteTarget.id);
      setNotes((n) => n.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Note supprimée");
    } catch (e: any) {
      toast.error("Suppression échouée : " + e.message);
    }
  };

  const ensureUrl = async (note: VoiceNote) => {
    if (urls[note.id]) return urls[note.id];
    const u = await getFloorPlanSignedUrl(note.bucket, note.storage_path);
    setUrls((m) => ({ ...m, [note.id]: u }));
    return u;
  };

  const togglePlay = async (note: VoiceNote) => {
    try {
      const url = await ensureUrl(note);
      const el = audioRefs.current[note.id];
      if (!el) return;
      if (!el.src) el.src = url;
      if (playingId === note.id) {
        el.pause();
        setPlayingId(null);
      } else {
        Object.values(audioRefs.current).forEach((a) => a?.pause());
        await el.play();
        setPlayingId(note.id);
      }
    } catch (e: any) {
      toast.error("Lecture échouée : " + e.message);
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[#1A1A1A]">Notes vocales</h3>
          <p className="text-xs text-gray-500">Transcription automatique à venir</p>
        </div>
        {!recording ? (
          <button
            onClick={start}
            disabled={!!capabilityError}
            className="inline-flex items-center gap-2 h-11 px-4 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-50 text-sm font-medium min-h-[44px]"
          >
            <Mic size={16} />
            Enregistrer
          </button>
        ) : (
          <button
            onClick={stop}
            className="inline-flex items-center gap-2 h-11 px-4 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium min-h-[44px]"
          >
            <Square size={14} fill="currentColor" />
            Arrêter {fmt(elapsed)}
          </button>
        )}
      </div>

      {capabilityError && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">{capabilityError}</div>
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-[#E10600]">
          <span className="w-2 h-2 rounded-full bg-[#E10600] animate-pulse" />
          Enregistrement en cours · {fmt(elapsed)}
        </div>
      )}

      {notes.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-2">
          Aucune note vocale pour cette visite
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
              <button
                onClick={() => togglePlay(note)}
                className="w-11 h-11 rounded-full bg-[#E10600] text-white flex items-center justify-center min-h-[44px]"
                aria-label="Lire / Pause"
              >
                {playingId === note.id ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#1A1A1A]">
                  {fmt(note.duration_seconds)} · {new Date(note.created_at).toLocaleString("fr-CA")}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {note.transcription ? note.transcription : "Transcription en attente"}
                </div>
              </div>
              <audio
                ref={(el) => {
                  audioRefs.current[note.id] = el;
                }}
                onEnded={() => setPlayingId(null)}
                preload="none"
              />
              <button
                onClick={() => setDeleteTarget(note)}
                className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-[#E10600]"
                aria-label="Supprimer"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer cette note vocale ?"
        description="Cette action est définitive."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
