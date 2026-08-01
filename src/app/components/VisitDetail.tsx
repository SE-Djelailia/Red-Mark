import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
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
  Pencil,
  LayoutGrid,
  Mic,
} from "lucide-react";
import {
  getSiteVisit,
  getProject,
  getPhotos,
  updateSiteVisit,
  deletePhoto,
  saveAnnotatedPhoto,
} from "../../lib/supabaseApi";
import { getIssuesByVisit, type Issue } from "../../lib/issuesApi";
import PlanFilesManager from "./PlanFilesManager";
import CollapsibleSection from "./CollapsibleSection";
import { getRlsErrorMessage } from "../../lib/rlsErrors";
import { PLANS_ENABLED } from "../../lib/featureFlags";
import { useSmartBack } from "../../hooks/useSmartBack";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import ConfirmDialog from "./ConfirmDialog";
import { formatDateLongWithWeekday } from "../../lib/dateUtils";
import VisitComments from "./VisitComments";
import IssueForm from "./IssueForm";
import VoiceNotesSection from "./VoiceNotesSection";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole, canEditIssue, canManagePhoto } from "../../hooks/useProjectRole";
import { useModalOpen } from "../../hooks/useModalOpen";
import { notifyProjectOwner } from "../../lib/notificationsApi";
import { uploadIssuePhotos, WEATHER_EVIDENCE_TAG } from "../../lib/issuePhotoUpload";
import SecureImage from "./SecureImage";
import { toast } from "sonner";
import { PhotoAnnotator } from "./PhotoAnnotator";
import ObservationsSection from "./ObservationsSection";
import FloatingActions from "./FloatingActions";
import { PriorityBadge, StatusBadge } from "./ui-kit/Badge";
import { Card, Section } from "./ui-kit/Card";
import VoiceRecorderModal from "./VoiceRecorderModal";

interface Photo {
  id: string;
  url: string; // Deprecated - kept for compatibility
  storage_path: string; // Secure storage path for signed URLs
  user_id: string; // Uploader, used for per-photo manage permission
  tags?: string[];
  location?: { floor?: string; room?: string };
}

interface VisitDisplay {
  id: string;
  date: string;
  phase: string;
  tags: string[];
  photoCount: number;
  notes: string;
  photos: Photo[];
  weather?: string;
  temperature?: string;
  createdBy: string;
}

