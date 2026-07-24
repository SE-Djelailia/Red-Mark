import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Building2, Calendar, AlertCircle, MapPin } from "lucide-react";
import { useAuth } from "../../contexts/useAuth";
import { globalSearch, type SearchResultItem, type SearchResults } from "../../lib/searchApi";

const EMPTY_RESULTS: SearchResults = { projects: [], visits: [], issues: [], locations: [] };

const GROUPS: {
  key: keyof SearchResults;
  label: string;
  icon: typeof Building2;
}[] = [
  { key: "projects", label: "Projets", icon: Building2 },
  { key: "visits", label: "Visites", icon: Calendar },
  { key: "issues", label: "Déficiences", icon: AlertCircle },
  { key: "locations", label: "Emplacements", icon: MapPin },
];

const MIN_QUERY_LENGTH = 2;

export default function SearchView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  // Input stays instantly responsive; the actual search (and re-render of
  // however many results come back) only fires once typing pauses — same
  // pattern as LocationsTab's project search.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!user?.id || trimmed.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    globalSearch(user.id, trimmed)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((error) => {
        console.error("Error running global search:", error);
        if (!cancelled) setResults(EMPTY_RESULTS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, user?.id]);

  const totalResults =
    results.projects.length + results.visits.length + results.issues.length + results.locations.length;
  const hasQuery = debouncedQuery.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-4 md:px-6 py-4 md:py-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl md:text-2xl mb-3 font-medium">Recherche</h1>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher projets, visites, déficiences, emplacements…"
              autoFocus
              className="w-full px-4 py-3 pl-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-white/40 focus:bg-white/15"
            />
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 max-w-6xl mx-auto">
        {!hasQuery ? (
          <div className="text-center py-16 text-gray-500">
            <Search size={48} className="mx-auto mb-4 text-gray-300" />
            <p>Tapez au moins {MIN_QUERY_LENGTH} caractères pour rechercher</p>
          </div>
        ) : loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Recherche…</div>
        ) : totalResults === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Search size={48} className="mx-auto mb-4 text-gray-300" />
            <p>Aucun résultat trouvé</p>
          </div>
        ) : (
          <>
            <div className="mb-3 text-sm text-gray-600">
              {totalResults} résultat{totalResults !== 1 ? "s" : ""}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {GROUPS.map((group) => {
                const items = results[group.key];
                if (items.length === 0) return null;
                const Icon = group.icon;
                return (
                  <div key={group.key} className="bg-white rounded-xl border border-gray-200">
                    <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
                      <Icon size={16} className="text-[#E10600]" />
                      <h2 className="text-sm font-semibold text-[#1A1A1A]">{group.label}</h2>
                      <span className="ml-auto text-xs text-gray-400">{items.length}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {items.map((item: SearchResultItem) => (
                        <div
                          key={item.id}
                          onClick={() => navigate(item.linkPath)}
                          className="px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <div className="text-sm font-medium text-[#1A1A1A] truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
