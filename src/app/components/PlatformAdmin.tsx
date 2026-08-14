import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import {
  createOrganization,
  listOrganizations,
  reissueAdminLink,
  slugify,
  updateOrganization,
  type PlatformOrganization,
} from "../../lib/platformApi";
import { normalizeName, normalizeRole } from "../../lib/roles";
import Button from "./ui-kit/Button";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import RolePicker from "./ui-kit/RolePicker";
import RecoveryLinkDialog from "./RecoveryLinkDialog";

/**
 * The platform-operator surface — administering FIRMS, never their contents.
 *
 * WHY THIS LIVES OUTSIDE /app
 *
 * Everything under /app is wrapped in Layout → FirmGate, which stops any user
 * who belongs to no firm before the app chrome renders. A platform operator
 * belongs to no firm BY DESIGN, so they cannot pass that gate — this screen
 * would be permanently unreachable inside /app.
 *
 * That constraint is worth stating plainly rather than working around: an
 * operator is structurally unable to enter the firm application. Not "sees an
 * empty version of it" — cannot load it. The tier's isolation is visible in
 * the routing, not just asserted in a policy.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No project list. No visit count. No way to open a firm and look inside. The
 * server has no route that would answer, and the database has no policy that
 * would let one — an operator is a stranger to every data table. Member counts
 * are administrative metadata; a list of projects would be the first step
 * across the line this whole tier exists to hold.
 *
 * Route-guarding is presentation. Every call is re-authorized against the
 * platform_operators allowlist server-side, and that allowlist is written by
 * hand in psql — no code path anywhere can add a row to it.
 */

type Phase = "checking" | "ready" | "denied";

