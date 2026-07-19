import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, MapPin, Layers, AlertCircle, Image as ImageIcon, X } from "lucide-react";
import { getLocation, getLevels, type Location, type Level } from "../../lib/locationsApi";
import { getIssuesByLocation, type Issue } from "../../lib/issuesApi";
import { getPhotosByLocation, getPhotoSignedUrl } from "../../lib/supabaseApi";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useSmartBack } from "../../hooks/useSmartBack";

const STATUS_LABEL: Record<Issue["status"], string> = {
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Résolue",
};

const TYPE_LABEL: Record<Location["type"], string> = {
  room: "Local",
  element: "Élément",
};

interface DisplayPhoto {
  id: string;
  url: string;
  description: string | null;
}

// "Everything recorded at this location" — Phase 1 scope: metadata, issues
// (via getIssuesByLocation), and photos (via getPhotosByLocation). No
// status-change timeline and no comment-stitching yet — both deferred to a
// later phase, per the P3 investigation.
export default function LocationDetail() {
  const { projectId, locationId } = useParams<{ projectId: string; locationId: string }>();
  const navigate = useNavigate();
  const goBack = useSmartBack(`/app/projects/${projectId}`);

  const [location, setLocation] = useState<Location | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [locationLoadError, setLocationLoadError] = useState<string | null>(null);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issuesLoadError, setIssuesLoadError] = useState(false);

  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosLoadError, setPhotosLoadError] = useState(false);

  const [lightboxPhoto, setLightboxPhoto] = useState<DisplayPhoto | null>(null);
  useModalOpen(!!lightboxPhoto);

  // Without the location itself there's nothing meaningful to show — same
  // reasoning as ProjectDetail's project-load split: this gets its own
  // full-page loading/error+retry state, separate from issues/photos below.
  const loadLocation = useCallback(async () => {
    if (!locationId || !projectId) return;
    setLoadingLocation(true);
    setLocationLoadError(null);
    try {
      const [loc, lvls] = await Promise.all([getLocation(locationId), getLevels(projectId)]);
      if (!loc) throw new Error("Local introuvable.");
      setLocation(loc);
      setLevels(lvls);
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
      const withUrls = await Promise.all(
        rows.map(async (p) => {
          try {
            const url = await getPhotoSignedUrl(p.storage_path);
            return { id: p.id, url, description: p.description ?? null };
          } catch (e) {
            console.error("Error generating signed URL for photo:", p.id, e);
            return { id: p.id, url: "", description: p.description ?? null };
          }
        }),
      );
      setPhotos(withUrls);
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

        {/* Issues section */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
            <AlertCircle size={18} className="text-gray-500" />
            Déficiences ({loadingIssues ? "…" : issuesLoadError ? "?" : issues.length})
          </h2>
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
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
            <ImageIcon size={18} className="text-gray-500" />
            Photos ({loadingPhotos ? "…" : photosLoadError ? "?" : photos.length})
          </h2>
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
    </div>
  );
}
