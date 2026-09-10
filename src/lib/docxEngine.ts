// Shared .docx plumbing, extracted from reportGenerator.ts so the note-de-
// visite and the punch list use ONE implementation of template loading,
// image embedding, field refresh and output.
//
// Everything here is document-agnostic. Anything specific to a particular
// report — which template, which placeholders, how photos are grouped —
// stays in that report's own module.
//
// Extracted rather than copied: the four helpers below all encode hard-won
// fixes (stale page numbers, yellow highlight bleed, image aspect ratio)
// that a second copy would silently miss.

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

/**
 * The template's footers carry real Word PAGE / NUMPAGES fields, but Word
 * renders the CACHED value stored in the file until something forces a
 * recalculation — so a generated document showed the template's stale
 * numbers rather than its own pagination. `updateFields` makes Word
 * recalculate every field on open.
 */
function forceFieldUpdateOnOpen(zip: PizZip): void {
  const path = "word/settings.xml";
  const file = zip.file(path);
  if (!file) return;

  const xml = file.asText();
  if (xml.includes("<w:updateFields")) return; // already set — keep idempotent

  const patched = xml.replace(/(<w:settings\b[^>]*>)/, `$1<w:updateFields w:val="true"/>`);
  if (patched !== xml) zip.file(path, patched);
}

/**
 * Placeholders are often authored with a yellow highlight so whoever tags
 * the document can find them. docxtemplater preserves run formatting when
 * it substitutes, so that highlight survives onto the rendered VALUE — most
 * visibly on free-text fields, which come out as blocks of yellow.
 *
 * Body only: the footers' highlights sit on page-number fields.
 */
function stripBodyHighlights(zip: PizZip): void {
  const path = "word/document.xml";
  const file = zip.file(path);
  if (!file) return;

  const xml = file.asText();
  const stripped = xml.replace(/<w:highlight\s+w:val="yellow"\s*\/>/g, "");
  if (stripped !== xml) zip.file(path, stripped);
}

/** Thrown when the template is absent or is not a .docx. Callers match on
 *  this rather than on message text. */
export class TemplateMissingError extends Error {
  constructor(url: string, detail: string) {
    super(`Could not load document template at ${url}: ${detail}`);
    this.name = "TemplateMissingError";
  }
}

export async function fetchTemplate(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new TemplateMissingError(url, `HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();

  // A missing file under a SPA history fallback comes back as 200 with the
  // app's index.html, not a 404. Without this check PizZip would then fail
  // deep inside with an opaque "can't find end of central directory", which
  // reads as a corrupt template rather than an absent one.
  //
  // Every .docx is a ZIP, so it starts with "PK". Four bytes is enough.
  const head = new Uint8Array(buffer.slice(0, 2));
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new TemplateMissingError(url, "response is not a .docx (ZIP) file");
  }

  return buffer;
}

async function getImage(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load photo for document: ${url}`);
  }
  return res.arrayBuffer();
}

/**
 * Scales an image to fit a box while preserving aspect ratio, and never
 * scales UP (ratio is capped at 1) — a small photo blown up to the box
 * would print soft.
 */
function makeGetSize(maxWidthPx: number, maxHeightPx: number) {
  return async (imgBuffer: ArrayBuffer): Promise<[number, number]> => {
    const bitmap = await createImageBitmap(new Blob([imgBuffer]));
    const ratio = Math.min(maxWidthPx / bitmap.width, maxHeightPx / bitmap.height, 1);
    const size: [number, number] = [
      Math.round(bitmap.width * ratio),
      Math.round(bitmap.height * ratio),
    ];
    bitmap.close();
    return size;
  };
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface RenderOptions {
  /** The template URL, or an already-fetched buffer. Passing the buffer lets
   *  a caller validate the template exists BEFORE doing expensive data work,
   *  without paying for a second fetch. */
  template: string | ArrayBuffer;
  /** The flat object the template's placeholders read from. */
  data: Record<string, unknown>;
  /** Photo box in px. Images are fitted to this, never enlarged. */
  photoMaxWidthPx: number;
  photoMaxHeightPx: number;
}

/**
 * Fills a template and returns the .docx as a Blob.
 *
 * Returns rather than downloads so the caller can choose what to do with it
 * — download directly, or hand it to a PDF conversion step.
 */
export async function renderDocx({
  template,
  data,
  photoMaxWidthPx,
  photoMaxHeightPx,
}: RenderOptions): Promise<Blob> {
  const templateBuffer =
    typeof template === "string" ? await fetchTemplate(template) : template;
  const zip = new PizZip(templateBuffer);

  // Before rendering: the highlight lives in the placeholder's run
  // properties, which docxtemplater carries over to the substituted value.
  stripBodyHighlights(zip);

  const imageModule = new ImageModule({
    centered: false,
    getImage,
    getSize: makeGetSize(photoMaxWidthPx, photoMaxHeightPx),
  });

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule],
  });

  await doc.renderAsync(data);
  forceFieldUpdateOnOpen(doc.getZip());

  return doc.getZip().generate({ type: "blob", mimeType: DOCX_MIME }) as Blob;
}
