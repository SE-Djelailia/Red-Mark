import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Play, Pause, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  deleteVoiceNote,
  getSignedUrl,
  listVoiceNotes,
  uploadVoiceNote,
} from "../../lib/voiceNotesApi";
import type { VoiceNote } from "../../lib/voiceNotesApi";
import ConfirmDialog from "./ConfirmDialog";
import { Card, ListRow, ListRows } from "./ui-kit/Card";
import { formatRelativeDate } from "../../lib/dateUtils";
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
    <div className={bare ? "space-y-3" : "bg-surface rounded-xl border border-line p-4 space-y-3"}>
      {/* One large target instead of a small header button. On site this is
          reached with gloves on, often without looking at the screen — so it
          spans the card and stays in the same place whether idle or live. */}
      {!recording ? (
        <button
          onClick={start}
          disabled={!!capabilityError || uploading}
          className="w-full h-14 flex items-center justify-center gap-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-colors font-medium"
        >
          <Mic size={20} />
          <span>{uploading ? "Téléversement…" : "Enregistrer une note"}</span>
        </button>
      ) : (
        <div className="w-full h-14 flex items-center gap-3 pl-4 pr-2 bg-brand-50 border border-brand-100 rounded-xl">
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
            className="ml-auto h-11 px-5 flex items-center gap-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium"
          >
            <Square size={14} fill="currentColor" />
            Arrêter
          </button>
        </div>
      )}

      {capabilityError && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle size={16} className="text-warn flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">{capabilityError}</div>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-center text-xs text-faint py-2">Aucune note vocale pour cette visite</p>
      ) : (
        <Card className="overflow-hidden">
          <ListRows>
            {notes.map((note) => (
              <ListRow key={note.id} className="flex items-center gap-3">
                <button
                  onClick={() => togglePlay(note)}
                  className="w-11 h-11 rounded-full bg-brand-600 text-white flex items-center justify-center flex-shrink-0 hover:bg-brand-700 transition-colors"
                  aria-label={playingId === note.id ? "Pause" : "Lire"}
                >
                  {playingId === note.id ? <Pause size={18} /> : <Play size={18} />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">
                    <span className="font-medium tabular-nums">
                      {formatElapsed(note.duration_seconds)}
                    </span>
                    <span className="text-muted"> · {formatRelativeDate(new Date(note.created_at))}</span>
                  </div>
                  {/* Transcription line. Filled in the next step; until then
                      the row simply doesn't reserve empty space for it. */}
                  {note.transcription && (
                    <div className="text-xs text-muted line-clamp-2 mt-0.5">
                      {note.transcription}
                    </div>
                  )}
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
