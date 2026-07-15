import { useEffect, useState } from "react";
import { WifiOff, Upload } from "lucide-react";
import { getQueuedItems, UPLOAD_QUEUE_CHANGED_EVENT } from "../../lib/uploadQueue";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const refreshPendingCount = () => {
      getQueuedItems()
        .then((items) => setPendingCount(items.length))
        .catch((error: unknown) => {
          console.error("❌ Error reading upload queue:", error);
        });
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    refreshPendingCount();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(UPLOAD_QUEUE_CHANGED_EVENT, refreshPendingCount);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(UPLOAD_QUEUE_CHANGED_EVENT, refreshPendingCount);
    };
  }, []);

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2">
      {isOnline && pendingCount > 0 ? (
        <div className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
          <Upload size={16} className="animate-pulse" />
          <span>Synchronisation de {pendingCount} élément(s)...</span>
        </div>
      ) : (
        <div className="bg-orange-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
          <WifiOff size={16} />
          <span>Mode hors ligne</span>
          {pendingCount > 0 && <span className="ml-1">• {pendingCount} en attente</span>}
        </div>
      )}
    </div>
  );
}
