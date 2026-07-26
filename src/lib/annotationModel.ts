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

export type Tool = "pencil" | "arrow" | "rectangle" | "circle" | "text";

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  type: Tool;
  points: Point[];
  color: string;
  /** Stroke width in natural pixels. */
  lineWidth: number;
  text?: string;
  /** Font size in natural pixels. */
  fontSize?: number;
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
    case "text": {
      if (!annotation.text) return;
      ctx.font = fontFor(annotation);
      ctx.textBaseline = "alphabetic";
      ctx.fillText(annotation.text, points[0].x, points[0].y);
      break;
    }
  }
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
