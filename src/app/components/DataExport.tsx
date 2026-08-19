import { useState } from "react";
import { X, Download, CheckCircle, FileText, Image, Database, Loader } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { getProjects, getSiteVisits, getPhotos, getIssues } from "../../lib/supabaseApi";
import { useModalOpen } from "../../hooks/useModalOpen";
import { useFirm } from "../../hooks/useFirm";

interface DataExportProps {
  onClose: () => void;
}

export default function DataExport({ onClose }: DataExportProps) {
  useModalOpen();
  const { user } = useAuth();
  const { firm } = useFirm();
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<"json" | "csv">("json");
  const [includePhotos, setIncludePhotos] = useState(false);

  const handleExport = async () => {
    if (!user) return;

    setExporting(true);
    try {
      toast.info("Collecte des données...");

      // 1. Get all projects
      const projects = await getProjects(user.id);

      // 2. Get all visits and photos for each project
      const enrichedProjects = await Promise.all(
        projects.map(async (project) => {
          const visits = await getSiteVisits(project.id);
          const issues = await getIssues(project.id);

          const visitsWithPhotos = await Promise.all(
            visits.map(async (visit) => {
              const photos = await getPhotos(visit.id);
              return { ...visit, photos };
            }),
          );

          return {
            ...project,
            visits: visitsWithPhotos,
            issues,
          };
        }),
      );

      // 3. Create export data
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name,
          // The firm comes from organization membership, not from
          // user_metadata. `user_metadata.firm` was free text someone typed at
          // signup; the field was removed with the organization model, so it is
          // blank for every account created since and carried no authority even
          // before that. This is the real firm the person belongs to.
          firm: firm?.name ?? null,
        },
        projects: enrichedProjects,
        stats: {
          totalProjects: projects.length,
          totalVisits: enrichedProjects.reduce((sum, p) => sum + p.visits.length, 0),
          totalPhotos: enrichedProjects.reduce(
            (sum, p) => sum + p.visits.reduce((vSum, v) => vSum + v.photos.length, 0),
            0,
          ),
          totalIssues: enrichedProjects.reduce((sum, p) => sum + p.issues.length, 0),
        },
      };

      // 4. Download based on format
      if (exportType === "json") {
        downloadJSON(exportData);
      } else {
        downloadCSV(exportData);
      }

      toast.success("Exportation réussie!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erreur lors de l'exportation");
    } finally {
      setExporting(false);
    }
  };

  const downloadJSON = (data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `redmark-export-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadCSV = (data: any) => {
    // Create CSV for projects
    const projectsCSV = [
      ["Nom", "Type", "Adresse", "Ville", "Date de création", "Visites", "Photos"].join(","),
      ...data.projects.map((p: any) =>
        [
          `"${p.name}"`,
          `"${p.type}"`,
          `"${p.address}"`,
          `"${p.city}"`,
          new Date(p.created_at).toLocaleDateString("fr-CA"),
          p.visits.length,
          p.visits.reduce((sum: number, v: any) => sum + v.photos.length, 0),
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([projectsCSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `redmark-projets-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
        <div className="bg-surface rounded-[4px] max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-6 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-xl text-ink font-medium">Exporter les données</h2>
              <p className="text-sm text-body mt-1">Téléchargez tous vos projets</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-subtle rounded-[4px] transition-colors"
            >
              <X size={24} className="text-body" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Export Format */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-ink mb-3">
                Format d'exportation
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setExportType("json")}
                  className={`px-4 py-3 rounded-[4px] border-2 transition-colors ${
                    exportType === "json"
                      ? "border-line-strong border-l-2 border-l-brand-600 bg-surface"
                      : "border-line-strong hover:border-line-strong"
                  }`}
                >
                  <Database size={24} className="mx-auto mb-1 text-body" />
                  <div className="text-sm font-medium">JSON</div>
                  <div className="text-xs text-muted">Données complètes</div>
                </button>
                <button
                  onClick={() => setExportType("csv")}
                  className={`px-4 py-3 rounded-[4px] border-2 transition-colors ${
                    exportType === "csv"
                      ? "border-line-strong border-l-2 border-l-brand-600 bg-surface"
                      : "border-line-strong hover:border-line-strong"
                  }`}
                >
                  <FileText size={24} className="mx-auto mb-1 text-body" />
                  <div className="text-sm font-medium">CSV</div>
                  <div className="text-xs text-muted">Tableur Excel</div>
                </button>
              </div>
            </div>

            {/* Options */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-ink mb-3">
                Options d'exportation
              </label>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-canvas rounded-[4px]">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} className="text-body" />
                    <div>
                      <div className="text-sm text-ink">Projets et visites</div>
                      <div className="text-xs text-muted">Toujours inclus</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-canvas rounded-[4px]">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} className="text-body" />
                    <div>
                      <div className="text-sm text-ink">Métadonnées des photos</div>
                      <div className="text-xs text-muted">Tags, localisation, descriptions</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-canvas rounded-[4px] opacity-50">
                  <div className="flex items-center gap-3">
                    <Image size={18} className="text-faint" />
                    <div>
                      <div className="text-sm text-body">Fichiers photos</div>
                      <div className="text-xs text-muted">Bientôt disponible</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted">Prochainement</div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="bg-subtle border border-line-strong rounded-[4px] p-4 mb-6">
              <h4 className="text-sm font-medium text-ink mb-2">À propos de l'export</h4>
              <ul className="text-xs text-ink space-y-1">
                <li>• Format JSON: données structurées, prêtes pour sauvegarde ou migration</li>
                <li>• Format CSV: compatible Excel, idéal pour analyses et rapports</li>
                <li>• Les photos restent accessibles dans votre compte Supabase</li>
              </ul>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className={`w-full py-4 rounded-[4px] transition-colors font-medium flex items-center justify-center gap-2 ${
                exporting
                  ? "bg-line text-muted cursor-not-allowed"
                  : "bg-brand-600 text-white hover:bg-brand-700"
              }`}
            >
              {exporting ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  Exportation en cours...
                </>
              ) : (
                <>
                  <Download size={20} />
                  Exporter maintenant
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
