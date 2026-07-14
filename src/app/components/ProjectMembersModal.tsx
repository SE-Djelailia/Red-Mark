import { useState, useEffect, useCallback } from "react";
import { X, UserPlus, Shield, Trash2, Loader2, Mail } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { supabase } from "../../lib/supabase";
import { projectId as supabaseProjectId, publicAnonKey } from "../../../utils/supabase/info";
import { toast } from "sonner";

interface Member {
  id: string;
  user_id: string;
  role: "owner" | "collaborator" | "viewer";
  name: string;
  email: string;
  status: "active" | "pending";
  created_at: string;
}

interface ProjectMembersModalProps {
  projectId: string;
  onClose: () => void;
}

const SERVER = `https://${supabaseProjectId}.supabase.co/functions/v1/make-server-9fe75696`;

export default function ProjectMembersModal({ projectId, onClose }: ProjectMembersModalProps) {
  const { user, session } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"collaborator" | "viewer">("collaborator");
  const [inviting, setInviting] = useState(false);
  const [projectName, setProjectName] = useState("");

  const token = session?.access_token ?? publicAnonKey;

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER}/projects/${projectId}/members-list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMembers(data);
    } catch (e: any) {
      console.error("Load members error:", e);
      toast.error("Impossible de charger les membres");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    loadMembers();
    // Get project name for the invitation email
    supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single()
      .then(({ data }) => {
        if (data) setProjectName(data.name);
      });
  }, [loadMembers, projectId]);

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Veuillez entrer une adresse courriel");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      toast.error("Adresse courriel invalide");
      return;
    }
    if (members.some((m) => m.email === inviteEmail)) {
      toast.error("Ce membre fait déjà partie du projet");
      return;
    }

    setInviting(true);
    try {
      const res = await fetch(`${SERVER}/projects/${projectId}/invite`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          projectName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      if (data.existing) {
        toast.success(`${inviteEmail} a été ajouté au projet et a reçu une notification`);
      } else {
        toast.success(`Invitation envoyée à ${inviteEmail} par courriel`);
      }

      setInviteEmail("");
      setShowInviteForm(false);
      await loadMembers();
    } catch (e: any) {
      console.error("Invite error:", e);
      toast.error(e.message || "Erreur lors de l'invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!window.confirm(`Retirer ${memberName} du projet ?`)) return;
    try {
      const { error } = await supabase.from("project_members").delete().eq("id", memberId);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success(`${memberName} retiré du projet`);
    } catch (e: any) {
      toast.error("Erreur lors de la suppression : " + e.message);
    }
  }

  async function handleUpdateRole(memberId: string, newRole: string) {
    try {
      const { error } = await supabase
        .from("project_members")
        .update({ role: newRole })
        .eq("id", memberId);
      if (error) throw error;
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole as any } : m)),
      );
      toast.success("Rôle mis à jour");
    } catch (e: any) {
      toast.error("Erreur : " + e.message);
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-700";
      case "collaborator":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner":
        return "Propriétaire";
      case "collaborator":
        return "Collaborateur";
      default:
        return "Observateur";
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-2xl w-full bg-white rounded-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#1A1A1A]">Membres du projet</h2>
            <p className="text-sm text-gray-500 mt-1">
              {members.length} membre{members.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Invite button */}
          {!showInviteForm && (
            <button
              onClick={() => setShowInviteForm(true)}
              className="w-full py-3 px-4 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <UserPlus size={20} />
              Inviter un membre
            </button>
          )}

          {/* Invite form */}
          {showInviteForm && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
                <Mail size={16} />
                Inviter par courriel
              </h3>
              <p className="text-xs text-gray-500">
                Si la personne a déjà un compte RedMark, elle recevra une notification dans l'app.
                Sinon, elle recevra un courriel d'invitation pour créer son compte.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Adresse courriel *
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  placeholder="mc.bouchard@jlp.ca"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                >
                  <option value="collaborator">Collaborateur — peut créer et modifier</option>
                  <option value="viewer">Observateur — lecture seule</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteEmail("");
                  }}
                  className="flex-1 py-2 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleInvite}
                  disabled={inviting}
                  className="flex-1 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {inviting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Envoi…
                    </>
                  ) : (
                    "Envoyer l'invitation"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Members list */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">Membres actuels</h3>
            {loading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
                <Loader2 size={20} className="animate-spin" />
                <span>Chargement…</span>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8">
                <UserPlus size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">Aucun membre pour l'instant</p>
              </div>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="bg-gray-50 rounded-lg p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#E10600] text-white flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {(member.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-[#1A1A1A] truncate">
                          {member.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(member.role)}`}
                        >
                          {getRoleLabel(member.role)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{member.email}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Ajouté le {new Date(member.created_at).toLocaleDateString("fr-CA")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {member.role !== "owner" && (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="collaborator">Collaborateur</option>
                          <option value="viewer">Observateur</option>
                        </select>
                        <button
                          onClick={() => handleRemoveMember(member.id, member.name)}
                          className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {member.role === "owner" && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Shield size={12} />
                        <span>Admin</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">À propos des rôles</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>
                <strong>Propriétaire :</strong> Contrôle total du projet et des membres
              </li>
              <li>
                <strong>Collaborateur :</strong> Peut créer et modifier visites, photos et
                déficiences
              </li>
              <li>
                <strong>Observateur :</strong> Peut uniquement consulter le projet
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
