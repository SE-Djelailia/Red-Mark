import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, MapPin, AlertCircle } from "lucide-react";
import type { Location, Level } from "../../lib/locationsApi";

const TYPE_LABEL: Record<Location["type"], string> = {
  room: "Local",
  element: "Élément",
};

interface Props {
  projectId: string;
  locations: Location[];
  levels: Level[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

// Project-wide flat browse of locations — search + level filter, each row
// linking into LocationDetail. Flat by design for Phase 1: no parent/child
// hierarchy display yet, even though locations.parent_location_id exists in
// the schema (it's write-only/unused for display today).
export default function LocationsTab({
  projectId,
  locations,
  levels,
  loading,
  error,
  onRetry,
}: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  // The input stays instantly responsive (bound to `search`); filtering (and
  // the re-render of however many hundred location rows) only happens once
  // typing pauses for 250ms, via `debouncedSearch`.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = locations.filter((loc) => {
    if (levelFilter && loc.levelId !== levelFilter) return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      if (!loc.locationNumber.toLowerCase().includes(q) && !(loc.name || "").toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  if (loading) {
    return <div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={36} className="mx-auto text-[#E10600] mb-3" />
        <p className="text-sm text-gray-600 mb-3">{error}</p>
        <button onClick={onRetry} className="text-sm text-[#E10600] hover:text-[#C00500] font-medium">
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un local…"
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent min-h-[48px]"
        />
      </div>

      {levels.length > 0 && (
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-sm min-h-[48px]"
        >
          <option value="">Tous les niveaux</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <MapPin size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">
            {locations.length === 0
              ? "Aucun local importé pour ce projet."
              : "Aucun local ne correspond à cette recherche."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((loc) => (
            <button
              key={loc.id}
              onClick={() => navigate(`/app/projects/${projectId}/locations/${loc.id}`)}
              className="w-full flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-[#E10600] hover:shadow-md transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
                <MapPin size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#1A1A1A] truncate">
                  {loc.locationNumber}
                  {loc.name ? ` — ${loc.name}` : ""}
                </div>
                <div className="text-xs text-gray-500">
                  {TYPE_LABEL[loc.type]}
                  {loc.discipline ? ` · ${loc.discipline}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
