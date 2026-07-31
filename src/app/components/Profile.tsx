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
import { inputClassName } from "./ui-kit/Input";
import { Card, Section } from "./ui-kit/Card";
import { StatGrid, StatTile } from "./ui-kit/StatTile";

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-muted">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  // Extract user metadata
  const userName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";
  const userFirm = user.user_metadata?.firm || "Non spécifié";
  const userRole = user.user_metadata?.role || "architect";

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      {/* Same container as the Dashboard: max-w-6xl, matching gutters and
          vertical rhythm, so the two screens line up at every breakpoint. */}
      <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-6xl mx-auto space-y-6">
        {/* Identity + counters. Stacked on a phone; side by side from lg,
            where the identity card alone would leave half the row empty. */}
        <div className="grid gap-6 lg:grid-cols-2 items-stretch">
          <Card className="p-4 sm:p-5 flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-xl font-semibold flex-shrink-0">
              {userName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-ink truncate">{userName}</h1>
              <p className="text-muted text-sm capitalize truncate">{userRole}</p>
            </div>
          </Card>

          {/* Hairline-joined tiles, same primitive as the Dashboard's. */}
          <StatGrid className="grid-cols-3">
            <StatTile label="Projets" value={loading ? "—" : stats.projectCount} />
            <StatTile label="Visites" value={loading ? "—" : stats.totalVisits} />
            <StatTile label="Photos" value={loading ? "—" : stats.totalPhotos} />
          </StatGrid>
        </div>

        {/* Two-column from lg: details take the wider column, the settings
            menu and account actions ride alongside instead of below the
            fold. items-start keeps the short right column from stretching. */}
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          <Section
            title="Mes informations"
            className="lg:col-span-2"
            action={
              isEditing ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-body hover:bg-subtle rounded-lg transition-colors disabled:opacity-50 min-h-[36px]"
                  >
                    <X size={16} />
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 min-h-[36px]"
                  >
                    <Check size={16} />
                    {isSaving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 rounded-lg transition-colors min-h-[36px]"
                >
                  <Pencil size={16} />
                  Modifier
                </button>
              )
            }
          >
            {/* Four fields in a 2×2 grid from sm — one tall column of
                half-empty rows is the main thing wasting width here.
                Borders are per-cell rather than divide-y, which only
                separates DOM siblings and would draw the wrong lines
                once the cells reflow into two columns. */}
            <Card className="overflow-hidden grid sm:grid-cols-2">
              <div className="p-4 flex items-center gap-3 border-t border-line first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(odd)]:border-r">
                <User size={20} className="text-faint flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted mb-1">Nom</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={inputClassName}
                      placeholder="Votre nom complet"
                    />
                  ) : (
                    <div className="text-sm text-ink">{userName}</div>
                  )}
                </div>
              </div>

              {/* Read-only: the email is the auth identity. */}
              <div className="p-4 flex items-center gap-3 border-t border-line first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(odd)]:border-r">
                <Mail size={20} className="text-faint flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted mb-1">Courriel</div>
                  <div className="text-sm text-ink break-all">{user.email}</div>
                  {isEditing && (
                    <div className="text-xs text-faint mt-1">
                      Le courriel ne peut pas être modifié ici.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 flex items-center gap-3 border-t border-line first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(odd)]:border-r">
                <Building2 size={20} className="text-faint flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted mb-1">Entreprise</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.firm}
                      onChange={(e) => setForm({ ...form, firm: e.target.value })}
                      className={inputClassName}
                      placeholder="Nom de votre entreprise"
                    />
                  ) : (
                    <div className="text-sm text-ink">{userFirm}</div>
                  )}
                </div>
              </div>

              <div className="p-4 flex items-center gap-3 border-t border-line first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(odd)]:border-r">
                <Settings size={20} className="text-faint flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted mb-1">Rôle</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className={inputClassName}
                      placeholder="Ex : Architecte, Technologue"
                    />
                  ) : (
                    <div className="text-sm text-ink capitalize">{userRole}</div>
                  )}
                </div>
              </div>
            </Card>
          </Section>

          <div className="space-y-6">
            {/* One panel with hairline rows rather than two free-floating
                cards — same treatment as the Dashboard's lists. */}
            <Section title="Paramètres">
              <Card className="overflow-hidden divide-y divide-line">
                <button
                  onClick={() => setShowDataExport(true)}
                  className="w-full px-4 py-3 min-h-11 flex items-center justify-between gap-3 text-left hover:bg-subtle transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Download size={20} className="text-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-ink">Exporter les données</div>
                      <div className="text-xs text-muted">Télécharger tous les projets</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-faint flex-shrink-0" />
                </button>

                <button
                  onClick={() => setShowGeneralSettings(true)}
                  className="w-full px-4 py-3 min-h-11 flex items-center justify-between gap-3 text-left hover:bg-subtle transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Settings size={20} className="text-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-ink">Paramètres généraux</div>
                      <div className="text-xs text-muted">Stockage local</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-faint flex-shrink-0" />
                </button>
              </Card>
            </Section>

            <Section title="Compte">
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full bg-surface rounded-xl border border-open/30 p-4 min-h-11 flex items-center justify-center gap-3 text-open hover:bg-open/5 transition-colors"
              >
                <LogOut size={20} />
                <span>Se déconnecter</span>
              </button>
            </Section>

            <div className="text-center text-xs text-faint">RedMark v1.0.0</div>
          </div>
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
                <h2 className="text-xl text-ink font-semibold mb-2">Se déconnecter?</h2>
                <p className="text-sm text-body mb-6">
                  Êtes-vous sûr de vouloir vous déconnecter de RedMark?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-3 bg-surface border border-line text-ink rounded-lg hover:bg-subtle font-medium min-h-[48px]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium min-h-[48px]"
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
