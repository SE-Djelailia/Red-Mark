import { useCallback, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { supabase } from "../../lib/supabase";
import { isProfileComplete, normalizeName, normalizeRole } from "../../lib/roles";
import Button from "./ui-kit/Button";
import { inputClassName, labelClassName } from "./ui-kit/Input";
import RolePicker from "./ui-kit/RolePicker";

/**
 * Catches accounts that reach the app without a name or a title.
 *
 * New accounts cannot get here: activation requires both before it will let
 * anyone through. This exists for the accounts that predate that — created by
 * self-signup when only a name was asked for, or by the old invite flow, which
 * asked for nothing at all.
 *
 * WHY IT IS WORTH BLOCKING FOR
 *
 * Both fields print on every report: the author line under "Préparé par", and
 * the ASSISTAIENT attendee table. A blank name does not degrade gracefully —
 * it produces a document sent to a client, signed by nobody.
 *
 * DELIBERATELY NARROW: it renders only when a field is genuinely empty, reads
 * the profiles row rather than user_metadata (the report generator reads
 * profiles, so that is the copy that must be right), and fails OPEN — if the
 * lookup errors, the app renders anyway. Locking someone out of a site visit
 * over a missing job title would be a far worse outcome than an unsigned
 * report.
 */
export default function ProfileCompletionGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  const check = useCallback(async () => {
    if (!user?.id) return;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("name, role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        // Fail open — see the note above.
        console.error("ProfileCompletionGate: lookup failed", error);
        setNeedsProfile(false);
        return;
      }

      if (data && isProfileComplete(data)) {
        setNeedsProfile(false);
        return;
      }

      // Seed from whatever exists, including user_metadata, so someone who
      // already has a name only has to add the missing title.
      setName(normalizeName(data?.name || user.user_metadata?.name));
      setRole(normalizeRole(data?.role || user.user_metadata?.role));
      setNeedsProfile(true);
    } finally {
      setChecking(false);
    }
  }, [user?.id, user?.user_metadata]);

  useEffect(() => {
    void check();
  }, [check]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = normalizeName(name);
    const cleanRole = normalizeRole(role);
    if (!cleanName || !cleanRole || !user?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name: cleanName, role: cleanRole, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;

      const { error: metaError } = await supabase.auth.updateUser({
        data: { name: cleanName, role: cleanRole },
      });
      if (metaError) console.warn("Could not sync user_metadata:", metaError.message);

      setNeedsProfile(false);
      toast.success("Profil complété.");
    } catch (err: any) {
      console.error("ProfileCompletionGate: save failed", err);
      toast.error(err?.message || "Impossible d'enregistrer votre profil.");
    } finally {
      setSaving(false);
    }
  }

  // No spinner while checking: this is one indexed read on the user's own row,
  // and flashing a loader in front of the whole app on every launch would cost
  // more than it buys.
  if (checking || !needsProfile) return <>{children}</>;

  const ready = normalizeName(name).length > 0 && normalizeRole(role).length > 0;

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[4px] border border-line bg-surface p-6">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-subtle">
            <UserRound className="h-6 w-6 text-brand-600" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Complétez votre profil</h1>
          <p className="mt-2 text-sm text-muted">
            Votre nom et votre titre apparaissent sur les rapports de visite. Il en manque un.
          </p>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div>
            <label className={labelClassName} htmlFor="completion-name">
              Nom complet
            </label>
            <input
              id="completion-name"
              type="text"
              required
              autoFocus
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              className={inputClassName}
            />
          </div>

          <div>
            <label className={labelClassName} htmlFor="completion-role">
              Titre
            </label>
            <RolePicker id="completion-role" value={role} onChange={setRole} required />
          </div>

          <Button type="submit" disabled={saving || !ready} fullWidth>
            {saving ? "Enregistrement…" : "Continuer"}
          </Button>
        </form>
      </div>
    </div>
  );
}
