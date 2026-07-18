import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Minus, Plus, Maximize2 } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";
import { getPlanFile, getPlanFileSignedUrl, type PlanFile } from "../../lib/plansApi";
import {
  openPdfFromUrl,
  renderPageToCanvas,
  getPageSize,
  type OpenedPdf,
  type RenderPageHandle,
} from "../../lib/pdfUtils";

// The zoom/pan gesture layer below (pointer handling, pinch math, drag,
// wheel zoom, +/-/reset) is carried over verbatim from FloorPlanViewer.tsx —
// it operates purely on a wrapping div's CSS transform and never cared what
// was inside it (previously an <img>, now a <canvas> that pdf.js renders
// into). Pin placement is intentionally not part of this component.
const MIN_SCALE = 0.5;
// The resolution cap in pdfUtils.ts triggers when the settle-render's target
// CSS width × devicePixelRatio exceeds MAX_CANVAS_DIMENSION (4096px) — a
// relationship that's independent of the underlying page's size (the two
// cancel out in renderScale's derivation), so it's purely a function of the
// container's "fit" width and the device's pixel ratio. On a typical phone
// (fit width ~350-400px, dpr capped at 2), that threshold sits around 5-6x;
// 8x stays crisp there for effectively the whole range and only mildly
// degrades (never blurs uncontrolled — see achievedCssWidth handling) on
// unusually large desktop displays where the fit width is already big.
const MAX_SCALE = 8;
const SETTLE_DELAY_MS = 220;

