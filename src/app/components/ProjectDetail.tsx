import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { getRlsErrorMessage } from "../../lib/rlsErrors";
import { toast } from "sonner";
import {
  ArrowLeft,
  Share2,
  FileText,
  Calendar,
  Camera,
  MapPin,
  User,
  Users,
  Tag,
  Search,
  X,
  Plus,
  MessageSquare,
  Pencil,
  Image as ImageIcon,
  AlertCircle,
  Upload,
  ChevronDown,
  ChevronUp,
  Mic,
} from "lucide-react";
import { VisitCardSkeleton, PhotoGridSkeleton, CommentSkeleton } from "./LoadingStates";
import {
  getSiteVisitsPage,
  getVisitsCount,
  getVisitPhasesInUse,
  getProject,
  getPhotosByProject,
  getPhotosCount,
  getPhotosSignedUrls,
  saveAnnotatedPhoto,
  type ProjectGalleryPhotoRow,
  type SiteVisitPageFilters,
} from "../../lib/supabaseApi";
import VisitCard from "./VisitCard";
import ProjectVisitCalendar from "./ProjectVisitCalendar";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole, canEditPhotoMetadata } from "../../hooks/useProjectRole";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useSmartBack } from "../../hooks/useSmartBack";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { getIssuesByProject, getVisitIdsWithOpenIssues } from "../../lib/issuesApi";
import { parseLocalDate } from "../../lib/dateUtils";
import { PhotoAnnotator } from "./PhotoAnnotator";
import ProjectMembersModal from "./ProjectMembersModal";
import ProjectForm from "./ProjectForm";
import PlanFilesManager from "./PlanFilesManager";
import LocationsImportModal from "./LocationsImportModal";
import LocationsTab from "./LocationsTab";
import FloatingActions from "./FloatingActions";
import VisitPicker from "./VisitPicker";
import VoiceRecorderModal from "./VoiceRecorderModal";
import { getLocations, getLevels, type Location, type Level } from "../../lib/locationsApi";
import { PLANS_ENABLED } from "../../lib/featureFlags";
import type { IssueStatus } from "../../lib/issueStatus";
import IssuesTab from "./IssuesTab";
import PhotoMetadataEditor, { type EditablePhoto } from "./PhotoMetadataEditor";
import { IconPhoto, IconVisit } from "./ui-kit/RedMarkIcons";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: IssueStatus;
  statusChangedAt?: string | null;
  discipline?: string;
  dueDate?: string | null;
  createdAt?: string;
  assignedTo: string;
  createdBy: string;
  createdDate: string;
  photos: { id: string; url: string; storagePath?: string }[];
  tags?: string[];
  location: string;
  locationId?: string | null;
}

interface SiteVisit {
  id: string;
  date: string;
  phase: string;
  authorName: string;
  // room/tags/photoCount/notes/photos below are always dummy defaults now —
  // the compact Visits list (VisitCard.tsx) doesn't show them, and neither
  // getSiteVisitsPage nor this component's mapping populates them
  // meaningfully anymore. Kept on the type only because the (currently
  // unreachable — see the dead "Visit Detail Modal" below) selectedVisit
  // state still reads them.
  room: string;
  tags: string[];
  photoCount: number;
  notes: string;
  // storage_path matches what the photo lightbox requires, so this grid
  // can open a photo that is fully annotatable. It was the lighter shape
  // here that originally justified gating the annotate button — the gate
  // then wrongly applied to the Gallery tab too. If this modal is ever
  // revived, whatever populates it must supply the path.
  photos: { id: string; url: string; tags: string[]; storage_path: string }[];
}

interface Comment {
  id: string;
  author: string;
  date: string;
  text: string;
  visitId?: string;
}

// Shared by the initial fetch and "load more" — both page through
// getSiteVisitsPage the same way. `any` here rather than fighting the raw
// DB row type: same pre-existing hand-written-type-vs-raw-row mismatch as
// the rest of this file (see e.g. supabaseApi.ts's SiteVisit/Photo/Issue
// interfaces not matching generated DB types), not something new.
/** "fondation" -> "Fondation". Tolerates null/empty: site_visits.phase is a
 *  nullable column, and this runs over every visit in the list, so one row
 *  saved without a phase used to take out the whole Visites tab. */
