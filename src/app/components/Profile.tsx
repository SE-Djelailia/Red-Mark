import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  User,
  Mail,
  Building2,
  LogOut,
  Download,
  Users,
  Settings,
  FileText,
  Bell,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { getProfileStats } from "../../lib/supabaseApi";
import { toast } from "sonner";
import TeamManagement from "./TeamManagement";
import NotificationSettings from "./NotificationSettings";
import ReportTemplates from "./ReportTemplates";
import GeneralSettings from "./GeneralSettings";
import DataExport from "./DataExport";

export default function Profile() {
  const navigate = useNavigate();
  const { user, session, signOut } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReportTemplates, setShowReportTemplates] = useState(false);
  const [showGeneralSettings, setShowGeneralSettings] = useState(false);
  const [showDataExport, setShowDataExport] = useState(false);
  const [stats, setStats] = useState({
    projectCount: 0,
    totalVisits: 0,
    totalPhotos: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadStats();
    }
  }, [user?.id]); // ✅ Fixed: use user.id instead of user object

  async function loadStats() {
    if (!user) return;

    try {
      const profileStats = await getProfileStats(user.id);
      setStats(profileStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

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
  const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Utilisateur';
  const userFirm = user.user_metadata?.firm || 'Non spécifié';
  const userRole = user.user_metadata?.role || 'architect';

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-8 md:py-12">
        <div className="max-w-2xl mx-auto">
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-[#E10600] flex items-center justify-center text-2xl font-bold">
              {userName.split(" ").map((n) => n[0]).join("").toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-medium mb-1">{userName}</h1>
              <p className="text-gray-400 text-sm capitalize">{userRole}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold mb-1">
                {loading ? "-" : stats.projectCount}
              </div>
              <div className="text-xs text-gray-400">Projets</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold mb-1">
                {loading ? "-" : stats.totalVisits}
              </div>
              <div className="text-xs text-gray-400">Visites</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold mb-1">
                {loading ? "-" : stats.totalPhotos}
              </div>
              <div className="text-xs text-gray-400">Photos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200 mb-6">
          <div className="p-4 flex items-center gap-3">
            <Mail size={20} className="text-gray-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Courriel</div>
              <div className="text-sm text-[#1A1A1A]">{user.email}</div>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <Building2 size={20} className="text-gray-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Entreprise</div>
              <div className="text-sm text-[#1A1A1A]">{userFirm}</div>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <User size={20} className="text-gray-500" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Rôle</div>
              <div className="text-sm text-[#1A1A1A] capitalize">{userRole}</div>
            </div>
          </div>
        </div>

        {/* Settings Menu */}
        <div className="space-y-3">
          <h2 className="text-lg text-[#1A1A1A] mb-3">Paramètres</h2>

          <button
            onClick={() => setShowTeamManagement(true)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-[#E10600] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Users size={20} className="text-gray-600" />
              <div className="text-left">
                <div className="text-sm text-[#1A1A1A]">Équipe & Collaboration</div>
                <div className="text-xs text-gray-500">Gérer les collègues et partages</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>

          <button
            onClick={() => setShowNotifications(true)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-[#E10600] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Bell size={20} className="text-gray-600" />
              <div className="text-left">
                <div className="text-sm text-[#1A1A1A]">Notifications</div>
                <div className="text-xs text-gray-500">Alertes et rappels</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>

          <button
            onClick={() => setShowReportTemplates(true)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-[#E10600] transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-gray-600" />
              <div className="text-left">
                <div className="text-sm text-[#1A1A1A]">Modèles de rapports</div>
                <div className="text-xs text-gray-500">Personnaliser les rapports PDF</div>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>

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
                <div className="text-xs text-gray-500">Langue, stockage, confidentialité</div>
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
          <div className="min-h-screen px-4 flex items-center justify-center py-8">
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
      {showTeamManagement && <TeamManagement onClose={() => setShowTeamManagement(false)} />}
      {showNotifications && <NotificationSettings onClose={() => setShowNotifications(false)} />}
      {showReportTemplates && <ReportTemplates onClose={() => setShowReportTemplates(false)} />}
      {showGeneralSettings && <GeneralSettings onClose={() => setShowGeneralSettings(false)} />}
      {showDataExport && <DataExport onClose={() => setShowDataExport(false)} />}
    </div>
  );
}