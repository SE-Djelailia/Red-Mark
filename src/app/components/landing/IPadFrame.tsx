// THE iPAD FRAME, AND THE CROSS-FADE THAT RUNS INSIDE IT.
//
// WHAT CHANGED, AND WHY
//
// The landing page used to show hand-recreated approximations of the app's
// screens, drawn in miniature. Two problems, both structural rather than
// cosmetic: they drifted from the real UI the moment anything was restyled,
// and their type was hardcoded in pixels for one frame size, so every frame
// that grew left the content marooned in the top third.
//
// These frames show PHOTOGRAPHS of the real screens instead (public/demo/,
// produced by scripts/capture-demo.mjs from /demo-capture). A screenshot of
// IssueForm cannot drift from IssueForm, and it scales with the frame like any
// other image.
//
// THE CHROME IS DRAWN, NOT PHOTOGRAPHED
//
// A bezel, a camera and a home indicator — enough that the thing reads as a
// tablet and not a card, which is what the old plain rounded rectangles looked
// like. But drawn in the page's own language: 1px rules, ink tokens, square
// corners inside. A photorealistic slab of glass would be the one un-Swiss
// thing on the page — it sells hardware, and the product here is the drawing
// inside the frame.
//
// ASPECT FOLLOWS THE COLUMN
//
// Real iPad proportions, and the frame switches between them at md — portrait
// while the frames stack one per row, landscape once they sit two across. The
// <picture> inside switches its source at the SAME breakpoint, so the box and
// the image always agree and no capture is ever cropped.

import { useEffect, useRef, useState } from "react";

/**
 * One photographed screen, in BOTH orientations.
 *
 * Both are required rather than optional. A 3:4 image inside a 4:3 frame gets
 * cropped by object-cover, and in practice that crop ate the project list's
 * third card and the déficience form's action buttons. Carrying both means the
 * frame can always show a capture whose aspect matches its own.
 */
export interface DemoShot {
  landscape: string;
  portrait: string;
  alt: string;
}

interface Props {
  label: string;
  caption: string;
  shots: DemoShot[];
  /** ms each shot is held before cross-fading to the next. */
  interval?: number;
  className?: string;
}

/**
 * Below md the frames stack one per row, so a PORTRAIT iPad is the honest
 * shape: it is taller, it fills a narrow column, and it is the orientation
 * someone actually holds a tablet in when reading a phone-width page. From md
 * they sit two across, where landscape fits the wider, shorter column.
 *
 * 768px matches Tailwind's md, so the <source> and the grid change together.
 */
const MD = "(min-width: 768px)";

/**
 * Cross-fades a set of screenshots inside an iPad.
 *
 * Deliberately NOT the old typing/tap recreation: that was a second
 * implementation of the UI, which is the thing this whole approach exists to
 * delete. A cross-fade keeps some motion on the page while every frame of it
 * remains an exact photograph of the app.
 */
export function IPadFrame({
  label,
  caption,
  shots,
  interval = 4200,
  className = "",
}: Props) {
  const [index, setIndex] = useState(0);
  const hostRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  // Only animate what is on screen — an off-screen timer is work nobody sees,
  // and on a phone it is battery spent on a frame the reader has scrolled past.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || shots.length < 2) return;
    // Respect the reader's stated preference — a looping cross-fade is motion,
    // and prefers-reduced-motion means "stop moving things", not "move less".
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % shots.length),
      interval,
    );
    return () => window.clearInterval(id);
  }, [inView, shots.length, interval]);

  return (
    <figure ref={hostRef} className={className}>
      {/* The device. The frame's ASPECT switches at the same breakpoint as the
          <source> below, so the box and the image it holds always agree — that
          agreement is what keeps every capture uncropped. p-2/p-3 IS the bezel:
          a real border, so the screen inside is genuinely inset. */}
      <div
        className="relative mx-auto w-full aspect-[3/4] md:aspect-[4/3] rounded-[14px] sm:rounded-[18px] border border-line-strong bg-surface p-2 sm:p-3 shadow-[0_1px_3px_rgb(20_20_20/0.06)]"
      >
        {/* The camera: one small ink dot, centred on the top bezel. At this
            size it is the single detail that says "tablet" fastest. */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 top-[3px] sm:top-[5px] w-1 h-1 rounded-full bg-line-strong"
        />

        {/* The screen. Square-ish inner radius against the rounder bezel,
            exactly as real hardware reads. */}
        <div className="relative w-full h-full overflow-hidden rounded-[6px] sm:rounded-[8px] bg-canvas">
          {shots.map((shot, i) => (
            // <picture> rather than one <img>: the browser picks the capture
            // matching the frame's current aspect, and swaps it on resize
            // without any JS.
            <picture key={shot.landscape}>
              <source media={MD} srcSet={shot.landscape} />
              <img
                src={shot.portrait}
                alt={i === 0 ? shot.alt : ""}
                // Only the first is announced; the rest are the same product in
                // another state and would be noise in a screen reader.
                aria-hidden={i === 0 ? undefined : "true"}
                loading="lazy"
                decoding="async"
                // object-contain, not cover: the capture and the frame share an
                // aspect, so there is nothing to crop — and if they ever drift,
                // contain letterboxes honestly instead of silently eating the
                // edge of the UI.
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  transition: "opacity 600ms var(--ease-out)",
                  opacity: i === index ? 1 : 0,
                }}
              />
            </picture>
          ))}
        </div>

        {/* The home indicator, on the bottom bezel. */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 bottom-[3px] sm:bottom-[5px] h-[2px] w-8 sm:w-10 rounded-full bg-line-strong"
        />
      </div>

      <figcaption className="mt-3">
        <p className="rm-label">{label}</p>
        <p className="text-sm text-muted mt-1 text-pretty">{caption}</p>
      </figcaption>
    </figure>
  );
}
