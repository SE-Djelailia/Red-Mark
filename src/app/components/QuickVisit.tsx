import { useState } from "react";
import { useNavigate } from "react-router";
import { Calendar, Upload, X, Tag, ChevronDown } from "lucide-react";
import { createSiteVisit } from "../../lib/supabaseApi";
import { getTodayForInput } from "../../lib/dateUtils";
import { useAuth } from "../../contexts/useAuth";

export default function QuickVisit() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [selectedProject, setSelectedProject] = useState("");
  const [visitDate, setVisitDate] = useState(getTodayForInput());
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState("Fondation");
  const [room, setRoom] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const projects = [
    { id: "1", name: "Centre Hospitalier de Montréal" },
    { id: "2", name: "Bibliothèque Quartier Latin" },
    { id: "3", name: "École Primaire Notre-Dame" },
  ];

  const phases = ["Fondation", "Charpente", "ÉMÉ", "Finitions", "Extérieur"];
  
  const suggestedTags = [
    "Problème ÉMÉ",
    "Déficience",
    "À corriger",
    "Non-conformité",
    "Équipement",
    "Sécurité",
    "Structure",
    "Fini",
    "Coordination",
    "Vérification qualité",
  ];

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos([...photos, ...Array.from(e.target.files)]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const addCustomTag = () => {
    if (customTag.trim() && !selectedTags.includes(customTag.trim())) {
      setSelectedTags([...selectedTags, customTag.trim()]);
      setCustomTag("");
    }
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) {
      alert("Veuillez sélectionner un projet");
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Vérifier que l'utilisateur est connecté
      if (!user?.id) {
        alert("Session expirée. Veuillez vous reconnecter.");
        navigate('/');
        return;
      }

      // Create the site visit
      await createSiteVisit({
        user_id: user.id,
        project_id: selectedProject,
        visit_date: visitDate,
        phase: phase,
        notes: notes,
        weather: undefined,
        temperature: undefined,
      });
      
      console.log('✅ Site visit created successfully');
      navigate(`/app/projects/${selectedProject}`);
    } catch (error) {
      console.error("Error creating site visit:", error);
      alert("Une erreur s'est produite lors de la création de la visite de chantier.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <h1 className="text-2xl md:text-3xl">Nouvelle visite</h1>
        <p className="text-gray-400 mt-1 text-sm">Créer une visite de chantier rapide</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-4 py-6 max-w-2xl mx-auto">
        <div className="space-y-5">
          {/* Project Selection - REQUIRED */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">
              Projet <span className="text-[#E10600]">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 appearance-none pr-12"
                required
              >
                <option value="">Sélectionner un projet...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={20}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Visit Date */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">
              Date de visite
            </label>
            <div className="relative">
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 pr-12"
                required
              />
              <Calendar
                size={20}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Phase Dropdown */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Phase</label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
              required
            >
              {phases.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Room/Area */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">
              Pièce / Zone
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="ex: Hall d'entrée, Unité 201, Aile ouest"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
            />
          </div>

          {/* Tags Section */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">
              <div className="flex items-center gap-2">
                <Tag size={16} />
                <span>Étiquettes</span>
                <span className="text-gray-500 text-xs">(Problèmes, catégories)</span>
              </div>
            </label>

            {/* Suggested Tags */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
              <p className="text-xs text-gray-600 mb-2">Étiquettes suggérées :</p>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedTags.includes(tag)
                        ? "bg-[#E10600] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Tag Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                placeholder="Ajouter une étiquette personnalisée..."
                className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
              />
              <button
                type="button"
                onClick={addCustomTag}
                className="px-4 py-3 bg-[#1A1A1A] text-white rounded-lg hover:bg-black transition-colors"
              >
                Ajouter
              </button>
            </div>

            {/* Selected Tags Display */}
            {selectedTags.length > 0 && (
              <div className="mt-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600 mb-2">Étiquettes sélectionnées :</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <div
                      key={tag}
                      className="flex items-center gap-1 px-3 py-1 bg-[#E10600] text-white rounded-lg text-sm"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:bg-white/20 rounded-full p-0.5"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ajouter des notes et observations de la visite..."
              rows={4}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 resize-none"
              required
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Photos</label>
            <label className="block w-full px-4 py-8 bg-white border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#E10600] transition-colors">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <Upload size={32} />
                <span className="text-sm">Télécharger des photos</span>
                <span className="text-xs">Appuyez pour sélectionner plusieurs images</span>
              </div>
            </label>

            {/* Photo Previews */}
            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={URL.createObjectURL(photo)}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-[#E10600] text-white rounded-full flex items-center justify-center hover:bg-[#C00500]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                {photos.length} photo{photos.length !== 1 ? "s" : ""} sélectionnée{photos.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-30 shadow-lg">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/app/projects")}
              className="flex-1 py-3 bg-white border border-gray-300 text-[#1A1A1A] rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!selectedProject || isSubmitting}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? "Enregistrement..." : "Enregistrer la visite"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}