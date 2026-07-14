import { useState, useEffect } from "react";
import { Info, X, Download } from "lucide-react";
import { exportDataAsFile } from "../../lib/backupUtils";
import { toast } from "sonner";

export default function DataPersistenceWarning() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user has dismissed this warning before
    const dismissed = localStorage.getItem("data_warning_dismissed");
    const lastExport = localStorage.getItem("last_data_export");

    if (dismissed === "true") {
      setIsDismissed(true);
      return;
    }

    // Show warning if no export in the last 7 days or never exported
    if (!lastExport) {
      setIsVisible(true);
    } else {
      const daysSinceExport = (Date.now() - parseInt(lastExport)) / (1000 * 60 * 60 * 24);
      if (daysSinceExport > 7) {
        setIsVisible(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem("data_warning_dismissed", "true");
  };

  const handleExport = () => {
    try {
      exportDataAsFile();
      localStorage.setItem("last_data_export", Date.now().toString());
      toast.success("Données exportées avec succès!");
      setIsVisible(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erreur lors de l'export");
    }
  };

  if (!isVisible || isDismissed) {
    return null;
  }

  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 flex-1">
          <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">💾 Protégez vos données</h3>
            <p className="text-sm text-blue-800 mb-3">
              Vos données sont stockées localement dans votre navigateur. Pour éviter toute perte,{" "}
              <strong>exportez régulièrement vos données</strong>.
            </p>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 min-h-[40px]"
            >
              <Download size={16} />
              Exporter maintenant
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-blue-600 hover:text-blue-800 transition-colors p-1"
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
