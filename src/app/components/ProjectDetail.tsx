import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
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
} from "lucide-react";
import { VisitCardSkeleton, PhotoGridSkeleton, CommentSkeleton } from "./LoadingStates";
import { getSiteVisits, getProject, getPhotos, getPhotoSignedUrl } from "../../lib/supabaseApi";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { getIssuesByProject } from "../../lib/issuesApi";
import { parseLocalDate } from "../../lib/dateUtils";
import PhotoMarkup from "./PhotoMarkup";
import IssueCreation from "./IssueCreation";
import ReportTemplateSelector from "./ReportTemplateSelector";
import ProjectMembersModal from "./ProjectMembersModal";
import ProjectEditModal from "./ProjectEditModal";
import FloorPlanManager from "./FloorPlanManager";

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

interface SiteVisit {
  id: string;
  date: string;
  phase: string;
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

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const projectRole = useProjectRole(id);
  const [activeTab, setActiveTab] = useState<"visits" | "gallery" | "plans">("visits");
  const [gallerySubTab, setGallerySubTab] = useState<"photos" | "issues">("photos");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showPhotoMarkupModal, setShowPhotoMarkupModal] = useState(false);
  const [showIssueCreationModal, setShowIssueCreationModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    id: string;
    url: string;
    tags: string[];
  } | null>(null);
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [isLoadingVisits, setIsLoadingVisits] = useState(true);

  // Photo filter states
  const [photoSearchQuery, setPhotoSearchQuery] = useState("");
  const [selectedPhotoTags, setSelectedPhotoTags] = useState<string[]>([]);
  const [selectedPhotoPhase, setSelectedPhotoPhase] = useState<string>("");
  const [showPhotoFilters, setShowPhotoFilters] = useState(false);

  const [issues, setIssues] = useState<Issue[]>([]);

  // Project state
  const [project, setProject] = useState<any>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

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

  // Mock site visit history with photos
  // const comments: Comment[] = [
  //   {
  //     id: "c1",
  //     author: "Marie-Claude Bouchard",
  //     date: "2026-02-19",
  //     text: "Excellent suivi! Les photos de l'armature montrent bien la qualité du travail. As-tu vérifié l'espacement des barres selon le plan?",
  //     visitId: "1",
  //   },
  //   {
  //     id: "c2",
  //     author: "Pierre Lafontaine",
  //     date: "2026-02-18",
  //     text: "Attention au problème ÉMÉ mentionné. Il faudrait coordonner avec l'ingénieur en mécanique avant de couler le béton.",
  //     visitId: "3",
  //   },
  // ];

  // Flatten all photos from all visits
  const allPhotos = siteVisits.flatMap((visit) =>
    visit.photos.map((photo) => ({
      ...photo,
      date: visit.date,
      phase: visit.phase,
      room: visit.room,
      // Keep the photo's own tags, not visit tags
    })),
  );

  // Filter photos based on search and filters
  const filteredPhotos = allPhotos.filter((photo) => {
    // Search filter
    if (photoSearchQuery.trim()) {
      const query = photoSearchQuery.toLowerCase();
      const matchesSearch =
        photo.room.toLowerCase().includes(query) ||
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

  useEffect(() => {
    const fetchData = async () => {
      // Don't fetch if still checking auth or no user
      if (authLoading) {
        console.log("⏳ Still loading auth, waiting...");
        return;
      }

      if (!user) {
        console.log("⚠️ No user logged in, redirecting to login...");
        navigate("/");
        return;
      }

      if (!id) return;

      try {
        setIsLoadingVisits(true);
        console.log("🔄 Fetching project and visits for user:", user.email);

        // Fetch project
        const proj = await getProject(id);
        setProject(proj);
        setIsLoadingProject(false);

        // Fetch site visits
        const visits = await getSiteVisits(id);

        // Transform visits and fetch photo counts for each
        const transformedVisits = await Promise.all(
          visits.map(async (visit) => {
            // Fetch photos for this visit
            const photos = await getPhotos(visit.id);

            // Collect all unique tags from photos in this visit
            const visitTags = [...new Set(photos.flatMap((p) => p.tags || []))];

            // Generate signed URLs for all photos
            const photosWithSignedUrls = await Promise.all(
              photos.map(async (p) => {
                try {
                  const signedUrl = await getPhotoSignedUrl(p.storage_path);
                  return { id: p.id, url: signedUrl, tags: p.tags || [] };
                } catch (error) {
                  console.error("Error generating signed URL for photo:", p.id, error);
                  return { id: p.id, url: "", tags: p.tags || [] };
                }
              }),
            );

            return {
              id: visit.id,
              date: visit.visit_date,
              phase: visit.phase.charAt(0).toUpperCase() + visit.phase.slice(1), // Capitalize
              room: visit.attendees?.[0] || "Zone non spécifiée",
              tags: visitTags, // Tags collected from all photos in this visit
              photoCount: photos.length, // Actual photo count
              notes: visit.notes,
              photos: photosWithSignedUrls,
            };
          }),
        );

        setSiteVisits(transformedVisits);
        console.log("✅ Loaded", transformedVisits.length, "site visits");
      } catch (error) {
        console.error("❌ Error fetching site visits:", error);
      } finally {
        setIsLoadingVisits(false);
      }
    };

    fetchData();
  }, [id, user, authLoading, navigate]);

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

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <div className="flex items-start justify-between mb-4">
          <button
            onClick={() => navigate("/app/projects")}
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
        <h1 className="text-xl md:text-2xl mb-4">{project?.name}</h1>

        {/* Quick Stats */}
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#E10600]" />
            <span>{siteVisits.length} visites</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span>{allPhotos.length} photos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span>{comments.length} commentaires</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span>{issues.length} déficiences</span>
          </div>
        </div>
      </div>

      {/* Project Info */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto space-y-2 text-sm">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">{project?.address}</span>
          </div>
          <div className="flex items-center gap-3">
            <User size={16} className="text-gray-500" />
            <span className="text-gray-500">Client :</span>
            <span className="text-gray-700">{project?.client}</span>
          </div>
          <div className="flex items-center gap-3">
            <Users size={16} className="text-gray-500" />
            <span className="text-gray-500">Entrepreneur :</span>
            <span className="text-gray-700">{(project as any)?.contractor || "Non spécifié"}</span>
          </div>
          {(project as any)?.sharedWith && (project as any).sharedWith.length > 0 && (
            <div className="flex items-start gap-3">
              <Share2 size={16} className="text-gray-500 mt-0.5" />
              <div>
                <span className="text-gray-500">Partagé avec : </span>
                <span className="text-gray-700">{(project as any).sharedWith.join(", ")}</span>
              </div>
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
            Visites ({siteVisits.length})
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
            Galerie ({allPhotos.length})
            {activeTab === "gallery" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600]" />
            )}
          </button>
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
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-6 max-w-2xl mx-auto">
        {/* Visits Tab */}
        {activeTab === "visits" && (
          <div className="space-y-3">
            {isLoadingVisits ? (
              <VisitCardSkeleton />
            ) : (
              siteVisits.map((visit) => (
                <div
                  key={visit.id}
                  onClick={() => navigate(`/app/projects/${id}/visits/${visit.id}`)}
                  className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-[#E10600] hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="text-sm text-[#1A1A1A] mb-2">
                        {parseLocalDate(visit.date).toLocaleDateString("fr-CA", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="px-2 py-1 bg-[#E10600]/10 text-[#E10600] rounded-md text-xs">
                          {visit.phase}
                        </span>
                        {visit.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs flex items-center gap-1"
                          >
                            <Tag size={10} />
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <MapPin size={14} />
                        <span>{visit.room}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Camera size={16} />
                      <span>{visit.photoCount}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">{visit.notes}</p>

                  {/* Photo thumbnails */}
                  {visit.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {visit.photos.map((photo) => (
                        <img
                          key={photo.id}
                          src={photo.url}
                          alt="Site photo"
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPhoto(photo);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
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
                Photos ({allPhotos.length})
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
            {gallerySubTab === "photos" && (
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
                          alt={photo.room}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                            <div className="text-xs mb-1">
                              {parseLocalDate(photo.date).toLocaleDateString("fr-CA")}
                            </div>
                            <div className="text-sm font-medium mb-1 line-clamp-1">
                              {photo.room}
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
            )}

            {/* Issues Sub Tab */}
            {gallerySubTab === "issues" && (
              <div className="space-y-4">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    onClick={() => navigate(`/app/projects/${id}/issues/${issue.id}`)}
                    className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-[#E10600] hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#E10600] text-white flex items-center justify-center text-sm font-medium">
                          {issue.assignedTo
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#1A1A1A]">{issue.title}</div>
                          <div className="text-xs text-gray-500">
                            {parseLocalDate(issue.createdDate).toLocaleDateString("fr-CA")}
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 mb-3">
                      {issue.description}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
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
                      </div>
                      <div
                        className={`px-2 py-1 rounded-md text-xs font-medium ${
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
                      </div>
                      <div className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs flex items-center gap-1">
                        <MapPin size={10} />
                        {issue.location}
                      </div>
                    </div>
                    {issue.tags && issue.tags.length > 0 && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {issue.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs flex items-center gap-1"
                          >
                            <Tag size={10} />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {issue.photos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 mt-4">
                        {issue.photos.slice(0, 3).map((photo) => (
                          <img
                            key={photo.id}
                            src={photo.url}
                            alt="Issue photo"
                            className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                          />
                        ))}
                        {issue.photos.length > 3 && (
                          <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-gray-600">
                              +{issue.photos.length - 3}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Issue Button */}
                {projectRole.canCreateIssues && (
                  <button
                    onClick={() => setShowIssueCreationModal(true)}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-[#E10600] hover:text-[#E10600] transition-colors flex items-center justify-center gap-2 min-h-[48px]"
                  >
                    <AlertCircle size={18} />
                    <span>Créer une déficience</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Plans Tab */}
        {activeTab === "plans" && id && <FloorPlanManager projectId={id} />}
      </div>

      {/* Create New Site Visit Button */}
      <button
        onClick={() => navigate(`/app/projects/${id}/visit/new`)}
        className="fixed bottom-24 md:bottom-28 right-4 sm:right-6 w-14 h-14 md:w-16 md:h-16 bg-[#E10600] text-white rounded-full shadow-lg hover:bg-[#C00500] active:scale-95 transition-all flex items-center justify-center z-40 touch-manipulation"
        aria-label="Créer une nouvelle visite"
      >
        <Plus size={28} />
      </button>

      {/* Share Modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 overflow-y-auto"
          onClick={() => setShowShareModal(false)}
        >
          <div className="min-h-screen px-4 flex items-center justify-center py-8">
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
          <div className="min-h-screen px-4 flex items-center justify-center py-8">
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
      {selectedPhoto && !showPhotoMarkupModal && !showIssueCreationModal && (
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
              onClick={() => setShowPhotoMarkupModal(true)}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2"
            >
              <Pencil size={18} />
              <span>Annoter</span>
            </button>
            {projectRole.canCreateIssues && (
              <button
                onClick={() => setShowIssueCreationModal(true)}
                className="flex-1 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
              >
                <AlertCircle size={18} />
                <span>Créer déficience</span>
              </button>
            )}
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

      {/* Issue Creation Modal */}
      {showIssueCreationModal && selectedPhoto && (
        <IssueCreation
          photoUrl={selectedPhoto.url}
          photoId={selectedPhoto.id}
          projectId={id || "1"}
          projectName={project?.name}
          phase={selectedPhoto.phase}
          room={selectedPhoto.room}
          defaultTags={selectedPhoto.tags || []}
          onClose={() => setShowIssueCreationModal(false)}
          onSave={(issue) => {
            setIssues([...issues, issue]);
            setShowIssueCreationModal(false);
            alert(`Déficience créée et assignée à ${issue.assignedTo}`);
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
            <div className="bg-white border-t border-gray-200 px-6 py-4 flex gap-3 flex-shrink-0 md:rounded-b-xl">
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
