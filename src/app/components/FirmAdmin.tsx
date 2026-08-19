import { useState } from "react";
import {
  Building2,
  KeyRound,
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
  reissueRecoveryLink,
  removeMember,
  revokeInvitation,
  setMemberRole,
  type ApiError,
} from "../../lib/organizationApi";
import { Card, Section } from "./ui-kit/Card";
import Button from "./ui-kit/Button";
import { inputClassName, labelClassName, selectClassName } from "./ui-kit/Input";
import RolePicker from "./ui-kit/RolePicker";
import FirmProjectAccess from "./FirmProjectAccess";
import { getMemberProjects, type FirmProject } from "../../lib/firmProjectsApi";
import RecoveryLinkDialog from "./RecoveryLinkDialog";
import RemoveMemberDialog from "./RemoveMemberDialog";

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
      ? "bg-subtle border-line-strong text-ink font-medium"
      : "bg-subtle border-line text-body";
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-[4px] border text-[11px] font-medium whitespace-nowrap ${style}`}
    >
      {ORG_ROLE_LABEL[role]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Invite form — both entry methods
// ---------------------------------------------------------------------------

type Method = "invite" | "provision";

// Both descriptions are visible BEFORE the choice is made, and each says who
// sends the email. The original UI showed one line of helper text only after
// selecting, so "Créer le compte" was picked on the reasonable assumption that
// creating an account would email the person — it does not, and the link that
// appeared afterwards was the only way in.
const METHODS: {
  value: Method;
  label: string;
  blurb: string;
  detail: string;
  Icon: typeof MailPlus;
}[] = [
  {
    value: "invite",
    label: "Inviter par courriel",
    blurb: "RedMark lui envoie le lien",
    detail:
      "La personne reçoit automatiquement une invitation, crée son mot de passe et rejoint la firme elle-même. Vous n'avez rien à transmettre.",
    Icon: MailPlus,
  },
  {
    value: "provision",
    label: "Créer le compte",
    blurb: "vous lui envoyez le lien vous-même",
    detail:
      "Le compte est créé immédiatement, mais AUCUN courriel n'est envoyé. Un lien s'affichera : c'est vous qui devez le lui transmettre pour qu'elle définisse son mot de passe.",
    Icon: UserPlus,
  },
];

function InviteForm({
  onDone,
  onProvisioned,
}: {
  onDone: () => void;
  onProvisioned: (link: string, recipient: string) => void;
}) {
  const [method, setMethod] = useState<Method>("invite");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [orgRole, setOrgRole] = useState<OrgRole>("member");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setBusy(true);
    try {
      if (method === "invite") {
        const result = await createInvitation(trimmed, orgRole, name.trim(), jobRole.trim());
        toast.success(
          result.emailed
            ? `Invitation envoyée à ${trimmed}.`
            : `Invitation créée. ${trimmed} a déjà un compte — elle rejoindra la firme à sa prochaine connexion.`,
        );
        setEmail("");
        setName("");
        setJobRole("");
        onDone();
      } else {
        const result = await provisionMember(trimmed, orgRole, name.trim(), jobRole.trim());
        setEmail("");
        setName("");
        setJobRole("");
        if (result.actionLink) {
          // Straight into a modal. The admin must dismiss it deliberately,
          // because this link is the only path to the account they just made.
          onProvisioned(result.actionLink, name.trim() || trimmed);
        } else {
          // Link generation failed but the account and membership exist. Say
          // so plainly and point at the roster action that re-issues it.
          toast.error(
            `Compte créé pour ${trimmed}, mais le lien n'a pas pu être généré. Utilisez « Lien de connexion » dans la liste des membres.`,
            { duration: 10000 },
          );
          onDone();
        }
      }
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
      <fieldset className="mb-4">
        <legend className="text-sm font-medium text-ink mb-2">Comment l'ajouter ?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {METHODS.map((m) => {
            const selected = method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setMethod(m.value)}
                className={`text-left p-3 rounded-[4px] border transition-colors ${
                  selected
                    ? "bg-surface border-line-strong border-l-2 border-l-brand-600"
                    : "bg-surface border-line hover:bg-subtle"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <m.Icon
                    size={16}
                    className={selected ? "text-ink" : "text-muted"}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-sm font-medium ${selected ? "text-brand-strong" : "text-ink"}`}
                  >
                    {m.label}
                  </span>
                </div>
                <div className="text-xs text-muted">{m.blurb}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="text-xs text-muted mb-4">
        {METHODS.find((m) => m.value === method)?.detail}
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

        {/* Shown for BOTH methods. These are pre-fills: the person confirms
            and can correct them when they activate, and activation requires
            both regardless. Filling them here just saves a new colleague
            re-typing what the admin already knew. */}
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

        <div>
          <label className={labelClassName} htmlFor="firm-invite-job-role">
            Titre <span className="font-normal text-muted">(optionnel)</span>
          </label>
          <RolePicker id="firm-invite-job-role" value={jobRole} onChange={setJobRole} />
          <p className="text-xs text-muted mt-1.5">
            Apparaît sur les rapports, sous « Préparé par ».
          </p>
        </div>

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
          {busy
            ? "En cours…"
            : method === "invite"
              ? "Envoyer l'invitation"
              : "Créer le compte et obtenir le lien"}
        </Button>
      </form>
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
  const [removalProjects, setRemovalProjects] = useState<FirmProject[]>([]);
  const [removalLoading, setRemovalLoading] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{
    link: string;
    recipient: string;
    isReissue: boolean;
  } | null>(null);

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

  // Opening the dialog fetches what the removal would cut, so the admin
  // confirms against a list of real project names rather than a bare count.
  function startRemoval(member: FirmMember) {
    setPendingRemoval(member);
    setRemovalProjects([]);
    setRemovalLoading(true);
    getMemberProjects(member.userId)
      .then(setRemovalProjects)
      .catch((err) => {
        // The preview failing must not block the removal — but the admin
        // should know they are confirming without seeing the list.
        console.error("Could not load member's projects:", err);
        toast.error("Impossible de lister ses projets — la liste ci-dessous peut être incomplète.");
      })
      .finally(() => setRemovalLoading(false));
  }

  async function handleRemove(member: FirmMember) {
    setBusyUserId(member.userId);
    try {
      // cascade: the dialog has just shown exactly what will be revoked and
      // the admin agreed to it. Without this flag the route refuses whenever
      // project rows exist, which is the correct default everywhere else.
      const result = await removeMember(member.userId, true);
      toast.success(
        result.projectsRemoved > 0
          ? `${member.name} a été retirée de la firme et de ${result.projectsRemoved} projet(s).`
          : `${member.name} a été retirée de la firme.`,
      );
      setPendingRemoval(null);
      await refresh();
    } catch (err) {
      const e = err as ApiError;
      console.error("Remove member failed:", e);
      toast.error(e.message || "Impossible de retirer ce membre.");
      // Dialog stays open on failure so the admin can retry or cancel
      // deliberately, rather than the row silently reappearing unchanged.
    } finally {
      setBusyUserId(null);
    }
  }

  // Re-issues the set-password link for an account provisioned but never
  // activated — so a link the admin lost doesn't leave a dead account. The
  // server refuses for anyone who has already signed in; that refusal is a
  // useful answer, not an error, so it's surfaced as guidance.
  async function handleRecoveryLink(member: FirmMember) {
    setBusyUserId(member.userId);
    try {
      const result = await reissueRecoveryLink(member.userId);
      setLinkDialog({ link: result.actionLink, recipient: member.name, isReissue: true });
    } catch (err) {
      const e = err as ApiError;
      console.error("Recovery link failed:", e);
      if (e.code === "already_activated") {
        toast.info(e.message, { duration: 8000 });
      } else {
        toast.error(e.message || "Impossible de générer le lien.");
      }
    } finally {
      setBusyUserId(null);
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-ink mx-auto" />
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
          <div className="h-12 w-12 rounded-[4px] bg-subtle flex items-center justify-center flex-shrink-0">
            <Building2 size={20} className="text-ink" aria-hidden="true" />
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

                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {!isSelf && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleRecoveryLink(member)}
                        title="Pour un compte créé par un administrateur et jamais utilisé"
                      >
                        <KeyRound size={16} aria-hidden="true" />
                        Lien de connexion
                      </Button>
                    )}

                    {member.orgRole === "member" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleRole(member, "admin")}
                      >
                        <ShieldCheck size={16} aria-hidden="true" />
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
                        <ShieldOff size={16} aria-hidden="true" />
                        Rétrograder
                      </Button>
                    )}

                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy || !!removeBlocked}
                      title={removeBlocked ?? undefined}
                      onClick={() => startRemoval(member)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
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
                  <X size={12} aria-hidden="true" />
                  Fermer
                </>
              ) : (
                <>
                  <UserPlus size={12} aria-hidden="true" />
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
                onProvisioned={(link, recipient) => {
                  setShowInvite(false);
                  setLinkDialog({ link, recipient, isReissue: false });
                  void refresh();
                }}
              />
            )}

            <Card>
              {invitations.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Mail size={32} className="mx-auto mb-2 text-faint" aria-hidden="true" />
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

      <RecoveryLinkDialog
        open={!!linkDialog}
        link={linkDialog?.link ?? null}
        recipient={linkDialog?.recipient ?? ""}
        isReissue={linkDialog?.isReissue ?? false}
        onClose={() => setLinkDialog(null)}
      />

      <RemoveMemberDialog
        open={!!pendingRemoval}
        memberName={pendingRemoval?.name ?? ""}
        projects={removalProjects}
        loading={removalLoading}
        busy={!!pendingRemoval && busyUserId === pendingRemoval.userId}
        onConfirm={() => pendingRemoval && void handleRemove(pendingRemoval)}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
