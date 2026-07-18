import { useState } from "react";
import { X, Search, MapPin } from "lucide-react";
import { useModalOpen } from "../../hooks/useModalOpen";
import type { Location } from "../../lib/locationsApi";

interface Props {
  open: boolean;
  locations: Location[];
  onSelect: (location: Location) => void;
  onCancel: () => void;
}

// Location picker shown when the user taps empty space on a plan (while in
// pin-placement mode) to choose which location the new pin represents.
// `locations` is expected to already be filtered by the caller to the
// current plan's level, and to exclude locations that already have a pin on
// this plan (the DB's UNIQUE(location_id, plan_id) would reject a repeat).
export default function LocationPickerSheet({ open, locations, onSelect, onCancel }: Props) {
  useModalOpen(open);
  const [search, setSearch] = useState("");

  if (!open) return null;

  const filtered = search.trim()
    ? locations.filter((l) => {
        const q = search.trim().toLowerCase();
        return l.locationNumber.toLowerCase().includes(q) || (l.name || "").toLowerCase().includes(q);
      })
    : locations;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-medium text-[#1A1A1A]">Placer un pin</h3>
          <button
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-[#1A1A1A] rounded-lg"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-200">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un local…"
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-8 px-4">
              {locations.length === 0
                ? "Aucun local disponible pour ce niveau (tous les locaux importés ont déjà un pin sur ce plan, ou aucun local n'est encore importé)."
                : "Aucun local ne correspond à cette recherche."}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => onSelect(loc)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 text-left min-h-[44px]"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
                    <MapPin size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A] truncate">
                      {loc.locationNumber}
                      {loc.name ? ` — ${loc.name}` : ""}
                    </div>
                    {loc.discipline && (
                      <div className="text-xs text-gray-500 truncate">{loc.discipline}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
