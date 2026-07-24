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
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1A1A1A] border-t border-gray-800 safe-area-bottom z-50">
      <div className="max-w-2xl mx-auto grid grid-cols-3 h-16 md:h-20">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center justify-center gap-1 transition-all min-h-[48px] ${
                active
                  ? "text-[#E10600] bg-white/5"
                  : "text-gray-400 hover:text-white active:bg-white/5"
              }`}
            >
              {/* Active Indicator Bar */}
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-[#E10600] rounded-b-full" />
              )}
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-xs ${active ? "font-semibold" : ""}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
