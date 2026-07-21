import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  MapPin,
  Layers,
  AlertCircle,
  Image as ImageIcon,
  X,
  Plus,
  Camera,
  ChevronRight,
  MessageSquare,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { getLocation, getLevels, getLocations, type Location, type Level } from "../../lib/locationsApi";
import { getIssuesByLocation, type Issue } from "../../lib/issuesApi";
import {
  getPhotosByLocation,
  getPhotosSignedUrls,
  getSiteVisitsSummaryByIds,
} from "../../lib/supabaseApi";
import { uploadIssuePhotos } from "../../lib/issuePhotoUpload";
import { getCommentsForLocationActivity, type Comment } from "../../lib/commentsApi";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useSmartBack } from "../../hooks/useSmartBack";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { parseLocalDate } from "../../lib/dateUtils";
import type { SiteVisit } from "../../lib/supabase";
import VisitPicker from "./VisitPicker";
import IssueForm from "./IssueForm";
import PhotoCaptureButtons from "./PhotoCaptureButtons";

const STATUS_LABEL: Record<Issue["status"], string> = {
  open: "Ouverte",
  resolved: "Résolue",
};

const TYPE_LABEL: Record<Location["type"], string> = {
  room: "Local",
  element: "Élément",
};

const PRIORITY_LABEL: Record<Issue["priority"], string> = {
  critical: "Critique",
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
};

