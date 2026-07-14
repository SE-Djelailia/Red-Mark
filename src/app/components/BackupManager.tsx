import { useState } from "react";
import { Download, Upload, RefreshCw, Database, AlertTriangle } from "lucide-react";
import {
  getLatestBackup,
  restoreFromBackup,
  exportDataAsFile,
  importDataFromFile,
  createBackup,
} from "../../lib/backupUtils";
import { toast } from "sonner";

export default function BackupManager() {
  const [showPanel, setShowPanel] = useState(false);
  const [backup, setBackup] = useState(getLatestBackup());

  const handleExport = () => {
    try {
      exportDataAsFile();
      toast.success("Données exportées avec succès!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erreur lors de l'export");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importDataFromFile(file);
      toast.success("Données importées avec succès!");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Erreur lors de l'import");
    }
  };

  const handleRestore = () => {
    if (!backup) {
      toast.error("Aucune sauvegarde disponible");
      return;
    }

    if (confirm("Restaurer la sauvegarde? Cela va écraser les données actuelles.")) {
      try {
        restoreFromBackup(backup);
        toast.success("Données restaurées avec succès!");
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        console.error("Restore error:", error);
        toast.error("Erreur lors de la restauration");
      }
    }
  };

  const handleCreateBackup = () => {
    try {
      const newBackup = createBackup();
      setBackup(newBackup);
      toast.success("Sauvegarde créée!");
    } catch (error) {
      console.error("Backup error:", error);
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const getDataStats = () => {
    const users = JSON.parse(localStorage.getItem("redmark_users") || "[]");
    const projects = JSON.parse(localStorage.getItem("redmark_projects") || "[]");
    const visits = JSON.parse(localStorage.getItem("redmark_site_visits") || "[]");
    const photos = JSON.parse(localStorage.getItem("redmark_photos") || "[]");

    return {
      users: users.length,
      projects: projects.length,
      visits: visits.length,
      photos: photos.length,
    };
  };

  const stats = getDataStats();

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="fixed bottom-4 left-4 w-12 h-12 bg-[#E10600] text-white rounded-full shadow-lg hover:bg-[#C00500] transition-all z-50 flex items-center justify-center"
        title="Gestion des sauvegardes"
      >
        <Database size={20} />
      </button>

      {/* Backup Panel */}
      {showPanel && (
        <div className="fixed bottom-20 left-4 bg-white rounded-lg shadow-2xl border border-gray-200 p-6 z-50 w-96 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1A1A1A]">Sauvegardes</h3>
            <button
              onClick={() => setShowPanel(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {/* Stats */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Données actuelles</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Utilisateurs:</span>{" "}
                <span className="font-medium">{stats.users}</span>
              </div>
              <div>
                <span className="text-gray-600">Projets:</span>{" "}
                <span className="font-medium">{stats.projects}</span>
              </div>
              <div>
                <span className="text-gray-600">Visites:</span>{" "}
                <span className="font-medium">{stats.visits}</span>
              </div>
              <div>
                <span className="text-gray-600">Photos:</span>{" "}
                <span className="font-medium">{stats.photos}</span>
              </div>
            </div>
          </div>

          {/* Backup Info */}
          {backup && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900">Dernière sauvegarde</p>
                  <p className="text-blue-700 text-xs mt-1">
                    {new Date(backup.timestamp).toLocaleString("fr-FR")}
                  </p>
                  <p className="text-blue-600 text-xs mt-1">
                    {backup.users.length} utilisateur(s), {backup.projects.length} projet(s)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleCreateBackup}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium"
            >
              <Database size={18} />
              Créer une sauvegarde
            </button>

            {backup && (
              <button
                onClick={handleRestore}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <RefreshCw size={18} />
                Restaurer la sauvegarde
              </button>
            )}

            <button
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              <Download size={18} />
              Exporter (fichier)
            </button>

            <label className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium cursor-pointer">
              <Upload size={18} />
              Importer (fichier)
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>

          {/* Warning */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              ⚠️ <strong>Auto-sauvegarde:</strong> Les données sont automatiquement sauvegardées
              toutes les 30 secondes. Utilisez "Restaurer" si votre session a été perdue.
            </p>
          </div>

          {/* Debug Info */}
          <details className="mt-4">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              Informations de débogage
            </summary>
            <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono overflow-x-auto">
              <div>Session: {localStorage.getItem("redmark_session") ? "✅" : "❌"}</div>
              <div>Users: {localStorage.getItem("redmark_users") ? "✅" : "❌"}</div>
              <div>Backup: {localStorage.getItem("redmark_backup") ? "✅" : "❌"}</div>
            </div>
          </details>
        </div>
      )}
    </>
  );
}
