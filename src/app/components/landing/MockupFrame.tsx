// Device frames for the landing page's app mockups.
//
// THREE MODES, in order of fidelity:
//
//   1. `demo` — an animated walkthrough: the app's own UI, rebuilt in HTML
//      from the real design tokens and driven by the motion system, so the
//      frame shows the product demonstrating itself. This is the default
//      for the workflow frames.
//   2. `src` — a real screenshot, when one exists. Wins over `demo`.
//   3. Neither — the drawn wireframe placeholder, which shows the intended
//      composition so the page still reads as designed.
//
//   <PhoneFrame label="Visite" caption="…" demo={<VisitWalkthrough />} />
//   <PhoneFrame label="Visite" caption="…" src="/marketing/visit.png" />

interface FrameProps {
  label: string;
  caption: string;
  /** Real screenshot. Takes precedence over `demo`. */
  src?: string;
  /** Alt text for the screenshot. Falls back to the caption. */
  alt?: string;
  /**
   * An animated walkthrough to render inside the frame. Used when no
   * screenshot exists — which is the intended state, since the walkthrough
   * is higher fidelity than a static capture: it shows the flow, not a
   * moment of it.
   */
  demo?: React.ReactNode;
}

/** The wireframe shown until a real screenshot is supplied. */
function Placeholder() {
  return (
    <div className="absolute inset-0 bg-canvas p-3 flex flex-col gap-2.5" aria-hidden="true">
      {/* Title block */}
      <div className="flex items-center justify-between">
        <div className="h-1.5 w-10 bg-line-strong rounded-[1px]" />
        <div className="h-1.5 w-4 bg-line rounded-[1px]" />
      </div>
      <div className="h-2.5 w-2/3 bg-line-strong rounded-[1px]" />
      <div className="h-px bg-line" />
      {/* Ruled rows — one of them marked, so the red budget reads even here. */}
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`border-l-2 pl-2 py-1.5 ${
            i === 1 ? "border-l-brand-600" : "border-l-line"
          }`}
        >
          <div className="h-1.5 bg-line-strong rounded-[1px]" style={{ width: `${72 - i * 9}%` }} />
          <div className="h-1.5 bg-line rounded-[1px] mt-1" style={{ width: `${48 - i * 6}%` }} />
        </div>
      ))}
      <div className="mt-auto flex gap-1.5">
        <div className="h-4 flex-1 bg-subtle rounded-[2px]" />
        <div className="h-4 w-10 bg-ink/85 rounded-[2px]" />
      </div>
    </div>
  );
}

function Caption({ label, caption }: { label: string; caption: string }) {
  return (
    <figcaption className="mt-3">
      <p className="rm-label">{label}</p>
      <p className="text-sm text-muted mt-1">{caption}</p>
    </figcaption>
  );
}

/**
 * Phone frame. 9:19.5 — a modern handset, which is what the app is used on.
 * The bezel is a 1px rule rather than a rendered device: a drawn frame, not
 * a photograph of hardware.
 */
export function PhoneFrame({ label, caption, src, alt, demo }: FrameProps) {
  return (
    <figure>
      <div className="relative mx-auto w-full max-w-[210px] aspect-[9/19.5] border border-line-strong rounded-[4px] overflow-hidden bg-surface shadow-[0_1px_2px_rgb(20_20_20/0.04)]">
        {src ? (
          <img src={src} alt={alt ?? caption} className="absolute inset-0 w-full h-full object-cover object-top" />
        ) : demo ? (
          demo
        ) : (
          <Placeholder />
        )}
      </div>
      <Caption label={label} caption={caption} />
    </figure>
  );
}

/**
 * iPad frame. 4:3 portrait — the app's PRIMARY device, and the one the
 * interface is now laid out for.
 *
 * Same drawn-frame language as the phone: a 1px rule and a 4px radius, not a
 * rendered slab of glass. A photographic device mockup would be the one
 * un-Swiss thing on the page — it sells hardware, and the product here is
 * the drawing inside the frame.
 *
 * Wider than the phone frame because an iPad mockup that is not visibly
 * WIDER reads as a big phone, which would waste the whole point of showing
 * the primary device.
 */
export function TabletFrame({ label, caption, src, alt, demo }: FrameProps) {
  return (
    <figure>
      <div className="relative mx-auto w-full max-w-[300px] aspect-[3/4] border border-line-strong rounded-[4px] overflow-hidden bg-surface shadow-[0_1px_2px_rgb(20_20_20/0.04)]">
        {src ? (
          <img src={src} alt={alt ?? caption} className="absolute inset-0 w-full h-full object-cover object-top" />
        ) : demo ? (
          demo
        ) : (
          <Placeholder />
        )}
      </div>
      <Caption label={label} caption={caption} />
    </figure>
  );
}

/**
 * Browser frame, for the report / desktop views. 16:10 with a title bar
 * carrying three square dots — square, because nothing here is round.
 */
export function BrowserFrame({ label, caption, src, alt, demo }: FrameProps) {
  return (
    <figure>
      <div className="border border-line-strong rounded-[4px] overflow-hidden bg-surface shadow-[0_1px_2px_rgb(20_20_20/0.04)]">
        <div className="flex items-center gap-1.5 px-3 h-7 border-b border-line bg-subtle">
          <span className="w-1.5 h-1.5 rounded-[1px] bg-line-strong" />
          <span className="w-1.5 h-1.5 rounded-[1px] bg-line-strong" />
          <span className="w-1.5 h-1.5 rounded-[1px] bg-line-strong" />
        </div>
        <div className="relative aspect-[16/10]">
          {src ? (
            <img src={src} alt={alt ?? caption} className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : demo ? (
            demo
          ) : (
            <Placeholder />
          )}
        </div>
      </div>
      <Caption label={label} caption={caption} />
    </figure>
  );
}
