import { useState, useEffect } from "react";
import { X, Globe, HardDrive, Shield, Trash2, AlertTriangle, Database } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";

interface GeneralSettingsData {
  language: "fr" | "en";
  dataStorage: "local" | "cloud";
  autoSync: boolean;
  enableAnalytics: boolean;
  shareUsageData: boolean;
}

interface GeneralSettingsProps {
  onClose: () => void;
}

const DEFAULT_SETTINGS: GeneralSettingsData = {
  language: "fr",
  dataStorage: "cloud",
  autoSync: true,
  enableAnalytics: false,
  shareUsageData: false,
};

export default function GeneralSettings({ onClose }: GeneralSettingsProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GeneralSettingsData>(DEFAULT_SETTINGS);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [storageUsed, setStorageUsed] = useState("0 MB");

  useEffect(() => {
    loadSettings();
    calculateStorage();
  }, []);

  const loadSettings = () => {
    const saved = localStorage.getItem(`general_settings_${user?.id}`);
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  };

  const saveSettings = (newSettings: GeneralSettingsData) => {
    localStorage.setItem(`general_settings_${user?.id}`, JSON.stringify(newSettings));
    setSettings(newSettings);
    toast.success("Paramètres sauvegardés");
  };

  const calculateStorage = () => {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length + key.length;
      }
    }
    const mb = (totalSize / (1024 * 1024)).toFixed(2);
    setStorageUsed(`${mb} MB`);
  };

  const handleClearCache = () => {
    const keysToKeep = [
      `general_settings_${user?.id}`,
      `report_template_${user?.id}`,
      `notifications_${user?.id}`,
      `team_${user?.id}`,
    ];

    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key) && !keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    }

    setShowClearConfirm(false);
    calculateStorage();
    toast.success("Cache nettoyé avec succès");
  };

  const updateSetting = <K extends keyof GeneralSettingsData>(
    key: K,
    value: GeneralSettingsData[K]
  ) => {
    saveSettings({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 flex items-center justify-center py-8">
        <div
          className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl text-[#1A1A1A] font-medium">Paramètres généraux</h2>
              <p className="text-sm text-gray-600 mt-1">Langue, stockage et confidentialité</p>
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
            {/* Language */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Globe size={18} className="text-[#E10600]" />
                Langue
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateSetting("language", "fr")}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    settings.language === "fr"
                      ? "border-[#E10600] bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <div className="text-sm font-medium">Français</div>
                  <div className="text-xs text-gray-500">Langue par défaut</div>
                </button>
                <button
                  onClick={() => updateSetting("language", "en")}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    settings.language === "en"
                      ? "border-[#E10600] bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <div className="text-sm font-medium">English</div>
                  <div className="text-xs text-gray-500">English</div>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Note: RedMark est optimisé pour le français (conformité québécoise)
              </p>
            </div>

            {/* Data Storage */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Database size={18} className="text-[#E10600]" />
                Stockage des données
              </h3>
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700">Mode de stockage actuel</span>
                    <span className="text-sm font-medium text-[#E10600]">
                      {settings.dataStorage === "cloud" ? "Cloud (Supabase)" : "Local"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Vos données sont stockées sur Supabase pour permettre la synchronisation multi-appareils
                  </p>
                </div>
                <SettingToggle
                  label="Synchronisation automatique"
                  description="Synchroniser automatiquement avec le cloud"
                  checked={settings.autoSync}
                  onChange={(checked) => updateSetting("autoSync", checked)}
                />
              </div>
            </div>

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
                  <div className="bg-[#E10600] h-2 rounded-full" style={{ width: "25%" }} />
                </div>
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-gray-700"
              >
                <Trash2 size={18} />
                Vider le cache local
              </button>
            </div>

            {/* Privacy */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Shield size={18} className="text-[#E10600]" />
                Confidentialité
              </h3>
              <div className="space-y-3">
                <SettingToggle
                  label="Activer les analyses d'utilisation"
                  description="Aide à améliorer RedMark (aucune donnée sensible)"
                  checked={settings.enableAnalytics}
                  onChange={(checked) => updateSetting("enableAnalytics", checked)}
                />
                <SettingToggle
                  label="Partager les données d'utilisation"
                  description="Partager des statistiques anonymes pour améliorer l'app"
                  checked={settings.shareUsageData}
                  onChange={(checked) => updateSetting("shareUsageData", checked)}
                />
              </div>
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
                  Cette action supprimera les données en cache local. Vos projets dans le cloud ne seront pas affectés.
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

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SettingToggle({ label, description, checked, onChange }: SettingToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div className="text-sm font-medium text-[#1A1A1A] mb-0.5">{label}</div>
        <div className="text-xs text-gray-600">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? "bg-[#E10600]" : "bg-gray-300"
        }`}
      >
        <div
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? "translate-x-6" : ""
          }`}
        />
      </button>
    </div>
  );
}
