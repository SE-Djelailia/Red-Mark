// WORKFLOW 02 — STARTING A SITE VISIT
//
// The app demonstrating itself: opening a visit, capturing a photo, and the
// offline beat that is the product's actual differentiator on a job site.
//
// THE NARRATIVE, and why it is ordered this way:
//
//   1. The visit screen at rest — the sheet, the title block, the metadata.
//   2. A tap on Photo. The capture sheet rises (`.rm-enter`, the same
//      220ms the real sheets use).
//   3. The shutter. A white flash, then the plate resolves into the grid.
//   4. Connection drops. The offline pill arrives, the new photo takes the
//      "en attente" mark — the photo is ALREADY CAPTURED and queued. That
//      is the whole point: the work does not stop when the signal does.
//   5. Hold on the finished state. This is the beat that has to breathe,
//      and it is the frame reduced-motion viewers see.
//
// Pacing is deliberately unhurried: 8.5s for the loop. The Swiss identity
// is restraint, and a frantic demo would contradict the product it is
// selling. Long holds on the meaningful states, quick moves between them.
import { useRef } from "react";
import { IconLocation, IconPhoto, StateSignale } from "../ui-kit/RedMarkIcons";
import { AppHeader, BottomNav, OfflinePill, Tap } from "./WalkthroughParts";
import { useInView, useWalkthrough, type WalkStep } from "./useWalkthrough";

/* Steps, with the dwell time that gives each its weight. */
const STEPS: WalkStep[] = [
  { hold: 1500 }, // 0 · the visit, at rest
  { hold: 620 }, // 1 · cursor travels to the Photo action
  { hold: 900 }, // 2 · capture sheet rises
  { hold: 260 }, // 3 · shutter fires — the one fast beat
  { hold: 1100 }, // 4 · the plate lands in the grid
  { hold: 1500 }, // 5 · signal drops, the pill arrives
  { hold: 2600 }, // 6 · finished state, held
];

/** The frame reduced-motion viewers get: everything captured and queued. */
const REST_STEP = 6;

