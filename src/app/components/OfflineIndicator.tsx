import { useCallback, useEffect, useState } from "react";
import { WifiOff, Upload, AlertTriangle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  getQueuedItems,
  retryFailedUploads,
  UPLOAD_QUEUE_CHANGED_EVENT,
  type QueuedUpload,
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

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const [retrying, setRetrying] = useState(false);

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

    </div>
  );
}
