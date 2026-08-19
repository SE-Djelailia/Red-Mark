import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, AlertCircle } from "lucide-react";
import type { Location, Level } from "../../lib/locationsApi";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_ICONS } from "../../lib/locationTypes";
import { inputClassName } from "./ui-kit/Input";
import { IconLocation } from "./ui-kit/RedMarkIcons";

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
    return <div className="text-center py-12 text-muted text-sm">Chargement…</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={32} className="mx-auto text-brand-600 mb-3" />
        <p className="text-sm text-body mb-3">{error}</p>
        <button onClick={onRetry} className="text-sm text-brand-strong hover:text-brand-800 font-medium">
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search and level filter share a row from sm — stacked full-width
          they read as two unrelated bars once the column is wide. */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un local…"
            className={`${inputClassName} pl-10`}
          />
        </div>

        {levels.length > 0 && (
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="w-full sm:w-56 px-4 py-3 bg-surface border border-line rounded-[4px] text-sm min-h-[48px]"
          >
            <option value="">Tous les niveaux</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <IconLocation size={48} className="mx-auto text-faint mb-4 lucide-display" />
          <p className="text-muted">
            {locations.length === 0
              ? "Aucun local importé pour ce projet."
              : "Aucun local ne correspond à cette recherche."}
          </p>
        </div>
      ) : (
        /* Locals are compact fixed-height tiles, so they tile cleanly —
           unlike the visit and déficience lists, which stay one-per-row
           because they read chronologically. */
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((loc) => {
            const TypeIcon = LOCATION_TYPE_ICONS[loc.type];
            return (
              <button
                key={loc.id}
                onClick={() => navigate(`/app/projects/${projectId}/locations/${loc.id}`)}
                className="w-full flex items-center gap-3 bg-surface rounded-[4px] border border-line p-4 hover:border-brand-600 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-[4px] bg-subtle text-ink flex items-center justify-center flex-shrink-0">
                  <TypeIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {loc.locationNumber}
                    {loc.name ? ` — ${loc.name}` : ""}
                  </div>
                  <div className="text-xs text-muted">
                    {LOCATION_TYPE_LABELS[loc.type]}
                    {loc.discipline ? ` · ${loc.discipline}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