export function VisitWalkthrough() {
  const hostRef = useRef<HTMLDivElement>(null);
  const inView = useInView(hostRef);
  const { step, still } = useWalkthrough(STEPS, REST_STEP, inView);

  // Derived stage flags. Reading them as ranges rather than equality means a
  // state that should PERSIST (the captured photo) simply stays true.
  const sheetOpen = step >= 2 && step <= 3;
  const flash = step === 3;
  const captured = step >= 4;
  const offline = step >= 5;

  // Cursor: enters from the lower right, travels to the Photo action, presses
  // it, then withdraws below the frame — a hand leaves the screen after
  // acting on it. Travelling diagonally rather than straight up reads as a
  // thumb reaching, which is how this app is actually held.
  const tapX = step === 0 ? 86 : 50;
  const tapY = step === 0 ? 99 : step === 1 ? 78 : 112;
  const tapVisible = step <= 2 && !still;

  return (
    <div ref={hostRef} className="absolute inset-0 bg-canvas overflow-hidden" aria-hidden="true">
      <AppHeader title="Tour du Centre-Ville" sub="Visite · 12 sept. 2026" />

      {/* ── The visit body ────────────────────────────────────────────── */}
      <div className="px-3 pt-2.5 pb-10">
        {/* Title block: the metadata pairs an architect reads first. */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none">
              Phase
            </p>
            <p className="text-[9px] text-ink font-medium leading-tight mt-0.5">Fondation</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none">
              Météo
            </p>
            <p className="text-[9px] text-ink font-medium leading-tight mt-0.5">4 °C · Nuageux</p>
          </div>
        </div>

        <div className="h-px bg-line my-2" />

        {/* Location row — the custom plan-fragment glyph, not a map pin. */}
        <div className="flex items-center gap-1.5 mb-2">
          <IconLocation className="w-2.5 h-2.5 text-muted shrink-0" />
          <span className="text-[8px] text-body leading-none">A-101 — Sous-sol</span>
        </div>

        {/* ── Photo grid ──────────────────────────────────────────────
            Two plates already on file; the third arrives from the capture.
            Drawn as ruled placeholders rather than fake photography: a
            wireframe is honest, a stock image would not be this app. */}
        <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1.5">
          Photos
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1].map((i) => (
            <Plate key={i} />
          ))}

          {/* The captured plate. Enters with the system's own 220ms curve. */}
          <div
            className="relative aspect-square rounded-[4px] overflow-hidden"
            style={{
              transition:
                "opacity 220ms var(--ease-out), transform 220ms var(--ease-out)",
              opacity: captured ? 1 : 0,
              transform: captured ? "scale(1)" : "scale(0.94)",
            }}
          >
            <Plate fresh />
            {/* Queued mark. Ink, not red: "waiting to sync" is a system
                state, not a déficience — red here would be a false alarm. */}
            {offline && (
              <span className="absolute bottom-0 inset-x-0 bg-ink/85 text-white text-[5px] leading-none py-0.5 text-center font-medium rm-fade">
                En attente
              </span>
            )}
          </div>
        </div>

        {/* ── Déficience row ─────────────────────────────────────────
            One marked row, carrying the 2px leading rule and the SIGNALÉ
            lifecycle glyph — the red budget's one legitimate spend here. */}
        <div className="mt-2.5">
          <p className="text-[7px] font-semibold uppercase tracking-[0.08em] text-muted leading-none mb-1.5">
            Déficiences
          </p>
          <div className="border-l-2 border-l-brand-600 bg-surface pl-1.5 py-1 pr-1 rounded-r-[4px] border-y border-r border-line">
            <div className="flex items-center gap-1">
              <StateSignale className="w-2 h-2 text-brand-600 shrink-0" />
              <span className="text-[7.5px] text-ink leading-none truncate">
                Fissure — mur nord
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Primary action: the ONE red fill on this screen ───────────── */}
      <div className="absolute left-0 right-0 bottom-9 px-3 pb-2">
        <div
          className="h-6 rounded-[4px] bg-brand-600 text-white flex items-center justify-center gap-1"
          style={{
            // Press feedback, keyed to the tap that triggers the capture.
            transition: "transform 120ms var(--ease-out), filter 120ms var(--ease-out)",
            transform: step === 1 ? "scale(0.97)" : "scale(1)",
            filter: step === 1 ? "brightness(0.92)" : "none",
          }}
        >
          <IconPhoto className="w-2.5 h-2.5" />
          <span className="text-[7.5px] font-semibold leading-none">Prendre une photo</span>
        </div>
      </div>

      {/* ── Capture sheet ────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 bottom-9 z-10 bg-surface border-t border-line-strong rounded-t-[4px] px-3 pt-2 pb-3"
        style={{
          transition: "transform 220ms var(--ease-out), opacity 220ms var(--ease-out)",
          transform: sheetOpen ? "translateY(0)" : "translateY(105%)",
          opacity: sheetOpen ? 1 : 0,
        }}
      >
        <div className="w-6 h-0.5 bg-line-strong rounded-full mx-auto mb-2" />
        <div className="aspect-[4/3] rounded-[4px] bg-ink/90 relative overflow-hidden flex items-center justify-center">
          {/* Viewfinder rule-of-thirds, drawn in the icon language. */}
          <svg viewBox="0 0 60 45" className="absolute inset-0 w-full h-full opacity-25">
            <g stroke="white" strokeWidth="0.5" fill="none">
              <path d="M20 0 V45 M40 0 V45 M0 15 H60 M0 30 H60" />
            </g>
          </svg>
          <IconPhoto className="w-4 h-4 text-white/70" />
        </div>
        <div className="mt-2 flex justify-center">
          {/* Shutter: a square, because nothing in this system is round. */}
          <span
            className="w-5 h-5 rounded-[4px] border-2 border-ink flex items-center justify-center"
            style={{
              transition: "transform 120ms var(--ease-out)",
              transform: flash ? "scale(0.9)" : "scale(1)",
            }}
          >
            <span className="w-2.5 h-2.5 rounded-[2px] bg-brand-600" />
          </span>
        </div>
      </div>

      {/* The shutter flash. Brief, white, and above everything. */}
      <div
        className="absolute inset-0 z-30 bg-white pointer-events-none"
        style={{
          transition: "opacity 260ms var(--ease-out)",
          opacity: flash ? 0.85 : 0,
        }}
      />

      <OfflinePill shown={offline} pending={1} />
      <BottomNav active="visites" />
      {tapVisible && <Tap x={tapX} y={tapY} firing={step === 1} />}
    </div>
  );
}

/** A photo plate: ruled placeholder art, in the drawing-sheet language. */
function Plate({ fresh = false }: { fresh?: boolean }) {
  return (
    <div
      className={`aspect-square rounded-[4px] border overflow-hidden relative ${
        fresh ? "border-line-strong bg-subtle" : "border-line bg-subtle"
      }`}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <g stroke="var(--color-line-strong)" strokeWidth="1" fill="none" strokeLinecap="butt">
          <path d="M0 27 L13 17 L23 25 L30 20 L40 28" />
          <path d="M0 31 L40 31" />
        </g>
        <circle cx="29" cy="10" r="3" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" />
      </svg>
    </div>
  );
}
