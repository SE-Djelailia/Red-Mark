import { useState, useEffect } from "react";
import { X, Mail, UserPlus, Trash2, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
  status: "active" | "pending";
  addedAt: string;
}

interface TeamManagementProps {
  onClose: () => void;
}

export default function TeamManagement({ onClose }: TeamManagementProps) {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "viewer">("member");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = () => {
    // Pour le moment, charger depuis localStorage
    const savedMembers = localStorage.getItem(`team_${user?.id}`);
    if (savedMembers) {
      setTeamMembers(JSON.parse(savedMembers));
    }
  };

  const saveTeamMembers = (members: TeamMember[]) => {
    localStorage.setItem(`team_${user?.id}`, JSON.stringify(members));
    setTeamMembers(members);
  };

  const handleInvite = () => {
    if (!inviteEmail.trim()) {
      toast.error("Veuillez entrer une adresse courriel");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      toast.error("Adresse courriel invalide");
      return;
    }

    if (teamMembers.some(m => m.email === inviteEmail)) {
      toast.error("Ce membre fait déjà partie de l'équipe");
      return;
    }

    const newMember: TeamMember = {
      id: Date.now().toString(),
      email: inviteEmail,
      name: inviteEmail.split("@")[0],
      role: inviteRole,
      status: "pending",
      addedAt: new Date().toISOString(),
    };

    saveTeamMembers([...teamMembers, newMember]);
    setInviteEmail("");
    toast.success(`Invitation envoyée à ${inviteEmail}`);
  };

  const handleRemoveMember = (memberId: string) => {
    const member = teamMembers.find(m => m.id === memberId);
    if (member) {
      saveTeamMembers(teamMembers.filter(m => m.id !== memberId));
      toast.success(`${member.email} retiré de l'équipe`);
    }
  };

  const handleChangeRole = (memberId: string, newRole: "admin" | "member" | "viewer") => {
    saveTeamMembers(
      teamMembers.map(m => m.id === memberId ? { ...m, role: newRole } : m)
    );
    toast.success("Rôle mis à jour");
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
              <h2 className="text-xl text-[#1A1A1A] font-medium">Équipe & Collaboration</h2>
              <p className="text-sm text-gray-600 mt-1">Invitez des collègues et gérez les accès</p>
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
            {/* Invite Section */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <UserPlus size={18} className="text-[#E10600]" />
                Inviter un nouveau membre
              </h3>
              <div className="space-y-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="adresse@courriel.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                  onKeyPress={(e) => e.key === "Enter" && handleInvite()}
                />
                <div className="flex gap-3">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "member" | "viewer")}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                  >
                    <option value="member">Membre - Peut créer et modifier</option>
                    <option value="viewer">Observateur - Lecture seule</option>
                  </select>
                  <button
                    onClick={handleInvite}
                    className="px-6 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium"
                  >
                    Inviter
                  </button>
                </div>
              </div>
            </div>

            {/* Team Members List */}
            <div>
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3">
                Membres de l'équipe ({teamMembers.length})
              </h3>
              {teamMembers.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <User size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Aucun membre dans l'équipe</p>
                  <p className="text-xs mt-1">Invitez des collègues pour collaborer</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                          {member.name[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-[#1A1A1A]">{member.name}</div>
                          <div className="text-xs text-gray-500">{member.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.id, e.target.value as any)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Membre</option>
                            <option value="viewer">Observateur</option>
                          </select>
                          {member.status === "pending" && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                              En attente
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="ml-3 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} className="text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">À propos des rôles</h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li><strong>Admin:</strong> Accès complet, peut gérer l'équipe</li>
                <li><strong>Membre:</strong> Peut créer et modifier des projets partagés</li>
                <li><strong>Observateur:</strong> Peut seulement consulter les projets</li>
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
    </div>
  );
}
