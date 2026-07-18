import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Upload, FileText, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { getPdfPageCount } from "../../lib/pdfUtils";
import {
  getPlanFiles,
  createPlanFile,
  deletePlanFile,
  PLAN_FILES_BUCKET,
  type PlanFile,
} from "../../lib/plansApi";
import ConfirmDialog from "./ConfirmDialog";

// Matches the dev environment's current Supabase Storage per-file limit.
// Checked client-side before attempting the upload so the failure mode is
// a clear message, not a cryptic network error — will be raised once the
// project is on a higher storage tier.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function isFileTooLargeError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("exceeded the maximum allowed size") ||
    normalized.includes("payload too large") ||
    normalized.includes("413")
  );
}

interface Props {
  projectId: string;
}

export default function PlanFilesManager({ projectId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const projectRole = useProjectRole(projectId);
  const [planFiles, setPlanFiles] = useState<PlanFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlanFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setLoading(true);
      const list = await getPlanFiles(projectId);
      setPlanFiles(list);
    } catch (e: any) {
      toast.error("Impossible de charger les plans : " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleFileSelected = async (file: File | null) => {
    if (!file || !user) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(
        "Ce fichier est trop volumineux (50 Mo maximum pour le moment). " +
          "Essayez de diviser votre jeu de plans en plusieurs fichiers plus petits " +
          "— un projet peut avoir plusieurs fichiers de plans — ou contactez-nous " +
          "pour augmenter cette limite.",
        { duration: 8000 },
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const pageCount = await getPdfPageCount(file);

      const sanitizedName = file.name
        .normalize("NFD")
        .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${projectId}/${crypto.randomUUID()}-${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from(PLAN_FILES_BUCKET)
        .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

      if (uploadError) throw uploadError;

      const planFile = await createPlanFile({
        projectId,
        name: file.name,
        storagePath,
        pageCount,
        fileSizeBytes: file.size,
        uploadedBy: user.id,
      });

      setPlanFiles((prev) => [planFile, ...prev]);
      toast.success(`Plan téléversé (${pageCount} page${pageCount !== 1 ? "s" : ""})`);
    } catch (e: any) {
      const message = e?.message || "";
      if (isFileTooLargeError(message)) {
        toast.error(
          "Ce fichier est trop volumineux (50 Mo maximum pour le moment). " +
            "Essayez de diviser votre jeu de plans en plusieurs fichiers plus petits " +
            "— un projet peut avoir plusieurs fichiers de plans — ou contactez-nous " +
            "pour augmenter cette limite.",
          { duration: 8000 },
        );
      } else {
        toast.error("Téléversement échoué : " + message);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deletePlanFile(deleteTarget.id);
      setPlanFiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success("Plan supprimé");
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error("Suppression échouée : " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const canManage = projectRole.canCreateIssues; // admin/owner/editor, matches plan_files RLS

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[#1A1A1A]">Fichiers de plans (PDF)</h3>
          <p className="text-xs text-gray-500">
            Téléversez des plans PDF pour assigner des pages aux niveaux du projet
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 h-11 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-50 text-sm font-medium min-h-[44px]"
          >
            <Upload size={16} />
            {uploading ? "Téléversement…" : "Ajouter un PDF"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
          Chargement…
        </div>
      ) : planFiles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <FileText size={36} className="mx-auto text-gray-300 mb-2" />
          <div className="text-sm text-gray-600 mb-1">Aucun fichier de plans</div>
          <div className="text-xs text-gray-400">
            Téléversez un PDF (jusqu'à 200 pages, 50 Mo max pour le moment) pour commencer
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {planFiles.map((planFile) => (
            <div
              key={planFile.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:border-[#E10600] hover:shadow-md transition-all"
            >
              <button
                onClick={() => navigate(`/app/projects/${projectId}/plan-files/${planFile.id}`)}
                className="flex-1 flex items-center gap-3 text-left min-w-0"
              >
                <div className="w-12 h-12 rounded-lg bg-[#E10600]/10 text-[#E10600] flex items-center justify-center flex-shrink-0">
                  <FileText size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#1A1A1A] font-medium truncate">{planFile.name}</div>
                  <div className="text-xs text-gray-500">
                    {planFile.pageCount ?? "?"} page{planFile.pageCount !== 1 ? "s" : ""}
                    {planFile.fileSizeBytes
                      ? ` · ${(planFile.fileSizeBytes / (1024 * 1024)).toFixed(1)} Mo`
                      : ""}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
              </button>
              {canManage && (
                <button
                  onClick={() => setDeleteTarget(planFile)}
                  className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-[#E10600] hover:bg-red-50 rounded-lg"
                  aria-label="Supprimer le plan"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer ce fichier de plans ?"
        description={
          deleteTarget
            ? `« ${deleteTarget.name} » et toutes ses pages assignées seront supprimés. Cette action est définitive.`
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
