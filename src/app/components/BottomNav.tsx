import { useContext } from "react";
import { useNavigate, useLocation } from "react-router";
import { FolderKanban, LayoutDashboard, User } from "lucide-react";
import { ModalOpenContext } from "../../contexts/ModalOpenContext";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const modalCtx = useContext(ModalOpenContext);

  const navItems = [
    { label: "Tableau de bord", icon: LayoutDashboard, path: "/app/dashboard" },
    { label: "Projets", icon: FolderKanban, path: "/app/projects" },
    { label: "Profil", icon: User, path: "/app/profile" },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  // Hidden while any modal is open so its action buttons are never covered
  // by (or lose taps to) the fixed nav bar — see useModalOpen().
  if (modalCtx?.isModalOpen) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-line safe-area-bottom z-50">
      <div className="max-w-2xl mx-auto grid grid-cols-3 h-14 md:h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              // Labels removed — icons only. The label still ships as the
              // accessible name so the tabs stay screen-reader navigable.
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center justify-center transition-colors min-h-[48px] ${
                // The active icon is INK, not red. The red is spent on the
                // 2px rule above it — that is the position marker. Colouring
                // the icon too would put two reds on one element.
                active ? "text-ink" : "text-faint hover:text-body active:bg-subtle"
              }`}
            >
              {/* THE REDMARK MOVE, applied to navigation: a 2px red rule
                  marking position. Square-cut, not a rounded pill — this is
                  a drawn line, not a lozenge. It is the only cue left now
                  that labels are gone, so it stays. */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-brand-600" />
              )}
              <Icon
                size={20}
                className="lucide-weight"
                style={{ "--icon-stroke": active ? 2 : 1.5 } as React.CSSProperties}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
