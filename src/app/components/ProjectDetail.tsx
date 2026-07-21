import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
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
  type ProjectGalleryPhotoRow,
  type SiteVisitPageFilters,
} from "../../lib/supabaseApi";
import VisitCard from "./VisitCard";
import ProjectVisitCalendar from "./ProjectVisitCalendar";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useSmartBack } from "../../hooks/useSmartBack";
import { getIssuesByProject, getVisitIdsWithOpenIssues } from "../../lib/issuesApi";
import { parseLocalDate } from "../../lib/dateUtils";
import PhotoMarkup from "./PhotoMarkup";
import ReportTemplateSelector from "./ReportTemplateSelector";
import ProjectMembersModal from "./ProjectMembersModal";
import ProjectEditModal from "./ProjectEditModal";
import PlanFilesManager from "./PlanFilesManager";
import LocationsImportModal from "./LocationsImportModal";
import LocationsTab from "./LocationsTab";
import { getLocations, getLevels, type Location, type Level } from "../../lib/locationsApi";
import { PLANS_ENABLED } from "../../lib/featureFlags";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved";
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
  photos: { id: string; url: string; tags: string[] }[];
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
function mapVisitRow(visit: any): SiteVisit {
  return {
    id: visit.id,
    date: visit.visit_date,
    phase: visit.phase.charAt(0).toUpperCase() + visit.phase.slice(1), // Capitalize
    authorName: visit.authorName,
    // Dead-code compat only — see SiteVisit's comment.
    room: "",
    tags: [],
    photoCount: 0,
    notes: visit.notes || "",
    photos: [],
  };
}

