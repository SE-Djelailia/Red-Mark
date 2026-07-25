import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import RedMarkLogo from "./RedMarkLogo";
import { useSupabaseAuth } from "../../contexts/SupabaseAuthContext"; // ✅ Using Supabase Auth
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useSupabaseAuth(); // ✅ Using Supabase Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Rediriger si déjà connecté
  useEffect(() => {
    if (user) {
      console.log("✅ User already logged in, redirecting to /app");
      navigate("/app", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, { name, firm });
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm">
        {/* Logo/Branding */}
        <div className="text-center mb-12 flex flex-col items-center">
          <RedMarkLogo size="lg" variant="full" className="mb-4" />
          <p className="text-body">Intelligence Photo de Chantier</p>
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
                  className="w-full px-4 py-3 bg-canvas border border-line rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-all"
                  required
                />
              </div>

              <div>
                <label htmlFor="firm" className="block text-sm text-ink mb-2">
                  Firme d'architecture
                </label>
                <input
                  id="firm"
                  type="text"
                  value={firm}
                  onChange={(e) => setFirm(e.target.value)}
                  placeholder="Jodoin Lamarre Pratte"
                  className="w-full px-4 py-3 bg-canvas border border-line rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-all"
                  required
                />
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
              className="w-full px-4 py-3 bg-canvas border border-line rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-all"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-ink mb-2">
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-canvas border border-line rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 transition-all pr-12"
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
            disabled={loading}
            className="w-full py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 active:bg-[#A00400] transition-colors mt-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Chargement..." : isSignUp ? "S'inscrire" : "Se connecter"}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-body hover:text-brand-600"
          >
            {isSignUp ? "Déjà un compte? Se connecter" : "Nouveau? Créer un compte"}
          </button>
        </div>
      </div>
    </div>
  );
}
