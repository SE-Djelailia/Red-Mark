import { useState, useEffect } from "react";
import { X, Bell, Mail, Calendar, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";

interface NotificationPreferences {
  emailNotifications: boolean;
  visitReminders: boolean;
  reportReady: boolean;
  teamActivity: boolean;
  weeklyDigest: boolean;
  criticalIssues: boolean;
  reminderDays: number;
}

interface NotificationSettingsProps {
  onClose: () => void;
}

export default function NotificationSettings({ onClose }: NotificationSettingsProps) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    emailNotifications: true,
    visitReminders: true,
    reportReady: true,
    teamActivity: false,
    weeklyDigest: true,
    criticalIssues: true,
    reminderDays: 7,
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = () => {
    const saved = localStorage.getItem(`notifications_${user?.id}`);
    if (saved) {
      setPreferences(JSON.parse(saved));
    }
  };

  const savePreferences = (newPrefs: NotificationPreferences) => {
    localStorage.setItem(`notifications_${user?.id}`, JSON.stringify(newPrefs));
    setPreferences(newPrefs);
    toast.success("Préférences sauvegardées");
  };

  const handleToggle = (key: keyof NotificationPreferences) => {
    if (typeof preferences[key] === "boolean") {
      savePreferences({
        ...preferences,
        [key]: !preferences[key],
      });
    }
  };

  const handleReminderDaysChange = (days: number) => {
    savePreferences({
      ...preferences,
      reminderDays: days,
    });
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
              <h2 className="text-xl text-[#1A1A1A] font-medium">Notifications</h2>
              <p className="text-sm text-gray-600 mt-1">Gérez vos alertes et rappels</p>
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
            {/* Email Notifications */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Mail size={18} className="text-[#E10600]" />
                Notifications par courriel
              </h3>
              <div className="space-y-3">
                <NotificationToggle
                  label="Activer les notifications par courriel"
                  description="Recevoir des courriels pour les événements importants"
                  checked={preferences.emailNotifications}
                  onChange={() => handleToggle("emailNotifications")}
                />
                {preferences.emailNotifications && (
                  <div className="ml-6 space-y-3 border-l-2 border-gray-200 pl-4">
                    <NotificationToggle
                      label="Rapports prêts"
                      description="Notification quand un rapport est généré"
                      checked={preferences.reportReady}
                      onChange={() => handleToggle("reportReady")}
                    />
                    <NotificationToggle
                      label="Activité de l'équipe"
                      description="Quand des collègues modifient des projets partagés"
                      checked={preferences.teamActivity}
                      onChange={() => handleToggle("teamActivity")}
                    />
                    <NotificationToggle
                      label="Résumé hebdomadaire"
                      description="Résumé de vos projets chaque lundi"
                      checked={preferences.weeklyDigest}
                      onChange={() => handleToggle("weeklyDigest")}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Visit Reminders */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Calendar size={18} className="text-[#E10600]" />
                Rappels de visites
              </h3>
              <div className="space-y-3">
                <NotificationToggle
                  label="Rappels de visites de chantier"
                  description="Recevoir des rappels pour planifier vos visites"
                  checked={preferences.visitReminders}
                  onChange={() => handleToggle("visitReminders")}
                />
                {preferences.visitReminders && (
                  <div className="ml-6 border-l-2 border-gray-200 pl-4">
                    <label className="block text-sm text-gray-700 mb-2">Rappeler tous les</label>
                    <select
                      value={preferences.reminderDays}
                      onChange={(e) => handleReminderDaysChange(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                    >
                      <option value={3}>3 jours</option>
                      <option value={7}>7 jours (1 semaine)</option>
                      <option value={14}>14 jours (2 semaines)</option>
                      <option value={30}>30 jours (1 mois)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Critical Alerts */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <AlertCircle size={18} className="text-[#E10600]" />
                Alertes critiques
              </h3>
              <NotificationToggle
                label="Problèmes critiques détectés"
                description="Toujours recevoir les alertes pour les problèmes graves"
                checked={preferences.criticalIssues}
                onChange={() => handleToggle("criticalIssues")}
                locked={true}
              />
            </div>

            {/* Success Message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-800">
                <p className="font-medium mb-1">
                  Vos préférences sont sauvegardées automatiquement
                </p>
                <p className="text-xs">Tous les changements sont appliqués immédiatement</p>
              </div>
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
    </div>
  );
}

interface NotificationToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  locked?: boolean;
}

function NotificationToggle({
  label,
  description,
  checked,
  onChange,
  locked,
}: NotificationToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div className="text-sm font-medium text-[#1A1A1A] mb-0.5">{label}</div>
        <div className="text-xs text-gray-600">{description}</div>
      </div>
      <button
        onClick={onChange}
        disabled={locked}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? "bg-[#E10600]" : "bg-gray-300"
        } ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
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
