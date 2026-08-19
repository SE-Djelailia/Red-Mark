import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Camera,
  Tag,
  MapPin,
  FileText,
  Edit,
  Trash2,
  Cloud,
  Thermometer,
  AlertCircle,
  Pencil,
  LayoutGrid,
  Mic,
  ChevronRight,
} from "lucide-react";
import { getLocations, type Location } from "../../lib/locationsApi";
import type { LocationExtras, Photo as ApiPhoto } from "../../lib/supabase";
import PhotoMetadataEditor, { type EditablePhoto } from "./PhotoMetadataEditor";
import { indexLocations, resolvePhotoZone, locationLabel } from "../../lib/photoZone";
import {
  getSiteVisit,
  getProject,
  getPhotos,
  updateSiteVisit,
  deletePhoto,
  saveAnnotatedPhoto,
} from "../../lib/supabaseApi";
import { getIssuesByVisit, type Issue } from "../../lib/issuesApi";
import type { VisitAttendee } from "../../lib/supabase";
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
import {
  useProjectRole,
  canEditIssue,
  canManagePhoto,
  canEditPhotoMetadata,
} from "../../hooks/useProjectRole";
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
import VisitAttendeesSection from "./VisitAttendeesSection";

interface Photo {
  id: string;
  url: string; // Deprecated - kept for compatibility
  storage_path: string; // Secure storage path for signed URLs
  user_id: string; // Uploader, used for per-photo manage permission
  tags?: string[];
  // The link to an imported local, written by the structured picker. Photos
  // predating it have null here and carry free text in `location` instead —
  // resolvePhotoZone prefers this and falls back to that.
  location_id?: string | null;
  location?: LocationExtras | null;
}

interface VisitDisplay {
  id: string;
  date: string;
  phase: string;
  tags: string[];
  photoCount: number;
  notes: string;
  photos: Photo[];
  // Nullable, not optional: both columns are nullable in the schema and the
  // API hands the raw value straight through. Every consumer below already
  // tests truthiness, so this is the annotation catching up to the data.
  weather?: string | null;
  temperature?: string | null;
  createdBy: string;
  attendees: VisitAttendee[];
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
  // The project's imported locations, purely to turn a photo's location_id
  // into a readable zone. Optional context: a failure degrades to the legacy
  // free-text label rather than hiding the photos.
  const [locations, setLocations] = useState<Location[]>([]);
  const [projectName, setProjectName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingWeatherPhoto, setUploadingWeatherPhoto] = useState(false);

