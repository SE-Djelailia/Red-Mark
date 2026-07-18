// Thin wrapper around pdfjs-dist. Every function here dynamically imports
// pdfjs-dist internally — this module must NEVER be given a static
// `import ... from "pdfjs-dist"` anywhere, including in this file itself,
// so Vite keeps it in its own lazily-loaded chunk instead of bloating the
// main bundle (the app's main chunk is already ~1.65MB/482KB gzipped with
// zero code-splitting today — this is deliberately not adding to that).

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
