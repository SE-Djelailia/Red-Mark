import { useEffect, useState } from "react";
import { Wifi, WifiOff, Upload, CheckCircle2 } from "lucide-react";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Simulate syncing pending items
      if (pendingSync > 0) {
        setShowSyncSuccess(true);
        setTimeout(() => {
          setPendingSync(0);
          setTimeout(() => setShowSyncSuccess(false), 2000);
        }, 1500);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      // Simulate adding pending items when offline
      setPendingSync((prev) => prev + 1);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [pendingSync]);

  if (isOnline && pendingSync === 0 && !showSyncSuccess) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2">
      {showSyncSuccess ? (
        <div className="bg-green-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
          <CheckCircle2 size={16} />
          <span>Données synchronisées</span>
        </div>
      ) : isOnline && pendingSync > 0 ? (
        <div className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
          <Upload size={16} className="animate-pulse" />
          <span>Synchronisation de {pendingSync} élément(s)...</span>
        </div>
      ) : (
        <div className="bg-orange-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
          <WifiOff size={16} />
          <span>Mode hors ligne</span>
          {pendingSync > 0 && <span className="ml-1">• {pendingSync} en attente</span>}
        </div>
      )}
    </div>
  );
}
