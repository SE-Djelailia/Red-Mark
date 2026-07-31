import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/useAuth";
import { usePageHeaderValue } from "../../contexts/PageHeaderContext";
import NotificationBell from "./NotificationBell";
import { LogoLockup } from "./ui-kit/Logo";

// Initials for the avatar chip: first letters of the display name, or the
// email's local part as a fallback. Capped at two so the chip stays round.
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// Global top bar. Per the design refresh this is light chrome: white
// surface with a hairline rule, identity carried by the red logo square
// rather than the dark slab it used to be. The page title, when a screen
// declares one via usePageHeader(), renders inside this same block so the
// header reads as one continuous white area instead of a bar plus a
// separate titled band.
export default function AppHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { title, subtitle } = usePageHeaderValue();

  if (!user) return null;

  const displayName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";

  return (
    <header className="bg-surface border-b border-line sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 h-14">
          <LogoLockup size={21} className="flex-shrink-0" />

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell userId={user.id} />
            <button
              type="button"
              onClick={() => navigate("/app/profile")}
              aria-label="Profil"
              title={displayName}
              className="w-7 h-7 rounded-full bg-subtle border border-line flex items-center justify-center text-[11px] font-semibold text-body hover:border-line-strong transition-colors flex-shrink-0"
            >
              {initialsFor(displayName)}
            </button>
          </div>
        </div>

        {title && (
          <div className="pb-3.5 -mt-0.5">
            <h1 className="text-2xl lg:text-[28px] font-semibold tracking-tight text-ink">
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 text-[13px] lg:text-sm text-muted">{subtitle}</p>}
          </div>
        )}
      </div>
    </header>
  );
}
