import { useEffect, useRef, useState } from "react";
import { Calendar, Clock, Cloud, Thermometer, ChevronDown, Plus, X, Camera } from "lucide-react";
import { ButtonLoader } from "./LoadingStates";
import { createSiteVisit } from "../../lib/supabaseApi";
import { notifyProjectOwner } from "../../lib/notificationsApi";
import { useAuth } from "../../contexts/useAuth";
import { uploadIssuePhotos, WEATHER_EVIDENCE_TAG } from "../../lib/issuePhotoUpload";
import PhotoCaptureButtons from "./PhotoCaptureButtons";
import type { SiteVisit } from "../../lib/supabase";

const DEFAULT_PHASES = ["Fondation", "Charpente", "ÉMÉ", "Finitions", "Extérieur"];
const CUSTOM_PHASES_KEY = "redmark_custom_phases";
const WEATHER_OPTIONS = ["Ensoleillé", "Nuageux", "Pluvieux", "Neige", "Venteux", "Brouillard"];
const TEMPERATURE_MIN = -30;
const TEMPERATURE_MAX = 35;
const TEMPERATURE_DEFAULT = 20;

interface Props {
  projectId: string;
  // Pre-fills the date field (e.g. from a calendar day-click or a picker
  // opened for "today"). Falls back to today when absent/malformed.
  initialDate?: string;
  onCreated: (visit: SiteVisit) => void;
  onCancel: () => void;
}

// Canonical create form for site visits — hosted as a full page by
// SiteVisitCreation.tsx, and inline (in a modal) by VisitPicker.tsx's
// "Nouvelle visite" option, so creating a visit mid-flow (e.g. while adding
// a deficiency from a location) doesn't navigate away from that flow.
// Permission gating is left to hosts (same convention as IssueForm).
export default function VisitForm({ projectId, initialDate, onCreated, onCancel }: Props) {
  const { user } = useAuth();

  const isValidDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate);
  const [visitDate, setVisitDate] = useState(
    isValidDate ? initialDate! : new Date().toISOString().split("T")[0],
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState("Fondation");
  const [weather, setWeather] = useState("");
  // null = not set. Slider needs a numeric value to render even before the
  // user has touched it, so the displayed position defaults to
  // TEMPERATURE_DEFAULT but nothing is submitted until the user interacts.
  const [temperature, setTemperature] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Photos can't attach until the visit exists (uploadPhoto needs a real
  // visitId) — held here and uploaded right after createSiteVisit succeeds,
  // same deferred-upload pattern IssueForm uses for its own photos.
  const [weatherPhotos, setWeatherPhotos] = useState<File[]>([]);

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
      if (!user?.id) {
        alert("Session expirée. Veuillez vous reconnecter.");
        return;
      }

      const newVisit = await createSiteVisit({
        user_id: user.id,
        project_id: projectId,
        visit_date: visitDate,
        phase: phase,
        notes: notes,
        weather: weather,
        temperature: temperature === null ? "" : `${temperature}°C`,
        start_time: startTime || null,
        end_time: endTime || null,
      });

      const actorName = user.user_metadata?.name || user.email?.split("@")[0] || "Utilisateur";
      notifyProjectOwner({
        projectId,
        actorId: user.id,
        actorName,
        type: "visit_created",
        message: "a ajouté une nouvelle visite",
        visitId: newVisit.id,
      });

      if (weatherPhotos.length > 0) {
        const { queuedCount } = await uploadIssuePhotos(weatherPhotos, {
          userId: user.id,
          projectId,
          visitId: newVisit.id,
          tags: [WEATHER_EVIDENCE_TAG],
        });
        if (queuedCount > 0) {
          alert(
            "Visite créée. Une preuve météo a été mise en file d'attente et sera envoyée une fois de retour en ligne.",
          );
        }
      }

      onCreated(newVisit);
    } catch (error) {
      console.error("Error creating site visit:", error);
      alert("Une erreur s'est produite lors de la création de la visite de chantier.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
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

        {/* Start/End Time — both optional */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">De</label>
            <div className="relative">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 pr-10"
              />
              <Clock
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-[#1A1A1A] mb-2">À</label>
            <div className="relative">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20 pr-10"
              />
              <Clock
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Phase Combobox */}
        <div>
          <label className="block text-sm text-[#1A1A1A] mb-2">Phase</label>
          <div className="relative" ref={dropdownRef}>
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

            {showPhaseDropdown && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
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

                {filteredPhases.length === 0 && !isNewPhase && phaseInput && (
                  <div className="px-4 py-6 text-center text-gray-500 text-sm">
                    Aucune phase trouvée
                  </div>
                )}
              </div>
            )}
          </div>
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
          <div className="relative">
            <Cloud
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <select
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/20"
            >
              <option value="">Non spécifiée</option>
              {WEATHER_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-[#1A1A1A]">Température</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#1A1A1A] flex items-center gap-1">
                <Thermometer size={14} className="text-gray-400" />
                {temperature === null ? "Non spécifiée" : `${temperature}°C`}
              </span>
              {temperature !== null && (
                <button
                  type="button"
                  onClick={() => setTemperature(null)}
                  className="text-xs text-[#E10600] hover:text-[#C00500] font-medium"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>
          <input
            type="range"
            min={TEMPERATURE_MIN}
            max={TEMPERATURE_MAX}
            step={1}
            value={temperature ?? TEMPERATURE_DEFAULT}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full accent-[#E10600]"
          />
          <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
            <span>{TEMPERATURE_MIN}°C</span>
            <span>{TEMPERATURE_MAX}°C</span>
          </div>
        </div>

        {/* Weather evidence — optional photo (sky, weather-app screenshot,
            etc.), stored as a regular visit photo tagged "Météo". */}
        <div>
          <label className="block text-sm text-[#1A1A1A] mb-2 flex items-center gap-2">
            <Camera size={16} className="text-gray-400" />
            Preuve météo (optionnel)
          </label>
          <PhotoCaptureButtons
            onFilesSelected={(files) => setWeatherPhotos((prev) => [...prev, ...Array.from(files)])}
            disabled={isSubmitting}
          />
          {weatherPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {weatherPhotos.map((file, index) => (
                <div
                  key={index}
                  className="relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                >
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Preuve météo ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setWeatherPhotos((prev) => prev.filter((_, i) => i !== index))}
                    disabled={isSubmitting}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                    aria-label="Retirer la photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3 bg-white border border-gray-300 text-[#1A1A1A] rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium min-h-[48px]"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px] font-medium"
          >
            {isSubmitting && <ButtonLoader />}
            <span>{isSubmitting ? "Enregistrement..." : "Enregistrer la visite"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
