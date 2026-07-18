import { useState } from "react";
import { X, Download, CheckCircle, FileText, Image, Database, Loader } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";
import { getProjects, getSiteVisits, getPhotos, getIssues } from "../../lib/supabaseApi";
import { useModalOpen } from "../../hooks/useModalOpen";

interface DataExportProps {
  onClose: () => void;
}

export default function DataExport({ onClose }: DataExportProps) {
  useModalOpen();
  const { user } = useAuth();
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
          firm: user.user_metadata?.firm,
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
        <div className="bg-white rounded-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl text-[#1A1A1A] font-medium">Exporter les données</h2>
              <p className="text-sm text-gray-600 mt-1">Téléchargez tous vos projets</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={24} className="text-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Export Format */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                Format d'exportation
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setExportType("json")}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    exportType === "json"
                      ? "border-[#E10600] bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <Database size={24} className="mx-auto mb-1 text-gray-600" />
                  <div className="text-sm font-medium">JSON</div>
                  <div className="text-xs text-gray-500">Données complètes</div>
                </button>
                <button
                  onClick={() => setExportType("csv")}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    exportType === "csv"
                      ? "border-[#E10600] bg-red-50"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <FileText size={24} className="mx-auto mb-1 text-gray-600" />
                  <div className="text-sm font-medium">CSV</div>
                  <div className="text-xs text-gray-500">Tableur Excel</div>
                </button>
              </div>
            </div>

            {/* Options */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                Options d'exportation
              </label>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} className="text-green-600" />
                    <div>
                      <div className="text-sm text-[#1A1A1A]">Projets et visites</div>
                      <div className="text-xs text-gray-500">Toujours inclus</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} className="text-green-600" />
                    <div>
                      <div className="text-sm text-[#1A1A1A]">Métadonnées des photos</div>
                      <div className="text-xs text-gray-500">Tags, localisation, descriptions</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg opacity-50">
                  <div className="flex items-center gap-3">
                    <Image size={18} className="text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">Fichiers photos</div>
                      <div className="text-xs text-gray-500">Bientôt disponible</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">Prochainement</div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-blue-900 mb-2">À propos de l'export</h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Format JSON: données structurées, prêtes pour sauvegarde ou migration</li>
                <li>• Format CSV: compatible Excel, idéal pour analyses et rapports</li>
                <li>• Les photos restent accessibles dans votre compte Supabase</li>
              </ul>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className={`w-full py-4 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                exporting
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#E10600] text-white hover:bg-[#C00500]"
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
