import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Trash2,
  Play,
  Pause,
  AlertCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteVoiceNote,
  getSignedUrl,
  listVoiceNotes,
  uploadVoiceNote,
  transcribeVoiceNote,
  isTranscribable,
} from "../../lib/voiceNotesApi";
import type { VoiceNote } from "../../lib/voiceNotesApi";
import ConfirmDialog from "./ConfirmDialog";
import TranscriptionDisclosure, { transcriptionDisclosureAccepted } from "./TranscriptionDisclosure";
import { Card, ListRow, ListRows } from "./ui-kit/Card";
import { formatRelativeDate } from "../../lib/dateUtils";
import XSpinner from "./ui-kit/XSpinner";
import EmptyState from "./ui-kit/EmptyState";
import {
  useAudioRecorder,
  formatElapsed,
  MAX_RECORDING_SECONDS,
} from "../../hooks/useAudioRecorder";

interface Props {
  visitId: string;
  // When rendered inside another card, skips this component's own outer card
  // chrome so it doesn't double up.
  bare?: boolean;
}

export default function VoiceNotesSection({ visitId, bare = false }: Props) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<VoiceNote | null>(null);
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // Transcription is per-note and opt-in; none of this runs on its own.
  const [pendingDisclosureId, setPendingDisclosureId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listVoiceNotes(visitId);
      setNotes(list);
    } catch (e: any) {
      console.error("Voice notes load failed", e);
    }
  }, [visitId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The recorder lifecycle now lives in useAudioRecorder so the upcoming
  // FAB recorder can share it; this component only says what to do with
  // the finished file.
  const handleComplete = useCallback(
    async (file: File, durationSeconds: number) => {
      setUploading(true);
      try {
        const note = await uploadVoiceNote(visitId, file, durationSeconds);
        setNotes((n) => [note, ...n]);
        toast.success("Note vocale enregistrée");
      } catch (e: any) {
        console.error("Voice upload failed", e);
        toast.error("Téléversement échoué : " + e.message);
      } finally {
        setUploading(false);
      }
    },
    [visitId],
  );

  const { recording, elapsed, capabilityError, start, stop } = useAudioRecorder({
    onComplete: handleComplete,
  });

  // The edge function runs Whisper synchronously, so this normally resolves
  // straight to done/error. Polling below is the safety net for a request
  // that was interrupted, or a note another device is transcribing.
  const runTranscription = useCallback(async (noteId: string) => {
    setNotes((n) =>
      n.map((x) => (x.id === noteId ? { ...x, transcription_status: "processing" } : x)),
    );
    try {
      const updated = await transcribeVoiceNote(noteId);
      setNotes((n) => n.map((x) => (x.id === noteId ? updated : x)));
      if (updated.transcription_status === "error") {
        toast.error(updated.transcription_error || "Transcription échouée.");
      }
    } catch (e: any) {
      // 503 = the key isn't configured on the server. That's a setup state,
      // not a broken note, so the row goes back to offering "Transcrire"
      // rather than sitting on a spinner or a red error forever.
      const unavailable = /503|non configur/i.test(e?.message || "");
      setNotes((n) =>
        n.map((x) =>
          x.id === noteId
            ? {
                ...x,
                transcription_status: unavailable ? "none" : "error",
                transcription_error: unavailable ? null : "Transcription échouée.",
              }
            : x,
        ),
      );
      toast.error(
        unavailable ? "Transcription indisponible pour le moment." : "Transcription échouée.",
      );
    }
  }, []);

  const handleTranscribeClick = (note: VoiceNote) => {
    if (!transcriptionDisclosureAccepted()) {
      setPendingDisclosureId(note.id);
      return;
    }
    void runTranscription(note.id);
  };

  // Poll only while something is actually processing, and give up after ~2
  // minutes so a stuck job can't spin forever — the row falls back to
  // Réessayer instead.
  const hasProcessing = notes.some((n) => n.transcription_status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    let elapsedMs = 0;
    pollRef.current = setInterval(() => {
      elapsedMs += 5000;
      if (elapsedMs > 120000) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setNotes((n) =>
          n.map((x) =>
            x.transcription_status === "processing"
              ? { ...x, transcription_status: "error", transcription_error: "Délai dépassé." }
              : x,
          ),
        );
        return;
      }
      void refresh();
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [hasProcessing, refresh]);

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
    const u = await getSignedUrl(note.bucket, note.storage_path);
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

  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsed);

  return (
    <div className={bare ? "space-y-3" : "bg-surface rounded-[4px] border border-line p-4 space-y-3"}>
      {/* One large target instead of a small header button. On site this is
          reached with gloves on, often without looking at the screen — so it
          spans the card and stays in the same place whether idle or live. */}
      {!recording ? (
        <button
          onClick={start}
          disabled={!!capabilityError || uploading}
          className="w-full h-14 flex items-center justify-center gap-2.5 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
        >
          <Mic size={20} />
          <span>{uploading ? "Téléversement…" : "Enregistrer une note"}</span>
        </button>
      ) : (
        <div className="w-full h-14 flex items-center gap-3 pl-4 pr-2 bg-surface border border-line border-l-2 border-l-brand-600 rounded-[4px]">
          <span
            className="w-2.5 h-2.5 rounded-full bg-open flex-shrink-0 animate-pulse"
            aria-hidden="true"
          />
          <span className="text-base font-semibold tabular-nums text-brand-strong">
            {formatElapsed(elapsed)}
          </span>
          {/* Only appears in the last minute — a countdown running the whole
              time would read as a limit rather than a safety net. */}
          {remaining <= 60 && (
            <span className="text-xs text-muted">reste {formatElapsed(remaining)}</span>
          )}
          <button
            onClick={stop}
            className="ml-auto h-11 px-5 flex items-center gap-2 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-brand-800 font-medium"
          >
            <Square size={16} fill="currentColor" />
            Arrêter
          </button>
        </div>
      )}

      {capabilityError && (
        <div className="flex items-start gap-2 bg-subtle border border-line-strong rounded-[4px] p-3">
          <AlertCircle size={16} className="text-warn flex-shrink-0 mt-0.5" />
          <div className="text-xs text-ink">{capabilityError}</div>
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Mic size={32} className="text-faint lucide-display" />}
          label="Aucune note vocale"
          message="Enregistrez une note pour garder une observation dite plutôt qu'écrite."
        />
      ) : (
        <Card className="overflow-hidden">
          <ListRows>
            {notes.map((note) => (
              <ListRow key={note.id} className="flex items-center gap-3">
                <button
                  onClick={() => togglePlay(note)}
                  className="w-11 h-11 rounded-[4px] bg-ink text-white flex items-center justify-center flex-shrink-0 hover:bg-ink/85 transition-colors"
                  aria-label={playingId === note.id ? "Pause" : "Lire"}
                >
                  {playingId === note.id ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">
                    <span className="font-medium tabular-nums">
                      {formatElapsed(note.duration_seconds)}
                    </span>
                    <span className="text-muted"> · {formatRelativeDate(new Date(note.created_at))}</span>
                  </div>
                  {/* Transcription slot — one of four mutually exclusive
                      states. Nothing here happens without a tap. */}
                  {note.transcription_status === "processing" ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
                      <XSpinner size={12} label={null} />
                      Transcription en cours…
                    </div>
                  ) : note.transcription_status === "done" && note.transcription ? (
                    <div
                      onClick={() =>
                        setExpandedIds((ids) =>
                          ids.includes(note.id)
                            ? ids.filter((x) => x !== note.id)
                            : [...ids, note.id],
                        )
                      }
                      className={`text-xs text-body mt-1 cursor-pointer ${
                        expandedIds.includes(note.id) ? "" : "line-clamp-2"
                      }`}
                    >
                      {note.transcription}
                    </div>
                  ) : note.transcription_status === "error" ? (
                    <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
                      <span className="text-muted">
                        {note.transcription_error || "Transcription échouée."}
                      </span>
                      <button
                        onClick={() => void runTranscription(note.id)}
                        className="font-medium text-brand-strong hover:underline"
                      >
                        Réessayer
                      </button>
                    </div>
                  ) : isTranscribable(note) ? (
                    <button
                      onClick={() => handleTranscribeClick(note)}
                      className="flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline mt-1"
                    >
                      <FileText size={12} />
                      Transcrire
                    </button>
                  ) : null}
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
                  className="w-11 h-11 flex items-center justify-center text-faint hover:text-brand-600 flex-shrink-0"
                  aria-label="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </ListRow>
            ))}
          </ListRows>
        </Card>
      )}

      <TranscriptionDisclosure
        open={!!pendingDisclosureId}
        onCancel={() => setPendingDisclosureId(null)}
        onConfirm={() => {
          const id = pendingDisclosureId;
          setPendingDisclosureId(null);
          if (id) void runTranscription(id);
        }}
      />

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
