import { useState } from "react";
import {
  Building2,
  Mail,
  MailPlus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { useAuth } from "../../contexts/useAuth";
import { useFirm, type FirmMember, type OrgRole } from "../../hooks/useFirm";
import {
  createInvitation,
  provisionMember,
  removeMember,
  revokeInvitation,
  setMemberRole,
  type ApiError,
} from "../../lib/organizationApi";
import { Card, Section } from "./ui-kit/Card";
import Button from "./ui-kit/Button";
import { inputClassName, labelClassName, selectClassName } from "./ui-kit/Input";
import ConfirmDialog from "./ConfirmDialog";
import FirmProjectAccess from "./FirmProjectAccess";

/**
 * Firm administration.
 *
 * The screen is rendered only for a firm admin, but that is presentation, not
 * protection: every write here goes through an edge-function route that
 * re-derives the caller's firm and re-checks their role. Hiding a button
 * changes nothing about what the server will accept.
 *
 * What the UI IS responsible for is not walking the user into a refusal it
 * could have predicted. The two server-side guards that would otherwise
 * surface as a bare 409 — "a firm must keep one admin" and "you cannot remove
 * yourself" — are mirrored here as disabled controls with the reason stated,
 * so the route's error is a backstop rather than the first the admin hears of
 * it.
 */

const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  admin: "Administrateur",
  member: "Membre",
};

