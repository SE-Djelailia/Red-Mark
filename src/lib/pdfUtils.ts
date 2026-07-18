// Thin wrapper around pdfjs-dist. Every function here dynamically imports
// pdfjs-dist internally — this module must NEVER be given a static
// `import ... from "pdfjs-dist"` anywhere, including in this file itself,
// so Vite keeps it in its own lazily-loaded chunk instead of bloating the
// main bundle (the app's main chunk is already ~1.65MB/482KB gzipped with
// zero code-splitting today — this is deliberately not adding to that).
//
// `import type` below is erased entirely at compile time (TypeScript never
// emits runtime code for type-only imports), so it doesn't violate that
// rule — only used for annotations, not a real module dependency.
import type { PDFDocumentProxy } from "pdfjs-dist";

// Configures the pdf.js worker exactly once per module instance. Safe to
// call on every dynamic import — GlobalWorkerOptions.workerSrc assignment
// is idempotent.
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

// Parses just enough of the PDF to report its page count — does not render
// any page content, so this is fast even for a ~200-page document.
export async function getPdfPageCount(file: File): Promise<number> {
  const pdfjs = await loadPdfjs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  try {
    const doc = await loadingTask.promise;
    return doc.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

export interface OpenedPdf {
  pdfDoc: PDFDocumentProxy;
  numPages: number;
  // Aborts any in-flight network requests and releases worker-side memory.
  // Must be called on unmount / when switching to a different plan file.
  destroy: () => Promise<void>;
}

// Opens a PDF by URL rather than by pre-fetched bytes — pdf.js issues HTTP
// range requests against the URL (Supabase Storage supports them), so
// opening a ~200-page file only pulls the byte ranges actually needed for
// the pages that get rendered, not the whole file upfront.
export async function openPdfFromUrl(url: string): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ url });
  const pdfDoc = await loadingTask.promise;
  return {
    pdfDoc,
    numPages: pdfDoc.numPages,
    destroy: () => loadingTask.destroy(),
  };
}

// Page width/height at pdf.js's native scale=1 (i.e. PDF points). Cheap —
// pdf.js caches the page object internally, so a later renderPageToCanvas
// call for the same page reuses it rather than re-fetching.
export async function getPageSize(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}

// iOS Safari has a known ceiling on canvas backing-store pixel dimensions
// (crashes/blanks the canvas well beyond this on some devices) — capped
// regardless of how far the user has zoomed; CSS transform handles any
// visual zoom beyond what the canvas itself is rendered at.
const MAX_CANVAS_DIMENSION = 4096;
const MAX_DEVICE_PIXEL_RATIO = 2;

export interface RenderPageResult {
  // The CSS width actually rendered at — equal to the requested cssWidth
  // unless MAX_CANVAS_DIMENSION capped it, in which case this is smaller.
  // Callers must treat this as the source of truth for what's now on the
  // canvas (e.g. when deriving a "rendered scale" to reconcile against a
  // CSS transform), not the width they originally asked for.
  achievedCssWidth: number;
}

export interface RenderPageHandle {
  promise: Promise<RenderPageResult>;
  cancel: () => void;
}

// Renders `pageNumber` into `canvas` at `cssWidth` CSS pixels wide (height
// derived from the page's own aspect ratio), scaled up for the device's
// pixel ratio (capped) for crispness, and capped again at
// MAX_CANVAS_DIMENSION regardless — when that cap engages, the *displayed*
// size is shrunk to match what was actually rendered (see achievedCssWidth)
// so the browser never has to stretch a lower-res bitmap, which is what
// caused the blur before this was fixed.
//
// Renders into a detached off-screen canvas first, and only mutates the
// visible `canvas`'s width/height/style once the new frame is fully
// painted — resizing a canvas clears it instantly, so touching the visible
// canvas mid-render produced a blank/wrong-size flash (the "zoom jump").
// The resize + drawImage onto the visible canvas happen back-to-back with
// no await between them, so the browser never paints the intermediate
// state.
//
// Cancellable — call .cancel() before starting a new render on the same
// canvas (rapid page flips / zoom settling) so stale RenderTasks don't
// pile up.
export function renderPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): RenderPageHandle {
  let cancelled = false;
  let renderTask: ReturnType<import("pdfjs-dist").PDFPageProxy["render"]> | null = null;

  const promise = (async (): Promise<RenderPageResult> => {
    const page = await pdfDoc.getPage(pageNumber);
    if (cancelled) return { achievedCssWidth: cssWidth };

    const baseViewport = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    let renderScale = (cssWidth / baseViewport.width) * dpr;
    let achievedCssWidth = cssWidth;

    const rawWidth = baseViewport.width * renderScale;
    const rawHeight = baseViewport.height * renderScale;
    const longestSide = Math.max(rawWidth, rawHeight);
    if (longestSide > MAX_CANVAS_DIMENSION) {
      const capRatio = MAX_CANVAS_DIMENSION / longestSide;
      renderScale *= capRatio;
      achievedCssWidth = cssWidth * capRatio;
    }

    const viewport = page.getViewport({ scale: renderScale });

    const offscreen = document.createElement("canvas");
    offscreen.width = Math.floor(viewport.width);
    offscreen.height = Math.floor(viewport.height);
    const offCtx = offscreen.getContext("2d");
    if (!offCtx || cancelled) return { achievedCssWidth };

    renderTask = page.render({ canvas: offscreen, canvasContext: offCtx, viewport });
    try {
      await renderTask.promise;
    } catch (err) {
      // Expected when .cancel() is called mid-render — not a real failure.
      if ((err as { name?: string })?.name !== "RenderingCancelledException") throw err;
      return { achievedCssWidth };
    }
    if (cancelled) return { achievedCssWidth };

    // Swap the finished frame onto the visible canvas in one synchronous
    // step (resize immediately followed by drawImage, no await between
    // them) so no intermediate blank/wrong-size frame is ever painted.
    canvas.width = offscreen.width;
    canvas.height = offscreen.height;
    canvas.style.width = `${achievedCssWidth}px`;
    canvas.style.height = `${(viewport.height / viewport.width) * achievedCssWidth}px`;
    canvas.getContext("2d")?.drawImage(offscreen, 0, 0);

    return { achievedCssWidth };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      renderTask?.cancel();
    },
  };
}
