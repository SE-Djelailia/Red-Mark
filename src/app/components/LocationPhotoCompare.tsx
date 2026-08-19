import { useEffect, useMemo, useState } from "react";
import { X, Check, GitCompareArrows } from "lucide-react";
import { parseLocalDate } from "../../lib/dateUtils";
import { useModalOpen } from "../../hooks/useModalOpen";
import { IconPhoto } from "./ui-kit/RedMarkIcons";

// Visual comparison of one location across visits.
//
// Two things live here: the dated contact-sheet grid (photos grouped by the
// visit they were taken on, oldest group first), and the pick-two overlay
// that puts a chosen pair side by side.
//
// Deliberately NOT a fixed-position slider or an opacity blend: photos at a
// location are not shot from a tripod, so two frames of the same corner
// rarely align. Overlaying them would imply a registration that isn't there
// and make a real change look like camera drift. Each photo stands on its
// own, labelled with its date; the comparison is the reader's to make.

export interface ComparePhoto {
  id: string;
  /** Pre-signed URL, already batched by the parent. May be "" if signing failed. */
  url: string;
  description: string | null;
  createdAt: string | null;
  visitId: string;
  // Carried only so the parent's lightbox — which this grid opens — can
  // hand a fully-populated photo to the metadata editor.
  locationId: string | null;
  tags: string[];
}

interface Props {
  photos: ComparePhoto[];
  /** Visit id -> visit_date ("YYYY-MM-DD"), from the parent's existing fetch. */
  visitDates: Record<string, string>;
  /**
   * The visit-date lookup resolves on a second async pass, after the photos
   * themselves. Without this the grid would render every group as "Date
   * inconnue" for a beat and then relabel — which reads as missing data
   * rather than as loading.
   */
  datesLoading?: boolean;
  /** Opens the parent's existing single-photo lightbox. */
  onOpenPhoto: (photo: ComparePhoto) => void;
}

