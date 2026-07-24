import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  User,
  Mail,
  Building2,
  LogOut,
  Download,
  Settings,
  ChevronRight,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { getProfileStats } from "../../lib/supabaseApi";
import { toast } from "sonner";
import GeneralSettings from "./GeneralSettings";
import DataExport from "./DataExport";
import { useModalOpen } from "../../hooks/useModalOpen";

// Left behind by settings that were removed as non-functional stubs: the
// Notifications and Report-Templates sections entirely, plus the general
// settings' language/sync/analytics toggles. All only ever wrote to
// localStorage; nothing read the values back. Cleared once on mount so
// existing installs don't keep carrying orphaned keys around.
function clearRemovedSettingsKeys(userId: string) {
  try {
    localStorage.removeItem(`notifications_${userId}`);
    localStorage.removeItem(`report_template_${userId}`);
    localStorage.removeItem(`general_settings_${userId}`);
  } catch {
    // localStorage unavailable — nothing to clean up.
  }
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, session, signOut, updateProfile } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  useModalOpen(showLogoutConfirm);
  const [showGeneralSettings, setShowGeneralSettings] = useState(false);
  const [showDataExport, setShowDataExport] = useState(false);
  const [stats, setStats] = useState({
    projectCount: 0,
    totalVisits: 0,
    totalPhotos: 0,
  });
  const [loading, setLoading] = useState(true);

  // Profile editing — email is intentionally absent: it's the auth identity,
  // and changing it needs Supabase's own confirm-by-email flow, not a plain
  // text field.
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: "", firm: "", role: "" });

  useEffect(() => {
    if (user?.id) {
      loadStats();
      clearRemovedSettingsKeys(user.id);
    }
  }, [user?.id]); // ✅ Fixed: use user.id instead of user object

  async function loadStats() {
    if (!user) return;

    try {
      const profileStats = await getProfileStats(user.id);
      setStats(profileStats);
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const startEditing = () => {
    setForm({
      name: user?.user_metadata?.name || "",
      firm: user?.user_metadata?.firm || "",
      role: user?.user_metadata?.role || "",
    });
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!form.name.trim()) {
      toast.error("Le nom ne peut pas être vide");
      return;
    }

    setIsSaving(true);
    try {
      // updateProfile writes both the auth metadata and the profiles row;
      // the auth state change it triggers refreshes `user`, so the header
      // and these fields pick up the new values without a manual refetch.
      await updateProfile({
        name: form.name.trim(),
        firm: form.firm.trim(),
        role: form.role.trim(),
      });
      setIsEditing(false);
    } catch {
      // updateProfile already surfaces its own error toast.
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Déconnexion réussie");
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Erreur lors de la déconnexion");
    }
  };

  // Show loading state while fetching user data
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E10600] mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  // Extract user metadata
  const userName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";
  const userFirm = user.user_metadata?.firm || "Non spécifié";
  const userRole = user.user_metadata?.role || "architect";

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-8 md:py-12">
        <div className="max-w-2xl mx-auto">
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-[#E10600] flex items-center justify-center text-2xl font-bold">
              {userName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-medium mb-1">{userName}</h1>
              <p className="text-gray-400 text-sm capitalize">{userRole}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold mb-1">{loading ? "-" : stats.projectCount}</div>
              <div className="text-xs text-gray-400">Projets</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold mb-1">{loading ? "-" : stats.totalVisits}</div>
              <div className="text-xs text-gray-400">Visites</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold mb-1">{loading ? "-" : stats.totalPhotos}</div>
              <div className="text-xs text-gray-400">Photos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1A1A1A]">Mes informations</h2>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 min-h-[36px]"
                >
                  <X size={16} />
                  Annuler
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors disabled:opacity-50 min-h-[36px]"
                >
                  <Check size={16} />
                  {isSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            ) : (
              <button
                onClick={startEditing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#E10600] hover:bg-red-50 rounded-lg transition-colors min-h-[36px]"
              >
                <Pencil size={16} />
                Modifier
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-200">
            <div className="p-4 flex items-center gap-3">
              <User size={20} className="text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1">Nom</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                    placeholder="Votre nom complet"
                  />
                ) : (
                  <div className="text-sm text-[#1A1A1A]">{userName}</div>
                )}
              </div>
            </div>

            {/* Read-only: the email is the auth identity. */}
            <div className="p-4 flex items-center gap-3">
              <Mail size={20} className="text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1">Courriel</div>
                <div className="text-sm text-[#1A1A1A] break-all">{user.email}</div>
                {isEditing && (
                  <div className="text-xs text-gray-400 mt-1">
                    Le courriel ne peut pas être modifié ici.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 flex items-center gap-3">
              <Building2 size={20} className="text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1">Entreprise</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={form.firm}
                    onChange={(e) => setForm({ ...form, firm: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                    placeholder="Nom de votre entreprise"
                  />
                ) : (
                  <div className="text-sm text-[#1A1A1A]">{userFirm}</div>
                )}
              </div>
            </div>

            <div className="p-4 flex items-center gap-3">
              <Settings size={20} className="text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1">Rôle</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 min-h-[44px]"
                    placeholder="Ex : Architecte, Technologue"
                  />
                ) : (
                  <div className="text-sm text-[#1A1A1A] capitalize">{userRole}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Settings Menu */}
        <div className="space-y-3">
          <h2 className="text-lg text-[#1A1A1A] mb-3">Paramètres</h2>

          <button
            onClick={() => setShowDataExport(true)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-[#E10600] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Download size={20} className="text-gray-600" />
              <div className="text-left">
                <div className="text-sm text-[#1A1A1A]">Exporter les données</div>
                <div className="text-xs text-gray-500">Télécharger tous les projets</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>

          <button
            onClick={() => setShowGeneralSettings(true)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-[#E10600] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Settings size={20} className="text-gray-600" />
              <div className="text-left">
                <div className="text-sm text-[#1A1A1A]">Paramètres généraux</div>
                <div className="text-xs text-gray-500">Stockage local</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full mt-8 bg-white rounded-xl border border-red-200 p-4 flex items-center justify-center gap-3 text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={20} />
          <span>Se déconnecter</span>
        </button>

        {/* App Version */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>RedMark v1.0.0</p>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 overflow-y-auto"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
            <div
              className="bg-white rounded-xl max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Content */}
              <div className="p-6">
                <h2 className="text-xl text-[#1A1A1A] font-medium mb-2">Se déconnecter?</h2>
                <p className="text-sm text-gray-600 mb-6">
                  Êtes-vous sûr de vouloir vous déconnecter de RedMark?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 font-medium min-h-[48px]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] font-medium min-h-[48px]"
                  >
                    Déconnexion
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modals */}
      {showGeneralSettings && <GeneralSettings onClose={() => setShowGeneralSettings(false)} />}
      {showDataExport && <DataExport onClose={() => setShowDataExport(false)} />}
    </div>
  );
}
