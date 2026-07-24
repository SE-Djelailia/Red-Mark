import { useContext, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Plus, X, type LucideIcon } from "lucide-react";
import { ModalOpenContext } from "../../contexts/ModalOpenContext";

export interface FloatingActionItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

interface Props {
  // Contextual "+" options for the current screen, already filtered by the
  // caller for the current project role (an option a commenter can't
  // perform simply isn't in the array). Empty/omitted hides the "+" button
  // entirely instead of opening onto nothing.
  menu?: FloatingActionItem[];
}

// Two persistent floating buttons (PDF-Expert style) shared by every main
// screen: a loupe that always opens global search, and a "+" that expands a
// small contextual menu of the 2-3 actions relevant to whatever screen it's
// mounted on. Screens own their menu config (this component has no route
// awareness) so each one declares its options instead of reimplementing its
// own floating button — replaces the bespoke fixed "+" buttons that used to
// live separately in ProjectList.tsx and ProjectDetail.tsx.
export default function FloatingActions({ menu = [] }: Props) {
  const navigate = useNavigate();
  const modalCtx = useContext(ModalOpenContext);
  const [menuOpen, setMenuOpen] = useState(false);

  // Same convention as BottomNav: disappear entirely while any modal is
  // open, rather than floating on top of it or competing for taps.
  if (modalCtx?.isModalOpen) return null;

  return (
    <>
      {menuOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <div className="fixed right-4 sm:right-6 bottom-24 md:bottom-28 z-40 flex flex-col items-end gap-3">
        {menuOpen && menu.length > 0 && (
          <div className="flex flex-col items-end gap-2">
            {menu.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                  className="flex items-center gap-2 pl-4 pr-2 py-2 bg-white border border-gray-200 rounded-full shadow-lg hover:border-[#E10600] transition-colors text-sm font-medium text-[#1A1A1A] whitespace-nowrap"
                >
                  <span>{item.label}</span>
                  <span className="w-8 h-8 rounded-full bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
                    <Icon size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!menuOpen && (
          <button
            onClick={() => navigate("/app/search")}
            aria-label="Rechercher"
            className="w-12 h-12 rounded-full bg-white text-[#1A1A1A] border border-gray-200 shadow-lg hover:border-[#E10600] transition-colors flex items-center justify-center touch-manipulation"
          >
            <Search size={20} />
          </button>
        )}

        {menu.length > 0 && (
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Fermer le menu d'actions" : "Actions rapides"}
            className="w-14 h-14 md:w-16 md:h-16 bg-[#E10600] text-white rounded-full shadow-lg hover:bg-[#C00500] active:scale-95 transition-all flex items-center justify-center touch-manipulation"
          >
            {menuOpen ? <X size={28} /> : <Plus size={28} />}
          </button>
        )}
      </div>
    </>
  );
}
