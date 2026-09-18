import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, X } from "lucide-react";
import { useCameraCapture, filesToFileList } from "../../hooks/useCameraCapture";
import XSpinner from "./ui-kit/XSpinner";

// THE BURST CAMERA — open once, shoot a room, come back with all of it.
//
// The flow this replaces: tap Caméra → OS camera → one shot → "Use Photo" →
// back in the form → tap Caméra again. Five photos in a room meant five
// round-trips. Here the shutter never leaves the viewfinder; Terminé returns
// the whole burst at once.
//
// LAYOUT: ONE RULE, BOTH ORIENTATIONS
//
// The viewfinder takes the space; the controls sit on the SHORT EDGE — bottom
// in portrait, right in landscape — so the shutter stays under the thumb of
// the hand already holding the iPad. That is a `flex-col landscape:flex-row`
// switch, not two layouts.
//
// The captured frame is read from videoWidth/videoHeight, so the PHOTO is the
// full sensor frame no matter how this box is arranged — the UI reflows, the
// photograph does not change.
//
// DARK, DELIBERATELY
//
// The only dark surface in the app. A viewfinder is not a document: the
// interface should disappear and leave the subject. It also matches every
// native camera, which is the one place the app should not be inventive.
//
// RED IS STILL THE PEN. The shutter is white — it is a mechanism, not an
// alarm — and red marks only the discard action on a thumbnail.

interface Props {
  open: boolean;
  onClose: () => void;
  /** Same contract as the file input: the caller cannot tell them apart. */
  onFilesSelected: (files: FileList) => void;
}

export default function CameraSheet({ open, onClose, onFilesSelected }: Props) {
  const {
    shots,
    active,
    starting,
    error,
    videoRef,
    start,
    stop,
    capture,
    discard,
    reset,
  } = useCameraCapture();

  const handleCancel = () => {
    reset();
    stop();
    onClose();
  };

  /** Hands the whole burst over in one call, then clears. */
  const handleDone = () => {
    if (shots.length > 0) {
      onFilesSelected(filesToFileList(shots.map((s) => s.file)));
    }
    reset();
    stop();
    onClose();
  };

  // Acquire on open, release on close. Tied to `open` rather than to mount so
  // the stream's life is exactly the sheet's visible life — iOS allows one
  // camera stream per page, so holding it while hidden would block reopening.
  useEffect(() => {
    if (open) {
      void start();
      return;
    }
    stop();
  }, [open, start, stop]);

  // The page behind must not scroll while a full-screen viewfinder is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes, for the desktop/keyboard case.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const sheet = (
    <div
      className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col landscape:flex-row"
      role="dialog"
      aria-modal="true"
      aria-label="Caméra"
    >
      {/* ── VIEWFINDER ────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          // muted + playsInline are REQUIRED on iOS for inline playback.
          // Without them the viewfinder is a black rectangle with no error.
          muted
          playsInline
          autoPlay
          className="w-full h-full object-contain"
        />

        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a0a]">
            <XSpinner size={32} tone="current" />
            <p className="text-white/70 text-sm">Ouverture de la caméra…</p>
          </div>
        )}

        {error && !starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-8 text-center">
            <p className="text-white text-sm max-w-xs text-pretty">{error}</p>
            <p className="text-white/50 text-xs max-w-xs text-pretty">
              Fermez la caméra pour utiliser la galerie.
            </p>
            <button
              type="button"
              onClick={() => void start()}
              className="min-h-[44px] px-5 rounded-[4px] border border-white/30 text-white text-sm font-semibold hover:bg-white/10 transition-colors duration-(--duration-fast) flex items-center gap-2"
            >
              <RotateCcw size={16} />
              Réessayer
            </button>
          </div>
        )}

        {/* Close. Top-left in both orientations — away from the shutter, so
            the hand that shoots cannot dismiss by accident. */}
        <button
          type="button"
          onClick={handleCancel}
          aria-label="Fermer la caméra"
          className="absolute top-4 left-4 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors duration-(--duration-fast)"
        >
          <X size={20} />
        </button>

        {/* The running count — the one number that matters mid-burst. */}
        {shots.length > 0 && (
          <div className="absolute top-4 right-4 px-3 h-11 rounded-full bg-black/50 text-white flex items-center">
            <span className="rm-figures text-sm font-semibold">
              {shots.length} photo{shots.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── CONTROLS ──────────────────────────────────────────────────────
          Short edge: bottom in portrait, right in landscape. */}
      <div className="flex-shrink-0 landscape:w-[168px] landscape:h-full bg-black/80 backdrop-blur-sm flex landscape:flex-col items-center justify-between landscape:justify-start gap-4 landscape:gap-6 px-5 py-4 landscape:px-4 landscape:py-6">
        {/* The strip. Newest first, so the last shot is always in reach —
            that is the one a user checks or deletes. */}
        {/* The strip SCROLLS rather than grows. In landscape a long burst
            otherwise pushes the shutter off the bottom of the rail — the one
            control that must never move. Capped at half the rail, so the
            shutter and Terminé keep a fixed home no matter how many photos
            are in the burst. */}
        <div className="flex-1 min-w-0 max-h-none landscape:flex-none landscape:max-h-[45%] landscape:w-full overflow-x-auto landscape:overflow-y-auto landscape:overflow-x-hidden">
          <div className="flex landscape:flex-col gap-2">
            {[...shots].reverse().map((shot) => (
              <div
                key={shot.id}
                className="relative flex-shrink-0 w-14 h-14 landscape:w-full landscape:h-auto landscape:aspect-square rounded-[4px] overflow-hidden border border-white/20"
              >
                <img
                  src={shot.previewUrl}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => discard(shot.id)}
                  aria-label="Retirer cette photo"
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Spacer: in landscape it drives the shutter to the rail's foot, so
            the thumb finds it in the same place every time. */}
        <div className="hidden landscape:block landscape:flex-1" />

        {/* THE SHUTTER. The native ring: white, round, unmissable. Round
            because it is the one control in the app that is a MECHANISM
            rather than a document — every camera ever made agrees. */}
        <button
          type="button"
          onClick={() => void capture()}
          disabled={!active || !!error}
          aria-label="Prendre une photo"
          className="group flex-shrink-0 w-[72px] h-[72px] rounded-full border-4 border-white/90 disabled:border-white/25 flex items-center justify-center transition-transform duration-(--duration-fast) active:scale-95"
        >
          <span className="w-[56px] h-[56px] rounded-full bg-white/90 group-disabled:bg-white/25" />
        </button>

        {/* TERMINÉ — returns the whole burst. Disabled with nothing shot, so
            it cannot be mistaken for "close". */}
        <button
          type="button"
          onClick={handleDone}
          disabled={shots.length === 0}
          className="flex-shrink-0 min-h-[44px] px-4 rounded-[4px] bg-white text-ink text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/90 transition-colors duration-(--duration-fast) flex items-center gap-2"
        >
          <Check size={16} />
          Terminé
        </button>
      </div>
    </div>
  );

  // Portalled to body: a fixed full-screen surface must not inherit a
  // transform or overflow from whatever form opened it.
  return createPortal(sheet, document.body);
}
