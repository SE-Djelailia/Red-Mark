import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Camera, Plus, X, Check, MapPin, Navigation, Search } from "lucide-react";
import { uploadPhoto } from "../../lib/supabaseApi";
import { getLocations, type Location } from "../../lib/locationsApi";
import { locationLabel } from "../../lib/photoZone";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { compressImage } from "../../lib/imageCompression";
import { addToQueue } from "../../lib/uploadQueue";
import { isRetriableUploadError } from "../../lib/networkErrors";
import { useProjectRole } from "../../hooks/useProjectRole";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useSmartBack } from "../../hooks/useSmartBack";
import { notifyProjectOwner } from "../../lib/notificationsApi";
import XSpinner from "./ui-kit/XSpinner";


// Per-photo pending location assignment, keyed by index in photosToUpload.
// Named rather than inlined: three reindexing helpers rebuild this map, and
// as three separate inline literals they had to be kept in sync by hand.
type PhotoLocationMap = {
  [key: string]: { locationId?: string; freeText?: string };
};

export default function PhotoUploadPage() {
  const navigate = useNavigate();
  const { projectId, visitId } = useParams();
  const goBack = useSmartBack(`/app/projects/${projectId}/visits/${visitId}`);
  const { user } = useAuth();
  const projectRole = useProjectRole(projectId);

  const [photosToUpload, setPhotosToUpload] = useState<File[]>([]);
  const [photoTags, setPhotoTags] = useState<{ [key: string]: string[] }>({});
  // Per-photo location assignment, keyed by the photo's index in
  // photosToUpload. `locationId` is the real FK and the normal case;
  // `freeText` only ever gets set on projects with NO imported locations,
  // where the picker would otherwise leave a field user unable to label
  // anything at all.
  const [photoLocations, setPhotoLocations] = useState<PhotoLocationMap>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [selectedPhotoIndices, setSelectedPhotoIndices] = useState<number[]>([]);
  const [currentTag, setCurrentTag] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  useModalOpen(showLocationModal);
  const [tempLocationId, setTempLocationId] = useState("");
  const [tempFreeText, setTempFreeText] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const gpsToastShown = useRef(false);

  // The project's imported locations, for the picker. Failure is not fatal:
  // an empty list degrades to the free-text fallback below, which is the
  // same path a project with no imported locations takes.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLocationsLoading(true);
    getLocations(projectId)
      .then((locs) => {
        if (!cancelled) setLocations(locs);
      })
      .catch((e) => {
        console.error("Error loading locations for photo upload:", e);
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsCoords(coords);
        if (!gpsToastShown.current) {
          toast.success("Position GPS capturée");
          gpsToastShown.current = true;
        }
      },
      () => {
        // GPS denied or unavailable — silent, manual location still works
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files).slice(0, 20);
    setPhotosToUpload(fileArray);

    // Initialize empty tags and locations for each photo
    const newPhotoTags: { [key: string]: string[] } = {};
    const newPhotoLocations: PhotoLocationMap = {};
    fileArray.forEach((_, index) => {
      newPhotoTags[index.toString()] = [];
      newPhotoLocations[index.toString()] = {};
    });
    setPhotoTags(newPhotoTags);
    setPhotoLocations(newPhotoLocations);
    setSelectedPhotoIndices([]);
  };

  const handleAddMorePhotos = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    const combined = [...photosToUpload, ...newFiles].slice(0, 20);
    setPhotosToUpload(combined);

    // Update tags and locations mapping
    const newPhotoTags: { [key: string]: string[] } = {};
    const newPhotoLocations: PhotoLocationMap = {};
    combined.forEach((_, index) => {
      newPhotoTags[index.toString()] = photoTags[index.toString()] || [];
      newPhotoLocations[index.toString()] = photoLocations[index.toString()] || {};
    });
    setPhotoTags(newPhotoTags);
    setPhotoLocations(newPhotoLocations);
  };

  const handleRemovePhoto = (index: number) => {
    const newPhotos = photosToUpload.filter((_, i) => i !== index);
    setPhotosToUpload(newPhotos);

    // Update tags, locations and selected indices
    const newPhotoTags: { [key: string]: string[] } = {};
    const newPhotoLocations: PhotoLocationMap = {};
    newPhotos.forEach((_, newIndex) => {
      const oldIndex = newIndex >= index ? newIndex + 1 : newIndex;
      newPhotoTags[newIndex.toString()] = photoTags[oldIndex.toString()] || [];
      newPhotoLocations[newIndex.toString()] = photoLocations[oldIndex.toString()] || {};
    });
    setPhotoTags(newPhotoTags);
    setPhotoLocations(newPhotoLocations);
    setSelectedPhotoIndices(
      selectedPhotoIndices.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
    );
  };

  const handleAddTag = (tag: string) => {
    if (!tag.trim()) return;

    const newPhotoTags = { ...photoTags };
    selectedPhotoIndices.forEach((photoIndex) => {
      const existingTags = newPhotoTags[photoIndex.toString()] || [];
      if (!existingTags.includes(tag.trim())) {
        newPhotoTags[photoIndex.toString()] = [...existingTags, tag.trim()];
      }
    });
    setPhotoTags(newPhotoTags);
    setCurrentTag("");
  };

  const handleRemoveTag = (tag: string) => {
    const newPhotoTags = { ...photoTags };
    selectedPhotoIndices.forEach((photoIndex) => {
      const existingTags = newPhotoTags[photoIndex.toString()] || [];
      newPhotoTags[photoIndex.toString()] = existingTags.filter((t) => t !== tag);
    });
    setPhotoTags(newPhotoTags);
  };

  const filteredLocations = locationSearch.trim()
    ? locations.filter((l) => {
        const q = locationSearch.trim().toLowerCase();
        return (
          l.locationNumber.toLowerCase().includes(q) ||
          (l.name || "").toLowerCase().includes(q)
        );
      })
    : locations;

  // Label for a photo's pending assignment, for the thumbnail badge.
  const assignedLabel = (index: number): string | null => {
    const a = photoLocations[index.toString()];
    if (!a) return null;
    if (a.locationId) {
      const loc = locations.find((l) => l.id === a.locationId);
      return loc ? locationLabel(loc) : null;
    }
    return a.freeText || null;
  };

  const handleAssignLocation = () => {
    const freeText = tempFreeText.trim();
    if (!tempLocationId && !freeText) {
      toast.error("Veuillez choisir un local.");
      return;
    }

    const newPhotoLocations = { ...photoLocations };
    selectedPhotoIndices.forEach((photoIndex) => {
      newPhotoLocations[photoIndex.toString()] = tempLocationId
        ? { locationId: tempLocationId }
        : { freeText };
    });
    setPhotoLocations(newPhotoLocations);
    setShowLocationModal(false);
    setTempLocationId("");
    setTempFreeText("");
    setLocationSearch("");
    toast.success(`Local assigné à ${selectedPhotoIndices.length} photo(s)`);
  };

  const handleRemoveLocation = () => {
    const newPhotoLocations = { ...photoLocations };
    selectedPhotoIndices.forEach((photoIndex) => {
      newPhotoLocations[photoIndex.toString()] = {};
    });
    setPhotoLocations(newPhotoLocations);
    toast.success("Localisation supprimée");
  };

  const handleSubmit = async () => {
    if (!visitId || !projectId) {
      console.error("❌ Missing IDs:", { visitId, projectId });
      toast.error("Erreur : ID de projet ou visite manquant");
      return;
    }

    if (!user?.id) {
      toast.error("Session expirée. Veuillez vous reconnecter.");
      navigate("/");
      return;
    }

    if (photosToUpload.length === 0) {
      toast.error("Veuillez sélectionner au moins une photo");
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let queuedCount = 0;
    const failures: string[] = [];

    try {
      // Every photo is handled independently. A single failure used to
      // propagate out of this loop, so photo 3 of 10 failing meant photos
      // 4–10 were never uploaded AND never queued — silently dropped with
      // one generic toast. Nothing in here may throw past the iteration.
      for (let i = 0; i < photosToUpload.length; i++) {
        const file = photosToUpload[i];
        const tags = photoTags[i.toString()] || [];
        const location = photoLocations[i.toString()];

        // The `location` JSONB now carries GPS ONLY. The structured local
        // goes to photos.location_id (the FK) instead, so the free-text
        // floor/room keys are no longer written at all — old rows keep
        // theirs and are still read via resolvePhotoZone.
        //
        // The one exception is a project with no imported locations, where
        // the picker has nothing to offer: that free text is preserved in
        // the legacy `room` key precisely so the existing read fallback
        // displays it without needing a fifth code path.
        const locationObj =
          gpsCoords || location?.freeText
            ? {
                ...(gpsCoords ?? {}),
                ...(location?.freeText ? { room: location.freeText } : {}),
              }
            : undefined;

        // Compression can throw on its own (corrupt file, canvas OOM on a
        // very large image), so it is inside the per-photo guard too.
        let compressedFile: File;
        try {
          compressedFile = await compressImage(file);
        } catch (compressError) {
          console.error(`❌ Compression failed for ${file.name}:`, compressError);
          // Fall back to the original bytes rather than losing the photo.
          compressedFile = file;
        }

        try {
          await uploadPhoto(compressedFile, user.id, projectId, visitId, {
            tags: tags,
            location: locationObj,
            locationId: location?.locationId,
          });
          successCount++;
        } catch (uploadError) {
          if (isRetriableUploadError(uploadError)) {
            try {
              await addToQueue({
                file: compressedFile,
                userId: user.id,
                projectId,
                visitId,
                tags,
                location: locationObj,
                locationId: location?.locationId,
              });
              queuedCount++;
              console.warn("⚠️ Upload failed, queued for later:", file.name, uploadError);
            } catch (queueError) {
              // Queueing itself failed (IndexedDB unavailable/full). This is
              // the only path where a photo is genuinely lost, so it must be
              // named rather than counted silently.
              console.error("❌ Could not queue photo:", file.name, queueError);
              failures.push(file.name);
            }
          } else {
            // The server gave a verdict (permission, size, validation) —
            // retrying would never succeed, so report it against this photo
            // and carry on with the rest.
            console.error("❌ Upload rejected for", file.name, uploadError);
            failures.push(file.name);
          }
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} photo(s) ajoutée(s) avec succès!`);

        const actorName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";
        notifyProjectOwner({
          projectId,
          actorId: user.id,
          actorName,
          type: "photo_created",
          message:
            successCount === 1
              ? "a ajouté une nouvelle photo"
              : `a ajouté ${successCount} nouvelles photos`,
          visitId,
        });
      }
      if (queuedCount > 0) {
        toast.info(
          `${queuedCount} photo(s) enregistrée(s) localement, envoi automatique dès le retour en ligne.`,
        );
      }
      if (failures.length > 0) {
        // Named, not just counted — the user needs to know which photos to
        // retake or retry, and these are the only ones not safely stored.
        toast.error(
          `${failures.length} photo(s) non enregistrée(s) : ${failures.slice(0, 3).join(", ")}` +
            (failures.length > 3 ? `…` : ""),
          { duration: 10000 },
        );
      }

      // Only leave the page if nothing needs the user's attention here.
      if (failures.length === 0) {
        navigate(`/app/projects/${projectId}/visits/${visitId}`);
      }
    } catch (error) {
      console.error("❌ Unexpected error uploading photos:", error);
      toast.error(`Erreur lors de l'ajout des photos: ${error}`);
    } finally {
      setIsUploading(false);
    }
  };

  const getSelectedPhotosTags = () => {
    const allTags = new Set<string>();
    selectedPhotoIndices.forEach((photoIndex) => {
      const tags = photoTags[photoIndex.toString()] || [];
      tags.forEach((tag) => allTags.add(tag));
    });
    return Array.from(allTags);
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Header */}
      <div className="bg-surface border-b border-line px-4 sm:px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <button
            onClick={goBack}
            disabled={isUploading}
            className="flex items-center gap-2 text-muted hover:text-ink transition-colors disabled:opacity-50 min-h-[44px] text-sm font-medium"
          >
            <ArrowLeft size={20} />
            <span>Retour</span>
          </button>
          <h1 className="text-base sm:text-lg font-semibold text-ink">Ajouter des photos</h1>
          <div className="flex items-center gap-1.5 text-xs">
            <Navigation size={12} className={gpsCoords ? "text-resolved" : "text-faint"} />
            <span className={gpsCoords ? "text-resolved" : "text-faint"}>
              {gpsCoords ? "GPS" : "Pas de GPS"}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        {!projectRole.loading && !projectRole.canUploadPhotos ? (
          <div className="bg-surface rounded-[4px] p-8 border border-line text-center">
            <p className="text-base text-ink font-medium mb-2">
              Vous n'avez pas la permission d'ajouter des photos à ce projet.
            </p>
            <p className="text-sm text-muted">
              Contactez le propriétaire du projet ou un administrateur pour obtenir cet accès.
            </p>
          </div>
        ) : (
        <>
        {/* Upload Area */}
        {photosToUpload.length === 0 ? (
          <div className="bg-surface rounded-[4px] p-8 border-2 border-dashed border-line-strong hover:border-ink transition-colors">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-full bg-subtle flex items-center justify-center">
                <Camera size={40} className="text-body" />
              </div>
              <div className="text-center">
                <p className="text-base text-ink font-medium mb-2">Téléverser des photos</p>
                <p className="text-sm text-muted">
                  Sélectionnez jusqu'à 20 photos de votre chantier
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.multiple = true;
                    input.onchange = (e: any) => handleFileSelect(e.target.files);
                    input.click();
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line active:bg-line-strong transition-colors text-base font-medium flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <Camera size={20} />
                  <span>Galerie</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.multiple = true;
                    input.setAttribute("capture", "environment");
                    input.onchange = (e: any) => handleFileSelect(e.target.files);
                    input.click();
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-[#A00400] transition-colors text-base font-medium flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <Camera size={20} />
                  <span>Caméra</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Photo Count and Add More */}
            <div className="bg-surface rounded-[4px] p-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">
                {photosToUpload.length} photo{photosToUpload.length !== 1 ? "s" : ""} •{" "}
                {selectedPhotoIndices.length} sélectionnée
                {selectedPhotoIndices.length !== 1 ? "s" : ""}
              </h3>
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.multiple = true;
                  input.onchange = (e: any) => handleAddMorePhotos(e.target.files);
                  input.click();
                }}
                className="px-4 py-2 bg-subtle text-body rounded-[4px] hover:bg-line active:bg-line-strong transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Ajouter photos</span>
                <span className="sm:hidden">Ajouter</span>
              </button>
            </div>

            {/* Photo Grid */}
            <div className="bg-surface rounded-[4px] p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photosToUpload.map((file, index) => {
                  const isSelected = selectedPhotoIndices.includes(index);
                  const tags = photoTags[index.toString()] || [];
                  return (
                    <div
                      key={index}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedPhotoIndices(selectedPhotoIndices.filter((i) => i !== index));
                        } else {
                          setSelectedPhotoIndices([...selectedPhotoIndices, index]);
                        }
                      }}
                      className={`relative aspect-square rounded-[4px] overflow-hidden cursor-pointer border-2 transition-all group ${
                        isSelected
                          ? "border-ink ring-2 ring-ink/20"
                          : "border-line hover:border-line-strong active:border-line-strong"
                      }`}
                    >
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />

                      {/* Selection Indicator */}
                      <div
                        className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          isSelected
                            ? "bg-ink border-ink"
                            : "bg-white/90 border-line-strong"
                        }`}
                      >
                        {isSelected && <Check size={16} className="text-white lucide-weight" style={{ "--icon-stroke": 2.5 } as React.CSSProperties} />}
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto(index);
                        }}
                        className="absolute top-2 right-2 w-11 h-11 bg-ink/80 text-white rounded-[4px] flex items-center justify-center hover:bg-ink transition-colors"
                        aria-label="Supprimer la photo"
                      >
                        <X size={16} />
                      </button>

                      {/* Photo number */}
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-[4px] font-medium">
                        #{index + 1}
                      </div>

                      {/* Location badge (top priority) */}
                      {(() => {
                        const label = assignedLabel(index);
                        if (!label) return null;
                        return (
                          <div className="absolute top-10 left-2 max-w-[calc(100%-1rem)]">
                            <div className="px-2 py-1 bg-ink text-white rounded text-xs font-bold flex items-center gap-1 shadow-lg">
                              <MapPin size={12} className="flex-shrink-0" />
                              <span className="truncate">{label}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Tags preview */}
                      {tags.length > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                          <div className="flex gap-1 flex-wrap">
                            {tags.slice(0, 2).map((tag, tagIndex) => (
                              <span
                                key={tagIndex}
                                className="px-1.5 py-0.5 bg-white/90 text-ink rounded text-xs font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                            {tags.length > 2 && (
                              <span className="px-1.5 py-0.5 bg-white/90 text-ink rounded text-xs font-medium">
                                +{tags.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick Selection Buttons */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setSelectedPhotoIndices(photosToUpload.map((_, i) => i))}
                  className="px-4 py-2 bg-subtle text-body rounded-[4px] hover:bg-line active:bg-line-strong transition-colors text-sm font-medium min-h-[44px]"
                >
                  Tout sélectionner
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoIndices([])}
                  className="px-4 py-2 bg-subtle text-body rounded-[4px] hover:bg-line active:bg-line-strong transition-colors text-sm font-medium min-h-[44px]"
                >
                  Désélectionner
                </button>
              </div>
            </div>

            {/* Tag & Location Input Section */}
            {selectedPhotoIndices.length > 0 && (
              <div className="bg-surface rounded-[4px] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-base font-semibold text-ink">
                    {selectedPhotoIndices.length} photo
                    {selectedPhotoIndices.length !== 1 ? "s" : ""} sélectionnée
                    {selectedPhotoIndices.length !== 1 ? "s" : ""}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLocationModal(true)}
                      className="px-4 py-2 bg-ink text-white rounded-[4px] hover:bg-ink transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
                    >
                      <MapPin size={20} />
                      <span className="hidden sm:inline">Assigner localisation</span>
                      <span className="sm:hidden">Localisation</span>
                    </button>
                  </div>
                </div>

                {/* Tags Section */}
                <h3 className="text-sm font-semibold text-body mb-3 mt-4">Tags</h3>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="text"
                    value={currentTag}
                    onChange={(e) => setCurrentTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(currentTag);
                      }
                    }}
                    placeholder="Taper un tag et appuyer sur Entrée..."
                    className="flex-1 px-4 py-3 text-base border border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent min-h-[48px]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(currentTag)}
                    disabled={!currentTag.trim()}
                    className="px-6 py-3 bg-surface border border-ink text-ink rounded-[4px] hover:bg-subtle transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[48px]"
                  >
                    <Plus size={20} />
                    <span>Ajouter</span>
                  </button>
                </div>

                {/* Quick Tags */}
                <div className="mb-4">
                  <p className="text-sm text-body mb-2 font-medium">Tags rapides :</p>
                  <div className="flex gap-2 flex-wrap">
                    {["Fissure", "Défaut", "Conforme", "À corriger", "Urgent", "Non-conforme"].map(
                      (tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddTag(tag)}
                          className="px-4 py-2 bg-surface border border-line-strong text-body rounded-[4px] hover:bg-subtle hover:border-ink active:bg-subtle transition-colors text-sm font-medium min-h-[44px]"
                        >
                          + {tag}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {/* Current Tags */}
                {getSelectedPhotosTags().length > 0 && (
                  <div>
                    <p className="text-sm text-body mb-2 font-medium">Tags actuels :</p>
                    <div className="flex gap-2 flex-wrap">
                      {getSelectedPhotosTags().map((tag, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[4px] text-sm font-medium min-h-[44px]"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:bg-white/20 rounded-full p-1 transition-colors"
                            aria-label={`Retirer le tag ${tag}`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="bg-surface rounded-[4px] p-4 sm:p-5">
              <div className="flex gap-3">
                <button
                  onClick={goBack}
                  disabled={isUploading}
                  className="flex-1 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line-strong active:bg-line-strong transition-colors font-semibold text-base min-h-[48px] disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isUploading || photosToUpload.length === 0}
                  className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-[#A00400] transition-colors font-semibold text-base min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <XSpinner size={20} tone="current" label={null} />
                      <span>Upload...</span>
                    </>
                  ) : (
                    <>
                      <Check size={20} />
                      <span>Ajouter</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
        </>
        )}
      </div>

      {/* Removed Fixed Bottom Actions - Now inline in content */}

      {/* Location Assignment Modal */}
      {showLocationModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowLocationModal(false)}
        >
          <div
            className="bg-surface rounded-[4px] max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={20} className="text-brand-600" />
                <h2 className="text-lg font-semibold text-ink">Assigner une localisation</h2>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="p-1.5 hover:bg-subtle rounded-[4px] transition-colors"
              >
                <X size={20} className="text-body" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              <div className="bg-subtle border border-line-strong rounded-[4px] p-3 mb-4">
                <p className="text-sm text-ink">
                  <strong>
                    {selectedPhotoIndices.length} photo{selectedPhotoIndices.length > 1 ? "s" : ""}{" "}
                    sélectionnée{selectedPhotoIndices.length > 1 ? "s" : ""}
                  </strong>
                  <br />
                  La localisation sera appliquée à toutes les photos sélectionnées.
                </p>
              </div>

              {locationsLoading ? (
                <p className="text-sm text-muted py-4">Chargement des locaux…</p>
              ) : locations.length > 0 ? (
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-body flex items-center gap-2">
                    <MapPin size={16} className="text-brand-600" />
                    Local
                  </label>
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                    />
                    <input
                      type="text"
                      value={locationSearch}
                      onChange={(e) => setLocationSearch(e.target.value)}
                      placeholder="Rechercher un local…"
                      className="w-full pl-10 pr-4 py-3 text-base border-2 border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-ink"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-line rounded-[4px] divide-y divide-line">
                    {filteredLocations.length === 0 ? (
                      <p className="text-sm text-muted px-4 py-3">
                        Aucun local ne correspond à cette recherche.
                      </p>
                    ) : (
                      filteredLocations.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => setTempLocationId(l.id)}
                          aria-pressed={tempLocationId === l.id}
                          className={`w-full text-left px-4 py-3 min-h-[44px] flex items-center justify-between gap-2 transition-colors ${
                            tempLocationId === l.id
                              ? "bg-subtle text-ink font-medium"
                              : "hover:bg-subtle text-ink"
                          }`}
                        >
                          <span className="truncate">{locationLabel(l)}</span>
                          {tempLocationId === l.id && (
                            <Check size={16} className="flex-shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /*
                  No imported locations for this project. Rather than block
                  labelling entirely, fall back to free text — a field user
                  on a project nobody has set up yet must still be able to
                  say where a photo was taken. This writes the legacy `room`
                  key, so it displays through the same fallback old photos
                  use.
                */
                <div className="space-y-3">
                  <div className="bg-subtle border border-line-strong rounded-[4px] p-3">
                    <p className="text-sm text-warn">
                      Aucun local n'a été importé pour ce projet. Vous pouvez saisir un
                      emplacement manuellement — ou importer la liste des locaux depuis
                      l'onglet <strong>Locaux</strong> du projet pour un suivi structuré.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-body mb-2 flex items-center gap-2">
                      <MapPin size={16} className="text-brand-600" />
                      Emplacement
                    </label>
                    <input
                      type="text"
                      value={tempFreeText}
                      onChange={(e) => setTempFreeText(e.target.value)}
                      placeholder="Ex : Niveau 2 — corridor est"
                      className="w-full px-4 py-3 text-base border-2 border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-ink"
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="flex-1 px-4 py-3 border border-line-strong rounded-[4px] text-body font-medium hover:bg-subtle transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAssignLocation}
                  className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-[4px] font-medium hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={20} />
                  Assigner
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
