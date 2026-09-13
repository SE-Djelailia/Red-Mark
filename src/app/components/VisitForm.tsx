import { useEffect, useState } from "react";
import { Calendar, Clock, Cloud, Thermometer, X, Camera } from "lucide-react";
import { ButtonLoader } from "./LoadingStates";
import { createSiteVisit } from "../../lib/supabaseApi";
import { notifyProjectOwner } from "../../lib/notificationsApi";
import { useAuth } from "../../contexts/useAuth";
import { uploadIssuePhotos, WEATHER_EVIDENCE_TAG } from "../../lib/issuePhotoUpload";
import PhotoCaptureButtons from "./PhotoCaptureButtons";
import StageMultiSelect from "./StageMultiSelect";
import XSpinner from "./ui-kit/XSpinner";
import type { SiteVisit } from "../../lib/supabase";
import { inputClassName, labelClassName, textareaClassName } from "./ui-kit/Input";
import {
  ensureProjectStages,
  joinStageNames,
  setVisitStages,
  type ProjectStage,
} from "../../lib/stagesApi";

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
  // The project's construction stages, and which ones this visit covers.
  // A visit may cover SEVERAL — "foundations + envelope + finishes" in one
  // morning is the ordinary case, not an edge case.
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [stagesError, setStagesError] = useState(false);
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

  // Loads the project's stages, copying the firm's master list on first use.
  //
  // Nothing populates project_stages when a project is created, so a new
  // project would otherwise offer an empty list. ensureProjectStages is
  // self-healing and no-ops once the rows exist — see its own comment.
  //
  // The async work is declared inside the effect so no setState runs
  // synchronously in the effect body; `cancelled` drops a response that
  // arrives after the project changed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStagesLoading(true);
      setStagesError(false);
      try {
        const rows = await ensureProjectStages(projectId);
        if (!cancelled) setStages(rows);
      } catch (error) {
        console.error("❌ Failed to load construction stages:", error);
        if (!cancelled) setStagesError(true);
      } finally {
        if (!cancelled) setStagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!user?.id) {
        alert("Session expirée. Veuillez vous reconnecter.");
        return;
      }

      // site_visits.phase is still read in ~44 display places (report headers,
      // visit cards, search titles, the calendar chip) and Stage 25 drops it
      // only once those migrate. Writing the joined names keeps every one of
      // them truthful — "Fondation, Enveloppe" is what an architect would
      // have typed anyway — while site_visit_stages carries the structure.
      const selectedStages = stages.filter((st) => selectedStageIds.includes(st.id));

      const newVisit = await createSiteVisit({
        user_id: user.id,
        project_id: projectId,
        visit_date: visitDate,
        phase: joinStageNames(selectedStages),
        notes: notes,
        weather: weather,
        temperature: temperature === null ? "" : `${temperature}°C`,
        start_time: startTime || null,
        end_time: endTime || null,
      });

      // The links, once the visit exists to hang them on. A failure here must
      // not lose the visit the user just recorded on site: the visit is saved,
      // so the flow continues and only the stage links are reported missing.
      if (selectedStageIds.length > 0) {
        try {
          await setVisitStages(newVisit.id, selectedStageIds);
        } catch (error) {
          console.error("❌ Failed to link visit stages:", error);
          alert(
            "Visite créée, mais les étapes n'ont pas pu être enregistrées. Vous pouvez les ajouter depuis la visite.",
          );
        }
      }

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
          <label className={labelClassName}>Date de visite</label>
          <div className="relative">
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className={`${inputClassName} pr-12`}
              required
            />
            <Calendar
              size={20}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
            />
          </div>
        </div>

        {/* Start/End Time — both optional */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClassName}>De</label>
            <div className="relative">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`${inputClassName} pr-10`}
              />
              <Clock
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
              />
            </div>
          </div>
          <div>
            <label className={labelClassName}>À</label>
            <div className="relative">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={`${inputClassName} pr-10`}
              />
              <Clock
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Construction stages — a visit may cover several. */}
        {stagesLoading ? (
          <div>
            <label className={labelClassName}>Étapes de construction</label>
            <div className="py-4 flex justify-center" role="status" aria-label="Chargement des étapes">
              <XSpinner size={24} />
            </div>
          </div>
        ) : stagesError ? (
          <div>
            <label className={labelClassName}>Étapes de construction</label>
            <p className="text-sm text-muted text-pretty">
              Impossible de charger les étapes. La visite peut être enregistrée sans étape.
            </p>
          </div>
        ) : stages.length === 0 ? (
          // The FIRM has no master list — a firm created after the stages were
          // seeded. Naming where to fix it beats an empty box with no
          // explanation, and the visit can still be saved without stages.
          <div>
            <label className={labelClassName}>Étapes de construction</label>
            <p className="text-sm text-muted text-pretty">
              Aucune étape de construction définie pour votre firme. Un administrateur peut les
              configurer dans les paramètres de la firme.
            </p>
          </div>
        ) : (
          <StageMultiSelect
            stages={stages}
            selectedIds={selectedStageIds}
            onChange={setSelectedStageIds}
            disabled={isSubmitting}
          />
        )}

        {/* Notes */}
        <div>
          <label className={labelClassName}>Notes (optionnel)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ajouter des notes et observations de la visite..."
            rows={4}
            className={textareaClassName}
          />
        </div>

        {/* Weather */}
        <div>
          <label className={labelClassName}>Météo</label>
          <div className="relative">
            <Cloud
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
            />
            <select
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              className={`${inputClassName} pl-11`}
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
            <label className="text-sm text-ink">Température</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink flex items-center gap-1">
                <Thermometer size={12} className="text-faint" />
                {temperature === null ? "Non spécifiée" : `${temperature}°C`}
              </span>
              {temperature !== null && (
                <button
                  type="button"
                  onClick={() => setTemperature(null)}
                  className="text-xs text-brand-strong hover:text-brand-800 font-medium"
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
            className="w-full accent-brand-600"
          />
          <div className="flex items-center justify-between mt-1 text-xs text-faint">
            <span>{TEMPERATURE_MIN}°C</span>
            <span>{TEMPERATURE_MAX}°C</span>
          </div>
        </div>

        {/* Weather evidence — optional photo (sky, weather-app screenshot,
            etc.), stored as a regular visit photo tagged "Météo". */}
        <div>
          <label className={`${labelClassName} flex items-center gap-2`}>
            <Camera size={16} className="text-faint" />
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
                  className="relative aspect-square rounded-[4px] overflow-hidden border border-line"
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
                    <X size={16} />
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
            className="flex-1 py-3 bg-surface border border-line-strong text-ink rounded-[4px] hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed font-medium min-h-[48px]"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 bg-brand-600 text-white rounded-[4px] hover:bg-brand-700 active:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px] font-medium"
          >
            {isSubmitting && <ButtonLoader />}
            <span>{isSubmitting ? "Enregistrement..." : "Enregistrer la visite"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