export default function PlanFileViewer() {
  const { planFileId } = useParams<{ projectId: string; planFileId: string }>();
  const navigate = useNavigate();

  // This is a full-screen route (`fixed inset-0`), not a modal — but it's
  // still covered by the app's persistent, fixed, higher-z-index BottomNav
  // unless it explicitly asks for it to hide. useModalOpen() isn't just for
  // modals: ANY full-screen route needs this call, or its bottom-anchored
  // controls (here: page navigation, zoom buttons) render invisibly behind
  // the nav bar. Don't remove this without re-checking that.
  useModalOpen();

  const [planFile, setPlanFile] = useState<PlanFile | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [loading, setLoading] = useState(true);
  const [pageRendering, setPageRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // scale = the zoom level the user has interactively requested (1 = fit).
  // renderedScale = the zoom level the canvas bitmap was actually rendered
  // at. The gap between them is covered by a cheap CSS transform during
  // gestures; once settled, a real re-render closes the gap so the vector
  // content stays crisp instead of blurring under CSS scaling.
  const [scale, setScale] = useState(1);
  const [renderedScale, setRenderedScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<OpenedPdf | null>(null);
  const fitCssWidthRef = useRef(0);
  const fitCssHeightRef = useRef(0);
  const renderHandleRef = useRef<RenderPageHandle | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const movedDistance = useRef(0);
  // Set for the duration of a button-triggered zoom ramp (animateScaleTo).
  // While true, the wrapper transform gets transition:none, same as an
  // active pinch — the animation is JS-driven (many small rAF steps), so a
  // CSS transition on top of that would fight it and look laggy.
  const isAnimatingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // --- Open the document (once per plan file) ---
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!planFileId) return;
      setLoading(true);
      setError(null);
      try {
        const file = await getPlanFile(planFileId);
        if (!file) throw new Error("Fichier introuvable.");
        if (cancelled) return;
        setPlanFile(file);

        const url = await getPlanFileSignedUrl(file);
        if (cancelled) return;

        const opened = await openPdfFromUrl(url);
        if (cancelled) {
          opened.destroy();
          return;
        }
        pdfRef.current = opened;
        setNumPages(opened.numPages);
        setCurrentPage(1);
        setPageInput("1");
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Erreur de chargement du plan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      renderHandleRef.current?.cancel();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [planFileId]);

  // Renders `page` fit to the current container size, resetting zoom/pan.
  // Shared by the page-change effect and the resize handler below.
  async function renderFitted(page: number) {
    const doc = pdfRef.current;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!doc || !container || !canvas) return;

    renderHandleRef.current?.cancel();
    setPageRendering(true);
    try {
      const { width, height } = await getPageSize(doc.pdfDoc, page);
      const maxWidth = container.clientWidth * 0.9;
      const maxHeight = container.clientHeight * 0.8;
      const aspect = width / height;
      let fitWidth = maxWidth;
      let fitHeight = fitWidth / aspect;
      if (fitHeight > maxHeight) {
        fitHeight = maxHeight;
        fitWidth = fitHeight * aspect;
      }
      fitCssWidthRef.current = fitWidth;
      fitCssHeightRef.current = fitHeight;

      setScale(1);
      setTx(0);
      setTy(0);

      const handle = renderPageToCanvas(doc.pdfDoc, page, canvas, fitWidth);
      renderHandleRef.current = handle;
      const { achievedCssWidth } = await handle.promise;
      // The initial "fit" render can itself be capped for a very large
      // sheet — reconcile renderedScale (and thus fitCssHeightRef, since
      // aspect ratio is fixed) with what was actually achieved, not what
      // was requested, so the CSS transform ratio starts consistent.
      setRenderedScale(achievedCssWidth / fitWidth);
    } catch (e: any) {
      toast.error("Erreur d'affichage de la page : " + e.message);
    } finally {
      setPageRendering(false);
    }
  }

  // --- Render whenever the current page (or the loaded document) changes ---
  useEffect(() => {
    if (loading || !pdfRef.current) return;
    renderFitted(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, loading]);

  // --- Re-fit on container resize (e.g. phone rotation) ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!loading && pdfRef.current) renderFitted(currentPage);
      }, 200);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, loading]);

  // Debounced crisp re-render at `targetScale`, once the gesture settles.
  function triggerSettleRender(targetScale: number) {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      if (pointers.current.size > 0) return; // gesture somehow still active
      const doc = pdfRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;

      renderHandleRef.current?.cancel();
      const handle = renderPageToCanvas(
        doc.pdfDoc,
        currentPage,
        canvas,
        fitCssWidthRef.current * targetScale,
      );
      renderHandleRef.current = handle;
      handle.promise
        .then(({ achievedCssWidth }) => {
          // Use what was actually rendered, not what was requested — if the
          // resolution cap engaged, targetScale would leave the transform
          // ratio (scale/renderedScale) permanently non-1, silently
          // re-blurring the crisp frame we just produced.
          setRenderedScale(achievedCssWidth / fitCssWidthRef.current);
        })
        .catch(() => {});
    }, SETTLE_DELAY_MS);
  }

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  // The logical displayed size at any moment is always fitCssWidth * scale
  // (fitCssHeight * scale for height) regardless of which render tier is
  // currently showing — `scale` is always the total zoom relative to the
  // fit baseline. Pan is clamped so the content's near edge can reach the
  // container's edge (fully usable when zoomed in) but never be dragged
  // past it, so the plan can't be lost off-screen.
  const getPanBounds = (forScale: number) => {
    const container = containerRef.current;
    if (!container) return { maxTx: 0, maxTy: 0 };
    const displayedWidth = fitCssWidthRef.current * forScale;
    const displayedHeight = fitCssHeightRef.current * forScale;
    return {
      maxTx: Math.max(0, (displayedWidth - container.clientWidth) / 2),
      maxTy: Math.max(0, (displayedHeight - container.clientHeight) / 2),
    };
  };

  const clampPan = (x: number, y: number, forScale: number) => {
    const { maxTx, maxTy } = getPanBounds(forScale);
    return {
      x: Math.min(maxTx, Math.max(-maxTx, x)),
      y: Math.min(maxTy, Math.max(-maxTy, y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedDistance.current = 0;

    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStart.current = { dist, scale };
      dragStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const newScale = clampScale((pinchStart.current.scale * dist) / pinchStart.current.dist);
      const clamped = clampPan(tx, ty, newScale);
      setScale(newScale);
      setTx(clamped.x);
      setTy(clamped.y);
      triggerSettleRender(newScale);
    } else if (pointers.current.size === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      movedDistance.current = Math.max(movedDistance.current, Math.hypot(dx, dy));
      const clamped = clampPan(dragStart.current.tx + dx, dragStart.current.ty + dy, scale);
      setTx(clamped.x);
      setTy(clamped.y);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
  };

  const applyScale = (newScale: number) => {
    const clamped = clampPan(tx, ty, newScale);
    setScale(newScale);
    setTx(clamped.x);
    setTy(clamped.y);
    triggerSettleRender(newScale);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    applyScale(clampScale(scale * delta));
  };

  // Animates a button-triggered zoom as a burst of small rAF-driven steps
  // (transition:none throughout, matching an active pinch's zero-lag
  // tracking) instead of one large CSS-eased jump — a single ~20% jump
  // animated via CSS transition reads as a hitch, whereas many small steps
  // read as smooth, which is what actually makes wheel/pinch feel good.
  // The debounced settle-render fires once, at the end of the ramp, not
  // per frame.
  function animateScaleTo(targetScale: number, durationMs = 180) {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);

    const startScale = scale;
    const startTx = tx;
    const startTy = ty;
    const target = clampPan(tx, ty, targetScale);
    const startTime = performance.now();
    isAnimatingRef.current = true;

    function step(now: number) {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out, computed in JS instead of CSS
      setScale(startScale + (targetScale - startScale) * eased);
      setTx(startTx + (target.x - startTx) * eased);
      setTy(startTy + (target.y - startTy) * eased);

      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
        isAnimatingRef.current = false;
        triggerSettleRender(targetScale);
      }
    }
    animationFrameRef.current = requestAnimationFrame(step);
  }

  const zoomIn = () => animateScaleTo(clampScale(scale * 1.2));
  const zoomOut = () => animateScaleTo(clampScale(scale / 1.2));
  const resetView = () => {
    setScale(1);
    setTx(0);
    setTy(0);
    triggerSettleRender(1);
  };

  const goToPage = (page: number) => {
    const clamped = Math.min(Math.max(1, page), numPages || 1);
    if (clamped === currentPage) return;
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  };

  const submitPageInput = () => {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n)) goToPage(n);
    else setPageInput(String(currentPage));
  };

  return (
    <div className="fixed inset-0 bg-[#1A1A1A] z-40 flex flex-col">
      <div className="bg-[#1A1A1A] text-white px-4 py-3 flex items-center gap-3 border-b border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-lg"
          aria-label="Retour"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{planFile?.name || "Plan"}</div>
          {numPages > 0 && (
            <div className="text-xs text-white/60 truncate">
              Page {currentPage} / {numPages}
            </div>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden touch-none select-none"
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {(loading || pageRendering) && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 pointer-events-none z-10">
            Chargement…
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!error && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale / renderedScale})`,
              transformOrigin: "center center",
              transition:
                pointers.current.size === 0 && !isAnimatingRef.current
                  ? "transform 0.15s ease-out"
                  : "none",
            }}
          >
            <canvas ref={canvasRef} className="pointer-events-none" />
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-28 flex flex-col gap-2">
        <button
          onClick={zoomIn}
          className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-[#1A1A1A] hover:bg-gray-100"
          aria-label="Zoom avant"
        >
          <Plus size={22} />
        </button>
        <button
          onClick={zoomOut}
          className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-[#1A1A1A] hover:bg-gray-100"
          aria-label="Zoom arrière"
        >
          <Minus size={22} />
        </button>
        <button
          onClick={resetView}
          className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-[#1A1A1A] hover:bg-gray-100"
          aria-label="Réinitialiser"
        >
          <Maximize2 size={20} />
        </button>
      </div>

      {/* Page navigation */}
      {numPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-center gap-3">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-[#1A1A1A] hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Page précédente"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="number"
              min={1}
              max={numPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={submitPageInput}
              onKeyDown={(e) => e.key === "Enter" && submitPageInput()}
              className="w-14 px-2 py-2 border border-gray-300 rounded-lg text-center min-h-[44px]"
            />
            <span className="text-gray-500">/ {numPages}</span>
          </div>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-[#1A1A1A] hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Page suivante"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
