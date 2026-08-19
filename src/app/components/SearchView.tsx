import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Building2, Calendar, AlertCircle, MapPin } from "lucide-react";
import { Card, Section, ListRow, ListRows } from "./ui-kit/Card";
import { inputClassName } from "./ui-kit/Input";
import { usePageHeader } from "../../contexts/PageHeaderContext";
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

  usePageHeader("Recherche");

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 max-w-6xl mx-auto">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher projets, visites, déficiences, emplacements…"
            autoFocus
            className={`${inputClassName} pl-10`}
          />
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-6xl mx-auto">
        {!hasQuery ? (
          <div className="text-center py-16 text-muted">
            <Search size={48} className="mx-auto mb-4 text-faint" />
            <p>Tapez au moins {MIN_QUERY_LENGTH} caractères pour rechercher</p>
          </div>
        ) : loading ? (
          <div className="text-center py-16 text-sm text-faint">Recherche…</div>
        ) : totalResults === 0 ? (
          <div className="text-center py-16 text-muted">
            <Search size={48} className="mx-auto mb-4 text-faint" />
            <p>Aucun résultat trouvé</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-body">
              {totalResults} résultat{totalResults !== 1 ? "s" : ""}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {GROUPS.map((group) => {
                const items = results[group.key];
                if (items.length === 0) return null;
                return (
                  <Section
                    key={group.key}
                    title={group.label}
                    action={<span className="text-xs text-faint">{items.length}</span>}
                  >
                    <Card className="overflow-hidden">
                      <ListRows>
                        {items.map((item: SearchResultItem) => (
                          <ListRow key={item.id} onClick={() => navigate(item.linkPath)}>
                            <div className="text-sm font-medium text-ink truncate">
                              {item.title}
                            </div>
                            {item.subtitle && (
                              <div className="text-xs text-muted truncate">{item.subtitle}</div>
                            )}
                          </ListRow>
                        ))}
                      </ListRows>
                    </Card>
                  </Section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
