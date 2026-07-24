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
          className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl text-[#1A1A1A] font-medium">Paramètres généraux</h2>
              <p className="text-sm text-gray-600 mt-1">Gestion du stockage local</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={24} className="text-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Storage Management */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <HardDrive size={18} className="text-[#E10600]" />
                Gestion du stockage
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">Espace utilisé (cache local)</span>
                  <span className="text-sm font-medium text-[#1A1A1A]">{storageUsed}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#E10600] h-2 rounded-full transition-all"
                    style={{ width: `${Math.max(storagePercent, storagePercent > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Vos projets, visites et photos sont stockés dans le cloud (Supabase) et ne sont
                  pas affectés.
                </p>
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-gray-700 min-h-[48px]"
              >
                <Trash2 size={18} />
                Vider le cache local
              </button>
            </div>

            {/* Info Box */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-green-900 mb-2">Sécurité des données</h4>
              <ul className="text-xs text-green-800 space-y-1">
                <li>• Vos données sont chiffrées en transit et au repos</li>
                <li>• Aucune donnée n'est partagée avec des tiers</li>
                <li>• Conformité avec les normes de confidentialité québécoises</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="w-full py-3 bg-[#1A1A1A] text-white rounded-lg hover:bg-black transition-colors font-medium"
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
            className="bg-white rounded-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-orange-600 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-medium text-[#1A1A1A] mb-1">Vider le cache?</h3>
                <p className="text-sm text-gray-600">
                  Cette action supprimera les données en cache local. Vos projets dans le cloud ne
                  seront pas affectés.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleClearCache}
                className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] font-medium"
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

