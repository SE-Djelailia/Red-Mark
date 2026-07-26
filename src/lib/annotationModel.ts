// Annotation model + rendering, extracted from PhotoAnnotator so the
// component owns interaction and this owns geometry/drawing.
//
// COORDINATE SPACE — the important invariant: every point here is in
// NATURAL image pixels (the photo's true resolution), never in displayed
// CSS pixels. The previous implementation stored display-space points and
// sized its export canvas to the on-screen width, so annotating a 4032px
// site photo on a 390px phone permanently rewrote it as a ~390px image.
// Storing natural coordinates means the export is always full-resolution
// regardless of the device it was annotated on.

// "eraser" is an interaction mode, not a mark: it selects an existing
// annotation for removal and never produces one of its own. It is part of
// the Tool union because the toolbar treats it as a selectable tool, but
// no Annotation is ever created with type "eraser".
export type Tool =
  | "eraser"
  | "pencil"
  | "arrow"
  | "rectangle"
  | "circle"
  | "dimension"
  | "pin"
  | "text";

/** Tools that actually produce an Annotation. */
export type MarkType = Exclude<Tool, "eraser">;

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  type: MarkType;
  points: Point[];
  color: string;
  /** Stroke width in natural pixels. */
  lineWidth: number;
  text?: string;
  /** Font size in natural pixels. */
  fontSize?: number;
  /**
   * Display number for a "pin". Not persisted as the source of truth —
   * renumberPins() recomputes it from array order after any deletion, so
   * the sequence never shows a gap.
   */
  index?: number;
}

// The design system's four purposeful markup colours. Red is the default
// (a déficience marker); amber warns; ink and white exist so markup stays
// legible on light and dark photos respectively.
export const MARKUP_COLORS = [
  { value: "#E10600", label: "Rouge" },
  { value: "#A16207", label: "Ambre" },
  { value: "#1A1A1A", label: "Noir" },
  { value: "#FFFFFF", label: "Blanc" },
] as const;

export const DEFAULT_COLOR = MARKUP_COLORS[0].value;

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, lineWidth: number) {
  const headLength = Math.max(lineWidth * 4, 12);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 6),
    to.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 6),
    to.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

/** Radius of a numbered callout pin, in natural pixels. */
export function pinRadius(lineWidth: number): number {
  return Math.max(lineWidth * 5, 14);
}