export default function PlatformAdmin() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ link: string; recipient: string } | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setOrgs(await listOrganizations());
      setPhase("ready");
    } catch (err: any) {
      // 404 is the intended answer for a non-operator — the server refuses to
      // confirm the tier exists. Anything else is a genuine failure, but the
      // screen looks identical either way, for the same reason.
      if (err?.status !== 404) console.error("PlatformAdmin: load failed", err);
      setPhase("denied");
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === "checking") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden="true" />
      </div>
    );
  }

  // Generic not-found. No "réservé aux opérateurs", no mention of the tier:
  // telling someone they lack a permission tells them the permission exists.
  if (phase === "denied") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-lg font-semibold text-ink">Page introuvable</h1>
          <p className="mt-2 text-sm text-muted">Cette adresse ne correspond à aucune page.</p>
          <Link
            to="/app/dashboard"
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-subtle"
          >
            Retour à l'application
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50">
            <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-ink">Administration de la plateforme</h1>
            <p className="text-xs text-muted truncate">Connecté en tant que {user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-line p-2 text-muted hover:bg-subtle"
            aria-label="Rafraîchir"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* States the boundary on the screen itself, so nobody using it has to
            guess why there is no way in to a firm's work. */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm text-body">
            Vous pouvez créer des firmes et désigner leur premier administrateur. Vous n'avez accès
            à <strong>aucune donnée</strong> des firmes — ni projets, ni visites, ni photos, ni
            rapports. Pour toute question sur le contenu d'une firme, adressez-vous à son
            administrateur.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            Firmes ({orgs.length})
          </h2>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? (
              <>
                <X className="h-4 w-4" aria-hidden="true" />
                Annuler
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nouvelle firme
              </>
            )}
          </Button>
        </div>

        {showForm && (
          <CreateFirmForm
            onCreated={(link, recipient) => {
              setShowForm(false);
              void load();
              if (link) setLinkDialog({ link, recipient });
              else
                toast.warning(
                  "Firme créée, mais le lien d'activation n'a pas pu être généré. Utilisez « Renvoyer le lien ».",
                );
            }}
          />
        )}

        {orgs.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">
            Aucune firme pour l'instant.
          </p>
        ) : (
          <ul className="space-y-3">
            {orgs.map((org) => (
              <FirmRow
                key={org.id}
                org={org}
                onChanged={() => void load()}
                onLink={(link, recipient) => setLinkDialog({ link, recipient })}
              />
            ))}
          </ul>
        )}
      </main>

      <RecoveryLinkDialog
        open={!!linkDialog}
        link={linkDialog?.link ?? null}
        recipient={linkDialog?.recipient ?? ""}
        onClose={() => setLinkDialog(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function FirmRow({
  org,
  onChanged,
  onLink,
}: {
  org: PlatformOrganization;
  onChanged: () => void;
  onLink: (link: string, recipient: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [reportName, setReportName] = useState(org.report_firm_name || "");
  const [saving, setSaving] = useState(false);
  const [busyAdmin, setBusyAdmin] = useState<string | null>(null);

  async function save() {
    const cleanName = normalizeName(name);
    if (!cleanName) return;
    setSaving(true);
    try {
      await updateOrganization(org.id, { name: cleanName, reportFirmName: reportName.trim() });
      toast.success("Firme mise à jour.");
      setEditing(false);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || "Impossible de mettre à jour la firme.");
    } finally {
      setSaving(false);
    }
  }

  async function reissue(userId: string, label: string) {
    setBusyAdmin(userId);
    try {
      const res = await reissueAdminLink(org.id, userId);
      if (res.actionLink) onLink(res.actionLink, label);
      else toast.error("Le lien n'a pas pu être généré.");
    } catch (err: any) {
      // Not a failure: it means the person is already using their account.
      if (err?.code === "already_activated") toast.info(err.message);
      else toast.error(err?.message || "Impossible de générer le lien.");
    } finally {
      setBusyAdmin(null);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle">
          <Building2 className="h-4 w-4 text-muted" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className={labelClassName} htmlFor={`name-${org.id}`}>
                  Nom de la firme
                </label>
                <input
                  id={`name-${org.id}`}
                  className={inputClassName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor={`report-${org.id}`}>
                  Nom imprimé sur les rapports
                </label>
                <input
                  id={`report-${org.id}`}
                  className={inputClassName}
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="ex. Jodoin Lamarre Pratte architectes"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void save()} disabled={saving || !normalizeName(name)}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setName(org.name);
                    setReportName(org.report_firm_name || "");
                  }}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-subtle"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-medium text-ink">{org.name}</p>
              <p className="text-xs text-muted">
                {org.slug} · {org.memberCount} membre{org.memberCount === 1 ? "" : "s"}
              </p>
              {/* Called out when missing: reports fall back to this field, so a
                  blank one prints a document with no firm name on it. */}
              {org.report_firm_name ? (
                <p className="mt-1 text-xs text-muted">Rapports : {org.report_firm_name}</p>
              ) : (
                <p className="mt-1 text-xs text-warn">
                  Nom de rapport non défini — les rapports seront sans en-tête.
                </p>
              )}

              <div className="mt-3">
                <p className="text-xs font-medium text-muted">Administrateurs</p>
                {org.admins.length === 0 ? (
                  <p className="text-xs text-warn">Aucun administrateur.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {org.admins.map((admin) => (
                      <li
                        key={admin.userId}
                        className="flex flex-wrap items-center gap-2 text-sm text-body"
                      >
                        <span>{admin.name || admin.email || admin.userId}</span>
                        {admin.name && admin.email && (
                          <span className="text-xs text-muted">{admin.email}</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void reissue(admin.userId, admin.name || admin.email || "")
                          }
                          disabled={busyAdmin === admin.userId}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                        >
                          {busyAdmin === admin.userId ? "…" : "Renvoyer le lien"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Modifier
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function CreateFirmForm({
  onCreated,
}: {
  onCreated: (link: string | null, recipient: string) => void;
}) {
  const [name, setName] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [reportName, setReportName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [saving, setSaving] = useState(false);

  // Derived, never stored: typing the firm name keeps the preview live, and an
  // explicit override wins. Storing it would strand the slug on the first
  // keystroke of the name.
  const slug = slugOverride ? slugify(slugOverride) : slugify(name);
  const ready = normalizeName(name).length > 0 && adminEmail.includes("@") && slug.length > 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await createOrganization({
        name: normalizeName(name),
        slug,
        reportFirmName: reportName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminName: normalizeName(adminName),
        adminRole: normalizeRole(adminRole),
      });
      toast.success(`Firme « ${res.organization.name} » créée.`);
      onCreated(res.actionLink, normalizeName(adminName) || res.adminEmail);
    } catch (err: any) {
      toast.error(err?.message || "Impossible de créer la firme.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-4 space-y-4">
      <div>
        <label className={labelClassName} htmlFor="firm-name">
          Nom de la firme
        </label>
        <input
          id="firm-name"
          className={inputClassName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex. Jodoin Lamarre Pratte"
          required
        />
        {slug && (
          <p className="mt-1 text-xs text-muted">
            Identifiant : <code>{slug}</code>
          </p>
        )}
      </div>

      <div>
        <label className={labelClassName} htmlFor="firm-slug">
          Identifiant personnalisé (optionnel)
        </label>
        <input
          id="firm-slug"
          className={inputClassName}
          value={slugOverride}
          onChange={(e) => setSlugOverride(e.target.value)}
          placeholder="laissé vide, dérivé du nom"
        />
      </div>

      <div>
        <label className={labelClassName} htmlFor="firm-report-name">
          Nom imprimé sur les rapports
        </label>
        <input
          id="firm-report-name"
          className={inputClassName}
          value={reportName}
          onChange={(e) => setReportName(e.target.value)}
          placeholder="ex. Jodoin Lamarre Pratte architectes"
        />
        <p className="mt-1 text-xs text-muted">
          Apparaît en en-tête des rapports de visite. Laissé vide, les rapports n'auront pas de nom
          de firme.
        </p>
      </div>

      <div className="border-t border-line pt-4">
        <p className="text-sm font-medium text-ink">Premier administrateur</p>
        <p className="mt-1 text-xs text-muted">
          Cette personne gérera ensuite sa firme elle-même : inviter des collègues, gérer l'accès
          aux projets. Un lien d'activation sera affiché après la création — c'est le seul moyen
          pour elle d'accéder à son compte.
        </p>

        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClassName} htmlFor="admin-email">
              Courriel
            </label>
            <input
              id="admin-email"
              type="email"
              className={inputClassName}
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="prenom.nom@firme.ca"
              required
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor="admin-name">
              Nom complet (optionnel)
            </label>
            <input
              id="admin-name"
              className={inputClassName}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Prénom Nom"
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor="admin-role">
              Titre (optionnel)
            </label>
            <RolePicker id="admin-role" value={adminRole} onChange={setAdminRole} />
            <p className="mt-1 text-xs text-muted">
              Pré-remplissage seulement : la personne confirme et peut corriger son nom et son titre
              en activant son compte.
            </p>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving || !ready} fullWidth>
        {saving ? "Création…" : "Créer la firme"}
      </Button>
    </form>
  );
}
