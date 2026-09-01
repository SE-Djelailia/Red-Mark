// Device frames for the landing page's app screenshots.
//
// SWAPPING IN REAL SCREENSHOTS: pass `src`. The placeholder disappears and
// the image fills the frame at the correct aspect ratio — no other change.
//
//   <PhoneFrame label="Visite" caption="…" src="/marketing/visit.png" />
//
// Until then each frame renders a labelled placeholder, deliberately drawn
// as a wireframe rather than a grey box: it shows the intended composition
// (title block, ruled rows, a marked row) so the page reads as designed
// even before the real captures exist.

interface FrameProps {
  label: string;
  caption: string;
  /** Real screenshot. When absent, the wireframe placeholder renders. */
  src?: string;
  /** Alt text for the screenshot. Falls back to the caption. */
  alt?: string;
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
export function PhoneFrame({ label, caption, src, alt }: FrameProps) {
  return (
    <figure>
      <div className="relative mx-auto w-full max-w-[210px] aspect-[9/19.5] border border-line-strong rounded-[4px] overflow-hidden bg-surface shadow-[0_1px_2px_rgb(20_20_20/0.04)]">
        {src ? (
          <img src={src} alt={alt ?? caption} className="absolute inset-0 w-full h-full object-cover object-top" />
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
export function BrowserFrame({ label, caption, src, alt }: FrameProps) {
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
          ) : (
            <Placeholder />
          )}
        </div>
      </div>
      <Caption label={label} caption={caption} />
    </figure>
  );
}
