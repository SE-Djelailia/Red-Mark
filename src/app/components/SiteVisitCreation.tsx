import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Calendar, Cloud, Thermometer, ChevronDown, Plus } from "lucide-react";
import { ButtonLoader } from "./LoadingStates";
import { createSiteVisit } from "../../lib/supabaseApi";
import { notifyProjectOwner } from "../../lib/notificationsApi";
import { useAuth } from "../../contexts/useAuth";
import { useProjectRole } from "../../hooks/useProjectRole";
import { useSmartBack } from "../../hooks/useSmartBack";

const DEFAULT_PHASES = ["Fondation", "Charpente", "ÉMÉ", "Finitions", "Extérieur"];
const CUSTOM_PHASES_KEY = "redmark_custom_phases";

export default function SiteVisitCreation() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const projectRole = useProjectRole(id);
  const goBack = useSmartBack(`/app/projects/${id}`);

  const [visitDate, setVisitDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState("Fondation");
  const [room, setRoom] = useState("");
  const [weather, setWeather] = useState("");
  const [temperature, setTemperature] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom phases management
  const [customPhases, setCustomPhases] = useState<string[]>([]);
  const [showPhaseDropdown, setShowPhaseDropdown] = useState(false);
  const [phaseInput, setPhaseInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load custom phases from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(CUSTOM_PHASES_KEY);
    if (saved) {
      try {
        setCustomPhases(JSON.parse(saved));
      } catch (error) {
        console.error("Error loading custom phases:", error);
      }
    }
  }, []);

  // Save custom phases to localStorage
  const saveCustomPhases = (phases: string[]) => {
    localStorage.setItem(CUSTOM_PHASES_KEY, JSON.stringify(phases));
    setCustomPhases(phases);
  };

  // Combine default and custom phases
  const allPhases = [...DEFAULT_PHASES, ...customPhases];

  // Filter phases based on input
  const filteredPhases = phaseInput
    ? allPhases.filter((p) => p.toLowerCase().includes(phaseInput.toLowerCase()))
    : allPhases;

  // Check if input is a new phase
  const isNewPhase =
    phaseInput && !allPhases.some((p) => p.toLowerCase() === phaseInput.toLowerCase());

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPhaseDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectPhase = (selectedPhase: string) => {
    setPhase(selectedPhase);
    setPhaseInput("");
    setShowPhaseDropdown(false);
  };

  const handleAddNewPhase = () => {
    if (phaseInput.trim() && isNewPhase) {
      const newPhase = phaseInput.trim();
      saveCustomPhases([...customPhases, newPhase]);
      setPhase(newPhase);
      setPhaseInput("");
      setShowPhaseDropdown(false);
    }
  };

  const handlePhaseInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredPhases.length === 1) {
        handleSelectPhase(filteredPhases[0]);
      } else if (isNewPhase) {
        handleAddNewPhase();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Vérifier que l'utilisateur est connecté
      if (!user?.id) {
        alert("Session expirée. Veuillez vous reconnecter.");
        navigate("/");
        return;
      }

      // Create the site visit
      const newVisit = await createSiteVisit({
        user_id: user.id,
        project_id: id || "",
        visit_date: visitDate,
        phase: phase,
        notes: notes,
        weather: weather,
        temperature: temperature,
      });

      console.log("✅ Site visit created successfully", newVisit.id);

      const actorName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";
      notifyProjectOwner({
        projectId: id || "",
        actorId: user.id,
        actorName,
        type: "visit_created",
        message: "a ajouté une nouvelle visite",
        visitId: newVisit.id,
      });

      navigate(`/app/projects/${id}`);
    } catch (error) {
      console.error("Error creating site visit:", error);
      alert("Une erreur s'est produite lors de la création de la visite de chantier.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8 sticky top-0 z-10">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
        <h1 className="text-2xl md:text-3xl">Nouvelle visite de chantier</h1>
      </div>

      {!projectRole.loading && !projectRole.canCreateIssues ? (
        <div className="px-4 py-6 max-w-2xl mx-auto">
          <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
            <p className="text-base text-[#1A1A1A] font-medium mb-2">
              Vous n'avez pas la permission de créer une visite sur ce projet.
            </p>
            <p className="text-sm text-gray-500">
              Contactez le propriétaire du projet ou un administrateur pour obtenir cet accès.
            </p>
          </div>
        </div>
      ) : (
      /* Form */
      <form onSubmit={handleSubmit} className="px-4 py-6 max-w-2xl mx-auto pb-32">
        <div className="space-y-5">
          {/* Visit Date */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Date de visite</label>
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

          {/* Phase Combobox */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Phase</label>
            <div className="relative" ref={dropdownRef}>
              {/* Display selected phase or allow input */}
              <div className="relative">
                <input
                  type="text"
                  value={showPhaseDropdown ? phaseInput : phase}
                  onChange={(e) => {
                    setPhaseInput(e.target.value);
                    setShowPhaseDropdown(true);
                  }}
                  onFocus={() => setShowPhaseDropdown(true)}
                  onKeyDown={handlePhaseInputKeyDown}
                  placeholder="Sélectionner ou créer une phase..."
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 pr-10"
                  required
                />
                <ChevronDown
                  size={20}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>

              {/* Dropdown */}
              {showPhaseDropdown && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {/* Filtered existing phases */}
                  {filteredPhases.length > 0 ? (
                    <div>
                      {filteredPhases.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleSelectPhase(p)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                        >
                          <span className="text-sm text-[#1A1A1A]">{p}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {/* Option to add new phase */}
                  {isNewPhase && (
                    <button
                      type="button"
                      onClick={handleAddNewPhase}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-t border-gray-200 bg-blue-50"
                    >
                      <div className="flex items-center gap-2">
                        <Plus size={16} className="text-[#E10600]" />
                        <span className="text-sm text-[#E10600] font-medium">
                          Créer "{phaseInput}"
                        </span>
                      </div>
                    </button>
                  )}

                  {/* No results */}
                  {filteredPhases.length === 0 && !isNewPhase && phaseInput && (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      Aucune phase trouvée
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Room/Area */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Pièce / Zone</label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="ex: Hall d'entrée, Unité 201, Aile ouest"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
            />
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

          {/* Weather */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Météo</label>
            <input
              type="text"
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder="ex: Ensoleillé, Nuageux, Pluvieux"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">Température</label>
            <div className="relative">
              <input
                type="text"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="ex: 25°C"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 pr-12"
              />
              <Thermometer
                size={20}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-30 shadow-lg">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              type="button"
              onClick={() => navigate(`/app/projects/${id}`)}
              className="flex-1 py-3 bg-white border border-gray-300 text-[#1A1A1A] rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px] font-medium"
            >
              {isSubmitting && <ButtonLoader />}
              <span>{isSubmitting ? "Enregistrement..." : "Enregistrer la visite"}</span>
            </button>
          </div>
        </div>
      </form>
      )}
    </div>
  );
}
