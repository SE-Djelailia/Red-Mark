import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Circle as CircleIcon,
  Crop,
  Pencil,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "./ConfirmDialog";
import CropOverlay from "./CropOverlay";
import { getPhotoSignedUrl } from "../../lib/supabaseApi";
import { usePrepareImage, FULL_CROP, type CropRect } from "../../hooks/usePrepareImage";
import {
  DEFAULT_COLOR,
  MARKUP_COLORS,
  createId,
  drawAnnotation,
  hitTestText,
  textBounds,
  type Annotation,
  type Point,
  type Tool,
} from "../../lib/annotationModel";

interface PhotoAnnotatorProps {
  photo: {
    id: string;
    storage_path: string;
    tags?: string[];
    location?: { floor?: string; room?: string };
  };
  onClose: () => void;
  onSave?: (photoId: string, annotatedImageBlob: Blob) => Promise<void>;
}

const TOOLS: { tool: Tool; icon: typeof Pencil; label: string }[] = [
  { tool: "pencil", icon: Pencil, label: "Crayon" },
  { tool: "arrow", icon: ArrowUpRight, label: "Flèche" },
  { tool: "rectangle", icon: Square, label: "Rectangle" },
  { tool: "circle", icon: CircleIcon, label: "Cercle" },
  { tool: "text", icon: Type, label: "Texte" },
];

const DRAW_TOOLS: Tool[] = ["pencil", "arrow", "rectangle", "circle"];

// Stroke width and font size are authored against a reference width so a
// "3px" line looks the same on a 4032px photo as on an 800px one. Without
// this, marks drawn on a high-res photo are invisibly thin.
const REFERENCE_WIDTH = 1200;