// "21 juillet 2026". parseLocalDate rather than `new Date(...)` so a
// date-only string is not shifted a day by the local timezone.
function formatVisitDate(dayKey: string): string {
  return parseLocalDate(dayKey).toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const UNDATED_KEY = "￿"; // sorts last

export default function LocationPhotoCompare({
  photos,
  visitDates,
  datesLoading = false,
  onOpenPhoto,
}: Props) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  // Chronological, oldest first: this reads as the history of a spot, so the
  // earliest state belongs at the top. That is the opposite of the activity
  // feed above (newest first), which answers "what just happened".
  const groups = useMemo(() => {
    const byVisit = new Map<string, ComparePhoto[]>();
    for (const p of photos) {
      const key = p.visitId || "";
      const list = byVisit.get(key);
      if (list) list.push(p);
      else byVisit.set(key, [p]);
    }

    return [...byVisit.entries()]
      .map(([visitId, list]) => ({
        visitId,
        // A photo can outlive knowledge of its visit date (the visit summary
        // fetch is best-effort and returns [] on failure). Such a group is
        // still shown — hiding photos because a label is missing would be
        // worse than showing them undated.
        date: visitDates[visitId] ?? null,
        photos: [...list].sort(
          (a, b) => Date.parse(a.createdAt ?? "") - Date.parse(b.createdAt ?? ""),
        ),
      }))
      .sort((a, b) => {
        // Undated groups sort last, and ties break on the group's earliest
        // photo so the order is total. Without that tiebreak, every group
        // compares equal while dates are still loading and the rows visibly
        // reshuffle when they arrive.
        const d = (a.date ?? UNDATED_KEY).localeCompare(b.date ?? UNDATED_KEY);
        if (d !== 0) return d;
        return (
          Date.parse(a.photos[0]?.createdAt ?? "") - Date.parse(b.photos[0]?.createdAt ?? "")
        );
      });
  }, [photos, visitDates]);

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const pair = picked.map((id) => byId.get(id)).filter((p): p is ComparePhoto => !!p);
  const comparing = pair.length === 2;

  useModalOpen(comparing);

  // A photo can disappear underneath a selection (deleted elsewhere, or the
  // list refetched after an upload). Drop ids that no longer resolve rather
  // than opening a comparison against a blank pane.
  useEffect(() => {
    setPicked((prev) => prev.filter((id) => byId.has(id)));
  }, [byId]);

  useEffect(() => {
    if (!comparing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicked([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comparing]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Third pick replaces the OLDER of the two, so tapping through a series
      // keeps comparing against your most recent choice instead of forcing an
      // explicit deselect between every pair.
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const exitSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };

  const missingDate = datesLoading ? "…" : "Date inconnue";

  const labelFor = (p: ComparePhoto) => {
    const d = visitDates[p.visitId];
    return d ? formatVisitDate(d) : missingDate;
  };

  // Fewer than two photos means there is nothing to compare; the grid still
  // renders, just without the affordance.
  const canCompare = photos.length >= 2;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted">
          {groups.length} visite{groups.length !== 1 ? "s" : ""} · {photos.length} photo
          {photos.length !== 1 ? "s" : ""}
        </p>
        {canCompare &&
          (selecting ? (
            <button
              onClick={exitSelecting}
              className="flex items-center gap-1.5 px-3 py-2 bg-subtle hover:bg-line rounded-[4px] text-sm font-medium text-ink min-h-[40px]"
            >
              <X size={16} />
              Annuler
            </button>
          ) : (
            <button
              onClick={() => setSelecting(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-subtle hover:bg-line rounded-[4px] text-sm font-medium text-ink min-h-[40px]"
            >
              <GitCompareArrows size={16} />
              Comparer
            </button>
          ))}
      </div>

      {selecting && (
        <div className="mb-3 px-3 py-2 rounded-[4px] bg-surface border border-line border-l-2 border-l-brand-600 text-brand-strong text-xs">
          {picked.length === 0
            ? "Touchez deux photos à comparer."
            : picked.length === 1
              ? "Touchez une deuxième photo."
              : "Comparaison en cours…"}
        </div>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.visitId || "none"}>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-xs font-semibold text-ink">
                {g.date ? formatVisitDate(g.date) : missingDate}
              </h3>
              <span className="text-xs text-muted">
                {g.photos.length} photo{g.photos.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {g.photos.map((photo) => {
                const idx = picked.indexOf(photo.id);
                const isPicked = idx !== -1;
                return (
                  <button
                    key={photo.id}
                    onClick={() => (selecting ? toggle(photo.id) : onOpenPhoto(photo))}
                    aria-pressed={selecting ? isPicked : undefined}
                    className={`relative aspect-square rounded-[4px] overflow-hidden bg-subtle transition-all ${
                      isPicked ? "ring-2 ring-ink ring-offset-1" : ""
                    }`}
                  >
                    {photo.url ? (
                      <img
                        src={photo.url}
                        alt={photo.description || ""}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      // Signing failed for this batch — show the frame rather
                      // than a broken-image glyph.
                      <div className="w-full h-full flex items-center justify-center">
                        <IconPhoto size={20} className="text-faint" />
                      </div>
                    )}
                    {isPicked && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-[2px] bg-ink text-white flex items-center justify-center text-[10px] font-semibold">
                        {idx + 1}
                      </span>
                    )}
                    {selecting && !isPicked && (
                      <span className="absolute inset-0 bg-black/20" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {comparing && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
            <span className="text-white text-sm font-medium">Comparaison</span>
            <button
              onClick={() => setPicked([])}
              className="w-11 h-11 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
              aria-label="Fermer la comparaison"
            >
              <X size={24} />
            </button>
          </div>

          {/*
            Side by side on anything wide enough, stacked below `sm`.
            On a phone in portrait, two panes would each be under ~180px
            wide — too small to read the defect the comparison exists to
            show. Stacking keeps each photo full-width and scrolls; the
            dates stay attached to their image either way, so the pair is
            never ambiguous.
          */}
          <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden px-3 pb-4">
            <div className="h-full flex flex-col sm:flex-row gap-3">
              {pair.map((p, i) => (
                <figure
                  key={p.id}
                  className="flex-1 min-h-0 flex flex-col bg-white/5 rounded-[4px] overflow-hidden"
                >
                  <figcaption className="px-3 py-2 flex items-center gap-2 flex-shrink-0">
                    <span className="w-5 h-5 rounded-[2px] bg-ink text-white flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-white text-sm font-medium truncate">{labelFor(p)}</span>
                  </figcaption>
                  <div className="flex-1 min-h-0 flex items-center justify-center px-2 pb-2">
                    {p.url ? (
                      <img
                        src={p.url}
                        alt={p.description || labelFor(p)}
                        className="max-w-full max-h-[50vh] sm:max-h-full object-contain rounded"
                      />
                    ) : (
                      <div className="text-white/60 text-sm">Image indisponible</div>
                    )}
                  </div>
                  {p.description && (
                    <p className="px-3 pb-3 text-xs text-white/70 flex-shrink-0 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                </figure>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 flex-shrink-0 flex gap-2">
            <button
              onClick={() => setPicked([])}
              className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-[4px] text-sm font-medium min-h-[44px] transition-colors"
            >
              Choisir d'autres photos
            </button>
            <button
              onClick={() => {
                setPicked([]);
                setSelecting(false);
              }}
              className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-[4px] text-sm font-medium min-h-[44px] transition-colors flex items-center justify-center gap-2"
            >
              <Check size={16} />
              Terminer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