function drawPin(ctx: CanvasRenderingContext2D, annotation: Annotation) {
  const { points, color, lineWidth } = annotation;
  const centre = points[0];
  const r = pinRadius(lineWidth);
  const label = String(annotation.index ?? 1);

  // Filled disc in the mark colour with a white ring, so the pin stays
  // legible over both a dark and a bright area of the photo.
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, lineWidth * 0.6);
  ctx.strokeStyle = "#FFFFFF";
  ctx.stroke();

  // White numeral, except on a white pin where it would vanish.
  ctx.fillStyle = color.toUpperCase() === "#FFFFFF" ? "#1A1A1A" : "#FFFFFF";
  ctx.font = `bold ${r * 1.15}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, centre.x, centre.y);
}

function drawDimension(ctx: CanvasRenderingContext2D, annotation: Annotation) {
  const { points, color, lineWidth } = annotation;
  const from = points[0];
  const to = points[points.length - 1];
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const tick = Math.max(lineWidth * 3, 10);

  // Main run.
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // Perpendicular end ticks — the convention that distinguishes a
  // dimension line from a plain rule.
  const nx = Math.cos(angle + Math.PI / 2) * tick;
  const ny = Math.sin(angle + Math.PI / 2) * tick;
  ctx.beginPath();
  ctx.moveTo(from.x - nx, from.y - ny);
  ctx.lineTo(from.x + nx, from.y + ny);
  ctx.moveTo(to.x - nx, to.y - ny);
  ctx.lineTo(to.x + nx, to.y + ny);
  ctx.stroke();

  if (!annotation.text) return;

  // Label centred on the run, with an opaque backing plate so it stays
  // readable over a busy photo instead of blending into the texture.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  ctx.save();
  ctx.font = fontFor(annotation);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = ctx.measureText(annotation.text);
  const padX = Math.max(lineWidth * 2, 6);
  const padY = Math.max(lineWidth * 1.5, 4);
  const boxW = metrics.width + padX * 2;
  const boxH = (annotation.fontSize || lineWidth * 8) + padY * 2;

  ctx.fillStyle = color.toUpperCase() === "#FFFFFF" ? "#1A1A1A" : "#FFFFFF";
  ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lineWidth * 0.5);
  ctx.strokeRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);

  ctx.fillStyle = color;
  ctx.fillText(annotation.text, midX, midY);
  ctx.restore();
}

export function fontFor(annotation: Annotation): string {
  return `${annotation.fontSize || annotation.lineWidth * 8}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation) {
  const { type, points, color, lineWidth } = annotation;
  if (points.length === 0) return;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (type) {
    case "pencil": {
      // Quadratic smoothing rather than lineTo between raw pointer samples.
      // Pointer events arrive as discrete points, so straight segments
      // between them read as a visibly polygonal, low-poly path. Using each
      // captured point as a Bézier control and the MIDPOINT of consecutive
      // points as the curve endpoint yields a continuous curve: successive
      // segments share a tangent at every midpoint, so there are no corners.
      ctx.beginPath();

      if (points.length < 3) {
        // Not enough samples for a curve — a dot or a single short segment.
        ctx.moveTo(points[0].x, points[0].y);
        if (points.length === 2) {
          ctx.lineTo(points[1].x, points[1].y);
        } else {
          // A tap with no movement still deserves a visible mark; a
          // zero-length path strokes nothing even with a round cap.
          ctx.arc(points[0].x, points[0].y, lineWidth / 2, 0, 2 * Math.PI);
          ctx.fill();
          break;
        }
      } else {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const midX = (points[i].x + points[i + 1].x) / 2;
          const midY = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        // Final control point is the last-but-one sample, ending exactly on
        // the last sample so the stroke reaches where the pointer stopped.
        const last = points[points.length - 1];
        const penultimate = points[points.length - 2];
        ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
      }

      ctx.stroke();
      break;
    }
    case "arrow": {
      if (points.length < 2) return;
      drawArrow(ctx, points[0], points[points.length - 1], lineWidth);
      break;
    }
    case "rectangle": {
      if (points.length < 2) return;
      const [a, b] = [points[0], points[points.length - 1]];
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      break;
    }
    case "circle": {
      if (points.length < 2) return;
      const [a, b] = [points[0], points[points.length - 1]];
      const radius = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      ctx.beginPath();
      ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, radius, 0, 2 * Math.PI);
      ctx.stroke();
      break;
    }
    case "dimension": {
      if (points.length < 2) return;
      drawDimension(ctx, annotation);
      break;
    }
    case "pin": {
      drawPin(ctx, annotation);
      break;
    }
    case "text": {
      if (!annotation.text) return;
      ctx.font = fontFor(annotation);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(annotation.text, points[0].x, points[0].y);
      break;
    }
  }

  // drawPin/drawDimension set textAlign/textBaseline and the pin sets a
  // contrasting fillStyle. Restore the defaults so the next annotation in
  // the loop is not silently drawn centred or in the wrong colour.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/**
 * Reassign pin numbers from array order.
 *
 * Called after every deletion so a numbered list never shows a gap:
 * deleting #2 of 4 leaves 1, 2, 3 rather than 1, 3, 4. Pins map to a
 * numbered deficiency list, where a missing number reads as a lost item.
 */
export function renumberPins(annotations: Annotation[]): Annotation[] {
  let n = 0;
  return annotations.map((a) => (a.type === "pin" ? { ...a, index: ++n } : a));
}

export function nextPinNumber(annotations: Annotation[]): number {
  return annotations.filter((a) => a.type === "pin").length + 1;
}

/**
 * Bounding box of a text annotation, in natural pixels.
 *
 * Measured with the same font the renderer uses, so hit-testing matches
 * what's actually drawn. The old implementation hard-coded `Arial` here
 * while drawing with a different font, so the clickable region drifted
 * from the visible glyphs — worse after a rotate, since it also assumed
 * the canvas was never transformed.
 */
export function textBounds(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
): { x: number; y: number; width: number; height: number } | null {
  if (annotation.type !== "text" || !annotation.text || annotation.points.length === 0) {
    return null;
  }
  const origin = annotation.points[0];
  ctx.save();
  ctx.font = fontFor(annotation);
  const metrics = ctx.measureText(annotation.text);
  ctx.restore();

  // actualBoundingBox* accounts for ascenders/descenders, so the box wraps
  // the real glyphs rather than a nominal em-box guess.
  const ascent = metrics.actualBoundingBoxAscent || annotation.fontSize || 16;
  const descent = metrics.actualBoundingBoxDescent || 0;
  return {
    x: origin.x,
    y: origin.y - ascent,
    width: metrics.width,
    height: ascent + descent,
  };
}