function capitalizePhase(phase: unknown): string {
  if (typeof phase !== "string" || phase.length === 0) return "—";
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function mapVisitRow(visit: any): SiteVisit {
  return {
    id: visit.id,
    date: visit.visit_date,
    phase: capitalizePhase(visit.phase),
    authorName: visit.authorName,
    // Dead-code compat only — see SiteVisit's comment.
    room: "",
    tags: [],
    photoCount: 0,
    notes: visit.notes || "",
    photos: [],
  };
}

type MainTab = "visits" | "issues" | "photos" | "plans" | "locations";

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const goBack = useSmartBack("/app/projects");
  const { user, loading: authLoading } = useAuth();
  const projectRole = useProjectRole(id);

  // Tab/sub-tab state lives in the URL (not local state) so that
  // useSmartBack's navigate(-1) — which returns to whatever history entry
  // this page already had — naturally restores the tab the user was on,
  // instead of remounting back to the "visits" default. `replace: true`
  // updates the current history entry in place rather than pushing a new
  // one per tab click, so the back button still only takes one press to
  // actually leave the page.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");

  // The old "gallery" tab held Photos and Déficiences as sub-tabs; both are
  // now top-level. Those URLs still live in the back/forward history of any
  // session that was open across the change, and in any bookmark, so they
  // are translated rather than left to fall through to a tab that renders
  // nothing. The ?sub= value is honoured too, so a back-nav that was on
  // gallery/issues returns to Déficiences rather than dumping the user on
  // Photos. This can be deleted once those histories have aged out.
  const migrateLegacyTab = (tab: string | null): MainTab => {
    if (tab === "gallery") return searchParams.get("sub") === "issues" ? "issues" : "photos";
    return (tab as MainTab) || "visits";
  };

  const requestedTab = migrateLegacyTab(rawTab);
  // Falls back to "visits" if a stale/typed-in URL asks for the Plans tab
  // while the feature is flagged off, rather than rendering an empty tab
  // with no way to reach it from the tab bar.
  const activeTab: MainTab = requestedTab === "plans" && !PLANS_ENABLED ? "visits" : requestedTab;

  const setActiveTab = (tab: MainTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        // "sub" only ever belonged to the old gallery tab. Drop it so a
        // migrated URL doesn't carry a dead param forward.
        next.delete("sub");
        return next;
      },
      { replace: true },
    );
  };

  // Visits tab's List/Calendar toggle and visible calendar month — same
  // URL-state reasoning as tab/sub above, so navigating to a visit from the
  // calendar and back restores both the view mode and the month.
  const visitsView: "list" | "calendar" =
    searchParams.get("view") === "calendar" ? "calendar" : "list";
  const visitsMonthParam = searchParams.get("month"); // "YYYY-MM"
  const visitsMonth =
    visitsMonthParam && /^\d{4}-\d{2}$/.test(visitsMonthParam)
      ? new Date(Number(visitsMonthParam.slice(0, 4)), Number(visitsMonthParam.slice(5, 7)) - 1, 1)
      : new Date();

  const setVisitsView = (view: "list" | "calendar") => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view === "calendar") next.set("view", "calendar");
        else next.delete("view");
        return next;
      },
      { replace: true },
    );
  };

  const setVisitsMonth = (month: Date) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const ym = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
        next.set("month", ym);
        return next;
      },
      { replace: true },
    );
  };

  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showLocationsImportModal, setShowLocationsImportModal] = useState(false);
  // "Nouvelle déficience" from the floating-actions menu has no visit in
  // context yet (unlike VisitDetail/LocationDetail) — VisitPicker resolves
  // one, then we hand off to VisitDetail's own issue-creation modal via
  // ?action=new-issue rather than duplicating IssueForm hosting here.
  const [showVisitPickerForIssue, setShowVisitPickerForIssue] = useState(false);
  // Same reasoning for "Ajouter des photos" from the Photos tab: a photo
  // needs a visit_id, so the picker resolves one and we hand off to the
  // existing per-visit upload page.
  const [showVisitPickerForPhotos, setShowVisitPickerForPhotos] = useState(false);
  // Voice notes belong to a visit too, so the "+" entry resolves one through
  // VisitPicker first — same two-step as photos and déficiences. The picked
  // visit id is then handed straight to the recorder modal.
  const [showVisitPickerForVoice, setShowVisitPickerForVoice] = useState(false);
  const [voiceRecorderVisitId, setVoiceRecorderVisitId] = useState<string | null>(null);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showAnnotator, setShowAnnotator] = useState(false);
  // storage_path and visit_id are carried so the annotator can save without
  // a second fetch — PhotoAnnotator resolves its own signed URL from the
  // path, and saveAnnotatedPhoto needs the visit to build the new path.
  // storage_path is REQUIRED, not optional: annotation is a universal photo
  // action, so any surface that can open a photo must supply enough to
  // annotate it. Making it required means a future photo grid that forgets
  // the field is a compile error rather than a silently greyed-out button —
  // which is exactly how the Photos tab regressed.
  const [selectedPhoto, setSelectedPhoto] = useState<{
    id: string;
    url: string;
    tags: string[];
    date?: string;
    phase?: string;
    storage_path: string;
    visit_id?: string;
    // Carried so the metadata editor opens PRE-FILLED with the photo's
    // current local and caption rather than blank, which would read as
    // "no local set" and invite the user to overwrite a good value.
    location_id?: string | null;
    description?: string | null;
  } | null>(null);
  const [editingPhotos, setEditingPhotos] = useState<EditablePhoto[]>([]);
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [isLoadingVisits, setIsLoadingVisits] = useState(true);
  const [visitsHasMore, setVisitsHasMore] = useState(false);
  const [loadingMoreVisits, setLoadingMoreVisits] = useState(false);
  const [totalVisitsCount, setTotalVisitsCount] = useState(0);
  const VISITS_PAGE_SIZE = 20;

  // Visits list filters — all server-side (see supabaseApi.ts's
  // getSiteVisitsPage), so they compose correctly with pagination instead
  // of only filtering whatever page happens to be loaded.
  const [visitPhaseFilter, setVisitPhaseFilter] = useState("");
  const [visitDateFrom, setVisitDateFrom] = useState("");
  const [visitDateTo, setVisitDateTo] = useState("");
  const [visitOpenIssuesOnly, setVisitOpenIssuesOnly] = useState(false);
  const [visitPhasesInUse, setVisitPhasesInUse] = useState<string[]>([]);
  // Resolved lazily the first time the open-issues toggle is turned on, not
  // on every render — see toggleVisitOpenIssuesOnly below.
  const [openIssueVisitIds, setOpenIssueVisitIds] = useState<Set<string> | null>(null);

  // Gallery tab's own state — no longer derived from siteVisits (see
  // VisitCard.tsx's comment: visits are paginated and no longer carry every
  // photo eagerly). Loaded lazily, the first time the Gallery/Photos tab is
  // actually opened, same pattern as the Locations tab below.
  const [galleryPhotos, setGalleryPhotos] = useState<ProjectGalleryPhotoRow[]>([]);
  const [galleryPhotoUrls, setGalleryPhotoUrls] = useState<Record<string, string>>({});
  const [loadingGalleryPhotos, setLoadingGalleryPhotos] = useState(false);
  const [galleryPhotosLoadError, setGalleryPhotosLoadError] = useState<string | null>(null);
  const [issuesLoadError, setIssuesLoadError] = useState<string | null>(null);
  const [galleryPhotosFetchStarted, setGalleryPhotosFetchStarted] = useState(false);
  const [totalPhotosCount, setTotalPhotosCount] = useState(0);
  useModalOpen(showCommentModal);
  useModalOpen(!!selectedPhoto && !showAnnotator);
  useModalOpen(showVisitModal && !!selectedVisit);
  useModalOpen(showLocationsImportModal);
  useModalOpen(showVisitPickerForIssue);
  useModalOpen(showVisitPickerForPhotos);
  useModalOpen(showVisitPickerForVoice);

  // Photo filter states
  const [photoSearchQuery, setPhotoSearchQuery] = useState("");
  const [selectedPhotoTags, setSelectedPhotoTags] = useState<string[]>([]);
  const [selectedPhotoPhase, setSelectedPhotoPhase] = useState<string>("");
  const [showPhotoFilters, setShowPhotoFilters] = useState(false);

  const [issues, setIssues] = useState<Issue[]>([]);

  // Shared by the Locations tab and the Issues sub-tab's location filter —
  // loaded once, lazily, the first time either is actually visited (not on
  // every project visit), so users who never look at locations pay nothing.
  const [locations, setLocations] = useState<Location[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationsLoadError, setLocationsLoadError] = useState<string | null>(null);
  const [locationsFetchStarted, setLocationsFetchStarted] = useState(false);

  // Project state
  const [project, setProject] = useState<any>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);

  // Edit form data
  const [editFormData, setEditFormData] = useState({
    name: "",
    address: "",
    client: "",
    contractor: "",
    startDate: "",
    status: "planning" as any,
  });

  // Empty comments - will be populated from backend
  const comments: Comment[] = [];

  // Display shape for the Gallery tab, derived from its own dedicated
  // fetch (galleryPhotos + galleryPhotoUrls) — see the lazy-load effect
  // below, not from siteVisits (which no longer carries photos eagerly).
  const allPhotos = galleryPhotos.map((p) => ({
    id: p.id,
    url: galleryPhotoUrls[p.id] || "",
    tags: p.tags || [],
    date: p.site_visits?.visit_date || p.created_at || "",
    phase: p.site_visits?.phase
      ? p.site_visits.phase.charAt(0).toUpperCase() + p.site_visits.phase.slice(1)
      : "",
    // Carried through so "Annoter" works from the Photos tab. getPhotosByProject
    // selects "*", so both fields were already fetched — this mapping simply
    // dropped them, which left the lightbox's annotate button permanently
    // disabled for every photo opened from the gallery.
    storage_path: p.storage_path,
    visit_id: p.visit_id,
    location_id: p.location_id,
    description: p.description,
  }));

  // Filter photos based on search and filters
  const filteredPhotos = allPhotos.filter((photo) => {
    // Search filter
    if (photoSearchQuery.trim()) {
      const query = photoSearchQuery.toLowerCase();
      const matchesSearch =
        photo.phase.toLowerCase().includes(query) ||
        (photo.tags && photo.tags.some((tag) => tag.toLowerCase().includes(query)));
      if (!matchesSearch) return false;
    }

    // Tag filter (must have ALL selected tags)
    if (selectedPhotoTags.length > 0) {
      const hasAllTags = selectedPhotoTags.every((tag) => photo.tags && photo.tags.includes(tag));
      if (!hasAllTags) return false;
    }

    // Phase filter
    if (selectedPhotoPhase && photo.phase !== selectedPhotoPhase) {
      return false;
    }

    return true;
  });

  // Get all unique tags from all photos with counts
  const allPhotoTags = allPhotos.reduce(
    (acc, photo) => {
      if (photo.tags) {
        photo.tags.forEach((tag) => {
          acc[tag] = (acc[tag] || 0) + 1;
        });
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  // Get all unique phases from photos
  const allPhotoPhases = [...new Set(allPhotos.map((photo) => photo.phase))];

  const togglePhotoTag = (tag: string) => {
    setSelectedPhotoTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const clearPhotoFilters = () => {
    setPhotoSearchQuery("");
    setSelectedPhotoTags([]);
    setSelectedPhotoPhase("");
  };

  // Header stats, muted and secondary to déficiences — zero-value ones are
  // dropped entirely rather than shown as e.g. "0 commentaires", which read
  // as noise/broken rather than as real information.
  const secondaryStats = [
    totalVisitsCount > 0 ? `${totalVisitsCount} visite${totalVisitsCount !== 1 ? "s" : ""}` : null,
    totalPhotosCount > 0 ? `${totalPhotosCount} photo${totalPhotosCount !== 1 ? "s" : ""}` : null,
    comments.length > 0
      ? `${comments.length} commentaire${comments.length !== 1 ? "s" : ""}`
      : null,
  ].filter((s): s is string => s !== null);

  // Project name moves into the global light header; the address is the
  // most useful identifying detail to sit under it.
  usePageHeader(project?.name, project?.address || undefined);

  // Only the resolved location (locationId -> "202 — Salle mécanique") is
  // trustworthy — the free-text `location` field predates the Plans &
  // Locations feature and is often just the phantom "Zone non spécifiée"
  // fallback from the old visit-room flow, so it's not used here at all.
  // Returns null when there's no real linked location, so the caller can
  // hide the chip entirely instead of showing a phantom value.
  const resolveLocationLabel = (issue: { locationId?: string | null }): string | null => {
    if (!issue.locationId) return null;
    const loc = locations.find((l) => l.id === issue.locationId);
    return loc ? loc.locationNumber + (loc.name ? ` — ${loc.name}` : "") : null;
  };

  const fetchData = useCallback(async () => {
    // Don't fetch if still checking auth or no user
    if (authLoading) return;

    if (!user) {
      navigate("/login");
      return;
    }

    if (!id) return;

    // Project load is kept separate from visits/photos below: without a
    // project there's nothing meaningful to show at all (title, tabs,
    // every action in the header reads from it), so a failure here gets
    // its own visible, retryable error state instead of leaving the rest
    // of the page to render around a null `project`.
    setIsLoadingProject(true);
    setProjectLoadError(null);
    let proj;
    try {
      proj = await getProject(id);
      if (!proj) throw new Error("Projet introuvable.");
      setProject(proj);
    } catch (error: any) {
      console.error("❌ Error fetching project:", error);
      setProjectLoadError(error.message || "Impossible de charger le projet.");
      setIsLoadingProject(false);
      setIsLoadingVisits(false);
      return;
    }
    setIsLoadingProject(false);

    try {
      setIsLoadingVisits(true);

      // First page only (most recent 20) — photos are no longer fetched
      // eagerly here at all; each VisitCard lazy-loads its own once it's
      // actually on/near screen (see VisitCard.tsx). The total count is a
      // separate cheap query so the header stat/tab badge show the real
      // total, not just what's been paged in so far.
      const [{ visits, hasMore }, total, totalPhotos, phases] = await Promise.all([
        getSiteVisitsPage(id, { offset: 0, limit: VISITS_PAGE_SIZE }),
        getVisitsCount(id),
        getPhotosCount(id),
        getVisitPhasesInUse(id),
      ]);

      setSiteVisits(visits.map(mapVisitRow));
      setVisitsHasMore(hasMore);
      setTotalVisitsCount(total);
      setTotalPhotosCount(totalPhotos);
      setVisitPhasesInUse(phases);
    } catch (error) {
      console.error("❌ Error fetching site visits:", error);
      toast.error("Erreur lors du chargement des visites.");
    } finally {
      setIsLoadingVisits(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, authLoading, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeVisitFilters = useMemo((): SiteVisitPageFilters | undefined => {
    const f: SiteVisitPageFilters = {};
    if (visitPhaseFilter) f.phase = visitPhaseFilter;
    if (visitDateFrom) f.dateFrom = visitDateFrom;
    if (visitDateTo) f.dateTo = visitDateTo;
    if (visitOpenIssuesOnly) f.visitIds = Array.from(openIssueVisitIds || []);
    return Object.keys(f).length > 0 ? f : undefined;
  }, [visitPhaseFilter, visitDateFrom, visitDateTo, visitOpenIssuesOnly, openIssueVisitIds]);

  // Used by both "Charger plus" (reset=false) and the filter-change effect
  // below (reset=true) — kept separate from fetchData's own initial fetch
  // so filter state doesn't need to be part of fetchData's deps (that
  // effect should only re-run on id/user/auth changes).
  const loadVisits = useCallback(
    async (reset: boolean) => {
      if (!id) return;
      if (reset) setIsLoadingVisits(true);
      else setLoadingMoreVisits(true);
      try {
        const { visits, hasMore } = await getSiteVisitsPage(id, {
          offset: reset ? 0 : siteVisits.length,
          limit: VISITS_PAGE_SIZE,
          filters: activeVisitFilters,
        });
        setSiteVisits((prev) =>
          reset ? visits.map(mapVisitRow) : [...prev, ...visits.map(mapVisitRow)],
        );
        setVisitsHasMore(hasMore);
      } catch (error) {
        console.error("❌ Error fetching site visits:", error);
        toast.error("Erreur lors du chargement des visites.");
      } finally {
        if (reset) setIsLoadingVisits(false);
        else setLoadingMoreVisits(false);
      }
    },
    [id, siteVisits.length, activeVisitFilters],
  );

  // Skips the first run — the initial page is already loaded by fetchData
  // above with no filters, which is equivalent to this effect's default
  // (empty) filter state; only real filter changes should trigger a refetch.
  const isFirstVisitFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstVisitFilterRun.current) {
      isFirstVisitFilterRun.current = false;
      return;
    }
    loadVisits(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVisitFilters]);

  const toggleVisitOpenIssuesOnly = async () => {
    if (!visitOpenIssuesOnly && !openIssueVisitIds && id) {
      const ids = await getVisitIdsWithOpenIssues(id);
      setOpenIssueVisitIds(ids);
    }
    setVisitOpenIssuesOnly((v) => !v);
  };

  // Mirrors VisitDetail's handler: non-destructive save, then repoint the
  // local row so the gallery re-fetches a signed URL for the new path.
  const handleSaveAnnotation = async (photoId: string, annotatedImageBlob: Blob) => {
    const target = galleryPhotos.find((p) => p.id === photoId);
    if (!user?.id || !id || !target) {
      toast.error("Photo introuvable");
      return;
    }
    try {
      const updated = await saveAnnotatedPhoto(
        target,
        annotatedImageBlob,
        user.id,
        id,
        target.visit_id,
      );
      setGalleryPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, storage_path: updated.storage_path } : p)),
      );
      const [freshUrl] = await getPhotosSignedUrls([updated.storage_path]);
      setGalleryPhotoUrls((prev) => ({ ...prev, [photoId]: freshUrl || "" }));
      setSelectedPhoto(null);
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

  const loadGalleryPhotos = useCallback(async () => {
    if (!id) return;
    setLoadingGalleryPhotos(true);
    setGalleryPhotosLoadError(null);
    try {
      const rows = await getPhotosByProject(id);
      setGalleryPhotos(rows);
      if (rows.length > 0) {
        const urls = await getPhotosSignedUrls(rows.map((r) => r.storage_path));
        const urlMap: Record<string, string> = {};
        rows.forEach((r, i) => {
          urlMap[r.id] = urls[i] || "";
        });
        setGalleryPhotoUrls(urlMap);
      }
    } catch (error: any) {
      console.error("❌ Error loading gallery photos:", error);
      setGalleryPhotosLoadError(error.message || "Impossible de charger les photos.");
    } finally {
      setLoadingGalleryPhotos(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === "photos" && !galleryPhotosFetchStarted) {
      setGalleryPhotosFetchStarted(true);
      loadGalleryPhotos();
    }
  }, [activeTab, galleryPhotosFetchStarted, loadGalleryPhotos]);

  // Extracted so the error state has something to retry with. A failure here
  // used to log only, leaving the Déficiences tab showing "0" and an empty
  // list — indistinguishable from a site with nothing outstanding.
  const loadIssues = useCallback(async () => {
    if (!id) return;
    setIssuesLoadError(null);
    try {
      const projectIssues = await getIssuesByProject(id);
      setIssues(projectIssues);
    } catch (error: any) {
      console.error("❌ Error fetching issues:", error);
      setIssuesLoadError(
        getRlsErrorMessage(
          error,
          "Impossible de charger les déficiences.",
          "Vous n'avez pas accès aux déficiences de ce projet.",
        ),
      );
    }
  }, [id]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const loadLocationsAndLevels = useCallback(async () => {
    if (!id) return;
    setLoadingLocations(true);
    setLocationsLoadError(null);
    try {
      const [locs, lvls] = await Promise.all([getLocations(id), getLevels(id)]);
      setLocations(locs);
      setLevels(lvls);
    } catch (e: any) {
      console.error("❌ Error loading locations:", e);
      setLocationsLoadError(e.message || "Impossible de charger les locaux.");
    } finally {
      setLoadingLocations(false);
    }
  }, [id]);

  useEffect(() => {
    // The Déficiences tab needs locations too — they populate its
    // "Tous les locaux" filter, which renders empty without this fetch.
    const needsLocations = activeTab === "locations" || activeTab === "issues";
    if (needsLocations && !locationsFetchStarted) {
      setLocationsFetchStarted(true);
      loadLocationsAndLevels();
    }
  }, [activeTab, locationsFetchStarted, loadLocationsAndLevels]);

  if (projectLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="mx-auto text-brand-600 mb-3" />
          <p className="text-base text-ink font-medium mb-2">Impossible de charger ce projet</p>
          <p className="text-sm text-muted mb-6">{projectLoadError}</p>
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

  if (isLoadingProject) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted text-sm">
        Chargement…
      </div>
    );
  }

  // Contextual "+" options depend on which tab is active — an option a
  // commenter can't perform is simply left out, so the menu (or the whole
  // "+" button, if it ends up empty) reflects the role automatically.
  const floatingMenu: { label: string; icon: typeof Plus; onClick: () => void }[] = [];
  if (projectRole.canCreateIssues) {
    if (activeTab === "visits") {
      floatingMenu.push({
        label: "Nouvelle visite",
        icon: Calendar,
        onClick: () => navigate(`/app/projects/${id}/visit/new`),
      });
    } else if (activeTab === "issues") {
      floatingMenu.push({
        label: "Nouvelle déficience",
        icon: AlertCircle,
        onClick: () => setShowVisitPickerForIssue(true),
      });
    } else if (activeTab === "photos") {
      // Photos belong to a visit, same as déficiences — so this goes
      // through VisitPicker to establish one rather than uploading into
      // the project directly, which would orphan the photos.
      floatingMenu.push({
        label: "Ajouter des photos",
        icon: Camera,
        onClick: () => setShowVisitPickerForPhotos(true),
      });
    } else if (activeTab === "locations") {
      floatingMenu.push({
        label: "Importer des emplacements",
        icon: Upload,
        onClick: () => setShowLocationsImportModal(true),
      });
    }
  }

  // Deliberately outside the per-tab chain above: a voice note is the
  // fastest thing to capture on site, and which tab happens to be open is
  // not a reason to hide it.
  if (projectRole.canUploadPhotos) {
    floatingMenu.push({
      label: "Enregistrer une note vocale",
      icon: Mic,
      onClick: () => setShowVisitPickerForVoice(true),
    });
  }

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      {/* Toolbar — the dark band is gone; the project name now renders in
          the global light header via usePageHeader(). */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-3">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
          >
            <ArrowLeft size={20} />
            <span>Retour</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Initialize edit form with current project data
                if (project) {
                  setEditFormData({
                    name: project.name || "",
                    address: project.address || "",
                    client: project.client || "",
                    contractor: project.contractor || "",
                    startDate: project.startDate || "",
                    status: project.status || "planning",
                  });
                  setShowEditModal(true);
                }
              }}
              className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle rounded-[4px] transition-colors"
              title="Modifier le projet"
            >
              <Pencil size={20} />
            </button>
            <button
              onClick={() => setShowMembersModal(true)}
              className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle rounded-[4px] transition-colors"
              title="Gérer les membres"
            >
              <Users size={20} />
            </button>
            {projectRole.canCreateIssues && (
              <button
                onClick={() => setShowLocationsImportModal(true)}
                className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle rounded-[4px] transition-colors"
                title="Importer les emplacements"
              >
                <Upload size={20} />
              </button>
            )}
            {/* Goes to the real generator, which produces an actual .docx
                from the template. This used to open ReportTemplateSelector,
                which faked a 2.5s delay and alerted success without ever
                producing a file. */}
            <button
              onClick={() => navigate(`/app/projects/${id}/report`)}
              title="Générer un rapport"
              aria-label="Générer un rapport"
              className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-subtle rounded-[4px] transition-colors"
            >
              <FileText size={20} />
            </button>
          </div>
        </div>
        {/* Quick Stats — déficiences is the primary number on this screen,
            everything else is secondary/muted and hidden entirely at zero
            so it doesn't read as noise (e.g. "0 commentaires"). */}
        <div className="flex items-center justify-between gap-4 flex-wrap pb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[26px] font-semibold tracking-tight tabular-nums leading-none text-open">
              {issues.length}
            </span>
            <span className="text-xs text-muted">déficience{issues.length !== 1 ? "s" : ""}</span>
          </div>
          {secondaryStats.length > 0 && (
            <div className="text-xs text-faint">{secondaryStats.join(" · ")}</div>
          )}
        </div>
      </div>

      {/* Project Info — collapsed by default so it doesn't eat space above
          the tabs; only fields that actually have a value render when
          expanded. */}
      <div className="bg-surface border-b border-line">
        {/* Gutters match the toolbar above and the tabs below so "Détails du
            projet" stays flush with "Retour" and the tab row at every width. */}
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => setShowProjectInfo((v) => !v)}
            className="w-full flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 text-sm text-body hover:text-ink min-h-[44px]"
          >
            <span>Détails du projet</span>
            {showProjectInfo ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          {showProjectInfo && (
            /* Two columns from sm: these are short label/value pairs that
               leave most of a 1152px row empty stacked one per line. */
            <div className="px-4 sm:px-6 lg:px-8 pb-4 grid gap-2 sm:grid-cols-2 text-sm">
              {project?.address && (
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-muted mt-0.5 flex-shrink-0" />
                  <span className="text-body">{project.address}</span>
                </div>
              )}
              {project?.client && (
                <div className="flex items-center gap-3">
                  <User size={16} className="text-muted" />
                  <span className="text-muted">Client :</span>
                  <span className="text-body">{project.client}</span>
                </div>
              )}
              {(project as any)?.contractor && (
                <div className="flex items-center gap-3">
                  <Users size={16} className="text-muted" />
                  <span className="text-muted">Entrepreneur :</span>
                  <span className="text-body">{(project as any).contractor}</span>
                </div>
              )}
              {(project as any)?.sharedWith && (project as any).sharedWith.length > 0 && (
                <div className="flex items-start gap-3">
                  <Share2 size={16} className="text-muted mt-0.5" />
                  <div>
                    <span className="text-muted">Partagé avec : </span>
                    <span className="text-body">{(project as any).sharedWith.join(", ")}</span>
                  </div>
                </div>
              )}
              {!project?.address &&
                !project?.client &&
                !(project as any)?.contractor &&
                !(project as any)?.sharedWith?.length && (
                  <p className="text-faint">Aucune information</p>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-surface border-b border-line sticky top-0 z-10">
        {/* No horizontal padding below sm: the four tabs already fit a 375px
            phone exactly at flex-1 (~94px each) and padding would squeeze
            "Photos (128)". From lg they stop stretching and size to their
            labels instead, left-aligned like a normal desktop tab row. */}
        <div className="flex max-w-6xl mx-auto sm:px-6 lg:px-8">
          <button
            onClick={() => setActiveTab("visits")}
            className={`flex-1 lg:flex-none lg:px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "visits" ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            Visites ({totalVisitsCount})
            {activeTab === "visits" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("issues")}
            className={`flex-1 lg:flex-none lg:px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "issues" ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {/* Four tabs at flex-1 leave ~94px each on a 375px phone, which
                "Déficiences (12)" overruns — so it abbreviates below sm and
                spells out from sm up, where there is room. */}
            <span className="sm:hidden">Déf. ({issues.length})</span>
            <span className="hidden sm:inline">Déficiences ({issues.length})</span>
            {activeTab === "issues" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("photos")}
            className={`flex-1 lg:flex-none lg:px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "photos" ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            Photos ({totalPhotosCount})
            {activeTab === "photos" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-600" />
            )}
          </button>
          {PLANS_ENABLED && (
            <button
              onClick={() => setActiveTab("plans")}
              className={`flex-1 lg:flex-none lg:px-6 py-3 text-sm font-medium transition-colors relative ${
                activeTab === "plans" ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              Plans
              {activeTab === "plans" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-600" />
              )}
            </button>
          )}
          <button
            onClick={() => setActiveTab("locations")}
            className={`flex-1 lg:flex-none lg:px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "locations" ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            Locaux
            {activeTab === "locations" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-600" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
        {/* Visits Tab */}
        {activeTab === "visits" && (
          <div className="space-y-3">
            {/* List/Calendar toggle */}
            <div className="inline-flex rounded-[4px] border border-line-strong overflow-hidden">
              <button
                onClick={() => setVisitsView("list")}
                className={`px-4 py-2 text-sm font-medium min-h-[44px] transition-colors ${
                  visitsView === "list"
                    ? "bg-ink text-white"
                    : "bg-surface text-body hover:bg-subtle"
                }`}
              >
                Liste
              </button>
              <button
                onClick={() => setVisitsView("calendar")}
                className={`px-4 py-2 text-sm font-medium min-h-[44px] transition-colors ${
                  visitsView === "calendar"
                    ? "bg-ink text-white"
                    : "bg-surface text-body hover:bg-subtle"
                }`}
              >
                Calendrier
              </button>
            </div>

            {visitsView === "calendar" ? (
              id && (
                <ProjectVisitCalendar
                  projectId={id}
                  month={visitsMonth}
                  onMonthChange={setVisitsMonth}
                />
              )
            ) : (
              <>
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={visitPhaseFilter}
                    onChange={(e) => setVisitPhaseFilter(e.target.value)}
                    className="px-3 py-2 bg-surface border border-line-strong rounded-[4px] text-sm min-h-[44px]"
                  >
                    <option value="">Toutes les phases</option>
                    {visitPhasesInUse.map((phase) => (
                      <option key={phase} value={phase}>
                        {phase.charAt(0).toUpperCase() + phase.slice(1)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={visitDateFrom}
                    onChange={(e) => setVisitDateFrom(e.target.value)}
                    aria-label="Du"
                    className="px-3 py-2 bg-surface border border-line-strong rounded-[4px] text-sm min-h-[44px]"
                  />
                  <input
                    type="date"
                    value={visitDateTo}
                    onChange={(e) => setVisitDateTo(e.target.value)}
                    aria-label="Au"
                    className="px-3 py-2 bg-surface border border-line-strong rounded-[4px] text-sm min-h-[44px]"
                  />
                  <button
                    onClick={toggleVisitOpenIssuesOnly}
                    className={`px-3 py-2 rounded-[4px] text-sm font-medium min-h-[44px] transition-colors ${
                      visitOpenIssuesOnly
                        ? "bg-ink text-white"
                        : "bg-surface border border-line-strong text-body hover:border-brand-600"
                    }`}
                  >
                    Déficiences ouvertes
                  </button>
                  {(visitPhaseFilter || visitDateFrom || visitDateTo || visitOpenIssuesOnly) && (
                    <button
                      onClick={() => {
                        setVisitPhaseFilter("");
                        setVisitDateFrom("");
                        setVisitDateTo("");
                        setVisitOpenIssuesOnly(false);
                      }}
                      className="px-3 py-2 text-sm text-body hover:text-ink"
                    >
                      Effacer
                    </button>
                  )}
                </div>

                {isLoadingVisits ? (
                  <VisitCardSkeleton />
                ) : siteVisits.length === 0 ? (
                  <div className="text-center py-12">
                    <IconVisit size={48} className="mx-auto text-faint mb-4 lucide-display" />
                    <p className="text-muted">Aucune visite ne correspond à ces filtres.</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-surface rounded-[4px] border border-line overflow-hidden">
                      {siteVisits.map((visit) => (
                        <VisitCard
                          key={visit.id}
                          visit={visit}
                          onOpen={() => navigate(`/app/projects/${id}/visits/${visit.id}`)}
                        />
                      ))}
                    </div>
                    {visitsHasMore && (
                      <button
                        onClick={() => loadVisits(false)}
                        disabled={loadingMoreVisits}
                        className="w-full py-3 bg-surface border border-line rounded-[4px] text-sm font-medium text-ink hover:border-ink hover:text-ink disabled:opacity-50 transition-colors min-h-[48px]"
                      >
                        {loadingMoreVisits ? "Chargement…" : "Charger plus de visites"}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === "photos" && (
          <div className="space-y-4">
            {loadingGalleryPhotos ? (
              <PhotoGridSkeleton />
            ) : galleryPhotosLoadError ? (
              <div className="text-center py-12">
                <IconPhoto size={48} className="mx-auto text-faint mb-4 lucide-display" />
                <p className="text-muted mb-2">{galleryPhotosLoadError}</p>
                <button
                  onClick={loadGalleryPhotos}
                  className="text-sm text-brand-strong hover:text-brand-800 font-medium"
                >
                  Réessayer
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search and Filters */}
                <div className="space-y-3">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                    />
                    <input
                      type="text"
                      value={photoSearchQuery}
                      onChange={(e) => setPhotoSearchQuery(e.target.value)}
                      placeholder="Rechercher par emplacement, phase, catégorie..."
                      className="w-full pl-10 pr-4 py-3 border border-line-strong rounded-[4px] focus:outline-none focus:ring-2 focus:ring-ink focus:border-transparent min-h-[48px]"
                    />
                  </div>

                  {/* Quick Phase Filters */}
                  {allPhotoPhases.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                        Phase
                      </h3>
                      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 scrollbar-hide">
                        {allPhotoPhases.map((phase) => (
                          <button
                            key={phase}
                            onClick={() =>
                              setSelectedPhotoPhase(selectedPhotoPhase === phase ? "" : phase)
                            }
                            className={`px-3 py-1.5 rounded-[4px] text-sm font-medium transition-colors min-h-[36px] whitespace-nowrap flex-shrink-0 ${
                              selectedPhotoPhase === phase
                                ? "bg-ink text-white"
                                : "bg-subtle text-ink hover:bg-line"
                            }`}
                          >
                            {phase}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Tag Filters */}
                  {Object.keys(allPhotoTags).length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                        Catégories
                      </h3>
                      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 scrollbar-hide">
                        {Object.entries(allPhotoTags)
                          .sort((a, b) => b[1] - a[1])
                          .map(([tag, count]) => (
                            <button
                              key={tag}
                              onClick={() => togglePhotoTag(tag)}
                              className={`px-3 py-1.5 rounded-[4px] text-sm font-medium transition-colors min-h-[36px] whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
                                selectedPhotoTags.includes(tag)
                                  ? "bg-ink text-white"
                                  : "bg-subtle text-ink hover:bg-line"
                              }`}
                            >
                              <span>{tag}</span>
                              <span
                                className={`text-xs ${selectedPhotoTags.includes(tag) ? "opacity-75" : "text-muted"}`}
                              >
                                ({count})
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Filter Actions */}
                  <div className="flex items-center gap-2">
                    {(photoSearchQuery || selectedPhotoTags.length > 0 || selectedPhotoPhase) && (
                      <button
                        onClick={clearPhotoFilters}
                        className="px-4 py-2 text-sm text-body hover:text-ink transition-colors flex items-center gap-2"
                      >
                        <X size={16} />
                        <span>Effacer les filtres</span>
                      </button>
                    )}

                    <span className="text-sm text-body ml-auto">
                      {filteredPhotos.length} / {allPhotos.length} photos
                    </span>
                  </div>
                </div>

                {/* Photo Grid */}
                {filteredPhotos.length === 0 ? (
                  <div className="text-center py-12">
                    <IconPhoto size={48} className="mx-auto text-faint mb-4 lucide-display" />
                    <p className="text-muted mb-2">Aucune photo trouvée</p>
                    {(photoSearchQuery || selectedPhotoTags.length > 0 || selectedPhotoPhase) && (
                      <button
                        onClick={clearPhotoFilters}
                        className="text-sm text-brand-strong hover:text-brand-800"
                      >
                        Effacer les filtres
                      </button>
                    )}
                  </div>
                ) : (
                  /* The gallery is where the extra width pays off most:
                     2-up on a phone, 5-up at xl, so a project's photos are
                     scanned rather than scrolled. */
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className="relative aspect-square rounded-[4px] overflow-hidden cursor-pointer group bg-subtle"
                      >
                        <img
                          src={photo.url}
                          alt="Photo"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                            <div className="text-xs mb-1">
                              {parseLocalDate(photo.date).toLocaleDateString("fr-CA")}
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              <div className="text-xs px-2 py-0.5 bg-white/25 rounded-[2px] inline-block">
                                {photo.phase}
                              </div>
                              {photo.tags && photo.tags.length > 0 && (
                                <div className="text-xs px-2 py-0.5 bg-white/20 rounded inline-block">
                                  +{photo.tags.length}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Déficiences Tab */}
        {activeTab === "issues" && (
          <IssuesTab
            issues={issues}
            locations={locations}
            loadError={issuesLoadError}
            onRetry={loadIssues}
            onOpenIssue={(issueId) => navigate(`/app/projects/${id}/issues/${issueId}`)}
            resolveLocationLabel={resolveLocationLabel}
          />
        )}

        {/* Plans Tab */}
        {PLANS_ENABLED && activeTab === "plans" && id && <PlanFilesManager projectId={id} />}

        {/* Locations Tab */}
        {activeTab === "locations" && id && (
          <LocationsTab
            projectId={id}
            locations={locations}
            levels={levels}
            loading={loadingLocations}
            error={locationsLoadError}
            onRetry={loadLocationsAndLevels}
          />
        )}
      </div>

      <FloatingActions menu={floatingMenu} />

      {id && (
        <VisitPicker
          open={showVisitPickerForIssue}
          projectId={id}
          onSelect={(visit) => {
            setShowVisitPickerForIssue(false);
            navigate(`/app/projects/${id}/visits/${visit.id}?action=new-issue`);
          }}
          onClose={() => setShowVisitPickerForIssue(false)}
        />
      )}

      {id && (
        <VisitPicker
          open={showVisitPickerForPhotos}
          projectId={id}
          onSelect={(visit) => {
            setShowVisitPickerForPhotos(false);
            navigate(`/app/projects/${id}/visits/${visit.id}/add-photos`);
          }}
          onClose={() => setShowVisitPickerForPhotos(false)}
        />
      )}

      {id && (
        <VisitPicker
          open={showVisitPickerForVoice}
          projectId={id}
          onSelect={(visit) => {
            setShowVisitPickerForVoice(false);
            setVoiceRecorderVisitId(visit.id);
          }}
          onClose={() => setShowVisitPickerForVoice(false)}
        />
      )}

      {voiceRecorderVisitId && (
        <VoiceRecorderModal
          open
          visitId={voiceRecorderVisitId}
          onClose={() => setVoiceRecorderVisitId(null)}
          // Lands in that visit's voice-notes section, which is where the
          // note now lives — the project screen has nowhere to show it.
          onSaved={() => navigate(`/app/projects/${id}/visits/${voiceRecorderVisitId}`)}
        />
      )}

      {/* Comment Modal */}
      {showCommentModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 overflow-y-auto"
          onClick={() => setShowCommentModal(false)}
        >
          <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
            <div
              className="bg-surface rounded-[4px] w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-line">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl text-ink font-medium">Nouveau commentaire</h2>
                  <button
                    onClick={() => {
                      setShowCommentModal(false);
                      setCommentText("");
                    }}
                    className="w-10 h-10 flex items-center justify-center hover:bg-subtle rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Ajouter une observation, question ou feedback..."
                  rows={4}
                  className="w-full px-4 py-3 bg-canvas border border-line rounded-[4px] mb-4 resize-none focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCommentModal(false);
                      setCommentText("");
                    }}
                    className="flex-1 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line-strong font-medium min-h-[48px]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      setShowCommentModal(false);
                      setCommentText("");
                      alert("Commentaire ajouté!");
                    }}
                    className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 font-medium min-h-[48px]"
                  >
                    Publier
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && !showAnnotator && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex flex-col"
          onClick={() => setSelectedPhoto(null)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 text-white">
            <h2 className="text-lg">{project?.name}</h2>
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
              alt="Photo"
              className="max-w-full max-h-full object-contain rounded-[4px]"
            />
          </div>

          {/* Action Buttons */}
          <div
            className="px-6 py-3 bg-ink border-b border-ink flex gap-3 safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAnnotator(true)}
              className="flex-1 py-3 bg-white/15 text-white rounded-[4px] hover:bg-white/25 transition-colors flex items-center justify-center gap-2"
            >
              <Pencil size={20} />
              <span>Annoter</span>
            </button>
            {canEditPhotoMetadata(projectRole) && (
              <button
                onClick={() => setEditingPhotos([selectedPhoto])}
                className="flex-1 py-3 bg-surface/10 text-white rounded-[4px] hover:bg-surface/20 transition-colors flex items-center justify-center gap-2"
              >
                <MapPin size={20} />
                <span>Modifier</span>
              </button>
            )}
          </div>

          {/* Metadata */}
          <div
            className="bg-ink text-white px-6 py-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedPhoto.date && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={20} className="text-faint" />
                <span>{parseLocalDate(selectedPhoto.date).toLocaleDateString("fr-CA")}</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-faint" />
                <span className="text-sm text-faint">Phase et étiquettes</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-6">
                <span className="px-2 py-1 bg-white/15 text-white rounded-[4px] text-xs">
                  {selectedPhoto.phase}
                </span>
                {selectedPhoto.tags && selectedPhoto.tags.length > 0 ? (
                  selectedPhoto.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-white/15 text-white rounded-[4px] text-xs">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted">Aucune étiquette</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo annotation — the same canonical PhotoAnnotator the visit
          screen uses. This used to render PhotoMarkup, whose onSave only
          logged a blob: URL and then claimed success, silently losing every
          annotation made from this screen. */}
      {showAnnotator && selectedPhoto && (
        <PhotoAnnotator
          photo={selectedPhoto}
          onClose={() => setShowAnnotator(false)}
          onSave={handleSaveAnnotation}
        />
      )}

      {editingPhotos.length > 0 && id && (
        <PhotoMetadataEditor
          open
          photos={editingPhotos}
          projectId={id}
          onCancel={() => setEditingPhotos([])}
          onSaved={(updated) => {
            // Patch the gallery source list so the lightbox and any tag
            // filter reflect the edit without a refetch.
            const byId = new Map(updated.map((u) => [u.id, u]));
            setGalleryPhotos((prev) =>
              prev.map((p) => {
                const u = byId.get(p.id);
                return u ? { ...p, ...u, site_visits: p.site_visits } : p;
              }),
            );
            setSelectedPhoto((prev) => {
              const u = prev ? byId.get(prev.id) : undefined;
              return u && prev
                ? {
                    ...prev,
                    tags: u.tags || [],
                    location_id: u.location_id,
                    description: u.description,
                  }
                : prev;
            });
          }}
        />
      )}

      {/* Visit Detail Modal */}
      {showVisitModal && selectedVisit && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex flex-col h-screen"
          onClick={() => setShowVisitModal(false)}
        >
          <div
            className="bg-surface h-full flex flex-col md:m-auto md:h-[85vh] md:max-w-2xl md:w-full md:rounded-[4px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-surface border-b border-line px-6 py-4 flex items-center justify-between flex-shrink-0 md:rounded-t-xl">
              <h2 className="text-lg font-medium text-ink">Détails de la visite</h2>
              <button
                onClick={() => setShowVisitModal(false)}
                className="w-10 h-10 flex items-center justify-center hover:bg-subtle rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Date and Phase */}
              <div>
                <div className="flex items-center gap-3 text-sm text-muted mb-2">
                  <Calendar size={16} />
                  <span>
                    {parseLocalDate(selectedVisit.date).toLocaleDateString("fr-CA", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1.5 border border-line-strong text-body rounded-[4px] rm-label">
                    {selectedVisit.phase}
                  </span>
                  {selectedVisit.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 bg-subtle text-body rounded-[4px] text-sm flex items-center gap-1.5"
                    >
                      <Tag size={12} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-muted mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted mb-1">Emplacement</div>
                  <div className="text-sm text-ink font-medium">{selectedVisit.room}</div>
                </div>
              </div>

              {/* Photo Count */}
              <div className="flex items-start gap-3">
                <IconPhoto size={16} className="text-muted mt-0.5" />
                <div>
                  <div className="text-xs text-muted mb-1">Photos capturées</div>
                  <div className="text-sm text-ink font-medium">
                    {selectedVisit.photoCount} photos
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-muted" />
                  <span className="text-xs text-muted">Notes de visite</span>
                </div>
                <p className="text-sm text-body leading-relaxed bg-canvas rounded-[4px] p-4">
                  {selectedVisit.notes}
                </p>
              </div>

              {/* Photos Gallery */}
              {selectedVisit.photos.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ImageIcon size={16} className="text-muted" />
                    <span className="text-xs text-muted">Galerie photos</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedVisit.photos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => {
                          setSelectedPhoto(photo);
                          setShowVisitModal(false);
                        }}
                        className="relative aspect-square rounded-[4px] overflow-hidden cursor-pointer group bg-subtle"
                      >
                        <img
                          src={photo.url}
                          alt="Site photo"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="text-white text-sm">Voir</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Comments */}
              {comments.filter((c) => c.visitId === selectedVisit.id).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={16} className="text-muted" />
                    <span className="text-xs text-muted">Commentaires liés</span>
                  </div>
                  <div className="space-y-3">
                    {comments
                      .filter((c) => c.visitId === selectedVisit.id)
                      .map((comment) => (
                        <div key={comment.id} className="bg-canvas rounded-[4px] p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-[2px] bg-ink text-white flex items-center justify-center text-xs font-medium">
                              {comment.author
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-ink">{comment.author}</div>
                              <div className="text-xs text-muted">
                                {new Date(comment.date).toLocaleDateString("fr-CA")}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-body leading-relaxed">{comment.text}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="bg-surface border-t border-line px-6 py-4 flex gap-3 flex-shrink-0 safe-area-bottom md:rounded-b-xl">
              <button
                onClick={() => setShowVisitModal(false)}
                className="flex-1 py-3 bg-subtle text-ink rounded-[4px] hover:bg-line transition-colors font-medium"
              >
                Fermer
              </button>
              <button
                onClick={() => {
                  setShowVisitModal(false);
                  setShowCommentModal(true);
                }}
                className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <MessageSquare size={20} />
                <span>Commenter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Members Modal */}
      {showMembersModal && id && (
        <ProjectMembersModal projectId={id} onClose={() => setShowMembersModal(false)} />
      )}

      {/* Locations Import Modal */}
      {showLocationsImportModal && id && (
        <LocationsImportModal
          projectId={id}
          onClose={() => setShowLocationsImportModal(false)}
          onImported={() => {}}
        />
      )}

      {/* Project edit — the same ProjectForm the create flow renders. */}
      {showEditModal && project && (
        <ProjectForm
          project={project}
          onCancel={() => setShowEditModal(false)}
          onSaved={(updatedProject) => {
            setProject(updatedProject);
            // Force a refresh of the project data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
