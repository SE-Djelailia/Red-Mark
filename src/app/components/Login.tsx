import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Eye, EyeOff, MailCheck } from "lucide-react";
import { LogoLockup } from "./ui-kit/Logo";
import RolePicker from "./ui-kit/RolePicker";
import { useSupabaseAuth } from "../../contexts/SupabaseAuthContext"; // ✅ Using Supabase Auth
import { supabase } from "../../lib/supabase";
import { signInWithMicrosoft } from "../../lib/authProviders";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "reset";

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useSupabaseAuth(); // ✅ Using Supabase Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const isSignUp = mode === "signup";

  // Rediriger si déjà connecté
  useEffect(() => {
    if (user) {
      console.log("✅ User already logged in, redirecting to /app");
      navigate("/app", { replace: true });
    }
  }, [user, navigate]);

  const handleMicrosoftSignIn = async () => {
    setOauthLoading(true);
    try {
      // On success this NAVIGATES AWAY to Microsoft, so there is no success
      // path to handle here — only the failure to even start the handshake.
      // oauthLoading is deliberately never reset on success: the button must
      // stay disabled during the redirect rather than flicking back to
      // enabled and inviting a second click.
      await signInWithMicrosoft();
    } catch (error: any) {
      console.error("Microsoft sign-in error:", error);
      toast.error("Impossible de démarrer la connexion Microsoft.");
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, { name: name.trim(), role: jobRole.trim() });
        navigate("/app");
      } else {
        await signIn(email, password);
        navigate("/app");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      // Error handling is done in AuthContext
    } finally {
      setLoading(false);
    }
  };

  /**
   * Password reset.
   *
   * The confirmation is deliberately the SAME whether or not the address has
   * an account. Saying "aucun compte trouvé" would turn this form into an
   * account-enumeration oracle: anyone could check which addresses at a firm
   * use RedMark, one submission at a time. Supabase's own API is built the
   * same way and returns success for unknown addresses.
   *
   * The only exception below is rate limiting, which is about the sender
   * rather than the address and tells an attacker nothing.
   *
   * redirectTo is the SAME page invitations and provisioning land on — it
   * already reads the recovery session Supabase establishes and completes the
   * password change, so there is nothing reset-specific to build.
   *
   * ⚠ window.location.origin means every origin the app is served from
   * (production, Vercel previews, localhost) must appear in Supabase's
   * allowed Redirect URLs, or Supabase silently falls back to the Site URL.
   */
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      });

      if (error) {
        console.error("Password reset error:", error);
        const message = String(error.message || "");
        if (/rate limit|too many|429/i.test(message)) {
          toast.error("Trop de tentatives. Réessayez dans quelques minutes.");
          return;
        }
        // Anything else is reported as success on purpose — see above.
      }

      setResetSent(true);
    } finally {
      setLoading(false);
    }
  };

  const goTo = (next: Mode) => {
    setMode(next);
    setResetSent(false);
    setPassword("");
  };

  // ---------------------------------------------------------------------
  // Reset flow
  // ---------------------------------------------------------------------
  if (mode === "reset") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-6">
        <div className="w-full max-w-sm">
          <div className="mb-12 flex justify-center">
            <LogoLockup size={40} />
          </div>

          {resetSent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-subtle">
                <MailCheck className="h-6 w-6 text-ink" aria-hidden="true" />
              </div>
              <h1 className="text-lg font-semibold text-ink">Vérifiez vos courriels</h1>
              <p className="mt-2 text-sm text-muted">
                Si un compte existe pour cette adresse, un courriel de réinitialisation a été
                envoyé. Le lien expire après environ une heure.
              </p>
              <p className="mt-2 text-xs text-muted">
                Pensez à regarder dans vos indésirables.
              </p>
              <button
                onClick={() => goTo("signin")}
                className="mt-6 w-full py-3 border border-line text-ink rounded-[4px] hover:bg-canvas transition-colors"
              >
                Retour à la connexion
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-ink text-center">Mot de passe oublié</h1>
              <p className="mt-2 mb-6 text-sm text-muted text-center">
                Entrez votre adresse courriel et nous vous enverrons un lien pour en choisir un
                nouveau.
              </p>

              <form onSubmit={handleReset} className="space-y-5">
                <div>
                  <label htmlFor="reset-email" className="block text-sm text-ink mb-2">
                    Courriel
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@courriel.com"
                    className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 transition-all"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-[#A00400] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Envoi..." : "Envoyer le lien"}
                </button>
              </form>

              <div className="text-center mt-6">
                <button
                  onClick={() => goTo("signin")}
                  className="text-sm text-body hover:text-ink inline-flex items-center gap-1.5"
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  Retour à la connexion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm">
        {/* Logo/Branding — the lockup carries the screen on its own now
            that the tagline is gone. */}
        <div className="mb-12 flex justify-center">
          <LogoLockup size={40} />
        </div>

        {/* Federated sign-in. Above the form because it is the faster path
            for firm staff whose Microsoft account already exists; the
            email/password form below stays as the full fallback for anyone
            without one (external contractors, invited guests). */}
        <button
          type="button"
          onClick={handleMicrosoftSignIn}
          disabled={oauthLoading || loading}
          className="w-full py-3 bg-canvas border border-line rounded-[4px] text-ink font-medium hover:bg-subtle transition-colors flex items-center justify-center gap-3 min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {/* Microsoft's four-square mark, inline so the strict CSP has no
              external host to block. */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <rect x="0" y="0" width="8.5" height="8.5" fill="#F25022" />
            <rect x="9.5" y="0" width="8.5" height="8.5" fill="#7FBA00" />
            <rect x="0" y="9.5" width="8.5" height="8.5" fill="#00A4EF" />
            <rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900" />
          </svg>
          {oauthLoading ? "Redirection…" : "Continuer avec Microsoft"}
        </button>

        <div className="flex items-center gap-3 my-6">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">ou</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        {/* Login/Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignUp && (
            <>
              <div>
                <label htmlFor="name" className="block text-sm text-ink mb-2">
                  Nom complet
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jean Dupont"
                  className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 transition-all"
                  required
                />
              </div>

              {/* The free-text "Firme d'architecture" field used to sit here.
                  It was dead: nobody self-selects a firm in this model —
                  membership comes from an invitation — and the value carried
                  no authority at all, which made it actively misleading.
                  Replaced by the title, which is real and prints on reports. */}
              <div>
                <label htmlFor="signup-role" className="block text-sm text-ink mb-2">
                  Titre
                </label>
                <RolePicker id="signup-role" value={jobRole} onChange={setJobRole} required />
              </div>
            </>
          )}

          <div>
            <label htmlFor="email" className="block text-sm text-ink mb-2">
              Courriel
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@courriel.com"
              className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 transition-all"
              required
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <label htmlFor="password" className="block text-sm text-ink">
                Mot de passe
              </label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => goTo("reset")}
                  className="text-xs text-brand-strong hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15 transition-all pr-12"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || (isSignUp && (!name.trim() || !jobRole.trim()))}
            className="w-full py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-[#A00400] transition-colors mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Chargement..." : isSignUp ? "S'inscrire" : "Se connecter"}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => goTo(isSignUp ? "signin" : "signup")}
            className="text-sm text-body hover:text-ink"
          >
            {isSignUp ? "Déjà un compte? Se connecter" : "Nouveau? Créer un compte"}
          </button>
        </div>
      </div>
    </div>
  );
}
