import { useState, useEffect } from "react";
import { X, Calendar, MapPin, Tag, Edit3, Pencil, AlertCircle, Filter, Search, Camera } from "lucide-react";
import PhotoMarkup from "./PhotoMarkup";
import IssueCreation from "./IssueCreation";
import type { Issue } from "./IssueCreation";
import { getPhotos } from "../../lib/api";

interface Photo {
  id: string;
  url: string;
  date: string;
  phase: string;
  room: string;
  tags: string[];
  notes: string;
  projectName: string;
  projectId: string;
  visitId: string;
}

export default function PhotoGallery() {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [showMarkup, setShowMarkup] = useState(false);
  const [showIssueCreation, setShowIssueCreation] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch photos from backend
    const fetchPhotos = async () => {
      setIsLoading(true);
      try {
        // TODO: Replace with real API call when ready
        // const fetchedPhotos = await getPhotos();
        setAllPhotos([]);
        setFilteredPhotos([]);
      } catch (error) {
        console.error("Error fetching photos:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPhotos();
  }, []);

  // Filter photos based on search, tags, and phase
  useEffect(() => {
    let filtered = allPhotos;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (photo) =>
          photo.projectName.toLowerCase().includes(query) ||
          photo.room.toLowerCase().includes(query) ||
          photo.notes.toLowerCase().includes(query) ||
          photo.phase.toLowerCase().includes(query)
      );
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter((photo) =>
        selectedTags.every((tag) => photo.tags.includes(tag))
      );
    }

    // Phase filter
    if (selectedPhase) {
      filtered = filtered.filter((photo) => photo.phase === selectedPhase);
    }

    setFilteredPhotos(filtered);
  }, [searchQuery, selectedTags, selectedPhase, allPhotos]);

  // Get all unique tags and their counts
  const allTags = allPhotos.reduce((acc, photo) => {
    photo.tags.forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Get all unique phases
  const allPhases = [...new Set(allPhotos.map((photo) => photo.phase))];

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTags([]);
    setSelectedPhase("");
  };

  const handlePhotoClick = (photo: Photo) => {
    setSelectedPhoto(photo);
    setEditedNotes(photo.notes);
    setEditingNotes(false);
  };

  const handleSaveNotes = () => {
    if (selectedPhoto) {
      selectedPhoto.notes = editedNotes;
    }
    setEditingNotes(false);
  };

  const handleSaveAnnotation = (annotatedUrl: string) => {
    console.log("Saved annotated image:", annotatedUrl);
    setShowMarkup(false);
    alert("Photo annotée enregistrée avec succès!");
  };

  const handleCreateIssue = (issue: Issue) => {
    setIssues([...issues, issue]);
    setShowIssueCreation(false);
    alert(`Déficience créée et assignée à ${issue.assignedTo}`);
  };

  const handleAnnotatePhoto = () => {
    setShowMarkup(true);
  };

  const handleCreateIssueFromPhoto = () => {
    setShowIssueCreation(true);
  };

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <h1 className="text-2xl md:text-3xl">Galerie de photos</h1>
        <p className="text-gray-400 mt-1">
          {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? "s" : ""} sur {allPhotos.length}
        </p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4 max-w-4xl mx-auto space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par projet, phase, emplacement..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent min-h-[48px]"
            />
          </div>

          {/* Filter Button and Active Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 min-h-[40px] transition-colors ${
                showFilters || selectedTags.length > 0 || selectedPhase
                  ? "bg-[#E10600] text-white"
                  : "bg-gray-100 text-[#1A1A1A] hover:bg-gray-200"
              }`}
            >
              <Filter size={16} />
              <span>Filtres</span>
              {(selectedTags.length > 0 || selectedPhase) && (
                <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">
                  {selectedTags.length + (selectedPhase ? 1 : 0)}
                </span>
              )}
            </button>

            {(searchQuery || selectedTags.length > 0 || selectedPhase) && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-gray-600 hover:text-[#E10600] transition-colors"
              >
                Effacer tout
              </button>
            )}
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              {/* Phase Filter */}
              <div>
                <h3 className="text-sm font-semibold text-[#1A1A1A] mb-2">Phase</h3>
                <div className="flex flex-wrap gap-2">
                  {allPhases.map((phase) => (
                    <button
                      key={phase}
                      onClick={() => setSelectedPhase(selectedPhase === phase ? "" : phase)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[36px] ${
                        selectedPhase === phase
                          ? "bg-[#E10600] text-white"
                          : "bg-white text-[#1A1A1A] border border-gray-300 hover:border-[#E10600] hover:text-[#E10600]"
                      }`}
                    >
                      {phase}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tag Filter */}
              <div>
                <h3 className="text-sm font-semibold text-[#1A1A1A] mb-2">Catégories</h3>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {Object.entries(allTags)
                    .sort((a, b) => b[1] - a[1])
                    .map(([tag, count]) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[36px] flex items-center gap-1.5 ${
                          selectedTags.includes(tag)
                            ? "bg-[#E10600] text-white"
                            : "bg-white text-[#1A1A1A] border border-gray-300 hover:border-[#E10600] hover:text-[#E10600]"
                        }`}
                      >
                        <span>{tag}</span>
                        <span className={`text-xs ${selectedTags.includes(tag) ? "opacity-75" : "text-gray-500"}`}>
                          ({count})
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photo Grid */}
      <div className="px-4 py-6">
        {isLoading ? (
          <div className="max-w-4xl mx-auto flex justify-center items-center py-20">
            <div className="text-gray-500">Chargement des photos...</div>
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="max-w-4xl mx-auto text-center py-20">
            <Camera size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-2">Aucune photo trouvée</p>
            {(searchQuery || selectedTags.length > 0 || selectedPhase) && (
              <button
                onClick={clearFilters}
                className="text-sm text-[#E10600] hover:text-[#C00500]"
              >
                Effacer les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-3">{filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => handlePhotoClick(photo)}
              className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-gray-200"
            >
              <img
                src={photo.url}
                alt={`${photo.projectName} - ${photo.room}`}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              {/* Metadata Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                  <div className="text-xs mb-1">
                    {new Date(photo.date).toLocaleDateString('fr-CA')}
                  </div>
                  <div className="text-sm font-medium mb-1 line-clamp-1">{photo.room}</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <div className="text-xs px-2 py-0.5 bg-[#E10600] rounded inline-block">
                      {photo.phase}
                    </div>
                    {photo.tags.length > 0 && (
                      <div className="text-xs px-2 py-0.5 bg-white/20 rounded inline-block">
                        +{photo.tags.length}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}</div>
        )}
      </div>

      {/* Photo Detail Modal */}
      {selectedPhoto && !showMarkup && !showIssueCreation && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex flex-col"
          onClick={() => setSelectedPhoto(null)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 text-white">
            <h2 className="text-lg">{selectedPhoto.projectName}</h2>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Photo */}
          <div
            className="flex-1 flex items-center justify-center px-4 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.room}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>

          {/* Action Buttons */}
          <div
            className="px-6 py-3 bg-[#1A1A1A] border-b border-gray-800 flex gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleAnnotatePhoto}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2"
            >
              <Pencil size={18} />
              <span>Annoter</span>
            </button>
            <button
              onClick={handleCreateIssueFromPhoto}
              className="flex-1 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
            >
              <AlertCircle size={18} />
              <span>Créer déficience</span>
            </button>
          </div>

          {/* Metadata */}
          <div
            className="bg-[#1A1A1A] text-white px-6 py-6 space-y-4 max-h-[40vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={18} className="text-gray-400" />
              <span>{new Date(selectedPhoto.date).toLocaleDateString('fr-CA')}</span>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <MapPin size={18} className="text-gray-400" />
              <span>{selectedPhoto.room}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag size={18} className="text-gray-400" />
                <span className="text-sm text-gray-400">Phase et étiquettes</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-6">
                <span className="px-2 py-1 bg-[#E10600] text-white rounded-md text-xs">
                  {selectedPhoto.phase}
                </span>
                {selectedPhoto.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-gray-700 text-white rounded-md text-xs"
                  >
                    {tag}
                  </span>
                ))}
                {selectedPhoto.tags.length === 0 && (
                  <span className="text-xs text-gray-500">Aucune étiquette</span>
                )}
              </div>
            </div>

            {/* Editable Notes */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Notes</label>
                {!editingNotes && (
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="flex items-center gap-1 text-sm text-[#E10600] hover:text-[#C00500]"
                  >
                    <Edit3 size={14} />
                    <span>Modifier</span>
                  </button>
                )}
              </div>

              {editingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#E10600] resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingNotes(false)}
                      className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveNotes}
                      className="flex-1 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] text-sm"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-300 leading-relaxed">
                  {selectedPhoto.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Photo Markup Modal */}
      {showMarkup && selectedPhoto && (
        <PhotoMarkup
          imageUrl={selectedPhoto.url}
          onClose={() => setShowMarkup(false)}
          onSave={handleSaveAnnotation}
        />
      )}

      {/* Issue Creation Modal */}
      {showIssueCreation && selectedPhoto && (
        <IssueCreation
          photoUrl={selectedPhoto.url}
          photoId={selectedPhoto.id}
          projectId={selectedPhoto.projectId}
          projectName={selectedPhoto.projectName}
          phase={selectedPhoto.phase}
          room={selectedPhoto.room}
          defaultTags={selectedPhoto.tags}
          onClose={() => setShowIssueCreation(false)}
          onSave={handleCreateIssue}
        />
      )}
    </div>
  );
}