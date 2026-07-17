import { useState, useEffect, useCallback } from "react";
import { X, UserPlus, Shield, Trash2, Loader2, Mail } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { useProjectRole } from "../../hooks/useProjectRole";

type ProjectRole = "owner" | "editor" | "commenter";

interface Member {
  id: string; // project_members.id
  user_id: string;
  role: ProjectRole;
  name: string;
  email: string;
  created_at: string;
}

interface ProjectMembersModalProps {
  projectId: string;
  onClose: () => void;
}

export default function ProjectMembersModal({ projectId, onClose }: ProjectMembersModalProps) {
  const projectRole = useProjectRole(projectId);
  const canManage = projectRole.canManageMembers;
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "commenter">("editor");
  const [inviting, setInviting] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: memberRows, error: membersError } = await supabase
        .from("project_members")
        .select("id, user_id, role, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (membersError) throw membersError;

      const userIds = (memberRows || []).map((m) => m.user_id);
      let profilesById = new Map<string, { name: string | null; email: string }>();
      if (userIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", userIds);
        if (profilesError) throw profilesError;
        profilesById = new Map((profileRows || []).map((p) => [p.id, { name: p.name, email: p.email }]));
      }

      setMembers(
        (memberRows || []).map((m) => {
          const profile = profilesById.get(m.user_id);
          return {
            id: m.id,
            user_id: m.user_id,
            role: m.role as ProjectRole,
            name: profile?.name || profile?.email || "Utilisateur",
            email: profile?.email || "",
            created_at: m.created_at || "",
          };
        }),
      );
    } catch (e: any) {
      console.error("Load members error:", e);
      toast.error("Impossible de charger les membres");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

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
    if (members.some((m) => m.email.toLowerCase() === inviteEmail.trim().toLowerCase())) {
      toast.error("Ce membre fait déjà partie du projet");
      return;
    }

    setInviting(true);
    try {
      const { data: matches, error: lookupError } = (await supabase.rpc("find_invitable_user", {
        p_email: inviteEmail.trim(),
      })) as { data: { id: string; name: string | null; email: string }[] | null; error: any };
      if (lookupError) throw lookupError;

      if (!matches || matches.length === 0) {
        toast.error(
          "Aucun compte RedMark n'est associé à cette adresse. Les invitations par courriel pour créer un compte arrivent bientôt.",
        );
        return;
      }

      const invitee = matches[0];
      const { data: newMember, error: insertError } = await supabase
        .from("project_members")
        .insert([{ project_id: projectId, user_id: invitee.id, role: inviteRole }])
        .select("id, user_id, role, created_at")
        .single();
      if (insertError) throw insertError;

      setMembers((prev) => [
        ...prev,
        {
          id: newMember.id,
          user_id: newMember.user_id,
          role: newMember.role as ProjectRole,
          name: invitee.name || invitee.email,
          email: invitee.email,
          created_at: newMember.created_at || "",
        },
      ]);
      toast.success(`${invitee.name || invitee.email} a été ajouté au projet`);
      setInviteEmail("");
      setShowInviteForm(false);
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

  async function handleUpdateRole(memberId: string, newRole: ProjectRole) {
    try {
      const { error } = await supabase
        .from("project_members")
        .update({ role: newRole })
        .eq("id", memberId);
      if (error) throw error;
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
      toast.success("Rôle mis à jour");
    } catch (e: any) {
      toast.error("Erreur : " + e.message);
    }
  }

  const getRoleBadgeColor = (role: ProjectRole) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-700";
      case "editor":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getRoleLabel = (role: ProjectRole) => {
    switch (role) {
      case "owner":
        return "Propriétaire";
      case "editor":
        return "Éditeur";
      default:
        return "Commentateur";
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
          {/* Invite button (owner/admin only) */}
          {canManage && !showInviteForm && (
            <button
              onClick={() => setShowInviteForm(true)}
              className="w-full py-3 px-4 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <UserPlus size={20} />
              Inviter un membre
            </button>
          )}

          {/* Invite form */}
          {canManage && showInviteForm && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
                <Mail size={16} />
                Inviter par courriel
              </h3>
              <p className="text-xs text-gray-500">
                La personne doit déjà avoir un compte RedMark. Les invitations par courriel pour
                créer un compte arrivent bientôt.
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
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "commenter")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                >
                  <option value="editor">Éditeur — peut créer et modifier</option>
                  <option value="commenter">Commentateur — peut commenter seulement</option>
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
                    "Ajouter au projet"
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
                      {member.created_at && (
                        <div className="text-xs text-gray-400 mt-1">
                          Ajouté le {new Date(member.created_at).toLocaleDateString("fr-CA")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canManage && member.role !== "owner" && (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleUpdateRole(member.id, e.target.value as ProjectRole)
                          }
                          className="text-xs px-2 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="editor">Éditeur</option>
                          <option value="commenter">Commentateur</option>
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
                        <span>Propriétaire</span>
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
                <strong>Éditeur :</strong> Peut créer et modifier visites, photos et déficiences
              </li>
              <li>
                <strong>Commentateur :</strong> Peut consulter le projet et commenter
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