// Timeline entries are grouped by day; this formats the group header
// ("21 juillet 2026"). Uses parseLocalDate (not plain `new Date(...)`) to
// avoid the timezone shift a date-only "YYYY-MM-DD" string would otherwise
// introduce.
function formatDateHeader(dayKey: string): string {
  const s = parseLocalDate(dayKey).toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Per-row time-of-day — only meaningful for entries with a real timestamp
// (issues, photos, comments); visits only ever carry a date, so this
// returns null for those rather than showing a fake "00:00".
function formatEntryTime(dateStr: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return new Date(dateStr).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

interface DisplayPhoto {
  id: string;
  url: string;
  description: string | null;
  createdAt: string;
  visitId: string;
}

interface ActivityVisit {
  id: string;
  visitDate: string;
  phase?: string;
}

interface TimelineEntry {
  key: string;
  date: string; // ISO or "YYYY-MM-DD" — always comparable via `new Date(...)`
  kind: "issue-logged" | "issue-resolved" | "photo" | "comment" | "visit";
  onClick?: () => void;
  // Photo entries show their own image as the spine marker instead of a
  // generic icon — set only for kind "photo".
  thumbnailUrl?: string;
  render: () => React.ReactNode;
}

interface TimelineGroup {
  dayKey: string;
  entries: TimelineEntry[];
}

// "Everything recorded at this location" — Phase 1: metadata, issues (via
// getIssuesByLocation), and photos (via getPhotosByLocation). Phase 2 adds
// the "Activité" tab: a unified chronological feed weaving those together
// with their comments and the visits they belong to — see buildTimeline
// below. Still no comments directly ON the location (needs location_id on
// `comments`) and no status-change audit trail — both deferred further.
export default function LocationDetail() {
  const { projectId, locationId } = useParams<{ projectId: string; locationId: string }>();
  const navigate = useNavigate();
  const goBack = useSmartBack(`/app/projects/${projectId}`);
  const { user } = useAuth();
  const projectRole = useProjectRole(projectId);

  const [location, setLocation] = useState<Location | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [locationLoadError, setLocationLoadError] = useState<string | null>(null);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issuesLoadError, setIssuesLoadError] = useState(false);

  // Add-deficiency / add-photos flow: both actions open the same visit
  // picker first; pendingAction tracks which one to resume once a visit is
  // chosen (existing or freshly created).
  const [pendingAction, setPendingAction] = useState<"issue" | "photos" | null>(null);
  const [showVisitPicker, setShowVisitPicker] = useState(false);
  const [activeVisit, setActiveVisit] = useState<SiteVisit | null>(null);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosLoadError, setPhotosLoadError] = useState(false);

  const [lightboxPhoto, setLightboxPhoto] = useState<DisplayPhoto | null>(null);
  useModalOpen(!!lightboxPhoto);
  useModalOpen(pendingAction !== null && !!activeVisit);

  // Aperçu / Activité toggle — Activité renders the merged timeline built
  // from the issues/photos already loaded above, plus their comments and
  // the visits they belong to (fetched once both are in).
  const [view, setView] = useState<"overview" | "activity">("overview");
  const [comments, setComments] = useState<Comment[]>([]);
  const [activityVisits, setActivityVisits] = useState<ActivityVisit[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Without the location itself there's nothing meaningful to show — same
  // reasoning as ProjectDetail's project-load split: this gets its own
  // full-page loading/error+retry state, separate from issues/photos below.
  const loadLocation = useCallback(async () => {
    if (!locationId || !projectId) return;
    setLoadingLocation(true);
    setLocationLoadError(null);
    try {
      const [loc, lvls, allLocs] = await Promise.all([
        getLocation(locationId),
        getLevels(projectId),
        getLocations(projectId),
      ]);
      if (!loc) throw new Error("Local introuvable.");
      setLocation(loc);
      setLevels(lvls);
      setAllLocations(allLocs);
    } catch (e: any) {
      console.error("Error loading location:", e);
      setLocationLoadError(e.message || "Impossible de charger ce local.");
    } finally {
      setLoadingLocation(false);
    }
  }, [locationId, projectId]);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  const loadIssues = useCallback(() => {
    if (!locationId) return;
    setLoadingIssues(true);
    setIssuesLoadError(false);
    getIssuesByLocation(locationId)
      .then(setIssues)
      .catch((e) => {
        console.error("Error loading issues for location:", e);
        setIssuesLoadError(true);
      })
      .finally(() => setLoadingIssues(false));
  }, [locationId]);

  const loadPhotos = useCallback(async () => {
    if (!locationId) return;
    setLoadingPhotos(true);
    setPhotosLoadError(false);
    try {
      const rows = await getPhotosByLocation(locationId);
      let urls: string[] = [];
      if (rows.length > 0) {
        try {
          urls = await getPhotosSignedUrls(rows.map((p) => p.storage_path));
        } catch (e) {
          console.error("Error generating signed URLs for location photos:", e);
          urls = rows.map(() => ""); // graceful degrade — broken images, not a failed section
        }
      }
      setPhotos(
        rows.map((p, i) => ({
          id: p.id,
          url: urls[i] || "",
          description: p.description ?? null,
          createdAt: p.created_at,
          visitId: p.visit_id,
        })),
      );
    } catch (e) {
      console.error("Error loading photos for location:", e);
      setPhotosLoadError(true);
    } finally {
      setLoadingPhotos(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (!location) return;
    loadIssues();
    loadPhotos();
  }, [location, loadIssues, loadPhotos]);

  // Activity feed data — waits for both issues and photos to finish
  // loading, then fetches their comments (one batched call) and a summary
  // of the visits they belong to (one batched call). Re-runs whenever the
  // issue/photo lists change (e.g. after adding a deficiency or photos).
  useEffect(() => {
    if (loadingIssues || loadingPhotos) return;
    const issueIds = issues.map((i) => i.id);
    const photoIds = photos.map((p) => p.id);
    if (issueIds.length === 0 && photoIds.length === 0) {
      setComments([]);
      setActivityVisits([]);
      return;
    }

    let cancelled = false;
    setLoadingActivity(true);
    const visitIds = Array.from(
      new Set([...issues.map((i) => i.visitId), ...photos.map((p) => p.visitId)].filter(Boolean)),
    );

    Promise.all([
      getCommentsForLocationActivity(issueIds, photoIds),
      getSiteVisitsSummaryByIds(visitIds),
    ])
      .then(([commentRows, visits]) => {
        if (cancelled) return;
        setComments(commentRows);
        setActivityVisits(visits);
      })
      .catch((e) => console.error("Error loading location activity:", e))
      .finally(() => {
        if (!cancelled) setLoadingActivity(false);
      });

    return () => {
      cancelled = true;
    };
  }, [issues, photos, loadingIssues, loadingPhotos]);

  const startAddIssue = () => {
    setPendingAction("issue");
    setShowVisitPicker(true);
  };

  const startAddPhotos = () => {
    setPendingAction("photos");
    setShowVisitPicker(true);
  };

  const handleVisitSelected = (visit: SiteVisit) => {
    setActiveVisit(visit);
    setShowVisitPicker(false);
  };

  const closePendingAction = () => {
    setPendingAction(null);
    setActiveVisit(null);
    setNewPhotoFiles([]);
  };

  const handleSavePhotos = async () => {
    if (!user || !activeVisit || !location || newPhotoFiles.length === 0) return;
    setUploadingPhotos(true);
    try {
      const { uploaded, queuedCount } = await uploadIssuePhotos(newPhotoFiles, {
        userId: user.id,
        projectId: projectId || "",
        visitId: activeVisit.id,
        locationId: location.id,
      });
      if (uploaded.length > 0) {
        toast.success(`${uploaded.length} photo(s) ajoutée(s)`);
        loadPhotos();
      }
      if (queuedCount > 0) {
        toast.info("Photo mise en file d'attente — elle sera envoyée une fois de retour en ligne.");
      }
      closePendingAction();
    } catch (e: any) {
      console.error("Error uploading location photos:", e);
      toast.error("Échec de l'envoi des photos.");
    } finally {
      setUploadingPhotos(false);
    }
  };

  if (locationLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="mx-auto text-[#E10600] mb-3" />
          <p className="text-base text-[#1A1A1A] font-medium mb-2">Impossible de charger ce local</p>
          <p className="text-sm text-gray-500 mb-6">{locationLoadError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={goBack}
              className="px-4 h-11 bg-gray-100 text-[#1A1A1A] rounded-lg hover:bg-gray-200 text-sm font-medium min-h-[44px]"
            >
              Retour
            </button>
            <button
              onClick={() => loadLocation()}
              className="px-4 h-11 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] text-sm font-medium min-h-[44px]"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadingLocation || !location) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Chargement…
      </div>
    );
  }

  const levelName = levels.find((l) => l.id === location.levelId)?.name;
  const parentLocation = location.parentLocationId
    ? allLocations.find((l) => l.id === location.parentLocationId)
    : null;
  const childLocations = allLocations.filter((l) => l.parentLocationId === location.id);

  // Merges issues (logged + resolved as two separate moments), photos,
  // comments (linked back to their issue/photo), and the visits they
  // belong to into one reverse-chronological "building memory" feed.
  const timeline: TimelineEntry[] = [];

  for (const issue of issues) {
    timeline.push({
      key: `issue-logged-${issue.id}`,
      date: issue.createdAt || issue.createdDate,
      kind: "issue-logged",
      onClick: () => navigate(`/app/projects/${projectId}/issues/${issue.id}`),
      render: () => (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[#1A1A1A] font-medium truncate">{issue.title}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 flex-shrink-0">
              Ouverte
            </span>
          </div>
          <div className="text-xs text-gray-500">
            Déficience créée · {PRIORITY_LABEL[issue.priority]}
          </div>
        </>
      ),
    });
    if (issue.status === "resolved" && issue.resolvedAt) {
      timeline.push({
        key: `issue-resolved-${issue.id}`,
        date: issue.resolvedAt,
        kind: "issue-resolved",
        onClick: () => navigate(`/app/projects/${projectId}/issues/${issue.id}`),
        render: () => (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-[#1A1A1A] font-medium truncate">{issue.title}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 flex-shrink-0">
                Résolue
              </span>
            </div>
            <div className="text-xs text-gray-500">Déficience marquée résolue</div>
          </>
        ),
      });
    }
  }

  for (const photo of photos) {
    // created_at is nullable at the DB level (default now(), no NOT NULL) —
    // a photo missing it can't be placed on the timeline; skip rather than
    // crash the whole grouping pass below.
    if (!photo.createdAt) continue;
    timeline.push({
      key: `photo-${photo.id}`,
      date: photo.createdAt,
      kind: "photo",
      onClick: () => setLightboxPhoto(photo),
      thumbnailUrl: photo.url,
      render: () => (
        <div className="text-sm text-[#1A1A1A]">
          Photo ajoutée
          {photo.description && <span className="text-gray-500"> · {photo.description}</span>}
        </div>
      ),
    });
  }

  for (const comment of comments) {
    // Same nullable created_at gap as photos above — skip rather than risk
    // a falsy date reaching the grouping pass.
    if (!comment.date) continue;
    let sourceLabel = "";
    let onClick: (() => void) | undefined;
    if (comment.issueId) {
      const relatedIssue = issues.find((i) => i.id === comment.issueId);
      sourceLabel = relatedIssue ? `sur « ${relatedIssue.title} »` : "sur une déficience";
      const issueId = comment.issueId;
      onClick = () =>
        navigate(`/app/projects/${projectId}/issues/${issueId}?commentId=${comment.id}`);
    } else if (comment.photoId) {
      sourceLabel = "sur une photo";
      const relatedPhoto = photos.find((p) => p.id === comment.photoId);
      onClick = relatedPhoto ? () => setLightboxPhoto(relatedPhoto) : undefined;
    }
    timeline.push({
      key: `comment-${comment.id}`,
      date: comment.date,
      kind: "comment",
      onClick,
      render: () => (
        <div
          className={`bg-gray-50 rounded-2xl rounded-tl-sm px-3 py-2 inline-block max-w-full ${
            onClick ? "hover:bg-gray-100 transition-colors" : ""
          }`}
        >
          <div className="text-xs text-gray-500 mb-0.5">
            <span className="font-medium text-[#1A1A1A]">{comment.author}</span> {sourceLabel}
          </div>
          <div className="text-sm text-[#1A1A1A] truncate">{comment.text}</div>
        </div>
      ),
    });
  }

  for (const visit of activityVisits) {
    timeline.push({
      key: `visit-${visit.id}`,
      date: visit.visitDate,
      kind: "visit",
      onClick: () => navigate(`/app/projects/${projectId}/visits/${visit.id}`),
      render: () => (
        <div className="text-sm text-[#1A1A1A]">Visite{visit.phase ? ` · ${visit.phase}` : ""}</div>
      ),
    });
  }

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group consecutive same-day entries under one date header — since
  // `timeline` is already sorted descending, same-day entries are always
  // adjacent, so this is a single linear pass. Guards against a falsy
  // `entry.date` (defense in depth — every construction site above should
  // already skip/guarantee a real date, but a bad value here must never
  // crash the whole page again the way it just did).
  const timelineGroups: TimelineGroup[] = [];
  for (const entry of timeline) {
    const dayKey = entry.date ? entry.date.slice(0, 10) : "inconnue";
    const lastGroup = timelineGroups[timelineGroups.length - 1];
    if (lastGroup && lastGroup.dayKey === dayKey) lastGroup.entries.push(entry);
    else timelineGroups.push({ dayKey, entries: [entry] });
  }

  const TIMELINE_ICON: Record<TimelineEntry["kind"], { icon: typeof AlertCircle; color: string }> = {
    "issue-logged": { icon: AlertCircle, color: "text-red-600 bg-red-50" },
    "issue-resolved": { icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    photo: { icon: ImageIcon, color: "text-blue-600 bg-blue-50" },
    comment: { icon: MessageSquare, color: "text-gray-600 bg-gray-100" },
    visit: { icon: Calendar, color: "text-purple-600 bg-purple-50" },
  };

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
        <h1 className="text-xl md:text-2xl mb-1">
          {location.locationNumber}
          {location.name ? ` — ${location.name}` : ""}
        </h1>
        {(levelName || location.discipline) && (
          <div className="text-sm text-gray-400">
            {[levelName, location.discipline].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 max-w-2xl mx-auto">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setView("overview")}
            className={`px-4 py-2 text-sm font-medium min-h-[40px] transition-colors ${
              view === "overview" ? "bg-[#E10600] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Aperçu
          </button>
          <button
            onClick={() => setView("activity")}
            className={`px-4 py-2 text-sm font-medium min-h-[40px] transition-colors ${
              view === "activity" ? "bg-[#E10600] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Activité
          </button>
        </div>
      </div>

      {view === "activity" ? (
        <div className="px-4 py-6 max-w-2xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">
              Historique ({loadingActivity ? "…" : timeline.length})
            </h2>
            {loadingActivity ? (
              <div className="text-sm text-gray-500">Chargement…</div>
            ) : timeline.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-6">
                Aucune activité enregistrée à ce local pour le moment.
              </div>
            ) : (
              <div className="space-y-6">
                {timelineGroups.map((group) => (
                  <div key={group.dayKey}>
                    <div className="text-xs font-semibold text-gray-500 mb-3 pl-1">
                      {formatDateHeader(group.dayKey)}
                    </div>
                    <div className="relative">
                      {group.entries.length > 1 && (
                        <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200" />
                      )}
                      <div className="space-y-3">
                        {group.entries.map((entry) => {
                          const { icon: Icon, color } = TIMELINE_ICON[entry.kind];
                          const Tag = entry.onClick ? "button" : "div";
                          const isComment = entry.kind === "comment";
                          const time = formatEntryTime(entry.date);
                          return (
                            <div
                              key={entry.key}
                              className={`flex items-start gap-3 ${isComment ? "pl-4" : ""}`}
                            >
                              {/* Marker — photo entries show a thumbnail instead of an icon */}
                              <div className="relative z-10 flex-shrink-0">
                                {entry.thumbnailUrl ? (
                                  <button
                                    onClick={entry.onClick}
                                    className="w-8 h-8 rounded-lg overflow-hidden border-2 border-white shadow-sm bg-gray-100"
                                  >
                                    <img
                                      src={entry.thumbnailUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ) : (
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-sm ${color}`}
                                  >
                                    <Icon size={14} />
                                  </div>
                                )}
                              </div>

                              <Tag
                                onClick={entry.onClick}
                                className={`flex-1 min-w-0 flex items-start justify-between gap-3 rounded-lg text-left ${
                                  entry.onClick && !isComment
                                    ? "hover:bg-gray-50 -mx-1 px-1 py-0.5 cursor-pointer"
                                    : ""
                                }`}
                              >
                                <div className="min-w-0 flex-1">{entry.render()}</div>
                                {time && (
                                  <div className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap pt-0.5">
                                    {time}
                                  </div>
                                )}
                              </Tag>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Metadata card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <MapPin size={16} className="text-gray-500" />
            <span className="text-gray-500">Type :</span>
            <span className="text-gray-700">{TYPE_LABEL[location.type]}</span>
          </div>
          <div className="flex items-center gap-3">
            <Layers size={16} className="text-gray-500" />
            <span className="text-gray-500">Niveau :</span>
            <span className="text-gray-700">{levelName || "—"}</span>
          </div>
          {location.discipline && (
            <div className="flex items-center gap-3">
              <span className="w-4" />
              <span className="text-gray-500">Discipline :</span>
              <span className="text-gray-700">{location.discipline}</span>
            </div>
          )}
        </div>

        {/* Parent/child locations — only shown when there's something to show */}
        {(parentLocation || childLocations.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            {parentLocation && (
              <div>
                <div className="text-xs text-gray-500 mb-1.5">Emplacement parent</div>
                <button
                  onClick={() => navigate(`/app/projects/${projectId}/locations/${parentLocation.id}`)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#E10600] hover:bg-gray-50 min-h-[44px] text-left"
                >
                  <span className="text-sm text-[#1A1A1A] font-medium truncate">
                    {parentLocation.locationNumber}
                    {parentLocation.name ? ` — ${parentLocation.name}` : ""}
                  </span>
                  <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                </button>
              </div>
            )}
            {childLocations.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1.5">
                  Emplacements enfants ({childLocations.length})
                </div>
                <div className="space-y-1.5">
                  {childLocations.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => navigate(`/app/projects/${projectId}/locations/${child.id}`)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#E10600] hover:bg-gray-50 min-h-[44px] text-left"
                    >
                      <span className="text-sm text-[#1A1A1A] font-medium truncate">
                        {child.locationNumber}
                        {child.name ? ` — ${child.name}` : ""}
                      </span>
                      <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Issues section */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <AlertCircle size={18} className="text-gray-500" />
              Déficiences ({loadingIssues ? "…" : issuesLoadError ? "?" : issues.length})
            </h2>
            {projectRole.canCreateIssues && (
              <button
                onClick={startAddIssue}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-[#1A1A1A] min-h-[40px]"
              >
                <Plus size={14} />
                Ajouter
              </button>
            )}
          </div>
          {loadingIssues ? (
            <div className="text-sm text-gray-500">Chargement…</div>
          ) : issuesLoadError ? (
            <div className="text-sm text-red-600 flex items-center gap-2">
              Impossible de charger les déficiences.
              <button onClick={loadIssues} className="underline font-medium">
                Réessayer
              </button>
            </div>
          ) : issues.length === 0 ? (
            <div className="text-sm text-gray-500">Aucune déficience à ce local pour le moment.</div>
          ) : (
            <div className="space-y-1.5">
              {issues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => navigate(`/app/projects/${projectId}/issues/${issue.id}`)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#E10600] hover:bg-gray-50 min-h-[44px]"
                >
                  <div className="text-sm text-[#1A1A1A] font-medium truncate">{issue.title}</div>
                  <div className="text-xs text-gray-500">
                    {STATUS_LABEL[issue.status]} · {issue.createdDate}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Photos section */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <ImageIcon size={18} className="text-gray-500" />
              Photos ({loadingPhotos ? "…" : photosLoadError ? "?" : photos.length})
            </h2>
            {projectRole.canUploadPhotos && (
              <button
                onClick={startAddPhotos}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-[#1A1A1A] min-h-[40px]"
              >
                <Camera size={14} />
                Ajouter
              </button>
            )}
          </div>
          {loadingPhotos ? (
            <div className="text-sm text-gray-500">Chargement…</div>
          ) : photosLoadError ? (
            <div className="text-sm text-red-600 flex items-center gap-2">
              Impossible de charger les photos.
              <button onClick={loadPhotos} className="underline font-medium">
                Réessayer
              </button>
            </div>
          ) : photos.length === 0 ? (
            <div className="text-sm text-gray-500">Aucune photo à ce local pour le moment.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxPhoto(photo)}
                  className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                >
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Minimal photo lightbox — view only, no comments/annotations (Phase 2) */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex flex-col"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="flex items-center justify-end px-6 py-4">
            <button
              onClick={() => setLightboxPhoto(null)}
              className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
              aria-label="Fermer"
            >
              <X size={24} />
            </button>
          </div>
          <div
            className="flex-1 flex items-center justify-center px-4 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxPhoto.url}
              alt=""
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Visit picker — shared first step for both "add deficiency" and
          "add photos" at this location. */}
      <VisitPicker
        open={showVisitPicker}
        projectId={projectId || ""}
        onSelect={handleVisitSelected}
        onClose={() => {
          setShowVisitPicker(false);
          setPendingAction(null);
        }}
      />

      {/* Add deficiency — canonical IssueForm, pre-linked to this location
          and the chosen visit. */}
      {pendingAction === "issue" && activeVisit && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={closePendingAction}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closePendingAction}
              className="absolute top-4 right-4 w-10 h-10 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center text-gray-600 transition-colors z-10"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-6">Nouvelle déficience</h2>
            <IssueForm
              projectId={projectId || ""}
              visitId={activeVisit.id}
              locationId={location.id}
              onSaved={() => {
                loadIssues();
                closePendingAction();
              }}
              onCancel={closePendingAction}
            />
          </div>
        </div>
      )}

      {/* Add photos — capture/compress/upload via the shared helper,
          attached through the photo's visit_id + location_id (no issue
          involved). */}
      {pendingAction === "photos" && activeVisit && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={closePendingAction}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closePendingAction}
              className="absolute top-4 right-4 w-10 h-10 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center text-gray-600 transition-colors z-10"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-6">Ajouter des photos</h2>
            <PhotoCaptureButtons
              onFilesSelected={(files) => setNewPhotoFiles((prev) => [...prev, ...Array.from(files)])}
              disabled={uploadingPhotos}
            />
            {newPhotoFiles.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-3">
                {newPhotoFiles.map((file, index) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewPhotoFiles((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={uploadingPhotos}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                      aria-label="Retirer la photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={closePendingAction}
                disabled={uploadingPhotos}
                className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50 min-h-[48px]"
              >
                Annuler
              </button>
              <button
                onClick={handleSavePhotos}
                disabled={uploadingPhotos || newPhotoFiles.length === 0}
                className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium disabled:opacity-50 min-h-[48px]"
              >
                {uploadingPhotos ? "Envoi…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