export function PhotoAnnotator({ photo, onClose, onSave }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // Measuring context for text hit-testing — kept off-DOM so it never
  // depends on the visible canvas's current transform state.
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { preparedUrl, isApplying, applyPrepare } = usePrepareImage(sourceUrl);

  const [mode, setMode] = useState<"annotate" | "prepare">("annotate");
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [rotation, setRotation] = useState(0);

  const [activeTool, setActiveTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [strokeScale, setStrokeScale] = useState(3);
  const [fontScale, setFontScale] = useState(18);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [hoveredTextId, setHoveredTextId] = useState<string | null>(null);
  const [textDragOffset, setTextDragOffset] = useState<Point | null>(null);
  const [textPrompt, setTextPrompt] = useState<{ point: Point; value: string } | null>(null);

  const hasAnnotations = annotations.length > 0;

  // ---- image loading -------------------------------------------------
  // Fetched to a blob URL rather than used cross-origin: a signed URL from
  // another origin taints the canvas, and a tainted canvas cannot be
  // exported with toBlob().
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const signedUrl = await getPhotoSignedUrl(photo.storage_path);
        const response = await fetch(signedUrl);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSourceUrl(objectUrl);
      } catch (error) {
        console.error("Error loading image for annotation:", error);
        if (!cancelled) setLoadError("Impossible de charger la photo.");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.storage_path]);

  useEffect(() => {
    setImageLoaded(false);
  }, [preparedUrl]);

  // ---- natural-resolution canvas -------------------------------------
  // The backing store matches the photo's true pixel size; CSS scales it
  // down for display. Annotations are therefore authored and exported at
  // full resolution no matter how small the on-screen view is.
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !img.naturalWidth) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }, []);

  const naturalScale = useCallback(() => {
    const img = imageRef.current;
    if (!img || !img.naturalWidth) return 1;
    return img.naturalWidth / REFERENCE_WIDTH;
  }, []);

  const currentLineWidth = useCallback(
    () => Math.max(1, strokeScale * naturalScale()),
    [strokeScale, naturalScale],
  );
  const currentFontSize = useCallback(
    () => Math.max(8, fontScale * naturalScale()),
    [fontScale, naturalScale],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    annotations.forEach((a) => drawAnnotation(ctx, a));
    if (draft) drawAnnotation(ctx, draft);

    // Text affordances: a dashed box on hover and a solid box with corner
    // handles when selected, so "this is draggable / editable" is visible
    // before the user commits to a gesture rather than after.
    const highlightId = selectedTextId || hoveredTextId;
    if (highlightId) {
      const target = annotations.find((a) => a.id === highlightId);
      if (target) {
        const bounds = textBounds(ctx, target);
        if (bounds) {
          const pad = 6 * naturalScale();
          const selected = target.id === selectedTextId;
          ctx.save();
          ctx.strokeStyle = "#E10600";
          ctx.lineWidth = Math.max(1, 1.5 * naturalScale());
          if (!selected) ctx.setLineDash([6 * naturalScale(), 4 * naturalScale()]);
          ctx.strokeRect(
            bounds.x - pad,
            bounds.y - pad,
            bounds.width + pad * 2,
            bounds.height + pad * 2,
          );
          if (selected) {
            const h = 4 * naturalScale();
            ctx.fillStyle = "#E10600";
            [
              [bounds.x - pad, bounds.y - pad],
              [bounds.x + bounds.width + pad, bounds.y - pad],
              [bounds.x - pad, bounds.y + bounds.height + pad],
              [bounds.x + bounds.width + pad, bounds.y + bounds.height + pad],
            ].forEach(([hx, hy]) => ctx.fillRect(hx - h, hy - h, h * 2, h * 2));
          }
          ctx.restore();
        }
      }
    }
  }, [annotations, draft, selectedTextId, hoveredTextId, naturalScale]);

  useEffect(() => {
    if (!imageLoaded) return;
    syncCanvasSize();
    redraw();
  }, [imageLoaded, redraw, syncCanvasSize]);

  const measureCtx = () => {
    if (!measureRef.current) {
      measureRef.current = document.createElement("canvas").getContext("2d");
    }
    return measureRef.current;
  };

  // ---- pointer input -------------------------------------------------
  // Pointer Events unify mouse, touch and pen in one code path, so the
  // annotator works with a finger on the phone and an Apple Pencil on the
  // iPad without a second set of handlers. The previous implementation
  // bound mouse events only, so drawing did not work on touch at all.
  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const pushHistory = (next: Annotation[]) => {
    const trimmed = history.slice(0, historyStep + 1);
    trimmed.push(next);
    setHistory(trimmed);
    setHistoryStep(trimmed.length - 1);
    setAnnotations(next);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "annotate" || !imageLoaded) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = pointFromEvent(e);
    const ctx = measureCtx();

    // Text selection takes priority over starting a new mark.
    if (ctx) {
      const hit = hitTestText(ctx, annotations, point);
      if (hit) {
        setSelectedTextId(hit.id);
        setTextDragOffset({ x: point.x - hit.points[0].x, y: point.y - hit.points[0].y });
        return;
      }
    }
    setSelectedTextId(null);

    if (activeTool === "text") {
      setTextPrompt({ point, value: "" });
      return;
    }

    setDraft({
      id: createId(),
      type: activeTool,
      points: [point],
      color,
      lineWidth: currentLineWidth(),
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "annotate") return;
    const point = pointFromEvent(e);

    if (textDragOffset && selectedTextId) {
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === selectedTextId
            ? { ...a, points: [{ x: point.x - textDragOffset.x, y: point.y - textDragOffset.y }] }
            : a,
        ),
      );
      return;
    }

    if (!draft) {
      const ctx = measureCtx();
      const hit = ctx ? hitTestText(ctx, annotations, point) : null;
      setHoveredTextId(hit?.id ?? null);
      return;
    }

    setDraft((prev) => {
      if (!prev) return prev;
      // Freehand accumulates every point; the shape tools only need their
      // start and current corner.
      const points =
        prev.type === "pencil" ? [...prev.points, point] : [prev.points[0], point];
      return { ...prev, points };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (textDragOffset) {
      setTextDragOffset(null);
      pushHistory(annotations);
      return;
    }
    if (!draft) return;
    // A tap with a shape tool produces a degenerate mark — drop it.
    if (draft.type !== "pencil" && draft.points.length < 2) {
      setDraft(null);
      return;
    }
    pushHistory([...annotations, draft]);
    setDraft(null);
  };

  const commitText = () => {
    if (!textPrompt) return;
    const value = textPrompt.value.trim();
    if (value) {
      pushHistory([
        ...annotations,
        {
          id: createId(),
          type: "text",
          points: [textPrompt.point],
          color,
          lineWidth: currentLineWidth(),
          text: value,
          fontSize: currentFontSize(),
        },
      ]);
    }
    setTextPrompt(null);
  };

  const deleteSelectedText = () => {
    if (!selectedTextId) return;
    pushHistory(annotations.filter((a) => a.id !== selectedTextId));
    setSelectedTextId(null);
  };

  const undo = () => {
    if (historyStep <= 0) return;
    const step = historyStep - 1;
    setHistoryStep(step);
    setAnnotations(history[step]);
    setSelectedTextId(null);
  };

  const redo = () => {
    if (historyStep >= history.length - 1) return;
    const step = historyStep + 1;
    setHistoryStep(step);
    setAnnotations(history[step]);
    setSelectedTextId(null);
  };

  const clearAll = () => {
    pushHistory([]);
    setSelectedTextId(null);
    setShowClearConfirm(false);
  };

  // ---- prepare mode --------------------------------------------------
  const applyPrepareStep = async () => {
    try {
      await applyPrepare(crop, rotation);
      setCrop(FULL_CROP);
      setRotation(0);
      setMode("annotate");
    } catch (error) {
      console.error("Error preparing image:", error);
      toast.error("Impossible de préparer l'image.");
    }
  };

  const cancelPrepare = () => {
    setCrop(FULL_CROP);
    setRotation(0);
    setMode("annotate");
  };

  // ---- save ----------------------------------------------------------
  const handleSave = async () => {
    const img = imageRef.current;
    if (!img || !onSave || isSaving) return;

    setIsSaving(true);
    try {
      // Export at natural resolution — the whole point of the coordinate
      // change. Sizing this to the on-screen canvas is what silently
      // downsampled every previously annotated photo.
      const out = document.createElement("canvas");
      out.width = img.naturalWidth;
      out.height = img.naturalHeight;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible.");

      ctx.drawImage(img, 0, 0, out.width, out.height);
      annotations.forEach((a) => drawAnnotation(ctx, a));

      // JPEG at 0.92: these are photographs, where PNG would balloon a
      // 12-megapixel frame to tens of megabytes over a site's cellular
      // connection for no visible benefit. Re-annotation re-encodes, but
      // at full resolution that generational loss is negligible.
      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Échec de l'export de l'image.");

      await onSave(photo.id, blob);
      onClose();
    } catch (error) {
      console.error("Error saving annotation:", error);
      toast.error("Erreur lors de la sauvegarde de l'annotation.");
    } finally {
      setIsSaving(false);
    }
  };

  const canUndo = historyStep > 0;
  const canRedo = historyStep < history.length - 1;
  const showStrokeRow = mode === "annotate" && DRAW_TOOLS.includes(activeTool);
  const showFontRow = mode === "annotate" && activeTool === "text";

  const iconButton =
    "w-10 h-10 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    // Backdrop stays dark: a photo reads accurately against a neutral dark
    // surround. Only the chrome is light — same rule as the photo lightbox.
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
      {/* Single compact toolbar. The previous three stacked bars cost ~180px
          of vertical space and scrolled horizontally on a phone. */}
      <div className="bg-surface border-b border-line flex-shrink-0">
        <div className="h-14 px-2 sm:px-4 flex items-center gap-1 sm:gap-2">
          <button onClick={onClose} className={`${iconButton} text-muted hover:bg-subtle`} title="Fermer">
            <X size={20} />
          </button>

          {mode === "annotate" ? (
            <>
              <div className="flex items-center gap-0.5 sm:gap-1">
                {TOOLS.map(({ tool, icon: Icon, label }) => (
                  <button
                    key={tool}
                    onClick={() => setActiveTool(tool)}
                    title={label}
                    aria-label={label}
                    aria-pressed={activeTool === tool}
                    className={`${iconButton} ${
                      activeTool === tool
                        ? "bg-brand-50 text-brand-600"
                        : "text-body hover:bg-subtle"
                    }`}
                  >
                    <Icon size={19} />
                  </button>
                ))}
              </div>

              <div className="w-px h-6 bg-line mx-0.5 sm:mx-1" />

              <div className="flex items-center gap-1.5">
                {MARKUP_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => {
                      setColor(c.value);
                      if (selectedTextId) {
                        pushHistory(
                          annotations.map((a) =>
                            a.id === selectedTextId ? { ...a, color: c.value } : a,
                          ),
                        );
                      }
                    }}
                    title={c.label}
                    aria-label={c.label}
                    aria-pressed={color === c.value}
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      color === c.value
                        ? "border-ink scale-110 ring-2 ring-brand-600/30"
                        : "border-line-strong"
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>

              <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
                <button
                  onClick={() => setMode("prepare")}
                  disabled={hasAnnotations}
                  title={
                    hasAnnotations
                      ? "Recadrer/pivoter n'est possible qu'avant d'annoter"
                      : "Préparer l'image"
                  }
                  className={`${iconButton} text-body hover:bg-subtle`}
                >
                  <Crop size={18} />
                </button>
                <button onClick={undo} disabled={!canUndo} title="Annuler" className={`${iconButton} text-body hover:bg-subtle`}>
                  <Undo2 size={18} />
                </button>
                <button onClick={redo} disabled={!canRedo} title="Rétablir" className={`${iconButton} text-body hover:bg-subtle`}>
                  <Redo2 size={18} />
                </button>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={!hasAnnotations}
                  title="Tout effacer"
                  className={`${iconButton} text-body hover:bg-subtle`}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !imageLoaded}
                  className="ml-1 h-10 px-3 sm:px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 active:bg-brand-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Check size={16} />
                  <span className="hidden sm:inline">
                    {isSaving ? "Enregistrement…" : "Enregistrer"}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-ink ml-1">Préparer l'image</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  title="Pivoter 90°"
                  className={`${iconButton} text-body hover:bg-subtle`}
                >
                  <RotateCw size={18} />
                </button>
                <button
                  onClick={cancelPrepare}
                  className="h-10 px-3 rounded-lg text-sm font-medium text-body hover:bg-subtle transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={applyPrepareStep}
                  disabled={isApplying}
                  className="h-10 px-4 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {isApplying ? "…" : "Appliquer"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Contextual row — only the control relevant to the active tool,
            so the bar stays one row on a phone. */}
        {(showStrokeRow || showFontRow) && (
          <div className="h-11 px-3 sm:px-4 flex items-center gap-3 border-t border-line">
            <span className="text-xs text-muted whitespace-nowrap">
              {showFontRow ? "Taille du texte" : "Épaisseur"}
            </span>
            <input
              type="range"
              min={showFontRow ? 10 : 1}
              max={showFontRow ? 48 : 12}
              value={showFontRow ? fontScale : strokeScale}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (showFontRow) {
                  setFontScale(v);
                  if (selectedTextId) {
                    setAnnotations((prev) =>
                      prev.map((a) =>
                        a.id === selectedTextId
                          ? { ...a, fontSize: Math.max(8, v * naturalScale()) }
                          : a,
                      ),
                    );
                  }
                } else {
                  setStrokeScale(v);
                }
              }}
              className="flex-1 max-w-xs accent-brand-600"
            />
            <span className="text-xs text-ink tabular-nums w-6">
              {showFontRow ? fontScale : strokeScale}
            </span>
            {selectedTextId && (
              <button
                onClick={deleteSelectedText}
                className="ml-auto h-8 px-2.5 rounded-lg text-xs font-medium text-brand-strong hover:bg-brand-50 transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                Supprimer le texte
              </button>
            )}
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-3 sm:p-6">
        {loadError ? (
          <p className="text-white/80 text-sm">{loadError}</p>
        ) : !preparedUrl ? (
          <div className="flex items-center gap-3 text-white">
            <div className="w-7 h-7 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-sm">Chargement de l'image…</span>
          </div>
        ) : (
          <div className="relative inline-block max-w-full">
            <img
              ref={imageRef}
              src={preparedUrl}
              alt="Photo à annoter"
              className="block max-w-full max-h-[70vh] select-none"
              draggable={false}
              onLoad={() => setImageLoaded(true)}
            />

            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => setHoveredTextId(null)}
              // touch-none stops the browser scrolling/zooming the page
              // mid-stroke, which would otherwise make drawing on a phone
              // pan the view instead of drawing.
              className={`absolute inset-0 w-full h-full touch-none ${
                mode === "prepare"
                  ? "pointer-events-none"
                  : activeTool === "text"
                    ? "cursor-text"
                    : "cursor-crosshair"
              }`}
            />

            {mode === "prepare" && <CropOverlay crop={crop} onChange={setCrop} />}

            {/* Inline text entry, placed where the user tapped. */}
            {textPrompt && (
              <div
                className="absolute z-10 bg-surface border border-line rounded-lg shadow-lg p-2 flex items-center gap-2"
                style={{
                  left: `${(textPrompt.point.x / (canvasRef.current?.width || 1)) * 100}%`,
                  top: `${(textPrompt.point.y / (canvasRef.current?.height || 1)) * 100}%`,
                }}
              >
                <input
                  autoFocus
                  value={textPrompt.value}
                  onChange={(e) => setTextPrompt({ ...textPrompt, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitText();
                    if (e.key === "Escape") setTextPrompt(null);
                  }}
                  placeholder="Texte…"
                  className="h-9 px-2 text-sm bg-surface text-ink border border-line rounded-md focus:outline-none focus:border-brand-600 w-40"
                />
                <button
                  onClick={commitText}
                  className="h-9 px-3 rounded-md bg-brand-600 text-white text-sm font-medium"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Persistent hint — the text tool's drag/edit capabilities were
          previously only hinted at after a selection had been made. */}
      {mode === "annotate" && (
        <div className="flex-shrink-0 px-4 py-2 text-center">
          <p className="text-xs text-white/60">
            {selectedTextId
              ? "Glissez pour déplacer · changez la couleur ou la taille ci-dessus"
              : activeTool === "text"
                ? "Touchez la photo pour ajouter du texte · touchez un texte pour le déplacer"
                : "Dessinez sur la photo · touchez un texte existant pour le modifier"}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        title="Effacer toutes les annotations ?"
        confirmLabel="Effacer"
        destructive
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={clearAll}
      />
    </div>
  );
}

export default PhotoAnnotator;
