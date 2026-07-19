import { useEffect, useRef, useState } from "react";
import { Camera, MapPin, Tag } from "lucide-react";
import { getPhotos, getPhotosSignedUrls } from "../../lib/supabaseApi";
import { parseLocalDate } from "../../lib/dateUtils";

export interface VisitCardData {
  id: string;
  date: string;
  phase: string;
  room: string;
  notes: string;
  photoCount: number;
}

export interface VisitCardPhoto {
  id: string;
  url: string;
  tags: string[];
}

interface Props {
  visit: VisitCardData;
  onOpen: () => void;
  onPhotoClick: (photo: VisitCardPhoto) => void;
}

// Renders a visit's metadata immediately (including its photo count, which
// comes from the paginated query's embedded `photos(count)` — no fetch
// needed for that part). The photo thumbnail strip itself is lazy: it only
// fetches once this card scrolls near the viewport, via an IntersectionObserver
// (rootMargin 200px so loading starts just before the card is actually
// visible, not after). This is what turns "signed-URL every photo of every
// visit on mount" into "signed-URL only the visits currently on/near screen,
// one batched call per visit".
export default function VisitCard({ visit, onOpen, onPhotoClick }: Props) {
  const [photos, setPhotos] = useState<VisitCardPhoto[] | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // These were always derived from the visit's photos' own tags (site_visits
  // itself has no tags column) — so, same as the thumbnails, they can only
  // be known once photos have lazy-loaded, and reveal at the same time.
  const visitTags = photos ? [...new Set(photos.flatMap((p) => p.tags))] : [];

  useEffect(() => {
    if (visit.photoCount === 0) return; // nothing to lazy-load
    const el = cardRef.current;
    if (!el) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        (async () => {
          try {
            const rows = await getPhotos(visit.id);
            if (rows.length === 0) {
              if (!cancelled) setPhotos([]);
              return;
            }
            const urls = await getPhotosSignedUrls(rows.map((r) => r.storage_path));
            if (!cancelled) {
              setPhotos(rows.map((r, i) => ({ id: r.id, url: urls[i] || "", tags: r.tags || [] })));
            }
          } catch (e) {
            console.error("Error loading visit photos:", e);
            if (!cancelled) setPhotos([]); // graceful degrade — no thumbnails rather than a broken card
          }
        })();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id, visit.photoCount]);

  return (
    <div
      ref={cardRef}
      onClick={onOpen}
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
            {visitTags.map((tag) => (
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

      {visit.photoCount > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos === null
            ? Array.from({ length: Math.min(visit.photoCount, 4) }).map((_, i) => (
                <div
                  key={i}
                  className="w-20 h-20 rounded-lg bg-gray-100 flex-shrink-0 animate-pulse"
                />
              ))
            : photos.map((photo) => (
                <img
                  key={photo.id}
                  src={photo.url}
                  alt="Site photo"
                  className="w-20 h-20 object-cover rounded-lg flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPhotoClick(photo);
                  }}
                />
              ))}
        </div>
      )}
    </div>
  );
}
