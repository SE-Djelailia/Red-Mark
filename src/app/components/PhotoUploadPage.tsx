import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Camera, Plus, X, Check, MapPin, Building2, Navigation } from "lucide-react";
import { uploadPhoto } from "../../lib/supabaseApi";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { compressImage } from "../../lib/imageCompression";
import { addToQueue } from "../../lib/uploadQueue";
import { useProjectRole } from "../../hooks/useProjectRole";

// Network failures surface as TypeError (fetch's own error type) rather than the
// PostgrestError/StorageError objects Supabase throws for validation/permission failures.
function isNetworkError(error: unknown): boolean {
  return !navigator.onLine || error instanceof TypeError;
}

export default function PhotoUploadPage() {
  const navigate = useNavigate();
  const { projectId, visitId } = useParams();
  const { user } = useAuth();
  const projectRole = useProjectRole(projectId);

  const [photosToUpload, setPhotosToUpload] = useState<File[]>([]);
  const [photoTags, setPhotoTags] = useState<{ [key: string]: string[] }>({});
  const [photoLocations, setPhotoLocations] = useState<{
    [key: string]: { floor?: string; room?: string; lat?: number; lng?: number };
  }>({});
  const [selectedPhotoIndices, setSelectedPhotoIndices] = useState<number[]>([]);
  const [currentTag, setCurrentTag] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempLevel, setTempLevel] = useState("");
  const [tempRoom, setTempRoom] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const gpsToastShown = useRef(false);

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
    const newPhotoLocations: { [key: string]: { floor?: string; room?: string } } = {};
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
    const newPhotoLocations: { [key: string]: { floor?: string; room?: string } } = {};
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
    const newPhotoLocations: { [key: string]: { floor?: string; room?: string } } = {};
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

  const handleAssignLocation = () => {
    if (!tempLevel && !tempRoom) {
      toast.error("Veuillez renseigner au moins le niveau ou la pièce");
      return;
    }

    const newPhotoLocations = { ...photoLocations };
    selectedPhotoIndices.forEach((photoIndex) => {
      newPhotoLocations[photoIndex.toString()] = {
        floor: tempLevel || undefined,
        room: tempRoom || undefined,
        ...(gpsCoords ?? {}),
      };
    });
    setPhotoLocations(newPhotoLocations);
    setShowLocationModal(false);
    setTempLevel("");
    setTempRoom("");
    toast.success(`Localisation assignée à ${selectedPhotoIndices.length} photo(s)`);
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
    console.log("🚀 handleSubmit called", {
      visitId,
      projectId,
      photoCount: photosToUpload.length,
    });

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
    try {
      // Upload each photo (with automatic compression and individual location)
      for (let i = 0; i < photosToUpload.length; i++) {
        const file = photosToUpload[i];
        const tags = photoTags[i.toString()] || [];
        const location = photoLocations[i.toString()];

        // Build location object — include GPS if available
        const hasManualLocation = location?.floor || location?.room;
        const locationObj =
          hasManualLocation || gpsCoords
            ? {
                floor: location?.floor,
                room: location?.room,
                ...(gpsCoords ?? {}),
              }
            : undefined;

        console.log(
          `📤 Uploading photo ${i + 1}/${photosToUpload.length}:`,
          file.name,
          locationObj,
        );

        // Compress image before upload to reduce storage and bandwidth
        const compressedFile = await compressImage(file);

        try {
          await uploadPhoto(compressedFile, user.id, projectId, visitId, {
            tags: tags,
            location: locationObj,
          });
          successCount++;
        } catch (uploadError) {
          if (!isNetworkError(uploadError)) {
            // Not a connectivity issue (e.g. validation/permission error) —
            // let the outer catch handle it with the generic error toast.
            throw uploadError;
          }

          console.warn("⚠️ Upload failed due to network, queueing for later:", uploadError);
          await addToQueue({
            file: compressedFile,
            userId: user.id,
            projectId,
            visitId,
            tags,
            location: locationObj,
          });
          queuedCount++;
        }
      }

      console.log("✅ Batch finished", { successCount, queuedCount });

      if (queuedCount > 0) {
        toast.info(
          `${queuedCount} photo(s) enregistrée(s) localement, envoi automatique dès le retour en ligne.`,
        );
      }
      if (successCount > 0) {
        toast.success(`${successCount} photo(s) ajoutée(s) avec succès!`);
      }
      navigate(`/app/projects/${projectId}/visits/${visitId}`);
    } catch (error) {
      console.error("❌ Error uploading photos:", error);
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            disabled={isUploading}
            className="flex items-center gap-2 text-gray-400 hover:text-white disabled:opacity-50"
          >
            <ArrowLeft size={20} />
            <span>Retour</span>
          </button>
          <h1 className="text-lg sm:text-xl font-semibold">Ajouter des photos</h1>
          <div className="flex items-center gap-1.5 text-xs">
            <Navigation size={14} className={gpsCoords ? "text-green-400" : "text-gray-500"} />
            <span className={gpsCoords ? "text-green-400" : "text-gray-500"}>
              {gpsCoords ? "GPS" : "Pas de GPS"}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        {!projectRole.loading && !projectRole.canUploadPhotos ? (
          <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
            <p className="text-base text-[#1A1A1A] font-medium mb-2">
              Vous n'avez pas la permission d'ajouter des photos à ce projet.
            </p>
            <p className="text-sm text-gray-500">
              Contactez le propriétaire du projet ou un administrateur pour obtenir cet accès.
            </p>
          </div>
        ) : (
        <>
        {/* Upload Area */}
        {photosToUpload.length === 0 ? (
          <div className="bg-white rounded-xl p-8 border-2 border-dashed border-gray-300 hover:border-[#E10600] transition-colors">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <Camera size={40} className="text-gray-600" />
              </div>
              <div className="text-center">
                <p className="text-base text-[#1A1A1A] font-medium mb-2">Téléverser des photos</p>
                <p className="text-sm text-gray-500">
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
                  className="w-full sm:w-auto px-6 py-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors text-base font-medium flex items-center justify-center gap-2 min-h-[48px]"
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
                  className="w-full sm:w-auto px-6 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] active:bg-[#A00400] transition-colors text-base font-medium flex items-center justify-center gap-2 min-h-[48px]"
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
            <div className="bg-white rounded-xl p-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1A1A1A]">
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
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Ajouter photos</span>
                <span className="sm:hidden">Ajouter</span>
              </button>
            </div>

            {/* Photo Grid */}
            <div className="bg-white rounded-xl p-4">
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
                      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all group ${
                        isSelected
                          ? "border-[#E10600] ring-2 ring-[#E10600]/30"
                          : "border-gray-200 hover:border-gray-300 active:border-gray-400"
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
                            ? "bg-[#E10600] border-[#E10600]"
                            : "bg-white/90 border-gray-300"
                        }`}
                      >
                        {isSelected && <Check size={18} className="text-white" strokeWidth={3} />}
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto(index);
                        }}
                        className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 active:bg-red-700 transition-colors"
                        aria-label="Supprimer la photo"
                      >
                        <X size={16} />
                      </button>

                      {/* Photo number */}
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md font-medium">
                        #{index + 1}
                      </div>

                      {/* Location badge (top priority) */}
                      {(() => {
                        const location = photoLocations[index.toString()];
                        if (!location?.floor && !location?.room) return null;
                        return (
                          <div className="absolute top-10 left-2">
                            <div className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-bold flex items-center gap-1 shadow-lg">
                              <MapPin size={12} />
                              <span>
                                {location.floor && location.room
                                  ? `${location.floor} - ${location.room}`
                                  : location.floor || location.room}
                              </span>
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
                                className="px-1.5 py-0.5 bg-white/90 text-[#1A1A1A] rounded text-xs font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                            {tags.length > 2 && (
                              <span className="px-1.5 py-0.5 bg-white/90 text-[#1A1A1A] rounded text-xs font-medium">
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
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setSelectedPhotoIndices(photosToUpload.map((_, i) => i))}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm font-medium min-h-[44px]"
                >
                  Tout sélectionner
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoIndices([])}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm font-medium min-h-[44px]"
                >
                  Désélectionner
                </button>
              </div>
            </div>

            {/* Tag & Location Input Section */}
            {selectedPhotoIndices.length > 0 && (
              <div className="bg-white rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-base font-semibold text-[#1A1A1A]">
                    {selectedPhotoIndices.length} photo
                    {selectedPhotoIndices.length !== 1 ? "s" : ""} sélectionnée
                    {selectedPhotoIndices.length !== 1 ? "s" : ""}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLocationModal(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
                    >
                      <MapPin size={18} />
                      <span className="hidden sm:inline">Assigner localisation</span>
                      <span className="sm:hidden">Localisation</span>
                    </button>
                  </div>
                </div>

                {/* Tags Section */}
                <h3 className="text-sm font-semibold text-gray-700 mb-3 mt-4">Tags</h3>
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
                    className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent min-h-[48px]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(currentTag)}
                    disabled={!currentTag.trim()}
                    className="px-6 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] active:bg-[#A00400] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[48px]"
                  >
                    <Plus size={20} />
                    <span>Ajouter</span>
                  </button>
                </div>

                {/* Quick Tags */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2 font-medium">Tags rapides :</p>
                  <div className="flex gap-2 flex-wrap">
                    {["Fissure", "Défaut", "Conforme", "À corriger", "Urgent", "Non-conforme"].map(
                      (tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddTag(tag)}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-[#E10600] active:bg-gray-100 transition-colors text-sm font-medium min-h-[44px]"
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
                    <p className="text-sm text-gray-600 mb-2 font-medium">Tags actuels :</p>
                    <div className="flex gap-2 flex-wrap">
                      {getSelectedPhotosTags().map((tag, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 px-4 py-2 bg-[#E10600] text-white rounded-lg text-sm font-medium min-h-[44px]"
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
            <div className="bg-white rounded-xl p-4 sm:p-5">
              <div className="flex gap-3">
                <button
                  onClick={() => navigate(-1)}
                  disabled={isUploading}
                  className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 active:bg-gray-400 transition-colors font-semibold text-base min-h-[48px] disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isUploading || photosToUpload.length === 0}
                  className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] active:bg-[#A00400] transition-colors font-semibold text-base min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
            className="bg-white rounded-xl max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={20} className="text-[#E10600]" />
                <h2 className="text-lg font-semibold text-[#1A1A1A]">Assigner une localisation</h2>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>
                    {selectedPhotoIndices.length} photo{selectedPhotoIndices.length > 1 ? "s" : ""}{" "}
                    sélectionnée{selectedPhotoIndices.length > 1 ? "s" : ""}
                  </strong>
                  <br />
                  La localisation sera appliquée à toutes les photos sélectionnées.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <Building2 size={16} className="text-[#E10600]" />
                    Niveau / Étage
                  </label>
                  <input
                    type="text"
                    value={tempLevel}
                    onChange={(e) => setTempLevel(e.target.value)}
                    placeholder="Ex: Sous-sol, RDC, Niveau 1..."
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-[#E10600]"
                    list="modal-level-options"
                  />
                  <datalist id="modal-level-options">
                    <option value="Sous-sol" />
                    <option value="Rez-de-chaussée" />
                    <option value="Niveau 1" />
                    <option value="Niveau 2" />
                    <option value="Niveau 3" />
                    <option value="Niveau 4" />
                    <option value="Toit" />
                    <option value="Extérieur" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <MapPin size={16} className="text-[#E10600]" />
                    Pièce / Zone
                  </label>
                  <input
                    type="text"
                    value={tempRoom}
                    onChange={(e) => setTempRoom(e.target.value)}
                    placeholder="Ex: Cuisine, Hall, Bureau..."
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-[#E10600]"
                    list="modal-room-options"
                  />
                  <datalist id="modal-room-options">
                    <option value="Hall d'entrée" />
                    <option value="Cuisine" />
                    <option value="Salon" />
                    <option value="Chambre" />
                    <option value="Salle de bain" />
                    <option value="Bureau" />
                    <option value="Couloir" />
                    <option value="Cage d'escalier" />
                    <option value="Stationnement" />
                    <option value="Local technique" />
                  </datalist>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAssignLocation}
                  className="flex-1 px-4 py-3 bg-[#E10600] text-white rounded-lg font-medium hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={18} />
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