function OrgRoleBadge({ role }: { role: OrgRole }) {
  const style =
    role === "admin"
      ? "bg-brand-50 border-brand-100 text-brand-strong"
      : "bg-subtle border-line text-body";
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border text-[11px] font-medium whitespace-nowrap ${style}`}
    >
      {ORG_ROLE_LABEL[role]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Invite form — both entry methods
// ---------------------------------------------------------------------------

type Method = "invite" | "provision";

function InviteForm({ onDone }: { onDone: () => void }) {
  const [method, setMethod] = useState<Method>("invite");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orgRole, setOrgRole] = useState<OrgRole>("member");
  const [busy, setBusy] = useState(false);
  const [actionLink, setActionLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setBusy(true);
    setActionLink(null);
    try {
      if (method === "invite") {
        const result = await createInvitation(trimmed, orgRole);
        toast.success(
          result.emailed
            ? `Invitation envoyée à ${trimmed}.`
            : `Invitation créée. ${trimmed} a déjà un compte — elle rejoindra la firme à sa prochaine connexion.`,
        );
      } else {
        const result = await provisionMember(trimmed, orgRole, name.trim());
        toast.success(`${trimmed} a été ajoutée à la firme.`);
        // Shown rather than emailed silently, so the admin knows a link
        // exists and can pass it on if the mail does not arrive. The admin
        // never sees or sets a password.
        setActionLink(result.actionLink);
      }
      setEmail("");
      setName("");
      onDone();
    } catch (error) {
      const err = error as ApiError;
      console.error("Invite/provision failed:", err);
      toast.error(err.message || "Impossible d'ajouter cette personne.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Méthode d'ajout">
        <button
          type="button"
          role="tab"
          aria-selected={method === "invite"}
          onClick={() => setMethod("invite")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            method === "invite"
              ? "bg-brand-50 border-brand-100 text-brand-strong"
              : "bg-surface border-line text-body hover:bg-subtle"
          }`}
        >
          Inviter par courriel
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === "provision"}
          onClick={() => setMethod("provision")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            method === "provision"
              ? "bg-brand-50 border-brand-100 text-brand-strong"
              : "bg-surface border-line text-body hover:bg-subtle"
          }`}
        >
          Créer le compte
        </button>
      </div>

      <p className="text-xs text-muted mb-4">
        {method === "invite"
          ? "La personne reçoit un lien et rejoint la firme elle-même, une fois son adresse confirmée."
          : "Le compte est créé immédiatement. Un lien de réinitialisation lui permet de choisir son mot de passe — vous ne voyez jamais ses identifiants."}
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelClassName} htmlFor="firm-invite-email">
            Adresse courriel
          </label>
          <input
            id="firm-invite-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@firme.com"
            className={inputClassName}
          />
        </div>

        {method === "provision" && (
          <div>
            <label className={labelClassName} htmlFor="firm-invite-name">
              Nom <span className="font-normal text-muted">(optionnel)</span>
            </label>
            <input
              id="firm-invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              className={inputClassName}
            />
          </div>
        )}

        <div>
          <label className={labelClassName} htmlFor="firm-invite-role">
            Rôle dans la firme
          </label>
          <select
            id="firm-invite-role"
            value={orgRole}
            onChange={(e) => setOrgRole(e.target.value as OrgRole)}
            className={selectClassName}
          >
            <option value="member">Membre — accès aux projets qu'on lui assigne</option>
            <option value="admin">Administrateur — peut gérer la firme et les accès</option>
          </select>
          <p className="text-xs text-muted mt-1.5">
            L'accès aux projets s'accorde séparément, plus bas.
          </p>
        </div>

        <Button type="submit" disabled={busy || !email.trim()} fullWidth>
          {method === "invite" ? (
            <MailPlus size={16} aria-hidden="true" />
          ) : (
            <UserPlus size={16} aria-hidden="true" />
          )}
          {busy ? "En cours…" : method === "invite" ? "Envoyer l'invitation" : "Créer le compte"}
        </Button>
      </form>

      {actionLink && (
        <div className="mt-4 rounded-lg border border-line bg-subtle p-3">
          <p className="text-xs text-body mb-2">
            Lien pour définir le mot de passe (à transmettre si le courriel n'arrive pas) :
          </p>
          <p className="text-xs text-muted break-all select-all">{actionLink}</p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FirmAdmin() {
  const { user } = useAuth();
  const { loading, error, firm, isOrgAdmin, members, invitations, refresh } = useFirm();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<FirmMember | null>(null);

  usePageHeader("Firme", "Membres, invitations et accès aux projets");

  const adminCount = members.filter((m) => m.orgRole === "admin").length;

  async function handleRole(member: FirmMember, next: OrgRole) {
    setBusyUserId(member.userId);
    try {
      await setMemberRole(member.userId, next);
      toast.success(
        next === "admin" ? `${member.name} est maintenant administrateur.` : `${member.name} est maintenant membre.`,
      );
      await refresh();
    } catch (err) {
      const e = err as ApiError;
      console.error("Role change failed:", e);
      toast.error(e.message || "Impossible de changer le rôle.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(member: FirmMember) {
    setBusyUserId(member.userId);
    try {
      await removeMember(member.userId);
      toast.success(`${member.name} a été retirée de la firme.`);
      await refresh();
    } catch (err) {
      const e = err as ApiError;
      console.error("Remove member failed:", e);

      // The RESTRICT path. project_members_user_org_fkey refuses to strip
      // someone's project history silently, and the route turns that into a
      // list of the projects to clear first — show that, not a raw error.
      if (e.code === "has_project_memberships") {
        const names = (e.details as any)?.projects as string[] | undefined;
        toast.error(e.message, {
          description: names?.length ? names.join(", ") : undefined,
          duration: 10000,
        });
      } else {
        toast.error(e.message || "Impossible de retirer ce membre.");
      }
    } finally {
      setBusyUserId(null);
      setPendingRemoval(null);
    }
  }

  async function handleRevoke(invitationId: string, email: string) {
    try {
      await revokeInvitation(invitationId);
      toast.success(`Invitation de ${email} annulée.`);
      await refresh();
    } catch (err) {
      const e = err as ApiError;
      console.error("Revoke failed:", e);
      toast.error(e.message || "Impossible d'annuler l'invitation.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600 mx-auto" />
          <p className="mt-4 text-muted">Chargement…</p>
        </div>
      </div>
    );
  }

  // Not a redirect: bouncing someone silently to the dashboard reads as a
  // broken link. Say what the screen is and why they cannot see it.
  if (!isOrgAdmin) {
    return (
      <div className="min-h-screen bg-canvas px-4 sm:px-6 lg:px-8 py-10">
        <Card className="max-w-md mx-auto px-6 py-8 text-center">
          <ShieldOff size={32} className="mx-auto mb-3 text-faint" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">Réservé aux administrateurs</h2>
          <p className="mt-2 text-sm text-muted">
            Seuls les administrateurs de {firm?.name || "votre firme"} peuvent gérer les membres et
            les accès aux projets.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-20">
      <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-6xl mx-auto space-y-6">
        {error && (
          <Card className="px-4 py-3">
            <p className="text-sm text-open">{error}</p>
          </Card>
        )}

        {/* Firm header */}
        <Card className="p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={22} className="text-brand-600" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-ink truncate">{firm?.name}</h1>
            <p className="text-xs text-muted">
              {members.length} membre{members.length > 1 ? "s" : ""}
              {invitations.length > 0 && ` · ${invitations.length} invitation(s) en attente`}
            </p>
          </div>
        </Card>

        {/* Roster */}
        <Section title="Membres de la firme">
          <Card className="divide-y divide-line">
            {members.map((member) => {
              const isSelf = member.userId === user?.id;
              const isLastAdmin = member.orgRole === "admin" && adminCount <= 1;
              const busy = busyUserId === member.userId;

              const demoteBlocked = isLastAdmin
                ? "Votre firme doit conserver au moins un administrateur."
                : null;
              const removeBlocked = isSelf
                ? "Vous ne pouvez pas vous retirer vous-même."
                : demoteBlocked;

              return (
                <div
                  key={member.userId}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-ink truncate">{member.name}</span>
                      {isSelf && <span className="text-xs text-muted">(vous)</span>}
                      <OrgRoleBadge role={member.orgRole} />
                    </div>
                    <div className="text-xs text-muted truncate">{member.email}</div>
                    {removeBlocked && (
                      <p className="text-xs text-muted mt-1">{removeBlocked}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {member.orgRole === "member" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleRole(member, "admin")}
                      >
                        <ShieldCheck size={15} aria-hidden="true" />
                        Promouvoir
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || !!demoteBlocked}
                        title={demoteBlocked ?? undefined}
                        onClick={() => void handleRole(member, "member")}
                      >
                        <ShieldOff size={15} aria-hidden="true" />
                        Rétrograder
                      </Button>
                    )}

                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy || !!removeBlocked}
                      title={removeBlocked ?? undefined}
                      onClick={() => setPendingRemoval(member)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Retirer
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>

        {/* Invitations */}
        <Section
          title="Invitations"
          action={
            <button
              type="button"
              onClick={() => setShowInvite((v) => !v)}
              className="text-xs font-medium text-brand-strong hover:underline flex-shrink-0 inline-flex items-center gap-1"
            >
              {showInvite ? (
                <>
                  <X size={13} aria-hidden="true" />
                  Fermer
                </>
              ) : (
                <>
                  <UserPlus size={13} aria-hidden="true" />
                  Ajouter quelqu'un
                </>
              )}
            </button>
          }
        >
          <div className="space-y-3">
            {showInvite && (
              <InviteForm
                onDone={() => {
                  setShowInvite(false);
                  void refresh();
                }}
              />
            )}

            <Card>
              {invitations.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Mail size={28} className="mx-auto mb-2 text-faint" aria-hidden="true" />
                  <p className="text-sm text-muted">Aucune invitation en attente.</p>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-ink truncate">{inv.email}</span>
                          <OrgRoleBadge role={inv.orgRole} />
                        </div>
                        <div className="text-xs text-muted">
                          {inv.expired
                            ? "Expirée — annulez et renvoyez"
                            : `Expire le ${new Date(inv.expiresAt).toLocaleDateString("fr-CA")}`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRevoke(inv.id, inv.email)}
                      >
                        Annuler
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </Section>

        {/* Project access */}
        <Section title="Accès aux projets">
          <FirmProjectAccess members={members} />
        </Section>
      </div>

      <ConfirmDialog
        open={!!pendingRemoval}
        title={`Retirer ${pendingRemoval?.name ?? ""} de la firme ?`}
        description="Cette personne perdra l'accès à RedMark. Si elle est encore assignée à des projets, retirez-la d'abord de ceux-ci."
        confirmLabel="Retirer"
        destructive
        onConfirm={() => pendingRemoval && void handleRemove(pendingRemoval)}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
