import { useState } from "react";
import { Search, Filter, Calendar, MapPin, Tag as TagIcon, X } from "lucide-react";

interface SearchResult {
  id: string;
  type: "visit" | "photo";
  projectName: string;
  date: string;
  phase: string;
  room: string;
  tags: string[];
  notes: string;
  photoUrl?: string;
}

export default function SearchView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const phases = ["Fondation", "Charpente", "ÉMÉ", "Finitions", "Extérieur"];
  const availableTags = [
    "Problème ÉMÉ",
    "Déficience",
    "À corriger",
    "Non-conformité",
    "Équipement",
    "Sécurité",
    "Structure",
    "Vérification qualité",
  ];

  // Empty search results - will be populated from backend
  const allResults: SearchResult[] = [];

  // Filter results based on search and filters
  const filteredResults = allResults.filter((result) => {
    // Text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesText =
        result.projectName.toLowerCase().includes(query) ||
        result.room.toLowerCase().includes(query) ||
        result.notes.toLowerCase().includes(query) ||
        result.tags.some((tag) => tag.toLowerCase().includes(query));
      if (!matchesText) return false;
    }

    // Phase filter
    if (selectedPhases.length > 0 && !selectedPhases.includes(result.phase)) {
      return false;
    }

    // Tag filter
    if (selectedTags.length > 0) {
      const hasTag = selectedTags.some((tag) => result.tags.includes(tag));
      if (!hasTag) return false;
    }

    // Date filter
    if (dateFrom && result.date < dateFrom) return false;
    if (dateTo && result.date > dateTo) return false;

    return true;
  });

  const togglePhase = (phase: string) => {
    if (selectedPhases.includes(phase)) {
      setSelectedPhases(selectedPhases.filter((p) => p !== phase));
    } else {
      setSelectedPhases([...selectedPhases, phase]);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const clearFilters = () => {
    setSelectedPhases([]);
    setSelectedTags([]);
    setDateFrom("");
    setDateTo("");
  };

  const activeFilterCount = selectedPhases.length + selectedTags.length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8 sticky top-0 z-10">
        <h1 className="text-2xl md:text-3xl mb-4">Recherche</h1>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher projets, photos, notes, étiquettes..."
            className="w-full px-4 py-3 pl-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-white/40 focus:bg-white/15"
          />
          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mt-3 flex items-center gap-2 text-sm text-gray-300 hover:text-white"
        >
          <Filter size={16} />
          <span>Filtres</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-[#E10600] text-white rounded-full text-xs">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-4">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Phase Filter */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Phases</label>
              <div className="flex flex-wrap gap-2">
                {phases.map((phase) => (
                  <button
                    key={phase}
                    onClick={() => togglePhase(phase)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedPhases.includes(phase)
                        ? "bg-[#E10600] text-white"
                        : "bg-white text-gray-700 border border-gray-200"
                    }`}
                  >
                    {phase}
                  </button>
                ))}
              </div>
            </div>

            {/* Tag Filter */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Étiquettes</label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedTags.includes(tag)
                        ? "bg-[#E10600] text-white"
                        : "bg-white text-gray-700 border border-gray-200"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-sm text-[#1A1A1A] mb-2">Période</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                  placeholder="Du"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                  placeholder="Au"
                />
              </div>
            </div>

            {/* Clear Filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="w-full py-2 text-sm text-[#E10600] hover:text-[#C00500] flex items-center justify-center gap-2"
              >
                <X size={16} />
                <span>Effacer tous les filtres</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <div className="mb-4 text-sm text-gray-600">
          {filteredResults.length} résultat{filteredResults.length !== 1 ? "s" : ""} trouvé{filteredResults.length !== 1 ? "s" : ""}
        </div>

        <div className="space-y-3">
          {filteredResults.map((result) => (
            <div
              key={result.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-[#E10600] transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Photo Thumbnail if available */}
                {result.photoUrl && (
                  <img
                    src={result.photoUrl}
                    alt={result.room}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#E10600] mb-1">
                    {result.projectName}
                  </div>

                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-[#E10600]/10 text-[#E10600] rounded text-xs">
                      {result.phase}
                    </span>
                    {result.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs flex items-center gap-1"
                      >
                        <TagIcon size={10} />
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(result.date).toLocaleDateString('fr-CA')}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin size={12} />
                      {result.room}
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 line-clamp-2">
                    {result.notes}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {filteredResults.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Search size={48} className="mx-auto mb-4 text-gray-300" />
              <p>Aucun résultat trouvé</p>
              <p className="text-sm mt-2">Essayez d'ajuster vos critères de recherche</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}