export default function VisitDetail() {
  const navigate = useNavigate();
  const { projectId, visitId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const goBack = useSmartBack(`/app/projects/${projectId}`);
  const { user } = useAuth();
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [visit, setVisit] = useState<VisitDisplay | null>(null);
  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingWeatherPhoto, setUploadingWeatherPhoto] = useState(false);

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

  // Issue creation/edition modal — hosts the shared IssueForm; editingIssue
  // null means create mode. initialIssuePhotos carries photos pre-selected
  // from the visit's photo grid ("Créer déficience" from a selection) into
  // the new issue, since those already exist as real photos rows and just
  // need attaching, not re-uploading.
  const [showIssueModal, setShowIssueModal] = useState(false);
  useModalOpen(!!selectedPhoto);
  useModalOpen(showIssueModal);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [initialIssuePhotos, setInitialIssuePhotos] = useState<Issue["photos"]>([]);
  const [showDeletePhotosConfirm, setShowDeletePhotosConfirm] = useState(false);

  // Voice recorder opened from the "+" menu. The visit is already known
  // here, so it records straight against it — no picker step.
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  // Bumped after a recording is saved so the voice-notes section refetches.
  const [voiceNotesKey, setVoiceNotesKey] = useState(0);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      if (!visitId) {
        setLoadError("Visite introuvable.");
        return;
      }

      // getSiteVisit is typed `SiteVisit | null` and the row can genuinely
      // be absent — deleted visit, stale link, or RLS filtering it out for
      // a non-member. Previously every field below was read straight off
      // the result, so any of those cases threw inside the effect and left
      // the screen blank with only a console error.
      const apiVisit = await getSiteVisit(visitId);
      if (!apiVisit) {
        setLoadError("Cette visite n'existe plus ou vous n'y avez pas accès.");
        return;
      }

      const photos = await getPhotos(apiVisit.id);

      // phase/notes are optional on SiteVisit. `apiVisit.phase.charAt(0)`
      // crashed outright on a visit saved without a phase — a real runtime
      // fault, not just a type complaint.
      const phase = apiVisit.phase ?? "";
      const transformedVisit: VisitDisplay = {
        id: apiVisit.id,
        date: apiVisit.visit_date,
        phase: phase ? phase.charAt(0).toUpperCase() + phase.slice(1) : "—",
        tags: [],
        photoCount: photos.length,
        notes: apiVisit.notes ?? "",
        photos: photos.map((p) => ({
          id: p.id,
          url: p.file_url || "", // Deprecated, kept for backward compatibility
          storage_path: p.storage_path,
          user_id: p.user_id,
          tags: p.tags || [],
          location: p.location || undefined,
        })),
        weather: apiVisit.weather,
        temperature: apiVisit.temperature,
        createdBy: apiVisit.user_id,
      };

      setVisit(transformedVisit);
      setEditedNotes(transformedVisit.notes);

      // Load issues from Supabase
      const visitIssues = await getIssuesByVisit(visitId);
      setIssues(visitIssues);

      // The project name is decoration on this screen — a missing project
      // shouldn't blank out a visit that loaded fine, so it degrades to an
      // empty label rather than failing the whole fetch.
      if (projectId) {
        const project = await getProject(projectId);
        setProjectName(project?.name ?? "");
      }
    } catch (error) {
      console.error("Error fetching visit:", error);
      setLoadError(
        getRlsErrorMessage(
          error,
          "Impossible de charger cette visite.",
          "Vous n'avez pas accès à cette visite.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [visitId, projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const projectRole = useProjectRole(projectId);


  // Weather evidence — a regular visit photo tagged "Météo" (a sky photo,
  // a weather-app screenshot, etc.), via the same shared capture/compress/
  // upload/offline-queue flow used for issue and location photos.
  const handleWeatherPhotoSelected = async (files: FileList) => {
    if (!user?.id || !projectId || !visitId) return;
    setUploadingWeatherPhoto(true);
    try {
      const { uploaded, queuedCount } = await uploadIssuePhotos(Array.from(files), {
        userId: user.id,
        projectId,
        visitId,
        tags: [WEATHER_EVIDENCE_TAG],
      });
      if (uploaded.length > 0) {
        toast.success(`${uploaded.length} preuve(s) météo ajoutée(s)`);
        setVisit((prev) => {
          if (!prev) return prev;
          const newPhotos = uploaded.map((p) => ({
            id: p.id,
            url: p.url,
            storage_path: p.storagePath || "",
            user_id: user.id,
            tags: [WEATHER_EVIDENCE_TAG],
          }));
          return { ...prev, photos: [...prev.photos, ...newPhotos], photoCount: prev.photoCount + newPhotos.length };
        });
      }
      if (queuedCount > 0) {
        toast.info("Photo mise en file d'attente — elle sera envoyée une fois de retour en ligne.");
      }
    } catch (error) {
      console.error("Error uploading weather evidence photo:", error);
      toast.error("Échec de l'envoi de la preuve météo");
    } finally {
      setUploadingWeatherPhoto(false);
    }
  };

  // Issue management handlers — the form itself (IssueForm) now owns all
  // the field state and the actual create/update calls; these just control
  // which issue (if any) the modal is editing.
  const handleCreateIssue = () => {
    setEditingIssue(null);
    setInitialIssuePhotos([]);
    setShowIssueModal(true);
  };

  // Arriving via ProjectDetail's floating "Nouvelle déficience" action
  // (which has no visit in context yet, so it goes through VisitPicker then
  // lands here) — auto-open the same modal a manual "Ajouter" tap would.
  useEffect(() => {
    if (searchParams.get("action") === "new-issue") {
      handleCreateIssue();
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("action");
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateIssueFromPhotos = () => {
    if (selectedPhotoIds.length === 0) {
      toast.error("Veuillez sélectionner au moins une photo");
      return;
    }

    setEditingIssue(null);
    // visitId comes from the route — these are this visit's own photos, so
    // it is the correct visit for every one of them by construction.
    const preSelected =
      visit?.photos
        .filter((p) => selectedPhotoIds.includes(p.id))
        .map((p) => ({
          id: p.id,
          url: p.url,
          storagePath: p.storage_path,
          visitId: visitId || "",
        })) || [];
    setInitialIssuePhotos(preSelected);
    setIsSelectionMode(false);
    setSelectedPhotoIds([]);
    setShowIssueModal(true);
  };

  const handleEditIssue = (issue: Issue, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingIssue(issue);
    setInitialIssuePhotos([]);
    setShowIssueModal(true);
  };

  const handleIssueSaved = (savedIssue: Issue) => {
    if (editingIssue) {
      setIssues((prevIssues) =>
        prevIssues.map((issue) => (issue.id === savedIssue.id ? savedIssue : issue)),
      );
    } else {
      setIssues((prevIssues) => [...prevIssues, savedIssue]);
      if (user && projectId) {
        const actorName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";
        notifyProjectOwner({
          projectId,
          actorId: user.id,
          actorName,
          type: "issue_created",
          message: "a créé une nouvelle déficience",
          issueId: savedIssue.id,
          visitId,
        });
      }
    }
    setShowIssueModal(false);
    setInitialIssuePhotos([]);
  };

  // Photo delete handler for multiple photos
  const handleDeleteSelectedPhotos = async () => {
    setShowDeletePhotosConfirm(false);
    if (selectedPhotoIds.length === 0) return;

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
      alert(
        getRlsErrorMessage(
          error,
          "Erreur lors de la suppression des photos",
          "Seul le créateur ou un administrateur peut supprimer cette photo.",
        ),
      );
    }
  };

  const handlePhotoClick = (photoId: string, e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.stopPropagation();
      const photo = visit?.photos.find((p) => p.id === photoId);
      if (!photo || !canManagePhoto(projectRole, photo.user_id)) return;
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

      // Non-destructive: uploads to a new path under the current user's
      // folder, then repoints the row. The original stays in storage.
      const updated = await saveAnnotatedPhoto(
        originalPhoto,
        annotatedImageBlob,
        user.id,
        projectId,
        visitId,
      );

      // Swap the storage path in place so the new signed URL is fetched for
      // just this photo — no full page reload.
      setVisit((prev) =>
        prev
          ? {
              ...prev,
              photos: prev.photos.map((p) =>
                p.id === photoId ? { ...p, storage_path: updated.storage_path } : p,
              ),
            }
          : prev,
      );

      toast.success("Annotations sauvegardées");
    } catch (error) {
      console.error("Error saving annotation:", error);
      toast.error(
        getRlsErrorMessage(
          error,
          "Erreur lors de l'enregistrement de l'annotation",
          "Seul l'auteur de la photo peut enregistrer une annotation pour le moment.",
        ),
      );
    }
  };

  // Project name + date carry the context the dark band used to show.
  usePageHeader(
    "Visite du site",
    isLoading
      ? undefined
      : [projectName, visit?.date ? formatDateLongWithWeekday(visit.date) : null]
          .filter(Boolean)
          .join(" · "),
  );

  // Explicit not-found / no-access state. Placed after usePageHeader so the
  // hook order is identical on every render. Matches LocationDetail's and
  // ProjectDetail's load-error pattern: say what failed, offer Retour and
  // Réessayer, rather than leaving a blank screen behind a console error.
  if (!isLoading && (loadError || !visit)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-canvas">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="mx-auto text-brand-600 mb-3" />
          <p className="text-base text-ink font-medium mb-2">Impossible d'afficher cette visite</p>
          <p className="text-sm text-muted mb-6">
            {loadError || "Cette visite n'existe plus ou vous n'y avez pas accès."}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={goBack}
              className="px-4 h-11 bg-subtle text-ink rounded-lg hover:bg-line text-sm font-medium min-h-[44px]"
            >
              Retour
            </button>
            <button
              onClick={() => fetchData()}
              className="px-4 h-11 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium min-h-[44px]"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      {/* Toolbar — title/subtitle moved into the global light header via
          usePageHeader(); only the navigation and actions remain here. */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
          >
            <ArrowLeft size={18} />
            <span>Retour</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => console.log("Share visit")}
              className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle rounded-lg transition-colors"
              title="Partager"
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={() => console.log("Download report")}
              className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle rounded-lg transition-colors"
              title="Télécharger le rapport"
            >
              <Download size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content — the Dashboard's max-w-6xl shell. Unlike Profile,
          this screen earns the width: photos, observations, déficiences
          and comments are all real content that a 672px column would
          stack into a very long scroll. */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-6xl mx-auto space-y-3">
        {/* Meta Information — compact inline row. Emplacement dropped (same
            phantom "Zone non spécifiée" field removed from the visits list
            — attendees was never a real column) and Photos dropped (the
            Photos section below already shows the count). */}
        <div className="bg-surface rounded-xl border border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <div className="flex items-center gap-1.5">
              <Tag size={14} className="text-faint flex-shrink-0" />
              <span className="font-medium text-ink">{visit?.phase}</span>
            </div>
            {visit?.weather && (
              <div className="flex items-center gap-1.5">
                <Cloud size={14} className="text-faint flex-shrink-0" />
                <span className="text-ink">{visit.weather}</span>
              </div>
            )}
            {visit?.temperature && (
              <div className="flex items-center gap-1.5">
                <Thermometer size={14} className="text-faint flex-shrink-0" />
                <span className="text-ink">{visit.temperature}</span>
              </div>
            )}
            {projectRole.canUploadPhotos && (
              <button
                type="button"
                disabled={uploadingWeatherPhoto}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.multiple = true;
                  input.onchange = (e: any) => {
                    if (e.target.files?.length) void handleWeatherPhotoSelected(e.target.files);
                  };
                  input.click();
                }}
                className="flex items-center gap-1.5 text-brand-strong hover:text-brand-800 disabled:opacity-50 ml-auto"
              >
                <Camera size={14} className="flex-shrink-0" />
                <span className="text-xs font-medium">
                  {uploadingWeatherPhoto ? "Envoi…" : "Preuve météo"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Two columns from lg. The split is by weight, not by size:
            the left column holds what the visit is a record OF (notes,
            photos, observations, déficiences, comments) and the right
            holds what you DO with it plus the rarely-opened panels.
            items-start stops the short right column from stretching.

            The phone order is deliberately almost unchanged from before:
            only Notes vocales moves (it now follows the comments), and
            Plans is behind PLANS_ENABLED=false so it renders nowhere. */}
        <div className="grid gap-3 lg:grid-cols-3 items-start">
          <div className="lg:col-span-2 space-y-3">
          {/* Notes de visite — collapsed by default when empty (nothing to
              reclaim space for otherwise); stays open if there's real content
              to read at a glance. */}
          {visit && (
            <CollapsibleSection
              title="Notes de visite"
              icon={<FileText size={16} className="text-muted" />}
              defaultOpen={!!visit.notes?.trim()}
            >
            {isEditingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  placeholder="Ajouter des notes..."
                  rows={6}
                  className="w-full px-4 py-3 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsEditingNotes(false);
                      setEditedNotes(visit?.notes || "");
                    }}
                    className="flex-1 py-2.5 bg-subtle text-ink rounded-lg hover:bg-line-strong transition-colors font-medium min-h-[44px]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveNotes}
                    disabled={!editedNotes.trim()}
                    className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-body leading-relaxed mb-4">{visit?.notes}</p>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setIsEditingNotes(true);
                      setEditedNotes(visit?.notes || "");
                    }}
                    className="py-2.5 px-4 bg-subtle text-ink rounded-lg hover:bg-line transition-colors font-medium flex items-center gap-2 min-h-[44px]"
                  >
                    <Edit size={16} />
                    <span>Modifier les notes</span>
                  </button>
                </div>
              </div>
            )}
            </CollapsibleSection>
          )}

          {/* Notes vocales — promoted out of a collapsed panel in the right
              column to a first-class, always-expanded section right under
              the written notes. Voice is the fastest input on a site; it
              was previously two taps and a scroll away, which is the wrong
              cost for the thing you reach for with gloves on. */}
          {visitId && (
            <Section title="Notes vocales">
              <Card className="p-4">
                <VoiceNotesSection key={voiceNotesKey} visitId={visitId} bare />
              </Card>
            </Section>
          )}

          {/* Photos Grid — stays always visible, this is core content */}
          <div className="bg-surface rounded-xl border border-line p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Camera size={18} className="text-muted" />
                Photos ({visit?.photos.length})
              </h2>
              {visit && visit.photos.length > 0 && projectRole.canCreateIssues && (
                <button
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setSelectedPhotoIds([]);
                  }}
                  className="py-2 px-3 bg-subtle text-ink rounded-lg hover:bg-line transition-colors text-sm font-medium min-h-[44px]"
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
                          <label className="text-xs font-medium text-body mb-2 flex items-center gap-1">
                            <Tag size={14} />
                            Filtrer par tag
                          </label>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => setSelectedTagFilter(null)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                selectedTagFilter === null
                                  ? "bg-brand-600 text-white"
                                  : "bg-subtle text-body hover:bg-line"
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
                                    ? "bg-brand-600 text-white"
                                    : "bg-subtle text-body hover:bg-line"
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
                          <label className="text-xs font-medium text-body mb-2 flex items-center gap-1">
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
                <span className="text-sm text-ink font-medium">
                  {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? "s" : ""}{" "}
                  sélectionnée{selectedPhotoIds.length !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  {projectRole.canCreateIssues && (
                    <button
                      onClick={handleCreateIssueFromPhotos}
                      className="py-2 px-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
                    >
                      <AlertCircle size={16} />
                      Créer déficience
                    </button>
                  )}
                  <button
                    onClick={() => setShowDeletePhotosConfirm(true)}
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
                      className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-subtle ${isSelected ? "ring-2 ring-brand-600" : ""}`}
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
                                className="px-2 py-0.5 bg-surface/90 text-ink rounded text-xs"
                              >
                                {tag}
                              </span>
                            ))}
                            {photo.tags.length > 2 && (
                              <span className="px-2 py-0.5 bg-surface/90 text-ink rounded text-xs">
                                +{photo.tags.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {isSelectionMode && canManagePhoto(projectRole, photo.user_id) && (
                        <div
                          className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${isSelected ? "bg-brand-600 border-brand-600" : "bg-surface/90 border-line-strong"}`}
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

          {/* Observations — the factual record of the visit. Sits above
              déficiences because that mirrors the report, where OBSERVATIONS
              ET ACTIONS carries the observations first and the déficiences
              follow under a sub-heading. */}
          {projectId && visitId && (
            <ObservationsSection
              projectId={projectId}
              visitId={visitId}
              canEdit={projectRole.canCreateIssues}
            />
          )}

          {/* Deficiences — stays always visible (core content), but each row
              is now a single compact line instead of a large card. Same
              fields as before (title, description, priority, status, linked
              photos, assignee), just condensed. */}
          <div className="bg-surface rounded-xl border border-line p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <AlertCircle size={18} className="text-muted" />
                Déficiences ({issues.length})
              </h2>
              {projectRole.canCreateIssues && (
                <button
                  onClick={handleCreateIssue}
                  className="py-2.5 px-4 bg-subtle text-ink rounded-lg hover:bg-line transition-colors font-medium flex items-center gap-2 min-h-[44px]"
                >
                  <Edit size={16} />
                  <span>Ajouter une déficience</span>
                </button>
              )}
            </div>

            {issues.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">
                Aucune déficience pour cette visite.
              </p>
            ) : (
              <div className="space-y-1.5">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    onClick={() =>
                      navigate(`/app/projects/${projectId}/visits/${visitId}/issues/${issue.id}`)
                    }
                    className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-lg cursor-pointer hover:bg-subtle transition-colors min-h-[44px]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-ink truncate">
                          {issue.title}
                        </span>
                        <PriorityBadge priority={issue.priority} />
                        <StatusBadge status={issue.status} />
                      </div>
                      {(issue.description || issue.assignedTo) && (
                        <div className="text-xs text-muted truncate mt-0.5">
                          {issue.description}
                          {issue.description && issue.assignedTo ? " · " : ""}
                          {issue.assignedTo}
                        </div>
                      )}
                    </div>

                    {/* Linked Photos — small thumbnails instead of a full row */}
                    {issue.photos && issue.photos.length > 0 && (
                      <div className="flex gap-1 flex-shrink-0">
                        {issue.photos.slice(0, 2).map((photo) => {
                          const fullPhoto = visit?.photos.find((p) => p.id === photo.id);
                          return (
                            <div
                              key={photo.id}
                              className="w-8 h-8 rounded overflow-hidden flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (fullPhoto) setSelectedPhoto(fullPhoto);
                              }}
                            >
                              <SecureImage
                                storagePath={photo.storagePath}
                                alt="Photo de la déficience"
                                className="w-full h-full object-cover cursor-pointer"
                              />
                            </div>
                          );
                        })}
                        {issue.photos.length > 2 && (
                          <div className="w-8 h-8 rounded bg-subtle flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-medium text-body">
                              +{issue.photos.length - 2}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {canEditIssue(projectRole, issue.createdBy) && (
                      <button
                        onClick={(e) => handleEditIssue(issue, e)}
                        className="w-11 h-11 flex items-center justify-center text-faint hover:text-ink flex-shrink-0"
                        title="Modifier"
                      >
                        <Edit size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <VisitComments
            visitId={visitId || ""}
            projectId={projectId || ""}
            visitCreatedBy={visit?.createdBy}
          />

          </div>

          <div className="space-y-3">
          {/* Quick Actions */}
          <div className="bg-surface rounded-xl border border-line p-4">
            <h2 className="text-sm font-semibold text-ink mb-3">Actions rapides</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate(`/app/projects/${projectId}/report`)}
                className="py-3 px-4 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                <FileText size={18} />
                <span className="text-sm font-medium">Générer rapport</span>
              </button>
              {projectRole.canUploadPhotos && (
                <button
                  onClick={() => navigate(`/app/projects/${projectId}/visits/${visitId}/add-photos`)}
                  className="py-3 px-4 bg-subtle text-ink rounded-lg hover:bg-line transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <Camera size={18} />
                  <span className="text-sm font-medium">Ajouter photos</span>
                </button>
              )}
            </div>
          </div>

          {/* Plans — collapsed by default; not needed on every visit and the
              file manager itself is a fair amount of content. Hidden
              entirely while PLANS_ENABLED is off (see featureFlags.ts). */}
          {PLANS_ENABLED && projectId && (
            <CollapsibleSection title="Plans" icon={<LayoutGrid size={16} className="text-muted" />}>
              <PlanFilesManager projectId={projectId} visitId={visitId} />
            </CollapsibleSection>
          )}

          </div>
        </div>
      </div>

      {visitId && (
        <VoiceRecorderModal
          open={showVoiceRecorder}
          visitId={visitId}
          onClose={() => setShowVoiceRecorder(false)}
          onSaved={() => setVoiceNotesKey((k) => k + 1)}
        />
      )}

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
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg flex items-center gap-2 text-white transition-colors font-medium"
                title="Annoter"
              >
                <Pencil size={18} />
                Annoter
              </button>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-10 h-10 bg-surface/10 hover:bg-surface/20 rounded-full flex items-center justify-center text-white transition-colors"
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
                    className="px-3 py-1.5 bg-surface/90 text-ink rounded-lg text-sm font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Creation/Edition Modal — hosts the shared IssueForm, same
          canonical create/edit surface as IssueDetail. Comments aren't
          shown here (IssueForm doesn't own them); they're one tap away via
          the full issue page. */}
      {showIssueModal && visitId && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowIssueModal(false)}
        >
          <div
            className="relative max-w-2xl w-full bg-surface rounded-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIssueModal(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-subtle hover:bg-line-strong rounded-full flex items-center justify-center text-body transition-colors z-10"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold text-ink mb-6">
              {editingIssue ? "Modifier la déficience" : "Nouvelle déficience"}
            </h2>
            <IssueForm
              projectId={projectId || ""}
              visitId={visitId}
              issue={editingIssue}
              initialPhotos={initialIssuePhotos}
              onSaved={handleIssueSaved}
              onCancel={() => {
                setShowIssueModal(false);
                setInitialIssuePhotos([]);
              }}
            />
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

      <ConfirmDialog
        open={showDeletePhotosConfirm}
        title={`Supprimer ${selectedPhotoIds.length} photo${selectedPhotoIds.length !== 1 ? "s" : ""} ?`}
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setShowDeletePhotosConfirm(false)}
        onConfirm={handleDeleteSelectedPhotos}
      />

      <FloatingActions
        menu={[
          ...(projectRole.canCreateIssues
            ? [{ label: "Nouvelle déficience", icon: AlertCircle, onClick: handleCreateIssue }]
            : []),
          ...(projectRole.canUploadPhotos
            ? [
                {
                  label: "Ajouter des photos",
                  icon: Camera,
                  onClick: () =>
                    navigate(`/app/projects/${projectId}/visits/${visitId}/add-photos`),
                },
                {
                  label: "Enregistrer une note vocale",
                  icon: Mic,
                  onClick: () => setShowVoiceRecorder(true),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
