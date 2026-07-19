import { useState } from "react";
import {
  X,
  FileText,
  Download,
  CheckCircle2,
  Calendar,
  Image as ImageIcon,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { ButtonLoader } from "./LoadingStates";
import { useModalOpen } from "../../hooks/useModalOpen";

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  sections: string[];
}

interface ReportGeneratorProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export default function ReportTemplateSelector({
  projectId,
  projectName,
  onClose,
}: ReportGeneratorProps) {
  useModalOpen();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeIssues, setIncludeIssues] = useState(true);
  const [dateRange, setDateRange] = useState<"all" | "month" | "week" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const templates: ReportTemplate[] = [
    {
      id: "executive",
      name: "Résumé exécutif",
      description: "Vue d'ensemble concise pour les propriétaires et décideurs",
      icon: "",
      sections: [
        "Sommaire du projet",
        "Progrès par phase",
        "Photos clés",
        "Déficiences critiques",
        "Prochaines étapes",
      ],
    },
    {
      id: "detailed",
      name: "Rapport technique détaillé",
      description: "Documentation complète pour l'équipe de projet",
      icon: "",
      sections: [
        "Informations du projet",
        "Toutes les visites de site",
        "Galerie de photos par phase",
        "Liste complète des déficiences",
        "Commentaires et notes",
        "Historique des modifications",
      ],
    },
    {
      id: "deficiency",
      name: "Rapport de déficiences",
      description: "Focus sur les problèmes et non-conformités",
      icon: "",
      sections: [
        "Résumé des déficiences",
        "Déficiences par priorité",
        "Déficiences par responsable",
        "Photos avec annotations",
        "Statut et échéances",
      ],
    },
    {
      id: "progress",
      name: "Rapport de progrès",
      description: "Évolution du chantier dans le temps",
      icon: "",
      sections: [
        "Timeline du projet",
        "Progrès par phase",
        "Photos avant/après",
        "Jalons atteints",
        "Prévisions",
      ],
    },
    {
      id: "photo",
      name: "Album photo",
      description: "Documentation visuelle du chantier",
      icon: "",
      sections: [
        "Photos par phase",
        "Photos par emplacement",
        "Annotations et notes",
        "Index des photos",
      ],
    },
    {
      id: "custom",
      name: "Rapport personnalisé",
      description: "Créez votre propre structure de rapport",
      icon: "",
      sections: ["Sections configurables"],
    },
  ];

  const handleGenerate = async () => {
    if (!selectedTemplate) return;

    setIsGenerating(true);

    // Simulate PDF generation
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // In a real app, this would call an API to generate the PDF
    const template = templates.find((t) => t.id === selectedTemplate);
    alert(
      `Rapport généré avec succès!\n\nType: ${template?.name}\nProjet: ${projectName}\nPhotos: ${includePhotos ? "Oui" : "Non"}\nDéficiences: ${includeIssues ? "Oui" : "Non"}`,
    );

    setIsGenerating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 flex items-center justify-center py-8 pb-20 safe-area-bottom">
        <div
          className="bg-white rounded-xl max-w-4xl w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - Sticky */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-xl">
            <div>
              <h2 className="text-xl font-semibold text-[#1A1A1A]">Générer un rapport</h2>
              <p className="text-sm text-gray-600 mt-1">{projectName}</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Template Selection */}
            <div>
              <h3 className="text-lg text-[#1A1A1A] mb-4">Choisir un modèle de rapport</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`text-left p-5 rounded-xl border-2 transition-all hover:shadow-md min-h-[48px] ${
                      selectedTemplate === template.id
                        ? "border-[#E10600] bg-[#E10600]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-medium text-[#1A1A1A] mb-1">{template.name}</h4>
                        <p className="text-sm text-gray-600">{template.description}</p>
                      </div>
                      {selectedTemplate === template.id && (
                        <CheckCircle2 size={20} className="text-[#E10600] flex-shrink-0 ml-3" />
                      )}
                    </div>
                    <div className="border-t border-gray-100 pt-3 mt-3">
                      <p className="text-xs text-gray-500 mb-2">Inclut:</p>
                      <div className="flex flex-wrap gap-2">
                        {template.sections.slice(0, 3).map((section, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
                          >
                            {section}
                          </span>
                        ))}
                        {template.sections.length > 3 && (
                          <span className="text-xs px-2 py-1 text-gray-500">
                            +{template.sections.length - 3} autres
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            {selectedTemplate && (
              <div className="space-y-5">
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg text-[#1A1A1A] mb-4">Options du rapport</h3>

                  {/* Content Options */}
                  <div className="space-y-3 mb-5">
                    <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors min-h-[56px]">
                      <input
                        type="checkbox"
                        checked={includePhotos}
                        onChange={(e) => setIncludePhotos(e.target.checked)}
                        className="w-5 h-5 text-[#E10600] rounded focus:ring-[#E10600]"
                      />
                      <div className="flex items-center gap-3 flex-1">
                        <ImageIcon size={20} className="text-gray-600" />
                        <div>
                          <div className="text-sm text-[#1A1A1A]">Inclure les photos</div>
                          <div className="text-xs text-gray-500">
                            Ajouter toutes les photos du projet
                          </div>
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors min-h-[56px]">
                      <input
                        type="checkbox"
                        checked={includeIssues}
                        onChange={(e) => setIncludeIssues(e.target.checked)}
                        className="w-5 h-5 text-[#E10600] rounded focus:ring-[#E10600]"
                      />
                      <div className="flex items-center gap-3 flex-1">
                        <AlertTriangle size={20} className="text-gray-600" />
                        <div>
                          <div className="text-sm text-[#1A1A1A]">Inclure les déficiences</div>
                          <div className="text-xs text-gray-500">
                            Liste complète des déficiences et leur statut
                          </div>
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="block text-sm text-[#1A1A1A] mb-3">Période couverte</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      {[
                        { value: "all", label: "Tout" },
                        { value: "month", label: "Dernier mois" },
                        { value: "week", label: "Dernière semaine" },
                        { value: "custom", label: "Personnalisée" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDateRange(option.value as any)}
                          className={`py-3 px-3 rounded-lg border-2 text-sm transition-all min-h-[48px] ${
                            dateRange === option.value
                              ? "border-[#E10600] bg-[#E10600]/10"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {dateRange === "custom" && (
                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-2">Date de début</label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-2">Date de fin</label>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer - Sticky */}
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3 rounded-b-xl bg-white">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="flex-1 py-3 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[48px]"
            >
              Annuler
            </button>
            <button
              onClick={handleGenerate}
              disabled={!selectedTemplate || isGenerating}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium min-h-[48px]"
            >
              {isGenerating ? (
                <>
                  <ButtonLoader />
                  <span>Génération en cours...</span>
                </>
              ) : (
                <>
                  <Download size={20} />
                  <span>Générer le PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
