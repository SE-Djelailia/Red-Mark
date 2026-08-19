import { useState, useEffect } from "react";
import { X, HardDrive, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { useModalOpen } from "../../hooks/useModalOpen";

interface GeneralSettingsProps {
  onClose: () => void;
}

// Browsers don't expose the real localStorage quota, but ~5 MB is the
// near-universal limit — used only to give the usage bar a sensible scale.
const LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;

export default function GeneralSettings({ onClose }: GeneralSettingsProps) {
  useModalOpen();
  const { user } = useAuth();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [storageUsed, setStorageUsed] = useState("0 MB");
  const [storagePercent, setStoragePercent] = useState(0);

  useEffect(() => {
    calculateStorage();
  }, []);

  const calculateStorage = () => {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length + key.length;
      }
    }
    const mb = (totalSize / (1024 * 1024)).toFixed(2);
    setStorageUsed(`${mb} MB`);
    setStoragePercent(Math.min(100, (totalSize / LOCAL_STORAGE_QUOTA_BYTES) * 100));
  };

  const handleClearCache = () => {
    // Auth lives in IndexedDB (see authStorage.ts), not localStorage, so
    // clearing here can no longer sign the user out.
    const keysToKeep = [`team_${user?.id}`];

    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key) && !keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    }

    setShowClearConfirm(false);
    calculateStorage();
    toast.success("Cache nettoyé avec succès");
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
        <div
          className="bg-surface rounded-[4px] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-xl text-ink font-medium">Paramètres généraux</h2>
              <p className="text-sm text-body mt-1">Gestion du stockage local</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-subtle rounded-[4px] transition-colors"
            >
              <X size={24} className="text-body" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Storage Management */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
                <HardDrive size={16} className="text-ink" />
                Gestion du stockage
              </h3>
              <div className="bg-canvas rounded-[4px] p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-body">Espace utilisé (cache local)</span>
                  <span className="text-sm font-medium text-ink">{storageUsed}</span>
                </div>
                <div className="w-full bg-subtle rounded-full h-2">
                  <div
                    className="bg-ink h-2 rounded-[2px] transition-all"
                    style={{ width: `${Math.max(storagePercent, storagePercent > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <p className="text-xs text-muted mt-2">
                  Vos projets, visites et photos sont stockés dans le cloud (Supabase) et ne sont
                  pas affectés.
                </p>
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full px-4 py-3 bg-surface border border-line-strong rounded-[4px] hover:bg-subtle transition-colors flex items-center justify-center gap-2 text-body min-h-[48px]"
              >
                <Trash2 size={20} />
                Vider le cache local
              </button>
            </div>

            {/* Info Box */}
            <div className="bg-subtle border border-line-strong rounded-[4px] p-4">
              <h4 className="text-sm font-medium text-ink mb-2">Sécurité des données</h4>
              <ul className="text-xs text-ink space-y-1">
                <li>• Vos données sont chiffrées en transit et au repos</li>
                <li>• Aucune donnée n'est partagée avec des tiers</li>
                <li>• Conformité avec les normes de confidentialité québécoises</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-line bg-canvas">
            <button
              onClick={onClose}
              className="w-full py-3 bg-ink text-white rounded-[4px] hover:bg-body transition-colors font-medium"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>

      {/* Clear Cache Confirmation */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center px-4"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-surface rounded-[4px] max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-body flex-shrink-0" />
              <div>
                <h3 className="text-lg font-medium text-ink mb-1">Vider le cache?</h3>
                <p className="text-sm text-body">
                  Cette action supprimera les données en cache local. Vos projets dans le cloud ne
                  seront pas affectés.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line-strong font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleClearCache}
                className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 font-medium"
              >
                Vider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

