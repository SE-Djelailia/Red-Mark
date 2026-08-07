import { useCallback, useEffect, useState } from "react";
import { WifiOff, Upload, AlertTriangle, RotateCw, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  getQueuedItems,
  retryFailedUploads,
  UPLOAD_QUEUE_CHANGED_EVENT,
  type QueuedUpload,
  type QueuedUploadStatus,
} from "../../lib/uploadQueue";

interface QueueCounts {
  /** In flight or waiting for the next drain — genuinely "syncing". */
  syncing: number;
  /** Server verdicts (403/413). Retrying will not help without user action. */
  failed: number;
  total: number;
}

function tally(items: QueuedUpload[]): QueueCounts {
  const failed = items.filter((i) => i.status === "permanent").length;
  return { syncing: items.length - failed, failed, total: items.length };
}

const hasDiagnostics = (status: QueuedUploadStatus): boolean =>
  status === "permanent" || status === "failed";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const refresh = useCallback(() => {
    getQueuedItems()
      .then(setItems)
      .catch((error: unknown) => {
        console.error("❌ Error reading upload queue:", error);
      });
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    refresh();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(UPLOAD_QUEUE_CHANGED_EVENT, refresh);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(UPLOAD_QUEUE_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  const counts = tally(items);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const { uploaded, failed, permanent } = await retryFailedUploads();
      if (uploaded > 0) toast.success(`${uploaded} photo(s) envoyée(s).`);
      if (permanent > 0) {
        toast.error(`${permanent} photo(s) refusée(s) par le serveur.`, { duration: 8000 });
      } else if (failed > 0) {
        toast.info(`${failed} photo(s) toujours en attente, nouvelle tentative automatique.`);
      }
    } catch (error) {
      console.error("❌ Retry failed:", error);
      toast.error("La nouvelle tentative a échoué.");
    } finally {
      setRetrying(false);
    }
  };

  // ── TEMPORARY DIAGNOSTIC — remove once the iOS standalone failure is
  // identified. Everything between this marker and its closing twin exists
  // only so a raw error string can be read on a phone with no dev tools.
  const diagnostics = items.filter((i) => hasDiagnostics(i.status));

  const diagnosticText = () =>
    [
      `standalone=${window.matchMedia("(display-mode: standalone)").matches}`,
      `onLine=${navigator.onLine}`,
      `abortSignalTimeout=${typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"}`,
      `ua=${navigator.userAgent}`,
      ...diagnostics.map(
        (i) =>
          `[${i.status}] attempts=${i.attempts ?? 0} size=${i.file?.size ?? "?"} type=${
            i.file?.type || "?"
          } isFile=${i.file instanceof File} err=${i.lastError ?? "(none)"}`,
      ),
    ].join("\n");

  const copyDiagnostics = async () => {
    const text = diagnosticText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Diagnostic copié");
    } catch {
      // Clipboard API is blocked in some iOS standalone contexts; fall back to
      // a log so the text can still be retrieved another way.
      console.log("QUEUE DIAGNOSTIC:\n" + text);
      toast.error("Copie impossible — voir le détail affiché");
    }
  };
  // ── end TEMPORARY DIAGNOSTIC ──

  if (isOnline && counts.total === 0) {
    return null;
  }

  // Failures outrank the sync spinner: a photo the server REFUSED is the one
  // thing here the user has to act on. Previously a permanently-failed item
  // rendered as "Synchronisation…" forever, which read as progress.
  // Only while online: offline, "Mode hors ligne" is the more actionable
  // message, and a Réessayer button with no connection just fails again.
  const showFailed = counts.failed > 0 && isOnline;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 w-[calc(100vw-1.5rem)] max-w-md">
      <div className="flex justify-center">
        {showFailed ? (
          <div className="bg-red-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span>
              {counts.failed} en échec
              {counts.syncing > 0 && ` • ${counts.syncing} en attente`}
            </span>
            <button
              onClick={() => void handleRetry()}
              disabled={retrying}
              className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-60 font-medium min-h-[32px]"
            >
              <RotateCw size={13} className={retrying ? "animate-spin" : undefined} />
              Réessayer
            </button>
          </div>
        ) : isOnline ? (
          <div className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
            <Upload size={16} className="animate-pulse" />
            <span>Synchronisation de {counts.syncing} élément(s)...</span>
          </div>
        ) : (
          <div className="bg-orange-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
            <WifiOff size={16} />
            <span>Mode hors ligne</span>
            {counts.total > 0 && <span className="ml-1">• {counts.total} en attente</span>}
          </div>
        )}
      </div>

      {/* ── TEMPORARY DIAGNOSTIC PANEL — remove with its logic above. ── */}
      {diagnostics.length > 0 && (
        <div className="mt-2">
          <div className="flex justify-center">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-[11px] font-medium shadow-lg min-h-[32px]"
            >
              <ChevronDown
                size={12}
                className={showDetails ? "rotate-180 transition-transform" : "transition-transform"}
              />
              Détail de l'erreur ({diagnostics.length})
            </button>
          </div>

          {showDetails && (
            <div className="mt-2 bg-slate-900/95 text-white rounded-xl shadow-xl p-3 space-y-2 max-h-[50vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Diagnostic file d'attente
                </span>
                <button
                  onClick={() => void copyDiagnostics()}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-[11px] min-h-[30px]"
                >
                  <Copy size={11} />
                  Copier
                </button>
              </div>

              <p className="text-[10px] leading-relaxed text-slate-400 font-mono break-all">
                standalone=
                {String(window.matchMedia("(display-mode: standalone)").matches)} · onLine=
                {String(navigator.onLine)} · abortSignalTimeout=
                {String(
                  typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function",
                )}
              </p>

              {diagnostics.map((item) => (
                <div key={item.id} className="border-t border-white/15 pt-2">
                  <div className="text-[10px] font-mono text-slate-400 break-all">
                    {item.status} · essais {item.attempts ?? 0} · {item.file?.size ?? "?"} o ·{" "}
                    {item.file?.type || "type inconnu"} ·{" "}
                    {item.file instanceof File ? "File" : "Blob"}
                  </div>
                  {/* The raw string. `select-all` so a long-press selects the
                      whole thing in one gesture on iOS. */}
                  <p className="mt-1 text-[11px] leading-snug font-mono break-all select-all text-amber-200">
                    {item.lastError || "(aucun message enregistré)"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ── end TEMPORARY DIAGNOSTIC PANEL ── */}
    </div>
  );
}
