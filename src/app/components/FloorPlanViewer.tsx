import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Minus, Plus, MapPin, Maximize2, Check } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  FloorPlan,
  FloorPlanPin,
  createPin,
  deletePin,
  getFloorPlanSignedUrl,
  listPins,
} from "../../lib/floorPlansApi";
import { supabase } from "../../lib/supabase";
import { projectId as supabaseProjectId } from "/utils/supabase/info";
import PinIssueDialog from "./PinIssueDialog";
import ConfirmDialog from "./ConfirmDialog";

export default function FloorPlanViewer() {
  const { projectId, floorPlanId } = useParams<{
    projectId: string;
    floorPlanId: string;
  }>();
  const navigate = useNavigate();

  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pins, setPins] = useState<FloorPlanPin[]>([]);
  const [issuesMap, setIssuesMap] = useState<Record<string, any>>({});
  const [addMode, setAddMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const [linkPin, setLinkPin] = useState<FloorPlanPin | null>(null);
  const [deletePinTarget, setDeletePinTarget] = useState<FloorPlanPin | null>(null);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const movedDistance = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!floorPlanId) return;
      setLoading(true);
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const planRes = await fetch(
          `https://${supabaseProjectId}.supabase.co/functions/v1/make-server-9fe75696/floor-plans/${floorPlanId}`,
          { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } },
        );
        const plan: FloorPlan = await planRes.json();
        if (cancelled) return;
        setFloorPlan(plan);
        const url = await getFloorPlanSignedUrl(plan.bucket, plan.storage_path);
        if (cancelled) return;
        setImageUrl(url);
        const pinList = await listPins(floorPlanId);
        if (cancelled) return;
        setPins(pinList);

        const issueIds = pinList.map((p) => p.issue_id).filter(Boolean) as string[];
        if (issueIds.length) {
          const { data } = await supabase
            .from("issues")
            .select("id, title, priority, status")
            .in("id", issueIds);
          const map: Record<string, any> = {};
          (data || []).forEach((i: any) => (map[i.id] = i));
          if (!cancelled) setIssuesMap(map);
        }
      } catch (e: any) {
        toast.error("Erreur de chargement du plan : " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [floorPlanId]);

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
      const newScale = Math.min(
        6,
        Math.max(0.5, (pinchStart.current.scale * dist) / pinchStart.current.dist),
      );
      setScale(newScale);
    } else if (pointers.current.size === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      movedDistance.current = Math.max(movedDistance.current, Math.hypot(dx, dy));
      setTx(dragStart.current.tx + dx);
      setTy(dragStart.current.ty + dy);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(6, Math.max(0.5, s * delta)));
  };

  const onImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!addMode || !floorPlanId) return;
    if (movedDistance.current > 8) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    try {
      const pin = await createPin(floorPlanId, x, y, null, "");
      setPins((p) => [...p, pin]);
      setJustSavedId(pin.id);
      setTimeout(() => {
        setJustSavedId((cur) => (cur === pin.id ? null : cur));
      }, 1500);
      toast.success("Pin enregistré");
      setLinkPin(pin);
    } catch (err: any) {
      toast.error("Impossible de créer le pin : " + err.message);
    }
  };

  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const handleConfirmDelete = async () => {
    if (!deletePinTarget) return;
    try {
      await deletePin(deletePinTarget.id);
      setPins((p) => p.filter((x) => x.id !== deletePinTarget.id));
      toast.success("Pin supprimé");
      setDeletePinTarget(null);
    } catch (e: any) {
      toast.error("Suppression échouée : " + e.message);
    }
  };

  const handlePinClick = (pin: FloorPlanPin) => {
    if (pin.issue_id) {
      navigate(`/app/projects/${projectId}/issues/${pin.issue_id}`);
    } else {
      setLinkPin(pin);
    }
  };

  const handleLinked = (
    pin: FloorPlanPin,
    issue: { id: string; title: string; priority: string; status: string },
  ) => {
    setPins((list) => list.map((p) => (p.id === pin.id ? pin : p)));
    setIssuesMap((m) => ({ ...m, [issue.id]: issue }));
    setLinkPin(null);
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
          <div className="text-sm truncate">{floorPlan?.name || "Plan"}</div>
          {floorPlan?.level && (
            <div className="text-xs text-white/60 truncate">{floorPlan.level}</div>
          )}
        </div>
        <button
          onClick={() => setAddMode((v) => !v)}
          className={`px-4 h-11 rounded-lg text-sm font-medium ${
            addMode ? "bg-[#E10600] text-white" : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          {addMode ? "Terminer" : "Ajouter des pins"}
        </button>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden touch-none select-none"
        style={{ cursor: addMode ? "crosshair" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70">
            Chargement…
          </div>
        )}
        {imageUrl && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
              transformOrigin: "center center",
              transition: pointers.current.size === 0 ? "transform 0.15s ease-out" : "none",
            }}
          >
            <div className="relative">
              <img
                src={imageUrl}
                alt={floorPlan?.name || "Plan"}
                className="max-w-[90vw] max-h-[80vh] object-contain pointer-events-auto"
                draggable={false}
                onClick={onImageClick}
              />
              {pins.map((pin) => {
                const issue = pin.issue_id ? issuesMap[pin.issue_id] : null;
                const color =
                  issue?.priority === "critical"
                    ? "#991B1B"
                    : issue?.priority === "high"
                      ? "#EA580C"
                      : issue?.status === "resolved"
                        ? "#16A34A"
                        : "#E10600";
                const isJustSaved = justSavedId === pin.id;
                return (
                  <button
                    key={pin.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeletePinTarget(pin);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePinClick(pin);
                    }}
                    className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
                    style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                    title={issue?.title || "Pin sans déficience — touchez pour lier"}
                  >
                    <div
                      className={`w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center ${
                        isJustSaved ? "ring-4 ring-green-400 animate-pulse" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      <MapPin size={16} className="text-white" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {justSavedId && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm">
            <Check size={16} />
            Pin enregistré
          </div>
        )}
      </div>

      <div className="absolute right-4 bottom-28 flex flex-col gap-2">
        <button
          onClick={() => setScale((s) => Math.min(6, s * 1.2))}
          className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-[#1A1A1A] hover:bg-gray-100"
          aria-label="Zoom avant"
        >
          <Plus size={22} />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.5, s / 1.2))}
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

      {addMode && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 text-sm text-gray-600 text-center">
          Touchez le plan pour ajouter un pin · Les pins sont enregistrés automatiquement
        </div>
      )}

      {projectId && floorPlanId && (
        <PinIssueDialog
          open={!!linkPin}
          pin={linkPin}
          projectId={projectId}
          floorPlanId={floorPlanId}
          onClose={() => setLinkPin(null)}
          onLinked={handleLinked}
        />
      )}

      <ConfirmDialog
        open={!!deletePinTarget}
        title="Supprimer ce pin ?"
        description="Le pin sera retiré du plan. La déficience liée ne sera pas supprimée."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeletePinTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
