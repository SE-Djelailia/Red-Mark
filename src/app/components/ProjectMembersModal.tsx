import { useState, useEffect, useCallback } from "react";
import {
  X,
  UserPlus,
  Shield,
  Trash2,
  Mail,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { useProjectRole } from "../../hooks/useProjectRole";
import { useModalOpen } from "../../hooks/useModalOpen";
import ConfirmDialog from "./ConfirmDialog";
import type { Insert } from "../../lib/supabase";
import XSpinner from "./ui-kit/XSpinner";

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

/**
 * Turns the two database refusals this screen can now provoke into something
 * a person can act on.
 *
 * Since Stage 3 a project member must belong to the project's firm, enforced
 * by the composite key project_members_user_org_fkey. Since Stage 4 the RLS
 * INSERT policy also requires the caller to be a firm admin or the project's
 * owner. Both surface as raw Postgres text ("insert or update on table ...
 * violates foreign key constraint ...") which means nothing to an architect
 * on a site.
 */
function describeMemberWriteError(error: any, fallback: string): string {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  if (message.includes("project_members_user_org_fkey") || code === "23503") {
    return "Cette personne ne fait pas partie de votre firme. Ajoutez-la d'abord à la firme.";
  }
  // 42501 = insufficient_privilege; PostgREST also reports RLS refusals here.
  if (code === "42501" || message.toLowerCase().includes("row-level security")) {
    return "Vous n'avez pas les droits pour gérer les membres de ce projet.";
  }
  return message || fallback;
}

export default function ProjectMembersModal({ projectId, onClose }: ProjectMembersModalProps) {
  useModalOpen();
  const projectRole = useProjectRole(projectId);
  const canManage = projectRole.canManageMembers;
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "commenter">("editor");
  const [inviting, setInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  // The firm roster — everyone who could legitimately be added. Since Stage 3
  // a project member MUST be in the project's firm (enforced by the
  // project_members_user_org_fkey composite key), so picking from this list is
  // the only path that can succeed. Free-text email stays as a fallback.
  const [firmPeople, setFirmPeople] = useState<{ id: string; name: string; email: string }[]>([]);

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

  // Load the firm roster once the user is known to be able to manage members.
  // organization_members is RLS-scoped to the caller's own firm, and the
  // Stage 4 profiles policy makes firm colleagues readable, so this returns
  // the caller's firm and nothing else — no explicit org filter needed.
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: orgRows, error: orgError } = await supabase
          .from("organization_members")
          .select("user_id");
        if (orgError) throw orgError;

        const ids = (orgRows || []).map((r) => r.user_id);
        if (ids.length === 0) {
          if (!cancelled) setFirmPeople([]);
          return;
        }

        const { data: profileRows, error: profilesError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", ids);
        if (profilesError) throw profilesError;

        if (cancelled) return;
        setFirmPeople(
          (profileRows || [])
            .map((p) => ({ id: p.id, name: p.name || p.email, email: p.email }))
            .sort((a, b) => a.name.localeCompare(b.name, "fr")),
        );
      } catch (e) {
        // Non-fatal: the email field still works, so a roster failure must
        // not block adding someone.
        console.error("Load firm roster error:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canManage]);

  // Firm colleagues not already on this project.
  const addableFirmPeople = firmPeople.filter(
    (p) => !members.some((m) => m.user_id === p.id),
  );

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
        // find_invitable_user is firm-scoped since Stage 4, so "no match"
        // now means EITHER no account at all OR an account in another firm.
        // The function deliberately does not distinguish the two — telling
        // the caller "that address exists, just not here" would leak the
        // existence of accounts in other firms. The message says what the
        // user can act on, without implying the address is unregistered.
        toast.error(
          "Aucun membre de votre firme n'utilise cette adresse. Ajoutez d'abord la personne à votre firme.",
        );
        return;
      }

      const invitee = matches[0];
      const { data: newMember, error: insertError } = await supabase
        .from("project_members")
        // organization_id omitted — trigger-filled from the project's firm.
        .insert([
          { project_id: projectId, user_id: invitee.id, role: inviteRole } as Insert<"project_members">,
        ])
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
      toast.error(describeMemberWriteError(e, "Erreur lors de l'invitation"));
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    setRemoveTarget(null);
    try {
      const { error } = await supabase.from("project_members").delete().eq("id", memberId);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success(`${memberName} retiré du projet`);
    } catch (e: any) {
      toast.error(describeMemberWriteError(e, "Erreur lors de la suppression"));
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
      toast.error(describeMemberWriteError(e, "Erreur lors du changement de rôle"));
    }
  }

  const getRoleBadgeColor = (role: ProjectRole) => {
    switch (role) {
      case "owner":
        return "bg-subtle text-body";
      case "editor":
        return "bg-subtle text-body";
      default:
        return "bg-subtle text-body";
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
        className="relative max-w-2xl w-full bg-surface rounded-[4px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-ink">Membres du projet</h2>
            <p className="text-sm text-muted mt-1">
              {members.length} membre{members.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-subtle hover:bg-line-strong rounded-full flex items-center justify-center text-body transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Invite button (owner/admin only) */}
          {canManage && !showInviteForm && (
            <button
              onClick={() => setShowInviteForm(true)}
              className="w-full py-3 px-4 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-brand-800 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <UserPlus size={20} />
              Inviter un membre
            </button>
          )}

          {/* Invite form */}
          {canManage && showInviteForm && (
            <div className="bg-canvas rounded-[4px] p-4 space-y-4">
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <UserPlus size={16} />
                Ajouter un membre de votre firme
              </h3>
              <p className="text-xs text-muted">
                Seuls les membres de votre firme peuvent être ajoutés à un projet.
              </p>

              {/* The roster picker. Every name here is guaranteed to be
                  addable — same firm, not already on the project — so the
                  common case needs no typing and cannot fail. */}
              {addableFirmPeople.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-body mb-1">
                    Membre de la firme
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const picked = addableFirmPeople.find((p) => p.id === e.target.value);
                      if (picked) setInviteEmail(picked.email);
                    }}
                    className="w-full px-3 py-2 border border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent"
                  >
                    <option value="">Choisir une personne…</option>
                    {addableFirmPeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-body mb-1 flex items-center gap-1">
                  <Mail size={12} />
                  {addableFirmPeople.length > 0 ? "Ou par adresse courriel" : "Adresse courriel *"}
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  placeholder="mc.bouchard@jlp.ca"
                  className="w-full px-3 py-2 border border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-body mb-1">Rôle</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "commenter")}
                  className="w-full px-3 py-2 border border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent"
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
                  className="flex-1 py-2 bg-subtle text-ink rounded-[4px] hover:bg-line-strong transition-colors font-medium"
                >
                  Annuler
                </button>
                <button
                  onClick={handleInvite}
                  disabled={inviting}
                  className="flex-1 py-2 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-brand-800 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {inviting ? (
                    <>
                      <XSpinner size={16} tone="current" label={null} /> Envoi…
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
            <h3 className="text-sm font-semibold text-ink">Membres actuels</h3>
            {loading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted">
                <XSpinner size={20} label={null} />
                <span>Chargement…</span>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8">
                <UserPlus size={48} className="mx-auto text-faint mb-3" />
                <p className="text-muted text-sm">Aucun membre pour l'instant</p>
              </div>
            ) : (
              <div className="rm-fade space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="bg-canvas rounded-[4px] p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-[4px] bg-ink text-white flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {(member.name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium text-ink truncate">
                          {member.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(member.role)}`}
                        >
                          {getRoleLabel(member.role)}
                        </span>
                      </div>
                      <div className="text-xs text-muted truncate">{member.email}</div>
                      {member.created_at && (
                        <div className="text-xs text-faint mt-1">
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
                          className="text-xs px-2 py-1 border border-line-strong rounded bg-surface focus:outline-none focus:ring-2 focus:ring-ink"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="editor">Éditeur</option>
                          <option value="commenter">Commentateur</option>
                        </select>
                        <button
                          onClick={() => setRemoveTarget({ id: member.id, name: member.name })}
                          className="w-11 h-11 flex items-center justify-center bg-surface text-brand-strong rounded-[4px] hover:bg-subtle active:bg-line transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                    {member.role === "owner" && (
                      <div className="text-xs text-muted flex items-center gap-1">
                        <Shield size={12} />
                        <span>Propriétaire</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              </div>
            )}
          </div>

          <div className="bg-subtle rounded-[4px] p-4 border border-line-strong">
            <h4 className="text-sm font-semibold text-ink mb-2">À propos des rôles</h4>
            <ul className="text-xs text-ink space-y-1">
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

      <ConfirmDialog
        open={!!removeTarget}
        title={removeTarget ? `Retirer ${removeTarget.name} du projet ?` : ""}
        confirmLabel="Retirer"
        destructive
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && handleRemoveMember(removeTarget.id, removeTarget.name)}
      />
    </div>
  );
}
