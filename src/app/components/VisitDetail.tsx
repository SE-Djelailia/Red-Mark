import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Calendar,
  Camera,
  Tag,
  MapPin,
  FileText,
  Edit,
  Trash2,
  Share2,
  Download,
  Cloud,
  Thermometer,
  AlertCircle,
  Check,
  Pencil,
  MessageSquare,
} from "lucide-react";
import {
  getSiteVisit,
  getProject,
  getPhotos,
  uploadPhoto,
  updateSiteVisit,
  deletePhoto,
} from "../../lib/supabaseApi";
import { getIssuesByVisit, createIssue, updateIssue, getIssueErrorMessage } from "../../lib/issuesApi";
import { getCommentsForIssue, type Comment } from "../../lib/commentsApi";
import type { SiteVisit } from "../../lib/supabase";
import { supabase } from "../../lib/supabase";
import { formatDateLongWithWeekday } from "../../lib/dateUtils";
import VisitComments from "./VisitComments";
import CommentThread from "./CommentThread";
import VoiceNotesSection from "./VoiceNotesSection";
import { useAuth } from "../../contexts/useAuth";
import { compressImage } from "../../lib/imageCompression";
import SecureImage from "./SecureImage";
import { toast } from "sonner";
import { PhotoAnnotator } from "./PhotoAnnotator";

interface Photo {
  id: string;
  url: string; // Deprecated - kept for compatibility
  storage_path: string; // Secure storage path for signed URLs
  tags?: string[];
  location?: { floor?: string; room?: string };
}

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved";
  assignedTo: string;
  createdBy: string;
  createdDate: string;
  photos: { id: string; url: string }[];
  tags?: string[];
  location: string;
}

interface VisitDisplay {
  id: string;
  date: string;
  phase: string;
  room: string;
  tags: string[];
  photoCount: number;
  notes: string;
  photos: Photo[];
  weather?: string;
  temperature?: string;
}