  // Photos currently open in the metadata editor. Empty = closed; one entry
  // is single mode, several is bulk.
  const [editingPhotos, setEditingPhotos] = useState<EditablePhoto[]>([]);

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
          location_id: p.location_id,
          location: p.location || undefined,
        })),
        weather: apiVisit.weather,
        temperature: apiVisit.temperature,
        createdBy: apiVisit.user_id,
        // Null on visits saved before the column existed.
        attendees: apiVisit.attendees ?? [],
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
    if (!visitId) return;
    // Notes are optional, so an empty value is a legitimate save — it is how
    // you clear notes that were entered by mistake.
    const next = editedNotes.trim();
    try {
      await updateSiteVisit(visitId, { notes: next });
      setVisit((prevVisit) => (prevVisit ? { ...prevVisit, notes: next } : prevVisit));
      setIsEditingNotes(false);
      alert("Notes sauvegardées!");
    } catch (error) {
      console.error("Error saving notes:", error);
      alert("Erreur lors de la sauvegarde des notes");
    }
  };

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getLocations(projectId)
      .then((locs) => {
        if (!cancelled) setLocations(locs);
      })
      .catch((e) => console.error("Error loading locations for visit photos:", e));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Rebuilt only when the locations list changes, not per photo per render.
  const locationsById = useMemo(() => indexLocations(locations), [locations]);

  // Locations documented in THIS visit, derived from the photos and
  // déficiences the page already holds — no extra query.
  //
  // Counts location_id ONLY. A photo carrying legacy free text has no link
  // to any locations row, so there is nothing to navigate to; including it
  // would produce a dead entry.
  //
  // A location_id that isn't in `locations` (deleted, or the list hasn't
  // resolved) is skipped rather than listed as a nameless row — unlike the
  // visit list on the location page, here the label IS the destination.
  const locationsInVisit = useMemo(() => {
    const byLocation = new Map<string, { photos: number; issues: number }>();
    const bump = (locationId: string | null | undefined, key: "photos" | "issues") => {
      if (!locationId || !locationsById.has(locationId)) return;
      const entry = byLocation.get(locationId) ?? { photos: 0, issues: 0 };
      entry[key] += 1;
      byLocation.set(locationId, entry);
    };
    for (const p of visit?.photos ?? []) bump(p.location_id, "photos");
    for (const i of issues) bump(i.locationId, "issues");

    return [...byLocation.entries()]
      .map(([locationId, counts]) => ({
        locationId,
        label: locationLabel(locationsById.get(locationId)!),
        ...counts,
      }))
      // By local number, so the list reads in the same order as the plan and
      // the Locaux tab rather than in whatever order photos were taken.
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
  }, [visit?.photos, issues, locationsById]);

  // Patch the visit's photo list in place so the grid badge, the filter and
  // the lightbox all reflect the edit immediately. Refetching the whole
  // visit would work too but would blank the grid for a beat.
  const handleMetadataSaved = (updated: ApiPhoto[]) => {
    const byId = new Map(updated.map((u) => [u.id, u]));
    setVisit((prev) =>
      prev
        ? {
            ...prev,
            photos: prev.photos.map((p) => {
              const u = byId.get(p.id);
              return u
                ? {
                    ...p,
                    location_id: u.location_id,
                    location: u.location ?? undefined,
                    tags: u.tags || [],
                  }
                : p;
            }),
          }
        : prev,
    );
    setSelectedPhoto((prev) => {
      const u = prev ? byId.get(prev.id) : undefined;
      return u && prev
        ? { ...prev, location_id: u.location_id, location: u.location ?? undefined, tags: u.tags || [] }
        : prev;
    });
    setIsSelectionMode(false);
    setSelectedPhotoIds([]);
  };

  const projectRole = useProjectRole(projectId);

  // Mirrors the site_visits "Creator can update their visits" RLS policy.
  // Anything that writes to the visit row itself — notes, attendees — has to
  // be gated on this, or an editor who didn't create the visit is offered a
  // button the database will refuse.
  const canEditVisit = !!user?.id && !!visit && user.id === visit.createdBy;

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
          locationId: p.location_id ?? null,
          description: null,
          tags: p.tags || [],
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
              className="px-4 h-11 bg-subtle text-ink rounded-[4px] hover:bg-line text-sm font-medium min-h-[44px]"
            >
              Retour
            </button>
            <button
              onClick={() => fetchData()}
              className="px-4 h-11 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 text-sm font-medium min-h-[44px]"
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
            {/* Same destination as "Générer rapport" in Actions rapides, with
                this visit pre-selected. There is no share feature, so no
                share control here. */}
            <button
              onClick={() => navigate(`/app/projects/${projectId}/report?visit=${visitId}`)}
              className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle rounded-[4px] transition-colors"
              title="Générer le rapport"
              aria-label="Générer le rapport"
            >
              <FileText size={18} />
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
        <div className="bg-surface rounded-[4px] border border-line px-4 py-3">
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
                  className="w-full px-4 py-3 border border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent resize-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsEditingNotes(false);
                      setEditedNotes(visit?.notes || "");
                    }}
                    className="flex-1 py-2.5 bg-subtle text-ink rounded-[4px] hover:bg-line-strong transition-colors font-medium min-h-[44px]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveNotes}
                    className="flex-1 py-2.5 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {visit?.notes?.trim() ? (
                  <p className="text-sm text-body leading-relaxed mb-4">{visit.notes}</p>
                ) : (
                  <p className="text-sm text-muted italic mb-4">
                    Aucune note pour cette visite.
                  </p>
                )}
                {canEditVisit && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setIsEditingNotes(true);
                        setEditedNotes(visit?.notes || "");
                      }}
                      className="py-2.5 px-4 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors font-medium flex items-center gap-2 min-h-[44px]"
                    >
                      <Edit size={16} />
                      <span>{visit?.notes?.trim() ? "Modifier les notes" : "Ajouter des notes"}</span>
                    </button>
                  </div>
                )}
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

          {/* Assistaient — who was on site. Lives on the visit, not on the
              report form: the same list should appear on every report
              generated from this visit. Gated on the visit's creator because
              that is exactly what the "Creator can update their visits" RLS
              policy allows — offering it more widely would surface a save
              the database refuses. */}
          {visitId && visit && (
            <Section title="Assistaient">
              <Card className="p-4">
                <VisitAttendeesSection
                  visitId={visitId}
                  attendees={visit.attendees}
                  canEdit={canEditVisit}
                  onChanged={(attendees) =>
                    setVisit((prev) => (prev ? { ...prev, attendees } : prev))
                  }
                />
              </Card>
            </Section>
          )}

          {/* Photos Grid — stays always visible, this is core content */}
          <div className="bg-surface rounded-[4px] border border-line p-4">
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
                  className="py-2 px-3 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors text-sm font-medium min-h-[44px]"
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
                // Distinct zone labels across the visit's photos, resolving
                // location_id first so photos taken with the structured
                // picker appear in this filter alongside legacy ones.
                const allLocations = Array.from(
                  new Set(
                    visit.photos
                      .map((p) => resolvePhotoZone(p, locationsById))
                      .filter((z): z is string => !!z),
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
                              className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                                selectedTagFilter === null
                                  ? "bg-ink text-white"
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
                                className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                                  selectedTagFilter === tag
                                    ? "bg-ink text-white"
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
                              className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                                selectedLocationFilter === null
                                  ? "bg-ink text-white"
                                  : "bg-subtle text-body hover:bg-subtle"
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
                                className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
                                  selectedLocationFilter === location
                                    ? "bg-ink text-white"
                                    : "bg-subtle text-body hover:bg-subtle"
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
              <div className="mb-3 flex items-center justify-between bg-subtle border border-line-strong p-3 rounded-[4px]">
                <span className="text-sm text-ink font-medium">
                  {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? "s" : ""}{" "}
                  sélectionnée{selectedPhotoIds.length !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  {canEditPhotoMetadata(projectRole) && (
                    <button
                      onClick={() =>
                        setEditingPhotos(
                          (visit?.photos ?? [])
                            .filter((p) => selectedPhotoIds.includes(p.id))
                            // description omitted deliberately: bulk mode
                            // does not edit it, and the local view-model
                            // does not carry it.
                            .map((p) => ({
                              id: p.id,
                              location_id: p.location_id,
                              tags: p.tags,
                            })),
                        )
                      }
                      className="py-2 px-3 bg-subtle hover:bg-line text-ink rounded-[4px] transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
                    >
                      <MapPin size={16} />
                      Modifier le local
                    </button>
                  )}
                  {projectRole.canCreateIssues && (
                    <button
                      onClick={handleCreateIssueFromPhotos}
                      className="py-2 px-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
                    >
                      <AlertCircle size={16} />
                      Créer déficience
                    </button>
                  )}
                  <button
                    onClick={() => setShowDeletePhotosConfirm(true)}
                    className="py-2 px-3 bg-surface border border-ink text-ink rounded-[4px] hover:bg-subtle transition-colors text-sm font-medium flex items-center gap-2 min-h-[44px]"
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
                  // Filter by location. MUST resolve the same way the option
                  // list above does — if the options came from location_id
                  // and the match only looked at free text, selecting a zone
                  // would return nothing.
                  if (selectedLocationFilter) {
                    if (resolvePhotoZone(photo, locationsById) !== selectedLocationFilter) {
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
                      className={`relative aspect-square rounded-[4px] overflow-hidden cursor-pointer group bg-subtle ${isSelected ? "ring-2 ring-ink" : ""}`}
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
                      {resolvePhotoZone(photo, locationsById) && (
                        <div className="absolute top-2 left-2 max-w-[calc(100%-1rem)]">
                          <div className="px-2 py-1 bg-ink text-white rounded text-xs font-bold flex items-center gap-1 shadow-lg">
                            <MapPin size={12} className="flex-shrink-0" />
                            <span className="truncate">
                              {resolvePhotoZone(photo, locationsById)}
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
                          className={`absolute top-2 left-2 w-7 h-7 rounded-[2px] flex items-center justify-center border-2 transition-all ${isSelected ? "bg-ink border-ink" : "bg-surface/90 border-line-strong"}`}
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
          {locationsInVisit.length > 0 && (
            <div className="bg-surface rounded-[4px] border border-line p-4">
              <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <MapPin size={18} className="text-muted" />
                Emplacements documentés
                <span className="text-muted font-normal">({locationsInVisit.length})</span>
              </h2>
              <div className="-mx-4 -mb-4 border-t border-line">
                {locationsInVisit.map((l) => (
                  <button
                    key={l.locationId}
                    onClick={() =>
                      navigate(`/app/projects/${projectId}/locations/${l.locationId}`)
                    }
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-line last:border-b-0 hover:bg-subtle transition-colors min-h-[44px] text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{l.label}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {[
                          l.photos > 0 && `${l.photos} photo${l.photos !== 1 ? "s" : ""}`,
                          l.issues > 0 && `${l.issues} déficience${l.issues !== 1 ? "s" : ""}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-faint flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-surface rounded-[4px] border border-line p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <AlertCircle size={18} className="text-muted" />
                Déficiences ({issues.length})
              </h2>
              {projectRole.canCreateIssues && (
                <button
                  onClick={handleCreateIssue}
                  className="py-2.5 px-4 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors font-medium flex items-center gap-2 min-h-[44px]"
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
                    className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-[4px] cursor-pointer hover:bg-subtle transition-colors min-h-[44px]"
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
          <div className="bg-surface rounded-[4px] border border-line p-4">
            <h2 className="text-sm font-semibold text-ink mb-3">Actions rapides</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate(`/app/projects/${projectId}/report?visit=${visitId}`)}
                className="py-3 px-4 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                <FileText size={18} />
                <span className="text-sm font-medium">Générer rapport</span>
              </button>
              {projectRole.canUploadPhotos && (
                <button
                  onClick={() => navigate(`/app/projects/${projectId}/visits/${visitId}/add-photos`)}
                  className="py-3 px-4 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors flex items-center justify-center gap-2 min-h-[48px]"
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
              {canEditPhotoMetadata(projectRole) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingPhotos([selectedPhoto]);
                  }}
                  className="px-4 py-2 bg-surface/10 hover:bg-surface/20 rounded-[4px] flex items-center gap-2 text-white transition-colors font-medium"
                  title="Modifier"
                >
                  <MapPin size={18} />
                  Modifier
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenAnnotator(selectedPhoto);
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-[4px] flex items-center gap-2 text-white transition-colors font-medium"
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
              className="w-full h-auto rounded-[4px]"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Location badge in fullscreen */}
            {resolvePhotoZone(selectedPhoto, locationsById) && (
              <div className="absolute top-4 left-4 max-w-[calc(100%-2rem)]">
                <div className="px-4 py-2 bg-ink text-white rounded-[4px] text-sm font-bold flex items-center gap-2 shadow-xl">
                  <MapPin size={18} className="flex-shrink-0" />
                  <span className="truncate">
                    {resolvePhotoZone(selectedPhoto, locationsById)}
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
                    className="px-3 py-1.5 bg-surface/90 text-ink rounded-[4px] text-sm font-medium"
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
            className="relative max-w-2xl w-full bg-surface rounded-[4px] p-6 max-h-[90vh] overflow-y-auto"
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

      {editingPhotos.length > 0 && projectId && (
        <PhotoMetadataEditor
          open
          photos={editingPhotos}
          projectId={projectId}
          onCancel={() => setEditingPhotos([])}
          onSaved={handleMetadataSaved}
        />
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
