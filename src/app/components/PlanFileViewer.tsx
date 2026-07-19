import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Maximize2,
  MapPin,
} from "lucide-react";
import { useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useProjectRole } from "../../hooks/useProjectRole";
import { useSmartBack } from "../../hooks/useSmartBack";
import {
  getPlanFile,
  getPlanFileSignedUrl,
  getPlansForFile,
  createPlan,
  getPinPlacements,
  createPinPlacement,
  type PlanFile,
  type Plan,
  type PinPlacement,
} from "../../lib/plansApi";
import { getLevels, getLocations, type Level, type Location } from "../../lib/locationsApi";
import { getIssueStatusesByLocations } from "../../lib/issuesApi";
import {
  openPdfFromUrl,
  renderPageToCanvas,
  getPageSize,
  type OpenedPdf,
  type RenderPageHandle,
} from "../../lib/pdfUtils";
import LocationPickerSheet from "./LocationPickerSheet";
import LocationPinPanel from "./LocationPinPanel";

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
  const { projectId, planFileId } = useParams<{ projectId: string; planFileId: string }>();
  const goBack = useSmartBack(`/app/projects/${projectId}`);
  // Present only when the viewer was opened from within an active visit
  // (VisitDetail's Plans tab → PlanFilesManager appends this) — absent when
  // opened from the project-level Plans tab. Threaded down to
  // LocationPinPanel, which uses it to set issues'/photos' visit_id and to
  // gate issue-creation when there's no active visit (see its own comment).
  const [searchParams] = useSearchParams();
  const visitId = searchParams.get("visitId") || undefined;

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

  // Stage 4: pin placements. `plans` holds the page-to-level assignment rows
  // for this file (one per assigned page) — pin_placements.plan_id points at
  // one of these, not at the plan_file directly, so a page must be assigned
  // before it can be pinned. `pins` holds the placements for whichever plan
  // row matches `currentPage` (recomputed below as `currentPlan`).
  const projectRole = useProjectRole(planFile?.projectId);
  const canManagePins = projectRole.canCreateIssues; // matches pin_placements RLS insert bar
  const [levels, setLevels] = useState<Level[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pins, setPins] = useState<PinPlacement[]>([]);
  const [assignLevelId, setAssignLevelId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{ x: number; y: number } | null>(null);
  const [openedLocationId, setOpenedLocationId] = useState<string | null>(null);
  // location id -> has at least one non-resolved issue. Never stored — a
  // pin's color (red/green) is purely this map applied live to pins.map()
  // below. Refetched whenever the pin set for this page changes, and again
  // when the location panel closes (an issue may have just been created or
  // resolved during that session).
  const [locationHasOpenIssue, setLocationHasOpenIssue] = useState<Record<string, boolean>>({});
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const currentPlan = plans.find((p) => p.pageNumber === currentPage) || null;
  const openedLocation = locations.find((l) => l.id === openedLocationId) || null;

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

  // Load the project's levels/locations (for the picker + assign banner) and
  // this file's page-to-level assignments once the plan file itself loads.
  useEffect(() => {
    if (!planFile) return;
    let cancelled = false;
    getLevels(planFile.projectId)
      .then((l) => !cancelled && setLevels(l))
      .catch((e) => console.error("Error loading levels:", e));
    getLocations(planFile.projectId)
      .then((l) => !cancelled && setLocations(l))
      .catch((e) => console.error("Error loading locations:", e));
    return () => {
      cancelled = true;
    };
  }, [planFile]);

  useEffect(() => {
    if (!planFileId) return;
    let cancelled = false;
    getPlansForFile(planFileId)
      .then((p) => !cancelled && setPlans(p))
      .catch((e) => console.error("Error loading plans:", e));
    return () => {
      cancelled = true;
    };
  }, [planFileId]);

  useEffect(() => {
    setAssignLevelId("");
    if (!currentPlan) {
      setPins([]);
      return;
    }
    let cancelled = false;
    getPinPlacements(currentPlan.id)
      .then((p) => {
        if (cancelled) return;
        setPins(p);
        refreshPinColors(p.map((pin) => pin.locationId));
      })
      .catch((e) => console.error("Error loading pin placements:", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlan?.id]);

  function refreshPinColors(locationIds: string[]) {
    if (locationIds.length === 0) {
      setLocationHasOpenIssue({});
      return;
    }
    getIssueStatusesByLocations(locationIds).then(setLocationHasOpenIssue);
  }

  async function handleAssignPage() {
    if (!planFile || !assignLevelId) return;
    setAssigning(true);
    try {
      const plan = await createPlan({
        projectId: planFile.projectId,
        planFileId: planFile.id,
        levelId: assignLevelId,
        pageNumber: currentPage,
      });
      setPlans((prev) => [...prev, plan]);
      toast.success("Page assignée au niveau");
    } catch (e: any) {
      toast.error("Assignation échouée : " + e.message);
    } finally {
      setAssigning(false);
    }
  }

  function handlePlacementTap(clientX: number, clientY: number) {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return; // tapped outside the rendered page (e.g. in the surrounding margin)
    }
    setPendingPinCoords({
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    });
  }

  async function handlePinLocationSelected(location: Location) {
    if (!currentPlan || !planFile || !pendingPinCoords) return;
    try {
      const pin = await createPinPlacement({
        projectId: planFile.projectId,
        locationId: location.id,
        planId: currentPlan.id,
        x: pendingPinCoords.x,
        y: pendingPinCoords.y,
      });
      setPins((prev) => [...prev, pin]);
      toast.success("Pin placé");
    } catch (e: any) {
      toast.error("Placement échoué : " + e.message);
    } finally {
      setPendingPinCoords(null);
    }
  }

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
    // A tap (as opposed to a drag-release) is a single pointer that barely
    // moved — checked before deleting it below, same threshold the pan
    // logic already uses to tell taps from drags.
    const wasTap = pointers.current.size === 1 && movedDistance.current < 8;

    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;

    if (wasTap && placementMode && currentPlan) {
      handlePlacementTap(e.clientX, e.clientY);
    }
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
    setPlacementMode(false);
    setPendingPinCoords(null);
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
          onClick={goBack}
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
        {canManagePins && currentPlan && (
          <button
            onClick={() => {
              setPlacementMode((v) => !v);
              setPendingPinCoords(null);
            }}
            className={`inline-flex items-center gap-2 px-3 h-11 rounded-lg text-sm font-medium min-h-[44px] ${
              placementMode ? "bg-[#E10600] text-white" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <MapPin size={16} />
            {placementMode ? "Terminer" : "Ajouter des pins"}
          </button>
        )}
      </div>

      {currentPlan === null && !loading && !error && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          {canManagePins ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-amber-900">
                Cette page n'est pas encore assignée à un niveau — assignez-la pour pouvoir y placer des pins.
              </span>
              <select
                value={assignLevelId}
                onChange={(e) => setAssignLevelId(e.target.value)}
                className="px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm min-h-[44px]"
              >
                <option value="">Choisir un niveau…</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAssignPage}
                disabled={!assignLevelId || assigning}
                className="px-4 h-11 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium disabled:opacity-50 min-h-[44px]"
              >
                {assigning ? "Assignation…" : "Assigner"}
              </button>
            </div>
          ) : (
            <span className="text-sm text-amber-900">
              Cette page n'est pas encore assignée à un niveau — un administrateur ou éditeur doit
              l'assigner avant que des pins puissent y être placés.
            </span>
          )}
        </div>
      )}

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
            {/* inline-block shrink-wraps to the canvas's own CSS size (set
                programmatically in renderPageToCanvas), so pins positioned
                by percentage inside it land exactly on the rendered page
                regardless of zoom — this wrapper shares the same transform
                as the canvas, so pins pan/zoom with the plan for free. */}
            <div ref={canvasWrapperRef} className="relative inline-block">
              <canvas ref={canvasRef} className="pointer-events-none block" />
              {currentPlan &&
                pins.map((pin) => (
                  <button
                    key={pin.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenedLocationId(pin.locationId);
                    }}
                    style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center"
                    aria-label="Ouvrir ce local"
                  >
                    <span
                      className={`w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                        locationHasOpenIssue[pin.locationId] ? "bg-[#E10600]" : "bg-green-600"
                      }`}
                    >
                      <MapPin size={13} className="text-white" fill="currentColor" />
                    </span>
                  </button>
                ))}
            </div>
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

      {placementMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-[#1A1A1A]/90 text-white text-xs px-3 py-2 rounded-full pointer-events-none">
          Touchez le plan pour placer un pin
        </div>
      )}

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

      <LocationPickerSheet
        open={!!pendingPinCoords && !!currentPlan}
        locations={locations.filter(
          (l) => l.levelId === currentPlan?.levelId && !pins.some((p) => p.locationId === l.id),
        )}
        onSelect={(location) => {
          handlePinLocationSelected(location);
        }}
        onCancel={() => setPendingPinCoords(null)}
      />

      {planFile && (
        <LocationPinPanel
          open={!!openedLocationId}
          projectId={planFile.projectId}
          visitId={visitId}
          location={openedLocation}
          onClose={() => {
            setOpenedLocationId(null);
            // An issue may have just been created/resolved during this
            // session — refresh this page's pin colors to reflect it.
            refreshPinColors(pins.map((pin) => pin.locationId));
          }}
        />
      )}
    </div>
  );
}
