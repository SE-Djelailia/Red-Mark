import { useState, useEffect } from "react";
import { X, FileText, Image, Type, Palette, Layout, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/useAuth";

interface ReportTemplate {
  logoUrl: string;
  includeLogo: boolean;
  includePhotos: boolean;
  includeWeather: boolean;
  includeSignature: boolean;
  headerColor: string;
  fontSize: "small" | "medium" | "large";
  pageOrientation: "portrait" | "landscape";
  photoSize: "small" | "medium" | "large";
  companyName: string;
  footerText: string;
}

interface ReportTemplatesProps {
  onClose: () => void;
}

const DEFAULT_TEMPLATE: ReportTemplate = {
  logoUrl: "",
  includeLogo: true,
  includePhotos: true,
  includeWeather: true,
  includeSignature: true,
  headerColor: "#E10600",
  fontSize: "medium",
  pageOrientation: "portrait",
  photoSize: "medium",
  companyName: "Jodoin Lamarre Pratte architectes",
  footerText: "Ce rapport a été généré par RedMark",
};

export default function ReportTemplates({ onClose }: ReportTemplatesProps) {
  const { user } = useAuth();
  const [template, setTemplate] = useState<ReportTemplate>(DEFAULT_TEMPLATE);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = () => {
    const saved = localStorage.getItem(`report_template_${user?.id}`);
    if (saved) {
      setTemplate(JSON.parse(saved));
    } else {
      const userFirm = user?.user_metadata?.firm || "Jodoin Lamarre Pratte architectes";
      setTemplate({ ...DEFAULT_TEMPLATE, companyName: userFirm });
    }
  };

  const handleSave = () => {
    localStorage.setItem(`report_template_${user?.id}`, JSON.stringify(template));
    setHasChanges(false);
    toast.success("Modèle de rapport sauvegardé");
  };

  const handleReset = () => {
    const userFirm = user?.user_metadata?.firm || "Jodoin Lamarre Pratte architectes";
    setTemplate({ ...DEFAULT_TEMPLATE, companyName: userFirm });
    setHasChanges(true);
    toast.info("Modèle réinitialisé aux valeurs par défaut");
  };

  const updateTemplate = (updates: Partial<ReportTemplate>) => {
    setTemplate({ ...template, ...updates });
    setHasChanges(true);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen px-4 flex items-center justify-center py-8">
        <div
          className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl text-[#1A1A1A] font-medium">Modèles de rapports</h2>
              <p className="text-sm text-gray-600 mt-1">
                Personnalisez l'apparence de vos rapports PDF
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={24} className="text-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Company Info */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Type size={18} className="text-[#E10600]" />
                Informations de l'entreprise
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nom de l'entreprise</label>
                  <input
                    type="text"
                    value={template.companyName}
                    onChange={(e) => updateTemplate({ companyName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Texte de pied de page</label>
                  <input
                    type="text"
                    value={template.footerText}
                    onChange={(e) => updateTemplate({ footerText: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Visual Appearance */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Palette size={18} className="text-[#E10600]" />
                Apparence visuelle
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Couleur de l'en-tête</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={template.headerColor}
                      onChange={(e) => updateTemplate({ headerColor: e.target.value })}
                      className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={template.headerColor}
                      onChange={(e) => updateTemplate({ headerColor: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Taille de police</label>
                  <select
                    value={template.fontSize}
                    onChange={(e) => updateTemplate({ fontSize: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                  >
                    <option value="small">Petite (10pt)</option>
                    <option value="medium">Moyenne (12pt)</option>
                    <option value="large">Grande (14pt)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Layout Options */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <Layout size={18} className="text-[#E10600]" />
                Mise en page
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Orientation de page</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateTemplate({ pageOrientation: "portrait" })}
                      className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                        template.pageOrientation === "portrait"
                          ? "border-[#E10600] bg-red-50"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <div className="text-sm font-medium">Portrait</div>
                      <div className="text-xs text-gray-500">Vertical</div>
                    </button>
                    <button
                      onClick={() => updateTemplate({ pageOrientation: "landscape" })}
                      className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                        template.pageOrientation === "landscape"
                          ? "border-[#E10600] bg-red-50"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <div className="text-sm font-medium">Paysage</div>
                      <div className="text-xs text-gray-500">Horizontal</div>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Taille des photos</label>
                  <select
                    value={template.photoSize}
                    onChange={(e) => updateTemplate({ photoSize: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
                  >
                    <option value="small">Petite (2 par ligne)</option>
                    <option value="medium">Moyenne (1 par ligne)</option>
                    <option value="large">Grande (pleine page)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Content Options */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[#1A1A1A] mb-3 flex items-center gap-2">
                <FileText size={18} className="text-[#E10600]" />
                Contenu du rapport
              </h3>
              <div className="space-y-2">
                <TemplateToggle
                  label="Inclure le logo de l'entreprise"
                  checked={template.includeLogo}
                  onChange={(checked) => updateTemplate({ includeLogo: checked })}
                />
                <TemplateToggle
                  label="Inclure les photos"
                  checked={template.includePhotos}
                  onChange={(checked) => updateTemplate({ includePhotos: checked })}
                />
                <TemplateToggle
                  label="Inclure les conditions météo"
                  checked={template.includeWeather}
                  onChange={(checked) => updateTemplate({ includeWeather: checked })}
                />
                <TemplateToggle
                  label="Inclure une zone de signature"
                  checked={template.includeSignature}
                  onChange={(checked) => updateTemplate({ includeSignature: checked })}
                />
              </div>
            </div>

            {/* Preview Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Aperçu</h4>
              <p className="text-xs text-blue-800">
                Ces paramètres seront appliqués à tous les nouveaux rapports PDF générés. Vous
                pourrez toujours prévisualiser avant de télécharger.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2"
            >
              <RotateCcw size={18} />
              Réinitialiser
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`flex-1 py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 ${
                hasChanges
                  ? "bg-[#E10600] text-white hover:bg-[#C00500]"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Save size={18} />
              Sauvegarder les modifications
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TemplateToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function TemplateToggle({ label, checked, onChange }: TemplateToggleProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <span className="text-sm text-[#1A1A1A]">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? "bg-[#E10600]" : "bg-gray-300"
        }`}
      >
        <div
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? "translate-x-6" : ""
          }`}
        />
      </button>
    </div>
  );
}