export function hitTestText(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  point: Point,
  padding = 8,
): Annotation | null {
  // Reverse order so the topmost (most recently drawn) text wins.
  for (let i = annotations.length - 1; i >= 0; i--) {
    const bounds = textBounds(ctx, annotations[i]);
    if (!bounds) continue;
    if (
      point.x >= bounds.x - padding &&
      point.x <= bounds.x + bounds.width + padding &&
      point.y >= bounds.y - padding &&
      point.y <= bounds.y + bounds.height + padding
    ) {
      return annotations[i];
    }
  }
  return null;
}

// ---- general hit-testing -------------------------------------------------
// Everything below works in NATURAL image pixels, same as rendering, so a
// tap resolves identically whether the photo is displayed at 390px or full
// size. The tolerance passed in by the caller is scaled to natural pixels
// on the component side.

/** Shortest distance from p to the segment ab. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Projection parameter, clamped to the segment so the perpendicular
  // foot never lands on the infinite line beyond the endpoints.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToPolyline(p: Point, points: Point[]): number {
  if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, distanceToSegment(p, points[i], points[i + 1]));
  }
  return min;
}

/** Distance to the outline (not the interior) of the rect spanned by a,b. */
function distanceToRectEdge(p: Point, a: Point, b: Point): number {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const corners: Point[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
  return distanceToPolyline(p, corners);
}

/**
 * True when `point` is within `tolerance` of the annotation as drawn.
 *
 * Deliberately edge-based for the outline shapes: a rectangle drawn around
 * a defect is mostly empty interior, and treating that whole area as a hit
 * target would make it impossible to select anything drawn inside it.
 * Pins and text are the exceptions — they are solid marks, so their whole
 * body is the target.
 */
export function hitTestAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  point: Point,
  tolerance: number,
): boolean {
  const { type, points, lineWidth } = annotation;
  if (points.length === 0) return false;
  // A thick stroke is a bigger target than a hairline one.
  const slop = tolerance + lineWidth / 2;
  const a = points[0];
  const b = points[points.length - 1];

  switch (type) {
    case "pencil":
      return distanceToPolyline(point, points) <= slop;
    case "arrow":
    case "dimension":
      return points.length >= 2 && distanceToSegment(point, a, b) <= slop;
    case "rectangle":
      return points.length >= 2 && distanceToRectEdge(point, a, b) <= slop;
    case "circle": {
      if (points.length < 2) return false;
      const radius = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      // Distance from the ring itself, not from the centre.
      return Math.abs(Math.hypot(point.x - cx, point.y - cy) - radius) <= slop;
    }
    case "pin":
      return Math.hypot(point.x - a.x, point.y - a.y) <= pinRadius(lineWidth) + tolerance;
    case "text": {
      const bounds = textBounds(ctx, annotation);
      if (!bounds) return false;
      return (
        point.x >= bounds.x - tolerance &&
        point.x <= bounds.x + bounds.width + tolerance &&
        point.y >= bounds.y - tolerance &&
        point.y <= bounds.y + bounds.height + tolerance
      );
    }
  }
}

/** Topmost annotation under `point`, or null. */
export function hitTest(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  point: Point,
  tolerance: number,
): Annotation | null {
  // Reverse order: the most recently drawn mark is on top, so it wins.
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTestAnnotation(ctx, annotations[i], point, tolerance)) return annotations[i];
  }
  return null;
}

/**
 * Bounding box of any annotation, used to draw the eraser's selection
 * highlight. Returns natural-pixel coordinates.
 */
export function annotationBounds(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
): { x: number; y: number; width: number; height: number } | null {
  const { type, points, lineWidth } = annotation;
  if (points.length === 0) return null;

  if (type === "text") return textBounds(ctx, annotation);

  if (type === "pin") {
    const r = pinRadius(lineWidth);
    return { x: points[0].x - r, y: points[0].y - r, width: r * 2, height: r * 2 };
  }

  if (type === "circle" && points.length >= 2) {
    const [a, b] = [points[0], points[points.length - 1]];
    const radius = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    return {
      x: (a.x + b.x) / 2 - radius,
      y: (a.y + b.y) / 2 - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