type MainTab = "visits" | "gallery" | "plans" | "locations";
type GallerySubTab = "photos" | "issues";

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
  const requestedTab = (searchParams.get("tab") as MainTab) || "visits";
  // Falls back to "visits" if a stale/typed-in URL asks for the Plans tab
  // while the feature is flagged off, rather than rendering an empty tab
  // with no way to reach it from the tab bar.
  const activeTab: MainTab = requestedTab === "plans" && !PLANS_ENABLED ? "visits" : requestedTab;
  const gallerySubTab: GallerySubTab = (searchParams.get("sub") as GallerySubTab) || "photos";

  const setActiveTab = (tab: MainTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        if (tab !== "gallery") next.delete("sub");
        return next;
      },
      { replace: true },
    );
  };

  const setGallerySubTab = (sub: GallerySubTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "gallery");
        next.set("sub", sub);
        return next;
      },
      { replace: true },
    );
  };

  // Visits tab's List/Calendar toggle and visible calendar month — same
  // URL-state reasoning as tab/sub above, so navigating to a visit from the
  // calendar and back restores both the view mode and the month.
  const visitsView: "list" | "calendar" = searchParams.get("view") === "calendar" ? "calendar" : "list";
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

  const [issueLocationFilter, setIssueLocationFilter] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showLocationsImportModal, setShowLocationsImportModal] = useState(false);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showPhotoMarkupModal, setShowPhotoMarkupModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    id: string;
    url: string;
    tags: string[];
  } | null>(null);
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
  const [galleryPhotosFetchStarted, setGalleryPhotosFetchStarted] = useState(false);
  const [totalPhotosCount, setTotalPhotosCount] = useState(0);
  useModalOpen(showShareModal);
  useModalOpen(showCommentModal);
  useModalOpen(!!selectedPhoto && !showPhotoMarkupModal);
  useModalOpen(showVisitModal && !!selectedVisit);
  useModalOpen(showLocationsImportModal);

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

  const filteredIssues = issueLocationFilter
    ? issues.filter((issue) => issue.locationId === issueLocationFilter)
    : issues;

  // Header stats, muted and secondary to déficiences — zero-value ones are
  // dropped entirely rather than shown as e.g. "0 commentaires", which read
  // as noise/broken rather than as real information.
  const secondaryStats = [
    totalVisitsCount > 0 ? `${totalVisitsCount} visite${totalVisitsCount !== 1 ? "s" : ""}` : null,
    totalPhotosCount > 0 ? `${totalPhotosCount} photo${totalPhotosCount !== 1 ? "s" : ""}` : null,
    comments.length > 0 ? `${comments.length} commentaire${comments.length !== 1 ? "s" : ""}` : null,
  ].filter((s): s is string => s !== null);

  // Only the resolved location (locationId -> "202 — Salle mécanique") is
  // trustworthy — the free-text `location` field predates the Plans &
  // Locations feature and is often just the phantom "Zone non spécifiée"
  // fallback from the old visit-room flow, so it's not used here at all.
  // Returns null when there's no real linked location, so the caller can
  // hide the chip entirely instead of showing a phantom value.
  const resolveLocationLabel = (issue: Issue): string | null => {
    if (!issue.locationId) return null;
    const loc = locations.find((l) => l.id === issue.locationId);
    return loc ? loc.locationNumber + (loc.name ? ` — ${loc.name}` : "") : null;
  };

  const fetchData = useCallback(async () => {
    // Don't fetch if still checking auth or no user
    if (authLoading) return;

    if (!user) {
      navigate("/");
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
    if (activeTab === "gallery" && gallerySubTab === "photos" && !galleryPhotosFetchStarted) {
      setGalleryPhotosFetchStarted(true);
      loadGalleryPhotos();
    }
  }, [activeTab, gallerySubTab, galleryPhotosFetchStarted, loadGalleryPhotos]);

  useEffect(() => {
    const fetchIssues = async () => {
      if (!id) return;

      try {
        const projectIssues = await getIssuesByProject(id);
        setIssues(projectIssues);
      } catch (error) {
        console.error("❌ Error fetching issues:", error);
      }
    };

    fetchIssues();
  }, [id]);

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
    const needsLocations =
      activeTab === "locations" || (activeTab === "gallery" && gallerySubTab === "issues");
    if (needsLocations && !locationsFetchStarted) {
      setLocationsFetchStarted(true);
      loadLocationsAndLevels();
    }
  }, [activeTab, gallerySubTab, locationsFetchStarted, loadLocationsAndLevels]);

  if (projectLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="mx-auto text-[#E10600] mb-3" />
          <p className="text-base text-[#1A1A1A] font-medium mb-2">
            Impossible de charger ce projet
          </p>
          <p className="text-sm text-gray-500 mb-6">{projectLoadError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={goBack}
              className="px-4 h-11 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 text-sm font-medium min-h-[44px]"
            >
              Retour
            </button>
            <button
              onClick={() => fetchData()}
              className="px-4 h-11 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] text-sm font-medium min-h-[44px]"
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
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-4 md:py-5">
        <div className="flex items-start justify-between mb-3">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white"
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
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Modifier le projet"
            >
              <Pencil size={20} />
            </button>
            <button
              onClick={() => setShowMembersModal(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Gérer les membres"
            >
              <Users size={20} />
            </button>
            {projectRole.canCreateIssues && (
              <button
                onClick={() => setShowLocationsImportModal(true)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Importer les emplacements"
              >
                <Upload size={20} />
              </button>
            )}
            <button
              onClick={() => setShowShareModal(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Share2 size={20} />
            </button>
            <button
              onClick={() => setShowReportModal(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <FileText size={20} />
            </button>
          </div>
        </div>
        <h1 className="text-xl md:text-2xl mb-3">{project?.name}</h1>

        {/* Quick Stats — déficiences is the primary number on this screen,
            everything else is secondary/muted and hidden entirely at zero
            so it doesn't read as noise (e.g. "0 commentaires"). */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#E10600] flex items-center justify-center flex-shrink-0">
              <AlertCircle size={18} className="text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none">{issues.length}</div>
              <div className="text-xs text-white/70">
                déficience{issues.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          {secondaryStats.length > 0 && (
            <div className="text-xs text-white/60">{secondaryStats.join(" · ")}</div>
          )}
        </div>
      </div>

      {/* Project Info — collapsed by default so it doesn't eat space above
          the tabs; only fields that actually have a value render when
          expanded. */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setShowProjectInfo((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-3 text-sm text-gray-600 hover:text-[#1A1A1A] min-h-[44px]"
          >
            <span>Détails du projet</span>
            {showProjectInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {showProjectInfo && (
            <div className="px-6 pb-4 space-y-2 text-sm">
              {project?.address && (
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{project.address}</span>
                </div>
              )}
              {project?.client && (
                <div className="flex items-center gap-3">
                  <User size={16} className="text-gray-500" />
                  <span className="text-gray-500">Client :</span>
                  <span className="text-gray-700">{project.client}</span>
                </div>
              )}
              {(project as any)?.contractor && (
                <div className="flex items-center gap-3">
                  <Users size={16} className="text-gray-500" />
                  <span className="text-gray-500">Entrepreneur :</span>
                  <span className="text-gray-700">{(project as any).contractor}</span>
                </div>
              )}
              {(project as any)?.sharedWith && (project as any).sharedWith.length > 0 && (
                <div className="flex items-start gap-3">
                  <Share2 size={16} className="text-gray-500 mt-0.5" />
                  <div>
                    <span className="text-gray-500">Partagé avec : </span>
                    <span className="text-gray-700">{(project as any).sharedWith.join(", ")}</span>
                  </div>
                </div>
              )}
              {!project?.address &&
                !project?.client &&
                !(project as any)?.contractor &&
                !(project as any)?.sharedWith?.length && (
                  <p className="text-gray-400">Aucune information</p>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex max-w-2xl mx-auto">
          <button
            onClick={() => setActiveTab("visits")}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "visits" ? "text-[#E10600]" : "text-gray-600 hover:text-[#1A1A1A]"
            }`}
          >
            Visites ({totalVisitsCount})
            {activeTab === "visits" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("gallery")}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "gallery" ? "text-[#E10600]" : "text-gray-600 hover:text-[#1A1A1A]"
            }`}
          >
            Galerie ({totalPhotosCount})
            {activeTab === "gallery" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600]" />
            )}
          </button>
          {PLANS_ENABLED && (
            <button
              onClick={() => setActiveTab("plans")}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                activeTab === "plans" ? "text-[#E10600]" : "text-gray-600 hover:text-[#1A1A1A]"
              }`}
            >
              Plans
              {activeTab === "plans" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600]" />
              )}
            </button>
          )}
          <button
            onClick={() => setActiveTab("locations")}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "locations" ? "text-[#E10600]" : "text-gray-600 hover:text-[#1A1A1A]"
            }`}
          >
            Locaux
            {activeTab === "locations" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600]" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-6 max-w-2xl mx-auto">
        {/* Visits Tab */}
        {activeTab === "visits" && (
          <div className="space-y-3">
            {/* List/Calendar toggle */}
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setVisitsView("list")}
                className={`px-4 py-2 text-sm font-medium min-h-[44px] transition-colors ${
                  visitsView === "list"
                    ? "bg-[#E10600] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Liste
              </button>
              <button
                onClick={() => setVisitsView("calendar")}
                className={`px-4 py-2 text-sm font-medium min-h-[44px] transition-colors ${
                  visitsView === "calendar"
                    ? "bg-[#E10600] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Calendrier
              </button>
            </div>

            {visitsView === "calendar" ? (
              id && (
                <ProjectVisitCalendar projectId={id} month={visitsMonth} onMonthChange={setVisitsMonth} />
              )
            ) : (
              <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={visitPhaseFilter}
                onChange={(e) => setVisitPhaseFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm min-h-[44px]"
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
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm min-h-[44px]"
              />
              <input
                type="date"
                value={visitDateTo}
                onChange={(e) => setVisitDateTo(e.target.value)}
                aria-label="Au"
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm min-h-[44px]"
              />
              <button
                onClick={toggleVisitOpenIssuesOnly}
                className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors ${
                  visitOpenIssuesOnly
                    ? "bg-[#E10600] text-white"
                    : "bg-white border border-gray-300 text-gray-700 hover:border-[#E10600]"
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
                  className="px-3 py-2 text-sm text-gray-600 hover:text-[#E10600]"
                >
                  Effacer
                </button>
              )}
            </div>

            {isLoadingVisits ? (
              <VisitCardSkeleton />
            ) : siteVisits.length === 0 ? (
              <div className="text-center py-12">
                <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Aucune visite ne correspond à ces filtres.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                    className="w-full py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-[#1A1A1A] hover:border-[#E10600] hover:text-[#E10600] disabled:opacity-50 transition-colors min-h-[48px]"
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

        {/* Gallery Tab */}
        {activeTab === "gallery" && (
          <div className="space-y-4">
            {/* Sub Tabs */}
            <div className="flex max-w-2xl mx-auto">
              <button
                onClick={() => setGallerySubTab("photos")}
                className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                  gallerySubTab === "photos"
                    ? "text-[#E10600]"
                    : "text-gray-600 hover:text-[#1A1A1A]"
                }`}
              >
                Photos ({totalPhotosCount})
                {gallerySubTab === "photos" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600]" />
                )}
              </button>
              <button
                onClick={() => setGallerySubTab("issues")}
                className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                  gallerySubTab === "issues"
                    ? "text-[#E10600]"
                    : "text-gray-600 hover:text-[#1A1A1A]"
                }`}
              >
                Déficiences ({issues.length})
                {gallerySubTab === "issues" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600]" />
                )}
              </button>
            </div>

            {/* Photos Sub Tab */}
            {gallerySubTab === "photos" && loadingGalleryPhotos ? (
              <PhotoGridSkeleton />
            ) : gallerySubTab === "photos" && galleryPhotosLoadError ? (
              <div className="text-center py-12">
                <Camera size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 mb-2">{galleryPhotosLoadError}</p>
                <button
                  onClick={loadGalleryPhotos}
                  className="text-sm text-[#E10600] hover:text-[#C00500] font-medium"
                >
                  Réessayer
                </button>
              </div>
            ) : (
              gallerySubTab === "photos" && (
              <div className="space-y-4">
                {/* Search and Filters */}
                <div className="space-y-3">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      value={photoSearchQuery}
                      onChange={(e) => setPhotoSearchQuery(e.target.value)}
                      placeholder="Rechercher par emplacement, phase, catégorie..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent min-h-[48px]"
                    />
                  </div>

                  {/* Quick Phase Filters */}
                  {allPhotoPhases.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                        Phase
                      </h3>
                      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                        {allPhotoPhases.map((phase) => (
                          <button
                            key={phase}
                            onClick={() =>
                              setSelectedPhotoPhase(selectedPhotoPhase === phase ? "" : phase)
                            }
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px] whitespace-nowrap flex-shrink-0 ${
                              selectedPhotoPhase === phase
                                ? "bg-[#E10600] text-white"
                                : "bg-gray-100 text-[#1A1A1A] hover:bg-gray-200"
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
                      <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                        Catégories
                      </h3>
                      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                        {Object.entries(allPhotoTags)
                          .sort((a, b) => b[1] - a[1])
                          .map(([tag, count]) => (
                            <button
                              key={tag}
                              onClick={() => togglePhotoTag(tag)}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px] whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
                                selectedPhotoTags.includes(tag)
                                  ? "bg-[#E10600] text-white"
                                  : "bg-gray-100 text-[#1A1A1A] hover:bg-gray-200"
                              }`}
                            >
                              <span>{tag}</span>
                              <span
                                className={`text-xs ${selectedPhotoTags.includes(tag) ? "opacity-75" : "text-gray-500"}`}
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
                        className="px-4 py-2 text-sm text-gray-600 hover:text-[#E10600] transition-colors flex items-center gap-2"
                      >
                        <X size={16} />
                        <span>Effacer les filtres</span>
                      </button>
                    )}

                    <span className="text-sm text-gray-600 ml-auto">
                      {filteredPhotos.length} / {allPhotos.length} photos
                    </span>
                  </div>
                </div>

                {/* Photo Grid */}
                {filteredPhotos.length === 0 ? (
                  <div className="text-center py-12">
                    <Camera size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 mb-2">Aucune photo trouvée</p>
                    {(photoSearchQuery || selectedPhotoTags.length > 0 || selectedPhotoPhase) && (
                      <button
                        onClick={clearPhotoFilters}
                        className="text-sm text-[#E10600] hover:text-[#C00500]"
                      >
                        Effacer les filtres
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-gray-200"
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
                              <div className="text-xs px-2 py-0.5 bg-[#E10600] rounded inline-block">
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
              )
            )}

            {/* Issues Sub Tab */}
            {gallerySubTab === "issues" && (
              <div className="space-y-4">
                {locations.length > 0 && (
                  <select
                    value={issueLocationFilter}
                    onChange={(e) => setIssueLocationFilter(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-sm min-h-[48px]"
                  >
                    <option value="">Tous les locaux</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.locationNumber}
                        {loc.name ? ` — ${loc.name}` : ""}
                      </option>
                    ))}
                  </select>
                )}

                {filteredIssues.length === 0 && issueLocationFilter ? (
                  <div className="text-center py-8">
                    <MapPin size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 text-sm mb-2">
                      Aucune déficience pour ce local
                    </p>
                    <button
                      onClick={() => setIssueLocationFilter("")}
                      className="text-sm text-[#E10600] hover:text-[#C00500]"
                    >
                      Effacer le filtre
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {filteredIssues.map((issue) => {
                      const locationLabel = resolveLocationLabel(issue);
                      return (
                        <button
                          key={issue.id}
                          onClick={() => navigate(`/app/projects/${id}/issues/${issue.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors min-h-[44px] text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[#1A1A1A] truncate">
                              {issue.title}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5 flex-wrap">
                              <span className="whitespace-nowrap">
                                {parseLocalDate(issue.createdDate).toLocaleDateString("fr-CA", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                              {locationLabel && (
                                <span className="flex items-center gap-1 min-w-0">
                                  <span>·</span>
                                  <MapPin size={10} className="flex-shrink-0" />
                                  <span className="truncate">{locationLabel}</span>
                                </span>
                              )}
                              {issue.photos.length > 0 && (
                                <span className="flex items-center gap-1 flex-shrink-0">
                                  <span>·</span>
                                  <Camera size={10} />
                                  {issue.photos.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className={`px-2 py-1 rounded-md text-xs font-medium ${
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
                              className={`px-2 py-1 rounded-md text-xs font-medium ${
                                issue.status === "open"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-green-50 text-green-700"
                              }`}
                            >
                              {issue.status === "open" ? "Ouvert" : "Résolu"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
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

      {/* Create New Site Visit Button */}
      {projectRole.canCreateIssues && (
        <button
          onClick={() => navigate(`/app/projects/${id}/visit/new`)}
          className="fixed bottom-24 md:bottom-28 right-4 sm:right-6 w-14 h-14 md:w-16 md:h-16 bg-[#E10600] text-white rounded-full shadow-lg hover:bg-[#C00500] active:scale-95 transition-all flex items-center justify-center z-40 touch-manipulation"
          aria-label="Créer une nouvelle visite"
        >
          <Plus size={28} />
        </button>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 overflow-y-auto"
          onClick={() => setShowShareModal(false)}
        >
          <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
            <div
              className="bg-white rounded-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl text-[#1A1A1A] font-medium">Partager le projet</h2>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Inviter des collègues de JLP pour collaborer et commenter
                </p>
                <input
                  type="email"
                  placeholder="Courriel du collègue..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 font-medium min-h-[48px]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      setShowShareModal(false);
                      alert("Invitation envoyée!");
                    }}
                    className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] font-medium min-h-[48px]"
                  >
                    Inviter
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 overflow-y-auto"
          onClick={() => setShowCommentModal(false)}
        >
          <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
            <div
              className="bg-white rounded-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl text-[#1A1A1A] font-medium">Nouveau commentaire</h2>
                  <button
                    onClick={() => {
                      setShowCommentModal(false);
                      setCommentText("");
                    }}
                    className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
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
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg mb-4 resize-none focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCommentModal(false);
                      setCommentText("");
                    }}
                    className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 font-medium min-h-[48px]"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      setShowCommentModal(false);
                      setCommentText("");
                      alert("Commentaire ajouté!");
                    }}
                    className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] font-medium min-h-[48px]"
                  >
                    Publier
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <ReportTemplateSelector
          projectId={id || "1"}
          projectName={project?.name}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && !showPhotoMarkupModal && (
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
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>

          {/* Action Buttons */}
          <div
            className="px-6 py-3 bg-[#1A1A1A] border-b border-gray-800 flex gap-3 safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPhotoMarkupModal(true)}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2"
            >
              <Pencil size={18} />
              <span>Annoter</span>
            </button>
          </div>

          {/* Metadata */}
          <div
            className="bg-[#1A1A1A] text-white px-6 py-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={18} className="text-gray-400" />
              <span>{parseLocalDate(selectedPhoto.date).toLocaleDateString("fr-CA")}</span>
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
                {selectedPhoto.tags && selectedPhoto.tags.length > 0 ? (
                  selectedPhoto.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-gray-700 text-white rounded-md text-xs">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">Aucune étiquette</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Markup Modal */}
      {showPhotoMarkupModal && selectedPhoto && (
        <PhotoMarkup
          imageUrl={selectedPhoto.url}
          onClose={() => setShowPhotoMarkupModal(false)}
          onSave={(annotatedUrl) => {
            console.log("Saved annotated image:", annotatedUrl);
            setShowPhotoMarkupModal(false);
            alert("Photo annotée enregistrée avec succès!");
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
            className="bg-white h-full flex flex-col md:m-auto md:h-[85vh] md:max-w-2xl md:w-full md:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0 md:rounded-t-xl">
              <h2 className="text-lg font-medium text-[#1A1A1A]">Détails de la visite</h2>
              <button
                onClick={() => setShowVisitModal(false)}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Date and Phase */}
              <div>
                <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                  <Calendar size={18} />
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
                  <span className="px-3 py-1.5 bg-[#E10600]/10 text-[#E10600] rounded-lg text-sm font-medium">
                    {selectedVisit.phase}
                  </span>
                  {selectedVisit.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm flex items-center gap-1.5"
                    >
                      <Tag size={14} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-gray-500 mb-1">Emplacement</div>
                  <div className="text-sm text-[#1A1A1A] font-medium">{selectedVisit.room}</div>
                </div>
              </div>

              {/* Photo Count */}
              <div className="flex items-start gap-3">
                <Camera size={18} className="text-gray-500 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500 mb-1">Photos capturées</div>
                  <div className="text-sm text-[#1A1A1A] font-medium">
                    {selectedVisit.photoCount} photos
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={18} className="text-gray-500" />
                  <span className="text-xs text-gray-500">Notes de visite</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-4">
                  {selectedVisit.notes}
                </p>
              </div>

              {/* Photos Gallery */}
              {selectedVisit.photos.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ImageIcon size={18} className="text-gray-500" />
                    <span className="text-xs text-gray-500">Galerie photos</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedVisit.photos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => {
                          setSelectedPhoto(photo);
                          setShowVisitModal(false);
                        }}
                        className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group bg-gray-200"
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
                    <MessageSquare size={18} className="text-gray-500" />
                    <span className="text-xs text-gray-500">Commentaires liés</span>
                  </div>
                  <div className="space-y-3">
                    {comments
                      .filter((c) => c.visitId === selectedVisit.id)
                      .map((comment) => (
                        <div key={comment.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-[#E10600] text-white flex items-center justify-center text-xs font-medium">
                              {comment.author
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-[#1A1A1A]">
                                {comment.author}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(comment.date).toLocaleDateString("fr-CA")}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed">{comment.text}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 flex gap-3 flex-shrink-0 safe-area-bottom md:rounded-b-xl">
              <button
                onClick={() => setShowVisitModal(false)}
                className="flex-1 py-3 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Fermer
              </button>
              <button
                onClick={() => {
                  setShowVisitModal(false);
                  setShowCommentModal(true);
                }}
                className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <MessageSquare size={18} />
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

      {/* Project Edit Modal */}
      {showEditModal && project && (
        <ProjectEditModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onSave={(updatedProject) => {
            setProject(updatedProject);
            // Force a refresh of the project data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
