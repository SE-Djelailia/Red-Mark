import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Upload, FileImage, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  FloorPlan,
  deleteFloorPlan,
  listFloorPlans,
  uploadFloorPlan,
} from "../../lib/floorPlansApi";
import FloorPlanUploadModal from "./FloorPlanUploadModal";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  projectId: string;
}

export default function FloorPlanManager({ projectId }: Props) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<FloorPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FloorPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setLoading(true);
      const list = await listFloorPlans(projectId);
      setPlans(list);
    } catch (e: any) {
      toast.error("Impossible de charger les plans : " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [projectId]);

  const handleConfirmUpload = async (data: {
    name: string;
    level: string;
    description: string;
    file: File;
  }) => {
    try {
      setUploading(true);
      const plan = await uploadFloorPlan(projectId, data.file, data.name, data.level);
      setPlans((p) => [plan, ...p]);
      setPendingFile(null);
      toast.success("Plan téléversé");
    } catch (e: any) {
      toast.error("Téléversement échoué : " + e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteFloorPlan(deleteTarget.id);
      setPlans((p) => p.filter((x) => x.id !== deleteTarget.id));
      toast.success("Plan supprimé");
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error("Suppression échouée : " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[#1A1A1A]">Plans d'étage</h3>
          <p className="text-xs text-gray-500">
            Téléversez des plans pour localiser les déficiences
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 h-11 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-50 text-sm font-medium min-h-[44px]"
        >
          <Upload size={16} />
          {uploading ? "Téléversement…" : "Ajouter un plan"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingFile(f);
          }}
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
          Chargement…
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <FileImage size={36} className="mx-auto text-gray-300 mb-2" />
          <div className="text-sm text-gray-600 mb-1">Aucun plan d'étage</div>
          <div className="text-xs text-gray-400">
            Téléversez une image (PNG, JPG, WebP) pour commencer
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:border-[#E10600] hover:shadow-md transition-all"
            >
              <button
                onClick={() =>
                  navigate(`/app/projects/${projectId}/floor-plans/${plan.id}`)
                }
                className="flex-1 flex items-center gap-3 text-left min-w-0"
              >
                <div className="w-12 h-12 rounded-lg bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
                  <FileImage size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#1A1A1A] font-medium truncate">
                    {plan.name}
                  </div>
                  {plan.level && (
                    <div className="text-xs text-gray-500 truncate">{plan.level}</div>
                  )}
                </div>
                <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
              </button>
              <button
                onClick={() => setDeleteTarget(plan)}
                className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-[#E10600] hover:bg-red-50 rounded-lg"
                aria-label="Supprimer le plan"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <FloorPlanUploadModal
        open={!!pendingFile}
        file={pendingFile}
        onCancel={() => {
          setPendingFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        onConfirm={handleConfirmUpload}
        saving={uploading}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer ce plan ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.name} » et tous ses pins seront supprimés. Cette action est définitive.`
            : ""
        }
        confirmLabel={deleting ? "Suppression…" : "Supprimer"}
        destructive
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