export default function VisitDetail() {
  const navigate = useNavigate();
  const { projectId, visitId } = useParams();
  const { user } = useAuth();
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [visit, setVisit] = useState<VisitDisplay | null>(null);
  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo selection for deletion
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  // Photo filters
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);

  // Photo annotation
  const [showAnnotator, setShowAnnotator] = useState(false);
  const [photoToAnnotate, setPhotoToAnnotate] = useState<Photo | null>(null);

  // Issues/deficiences for this visit
  const [issues, setIssues] = useState<Issue[]>([]);

  // Issue creation/edition modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [issueComments, setIssueComments] = useState<Comment[]>([]);
  const [issueFormData, setIssueFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as Issue["priority"],
    status: "open" as Issue["status"],
    assignedTo: "",
  });
  const [selectedIssuePhotoIds, setSelectedIssuePhotoIds] = useState<string[]>([]);

  useEffect(() => {
    if (!editingIssue) {
      setIssueComments([]);
      return;
    }
    getCommentsForIssue(editingIssue.id).then(setIssueComments);
  }, [editingIssue]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiVisit = await getSiteVisit(visitId || "");
        const photos = await getPhotos(apiVisit.id);

        const transformedVisit: VisitDisplay = {
          id: apiVisit.id,
          date: apiVisit.visit_date,
          phase: apiVisit.phase.charAt(0).toUpperCase() + apiVisit.phase.slice(1),
          room: apiVisit.attendees?.[0] || "Zone non spécifiée",
          tags: [],
          photoCount: photos.length,
          notes: apiVisit.notes,
          photos: photos.map((p) => ({
            id: p.id,
            url: p.file_url || "", // Deprecated, kept for backward compatibility
            storage_path: p.storage_path,
            tags: p.tags || [],
            location: p.location || undefined,
          })),
          weather: apiVisit.weather,
          temperature: apiVisit.temperature,
        };

        setVisit(transformedVisit);
        setEditedNotes(transformedVisit.notes);

        // Load issues from Supabase
        if (visitId) {
          const visitIssues = await getIssuesByVisit(visitId);
          setIssues(visitIssues);
        }

        if (projectId) {
          const project = await getProject(projectId);
          setProjectName(project.name);
        }
      } catch (error) {
        console.error("Error fetching visit:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [visitId, projectId]);

  const handleSaveNotes = async () => {
    if (editedNotes.trim() && visitId) {
      try {
        await updateSiteVisit(visitId, { notes: editedNotes });
        setVisit((prevVisit) => {
          if (prevVisit) {
            return { ...prevVisit, notes: editedNotes };
          }
          return prevVisit;
        });
        setIsEditingNotes(false);
        alert("Notes sauvegardées!");
      } catch (error) {
        console.error("Error saving notes:", error);
        alert("Erreur lors de la sauvegarde des notes");
      }
    }
  };

  const currentUserId = user?.id || null;

  // Photo upload handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !visitId || !projectId) return;

    if (!user?.id) {
      alert("Session expirée. Veuillez vous reconnecter.");
      navigate("/");
      return;
    }

    const files = Array.from(e.target.files);

    try {
      // Upload each photo with compression
      for (const file of files) {
        // Compress image before upload
        const compressedFile = await compressImage(file);

        const uploadedPhoto = await uploadPhoto(compressedFile, user.id, projectId, visitId, {
          tags: [],
        });

        // Add to local state
        setVisit((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            photos: [
              ...prev.photos,
              {
                id: uploadedPhoto.id,
                url: uploadedPhoto.file_url || "",
                storage_path: uploadedPhoto.storage_path,
                tags: uploadedPhoto.tags || [],
                location: uploadedPhoto.location || undefined,
              },
            ],
            photoCount: prev.photoCount + 1,
          };
        });
      }

      alert(`${files.length} photo(s) ajoutée(s) avec succès!`);
    } catch (error) {
      console.error("Error uploading photos:", error);
      alert("Erreur lors de l'ajout des photos");
    }

    // Reset input
    if (e.target) {
      e.target.value = "";
    }
  };

  // Issue management handlers
  const handleCreateIssue = () => {
    setEditingIssue(null);
    setIssueFormData({
      title: "",
      description: "",
      priority: "medium",
      status: "open",
      assignedTo: "",
    });
    setSelectedIssuePhotoIds([]);
    setShowIssueModal(true);
  };

  const handleCreateIssueFromPhotos = () => {
    if (selectedPhotoIds.length === 0) {
      toast.error("Veuillez sélectionner au moins une photo");
      return;
    }

    setEditingIssue(null);
    setIssueFormData({
      title: "",
      description: "",
      priority: "medium",
      status: "open",
      assignedTo: "",
    });
    setSelectedIssuePhotoIds([...selectedPhotoIds]);
    setIsSelectionMode(false);
    setSelectedPhotoIds([]);
    setShowIssueModal(true);
  };

  const handleEditIssue = (issue: Issue, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingIssue(issue);
    setIssueFormData({
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      status: issue.status,
      assignedTo: issue.assignedTo,
    });
    setSelectedIssuePhotoIds(issue.photos?.map((p) => p.id) || []);
    setShowIssueModal(true);
  };

  const handleSaveIssue = async () => {
    if (!issueFormData.title.trim()) {
      alert("Le titre est requis");
      return;
    }

    if (!visitId || !projectId) return;

    // Get selected photos data
    const linkedPhotos =
      visit?.photos
        .filter((p) => selectedIssuePhotoIds.includes(p.id))
        .map((p) => ({ id: p.id, url: p.storage_path })) || [];

    try {
      if (editingIssue) {
        // Update existing issue
        const updatedIssue = await updateIssue(editingIssue.id, {
          ...issueFormData,
          photos: linkedPhotos,
        });
        if (updatedIssue) {
          setIssues((prevIssues) =>
            prevIssues.map((issue) => (issue.id === editingIssue.id ? updatedIssue : issue)),
          );
          toast.success("Déficience modifiée!");
        } else {
          toast.error("Cette déficience n'existe plus.");
          return;
        }
      } else {
        // Create new issue
        const newIssue = await createIssue({
          visitId,
          projectId,
          ...issueFormData,
          photos: linkedPhotos,
          tags: [],
          location: visit?.room || "Zone non spécifiée",
        });
        setIssues((prevIssues) => [...prevIssues, newIssue]);
        toast.success(`Déficience créée avec ${linkedPhotos.length} photo(s)`);
      }

      setShowIssueModal(false);
      setSelectedIssuePhotoIds([]);
    } catch (err) {
      console.error("Error saving issue:", err);
      toast.error(getIssueErrorMessage(err, "Impossible d'enregistrer la déficience."));
    }
  };

  const handleQuickStatusChange = (
    issueId: string,
    newStatus: Issue["status"],
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setIssues((prevIssues) =>
      prevIssues.map((issue) => (issue.id === issueId ? { ...issue, status: newStatus } : issue)),
    );
  };

  // Photo delete handler for multiple photos
  const handleDeleteSelectedPhotos = async () => {
    if (selectedPhotoIds.length === 0) return;

    if (
      !window.confirm(
        `Voulez-vous vraiment supprimer ${selectedPhotoIds.length} photo${selectedPhotoIds.length !== 1 ? "s" : ""} ?`,
      )
    ) {
      return;
    }

    try {
      if (visitId) {
        // Delete each selected photo
        for (const photoId of selectedPhotoIds) {
          await deletePhoto(photoId);
        }

        // Remove from local state
        setVisit((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            photos: prev.photos.filter((p) => !selectedPhotoIds.includes(p.id)),
            photoCount: prev.photoCount - selectedPhotoIds.length,
          };
        });

        alert(
          `${selectedPhotoIds.length} photo${selectedPhotoIds.length !== 1 ? "s" : ""} supprimée${selectedPhotoIds.length !== 1 ? "s" : ""} avec succès!`,
        );
        setSelectedPhotoIds([]);
        setIsSelectionMode(false);
      }
    } catch (error) {
      console.error("Error deleting photos:", error);
      alert("Erreur lors de la suppression des photos");
    }
  };

  const handlePhotoClick = (photoId: string, e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.stopPropagation();
      if (selectedPhotoIds.includes(photoId)) {
        setSelectedPhotoIds(selectedPhotoIds.filter((id) => id !== photoId));
      } else {
        setSelectedPhotoIds([...selectedPhotoIds, photoId]);
      }
    } else {
      const photo = visit?.photos.find((p) => p.id === photoId);
      if (photo) setSelectedPhoto(photo);
    }
  };

  const handleOpenAnnotator = (photo: Photo) => {
    setPhotoToAnnotate(photo);
    setShowAnnotator(true);
    setSelectedPhoto(null);
  };

  const handleSaveAnnotation = async (photoId: string, annotatedImageBlob: Blob) => {
    if (!user?.id || !projectId || !visitId) {
      toast.error("Session expirée");
      return;
    }

    try {
      const originalPhoto = visit?.photos.find((p) => p.id === photoId);
      if (!originalPhoto) {
        toast.error("Photo introuvable");
        return;
      }

      // Delete the old file from storage
      const { error: deleteError } = await supabase.storage
        .from("project-photos")
        .remove([originalPhoto.storage_path]);

      if (deleteError) {
        console.warn("Warning deleting old file:", deleteError);
        // Continue anyway - file might not exist
      }

      // Upload the new annotated image with the same path
      const { error: uploadError } = await supabase.storage
        .from("project-photos")
        .upload(originalPhoto.storage_path, annotatedImageBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      toast.success("Annotations sauvegardées! Actualisation...");

      // Reload page to show updated photo with fresh signed URLs
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (error) {
      console.error("Error saving annotation:", error);
      toast.error("Erreur lors de l'enregistrement de l'annotation");
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <button
          onClick={() => navigate(`/app/projects/${projectId}`)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 min-h-[44px]"
        >
          <ArrowLeft size={20} />
          <span>Retour au projet</span>
        </button>

        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-4 bg-white/20 rounded w-48 mb-2"></div>
            <div className="h-8 bg-white/30 rounded w-64 mb-3"></div>
            <div className="h-4 bg-white/20 rounded w-56"></div>
          </div>
        ) : (
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <p className="text-sm text-gray-400 mb-2">{projectName}</p>
              <h1 className="text-xl md:text-2xl mb-3">Visite du site</h1>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar size={16} />
                  <span>{formatDateLongWithWeekday(visit?.date || "")}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => console.log("Share visit")}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                title="Partager"
              >
                <Share2 size={20} />
              </button>
              <button
                onClick={() => console.log("Download report")}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
                title="Télécharger le rapport"
              >
                <Download size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Meta Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Tag size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-2">Phase</div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                <span className="text-sm font-medium">{visit?.phase}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Emplacement</div>
              <div className="text-sm text-[#1A1A1A] font-medium">{visit?.room}</div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Camera size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Photos</div>
              <div className="text-sm text-[#1A1A1A] font-medium">
                {visit?.photos.length} photo{visit?.photos.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {visit?.weather && (
            <div className="flex items-start gap-3">
              <Cloud size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">Météo</div>
                <div className="text-sm text-[#1A1A1A] font-medium">{visit.weather}</div>
              </div>
            </div>
          )}

          {visit?.temperature && (
            <div className="flex items-start gap-3">
              <Thermometer size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">Température</div>
                <div className="text-sm text-[#1A1A1A] font-medium">{visit.temperature}</div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
            <FileText size={18} className="text-gray-500" />
            Notes de visite
          </h2>
          {isEditingNotes ? (
            <div className="space-y-3">
              <textarea
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                placeholder="Ajouter des notes..."
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent resize-none"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsEditingNotes(false);
                    setEditedNotes(visit?.notes || "");
                  }}
                  className="flex-1 py-2.5 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={!editedNotes.trim()}
                  className="flex-1 py-2.5 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  Sauvegarder
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">{visit?.notes}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setIsEditingNotes(true);
                    setEditedNotes(visit?.notes || "");
                  }}
                  className="py-2.5 px-4 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center gap-2 min-h-[44px]"
                >
                  <Edit size={16} />
                  <span>Modifier les notes</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Photos Grid */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <Camera size={18} className="text-gray-500" />
              Photos ({visit?.photos.length})
            </h2>
            {visit && visit.photos.length > 0 && (
              <button
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedPhotoIds([]);
                }}
                className="py-2 px-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium min-h-[44px]"
              >
                {isSelectionMode ? "Annuler" : "Sélectionner"}
              </button>
            )}
          </div>

          {/* Filters Section */}
          {visit &&
            visit.photos.length > 0 &&
            (() => {
              const allTags = Array.from(new Set(visit.photos.flatMap((p) => p.tags || [])));
              const allLocations = Array.from(
                new Set(
                  visit.photos
                    .filter((p) => p.location?.floor || p.location?.room)
                    .map((p) => {
                      const loc = p.location!;
                      return loc.floor && loc.room
                        ? `${loc.floor} - ${loc.room}`
                        : loc.floor || loc.room || "";
                    }),
                ),
              );

              if (allTags.length > 0 || allLocations.length > 0) {
                return (
                  <div className="mb-4 space-y-3">
                    {/* Tag Filters */}
                    {allTags.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                          <Tag size={14} />
                          Filtrer par tag
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setSelectedTagFilter(null)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              selectedTagFilter === null
                                ? "bg-[#E10600] text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            Tous
                          </button>
                          {allTags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() =>
                                setSelectedTagFilter(tag === selectedTagFilter ? null : tag)
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                selectedTagFilter === tag
                                  ? "bg-[#E10600] text-white"
                                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Location Filters */}
                    {allLocations.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                          <MapPin size={14} />
                          Filtrer par localisation
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setSelectedLocationFilter(null)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              selectedLocationFilter === null
                                ? "bg-blue-600 text-white"
                                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            }`}
                          >
                            Toutes
                          </button>
                          {allLocations.map((location) => (
                            <button
                              key={location}
                              onClick={() =>
                                setSelectedLocationFilter(
                                  location === selectedLocationFilter ? null : location,
                                )
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                selectedLocationFilter === location
                                  ? "bg-blue-600 text-white"
                                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                              }`}
                            >
                              {location}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}

          {isSelectionMode && selectedPhotoIds.length > 0 && (
            <div className="mb-3 flex items-center justify-between bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <span className="text-sm text-[#1A1A1A] font-medium">
                {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? "s" : ""}{" "}
                sélectionnée{selectedPhotoIds.length !== 1 ? "s" : ""}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateIssueFromPhotos}
                  className="py-2 px-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
                >
                  <AlertCircle size={16} />
                  Créer déficience
                </button>
                <button
                  onClick={handleDeleteSelectedPhotos}
                  className="py-2 px-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
                >
                  <Trash2 size={16} />
                  Supprimer
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {visit?.photos
              .filter((photo) => {
                // Filter by tag
                if (selectedTagFilter && (!photo.tags || !photo.tags.includes(selectedTagFilter))) {
                  return false;
                }
                // Filter by location
                if (selectedLocationFilter) {
                  const photoLocation =
                    photo.location?.floor && photo.location?.room
                      ? `${photo.location.floor} - ${photo.location.room}`
                      : photo.location?.floor || photo.location?.room || "";
                  if (photoLocation !== selectedLocationFilter) {
                    return false;
                  }
                }
                return true;
              })
              .map((photo) => {
                const isSelected = selectedPhotoIds.includes(photo.id);
                return (
                  <div
                    key={photo.id}
                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-gray-200 ${isSelected ? "ring-2 ring-[#E10600]" : ""}`}
                    onClick={(e) => handlePhotoClick(photo.id, e)}
                  >
                    <SecureImage
                      storagePath={photo.storage_path}
                      alt="Site photo"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    {!isSelectionMode && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-medium">Voir</span>
                      </div>
                    )}

                    {/* Location badge - top priority */}
                    {photo.location && (photo.location.floor || photo.location.room) && (
                      <div className="absolute top-2 left-2">
                        <div className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-bold flex items-center gap-1 shadow-lg">
                          <MapPin size={12} />
                          <span>
                            {photo.location.floor && photo.location.room
                              ? `${photo.location.floor} - ${photo.location.room}`
                              : photo.location.floor || photo.location.room}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Tags at bottom */}
                    {photo.tags && photo.tags.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                        <div className="flex gap-1 flex-wrap">
                          {photo.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-white/90 text-[#1A1A1A] rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                          {photo.tags.length > 2 && (
                            <span className="px-2 py-0.5 bg-white/90 text-[#1A1A1A] rounded text-xs">
                              +{photo.tags.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {isSelectionMode && (
                      <div
                        className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${isSelected ? "bg-[#E10600] border-[#E10600]" : "bg-white/90 border-gray-300"}`}
                      >
                        {isSelected && (
                          <svg
                            className="w-4 h-4 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Deficiences */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <AlertCircle size={18} className="text-gray-500" />
              Déficiences ({issues.length})
            </h2>
            <button
              onClick={handleCreateIssue}
              className="py-2.5 px-4 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 transition-colors font-medium flex items-center gap-2 min-h-[44px]"
            >
              <Edit size={16} />
              <span>Ajouter une déficience</span>
            </button>
          </div>

          {issues.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              Aucune déficience pour cette visite.
            </p>
          ) : (
            <div className="space-y-3">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() =>
                    navigate(`/app/projects/${projectId}/visits/${visitId}/issues/${issue.id}`)
                  }
                  className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-medium text-[#1A1A1A] flex-1">{issue.title}</h3>
                    <button
                      onClick={(e) => handleEditIssue(issue, e)}
                      className="ml-2 w-8 h-8 flex items-center justify-center bg-white text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                      title="Modifier"
                    >
                      <Edit size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mb-3 line-clamp-2">{issue.description}</p>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        issue.priority === "critical"
                          ? "bg-red-100 text-red-700"
                          : issue.priority === "high"
                            ? "bg-orange-100 text-orange-700"
                            : issue.priority === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {issue.priority === "critical"
                        ? "Critique"
                        : issue.priority === "high"
                          ? "Élevé"
                          : issue.priority === "medium"
                            ? "Moyen"
                            : "Faible"}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        issue.status === "open"
                          ? "bg-red-50 text-red-700"
                          : issue.status === "in_progress"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-green-50 text-green-700"
                      }`}
                    >
                      {issue.status === "open"
                        ? "Ouvert"
                        : issue.status === "in_progress"
                          ? "En cours"
                          : "Résolu"}
                    </span>
                  </div>

                  {/* Linked Photos */}
                  {issue.photos && issue.photos.length > 0 && (
                    <div className="mt-3 mb-2">
                      <div className="flex items-center gap-1 mb-2">
                        <Camera size={12} className="text-gray-500" />
                        <span className="text-xs text-gray-500 font-medium">
                          {issue.photos.length} photo{issue.photos.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {issue.photos.slice(0, 4).map((photo) => {
                          const fullPhoto = visit?.photos.find((p) => p.id === photo.id);
                          return (
                            <div
                              key={photo.id}
                              className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (fullPhoto) setSelectedPhoto(fullPhoto);
                              }}
                            >
                              <SecureImage
                                storagePath={fullPhoto?.storage_path || photo.url}
                                alt="Issue photo"
                                className="w-full h-full object-cover hover:scale-110 transition-transform cursor-pointer"
                              />
                            </div>
                          );
                        })}
                        {issue.photos.length > 4 && (
                          <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-600">
                              +{issue.photos.length - 4}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    Assigné à :{" "}
                    <span className="font-medium text-gray-700">{issue.assignedTo}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Voice Notes (placeholder for future transcription) */}
        {visitId && <VoiceNotesSection visitId={visitId} />}

        {/* Comments */}
        <VisitComments visitId={visitId || ""} projectId={projectId || ""} />

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Actions rapides</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate(`/app/projects/${projectId}/report`)}
              className="py-3 px-4 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2 min-h-[48px]"
            >
              <FileText size={18} />
              <span className="text-sm font-medium">Générer rapport</span>
            </button>
            <button
              onClick={() => navigate(`/app/projects/${projectId}/visits/${visitId}/add-photos`)}
              className="py-3 px-4 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
            >
              <Camera size={18} />
              <span className="text-sm font-medium">Ajouter photos</span>
            </button>
          </div>
        </div>
      </div>

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-4xl w-full">
            <div className="absolute top-4 right-4 flex gap-2 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAnnotator(selectedPhoto);
                }}
                className="px-4 py-2 bg-[#E10600] hover:bg-[#C00500] rounded-lg flex items-center gap-2 text-white transition-colors font-medium"
                title="Annoter"
              >
                <Pencil size={18} />
                Annoter
              </button>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
              >
                ✕
              </button>
            </div>
            <SecureImage
              storagePath={selectedPhoto.storage_path}
              alt="Full size"
              className="w-full h-auto rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Location badge in fullscreen */}
            {selectedPhoto.location &&
              (selectedPhoto.location.floor || selectedPhoto.location.room) && (
                <div className="absolute top-4 left-4">
                  <div className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-xl">
                    <MapPin size={18} />
                    <span>
                      {selectedPhoto.location.floor && selectedPhoto.location.room
                        ? `${selectedPhoto.location.floor} - ${selectedPhoto.location.room}`
                        : selectedPhoto.location.floor || selectedPhoto.location.room}
                    </span>
                  </div>
                </div>
              )}

            {/* Tags at bottom */}
            {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
              <div className="absolute bottom-4 left-4 right-4 flex gap-2 flex-wrap">
                {selectedPhoto.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 bg-white/90 text-[#1A1A1A] rounded-lg text-sm font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Creation/Edition Modal */}
      {showIssueModal && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowIssueModal(false)}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIssueModal(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center text-gray-600 transition-colors z-10"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-6">
              {editingIssue ? "Modifier la déficience" : "Nouvelle déficience"}
            </h2>
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Titre *</label>
                <input
                  type="text"
                  value={issueFormData.title}
                  onChange={(e) => setIssueFormData({ ...issueFormData, title: e.target.value })}
                  placeholder="Ex: Fissure dans le béton"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Description</label>
                <textarea
                  value={issueFormData.description}
                  onChange={(e) =>
                    setIssueFormData({ ...issueFormData, description: e.target.value })
                  }
                  placeholder="Détails de la déficience..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent resize-none"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Priorité</label>
                <select
                  value={issueFormData.priority}
                  onChange={(e) =>
                    setIssueFormData({
                      ...issueFormData,
                      priority: e.target.value as Issue["priority"],
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                >
                  <option value="low">Faible</option>
                  <option value="medium">Moyen</option>
                  <option value="high">Élevé</option>
                  <option value="critical">Critique</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Statut</label>
                <select
                  value={issueFormData.status}
                  onChange={(e) =>
                    setIssueFormData({
                      ...issueFormData,
                      status: e.target.value as Issue["status"],
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                >
                  <option value="open">Ouvert</option>
                  <option value="in_progress">En cours</option>
                  <option value="resolved">Résolu</option>
                </select>
              </div>

              {/* Assigned To */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Assigné à</label>
                <input
                  type="text"
                  value={issueFormData.assignedTo}
                  onChange={(e) =>
                    setIssueFormData({ ...issueFormData, assignedTo: e.target.value })
                  }
                  placeholder="Nom de la personne"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                />
              </div>

              {/* Photo Selection */}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2 flex items-center gap-2">
                  <Camera size={18} className="text-[#E10600]" />
                  Photos liées ({selectedIssuePhotoIds.length})
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Sélectionnez les photos qui documentent cette déficience
                </p>

                {visit && visit.photos.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                    {visit.photos.map((photo) => {
                      const isSelected = selectedIssuePhotoIds.includes(photo.id);
                      return (
                        <div
                          key={photo.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedIssuePhotoIds(
                                selectedIssuePhotoIds.filter((id) => id !== photo.id),
                              );
                            } else {
                              setSelectedIssuePhotoIds([...selectedIssuePhotoIds, photo.id]);
                            }
                          }}
                          className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                            isSelected
                              ? "border-[#E10600] ring-2 ring-[#E10600]/30"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                        >
                          <SecureImage
                            storagePath={photo.storage_path}
                            alt="Photo"
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-[#E10600]/20 flex items-center justify-center">
                              <div className="w-6 h-6 bg-[#E10600] rounded-full flex items-center justify-center">
                                <Check size={14} className="text-white" strokeWidth={3} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center text-sm text-gray-500">
                    Aucune photo disponible pour cette visite
                  </div>
                )}
              </div>

              {/* Comments (existing issues only — a new issue has no id yet) */}
              {editingIssue && (
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
                    <MessageSquare size={18} className="text-gray-500" />
                    Commentaires
                  </h3>
                  <CommentThread
                    comments={issueComments}
                    issueId={editingIssue.id}
                    projectId={projectId || ""}
                    visitId={visitId}
                    onCommentsUpdate={setIssueComments}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowIssueModal(false)}
                  className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium min-h-[48px]"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveIssue}
                  className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium min-h-[48px]"
                >
                  {editingIssue ? "Sauvegarder" : "Créer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Annotator */}
      {showAnnotator && photoToAnnotate && (
        <PhotoAnnotator
          photo={photoToAnnotate}
          onClose={() => {
            setShowAnnotator(false);
            setPhotoToAnnotate(null);
          }}
          onSave={handleSaveAnnotation}
        />
      )}
    </div>
  );
}
