import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router";
import {
  FileText,
  Calendar,
  CheckCircle,
  ArrowLeft,
  Plus,
  X,
  Hash,
  Send,
  Check,
} from "lucide-react";
import { getProject, getSiteVisits, getPhotos } from "../../lib/supabaseApi";
import { supabase } from "../../lib/supabase";
import type { Project, SiteVisit, Photo } from "../../lib/supabase";
import { formatDateLong } from "../../lib/dateUtils";
import { toast } from "sonner";
import { getObservationsByVisit } from "../../lib/observationsApi";
import { createReport, deleteReport, touchRegenerated, type Report } from "../../lib/reportsApi";
import {
  generateSiteVisitReport,
  deriveLocationIds,
  selectableReportPhotos,
  formatVisitTimeRange,
  type ReportManualFields,
  type DossierNumberEntry,
} from "../../lib/reportGenerator";
import { useSmartBack } from "../../hooks/useSmartBack";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { useAuth } from "../../contexts/useAuth";
import SecureImage from "./SecureImage";

const EMPTY_MANUAL_FIELDS: ReportManualFields = {
  noteNumber: "",
  pageCount: "À déterminer",
  transmittedBy: "Courriel",
  dossierNumbers: [{ label: "Dossier", number: "" }],
  subject: "Visite de chantier / constatations.",
  time: "",
};

export default function ReportGenerator() {
  const { id } = useParams();
  // ?visit=<id> pre-selects the report's visit, so arriving from a specific
  // visit generates the report for THAT visit rather than silently defaulting
  // to the most recent one. Only a seed — the top selector still governs.
  const [searchParams] = useSearchParams();
  const requestedVisitId = searchParams.get("visit");
  const { user } = useAuth();
  // Fills the footer's firm line.
  //
  // AUTHORITATIVE SOURCE IS THE ORGANIZATION. This used to read
  // user_metadata.firm — free text each user edits on their own profile,
  // which meant two colleagues could put two different firm names on
  // documents going to the same client. organizations.report_firm_name is a
  // property of the firm, so every report from a firm agrees.
  //
  // Falls back to the profile value for a user whose organization has no
  // report_firm_name set yet, so no report is ever generated with a blank
  // letterhead.
  const [orgFirmName, setOrgFirmName] = useState<string | null>(null);
  const firmName = (orgFirmName || user?.user_metadata?.firm || "").trim();
  // "PRÉPARÉ PAR" in the document. Taken from the account that generates the
  // report rather than typed, so a note can't go out signed with someone
  // else's name. Title is appended when the profile has one.
  const preparedByNameTitle = (() => {
    const name = (user?.user_metadata?.name || "").trim();
    const title = (user?.user_metadata?.role || "").trim();
    if (!name) return "";
    return title ? `${name}, ${title}` : name;
  })();
  const goBack = useSmartBack(`/app/projects/${id}`);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  // The report row for the CURRENT allocation. Non-null means a number has
  // been issued for this visit; the primary button then becomes a re-download
  // of that same document rather than a fresh allocation.
  const [report, setReport] = useState<Report | null>(null);

  // The PHOTOS section browses independently of the top selector: the report
  // stays anchored to one visit, but its photos may be borrowed from any
  // visit in the project. photoVisitId is which visit the grid is SHOWING;
  // it is seeded from the report's visit once and then moves on its own.
  const [photoVisitId, setPhotoVisitId] = useState<string>("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosLoadError, setPhotosLoadError] = useState(false);
  // Accumulates ACROSS visits — browsing to another visit never clears it.
  // Full rows, not ids: the generator needs visit_id and storage_path, and
  // the summary needs to group by source visit.
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([]);

  const [project, setProject] = useState<Project | null>(null);
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string>("");

  const [manual, setManual] = useState<ReportManualFields>(EMPTY_MANUAL_FIELDS);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      setLoading(true);
      try {
        const projectData = await getProject(id);
        setProject(projectData);

        if (projectData) {
          // The contractor block is no longer pre-filled into editable
          // inputs — the document reads project.contractor_* directly, so
          // there is nothing here to seed. Only the dossier number remains
          // an editable field seeded from the project.
          setManual((prev) => ({
            ...prev,
            dossierNumbers: projectData.file_number
              ? [
                  { ...prev.dossierNumbers[0], number: projectData.file_number },
                  ...prev.dossierNumbers.slice(1),
                ]
              : prev.dossierNumbers,
          }));

          const visitsData = await getSiteVisits(id);
          setVisits(visitsData);
          if (visitsData.length > 0) {
            // Honour ?visit= only if it names a visit of THIS project —
            // a stale or foreign id falls back to the default rather than
            // leaving the selector pointing at nothing.
            const requested = visitsData.find((v) => v.id === requestedVisitId);
            setSelectedVisitId(requested ? requested.id : visitsData[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Erreur lors du chargement des données du projet");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [id, requestedVisitId]);

  // The firm's report letterhead name. RLS scopes `organizations` to the
  // caller's own firm, so this needs no explicit filter — a member sees
  // exactly one row, and a user in no firm sees none.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("organizations")
      .select("report_firm_name")
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Error loading firm name for report:", error);
          return;
        }
        setOrgFirmName(data?.report_firm_name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Switching the report's visit abandons the current allocation: the issued
  // number belongs to the visit it was generated for. It deliberately does
  // NOT touch the photo selection.
  useEffect(() => {
    setReport(null);
  }, [selectedVisitId]);

  // Seed the photo browser from the report's visit, once. After that the two
  // move independently — re-seeding on every change is exactly the coupling
  // this rework removes.
  useEffect(() => {
    setPhotoVisitId((current) => current || selectedVisitId);
  }, [selectedVisitId]);

  // A callback, not effect-inline, so the error state's "Réessayer" has
  // something real to call.
  const loadPhotos = useCallback(() => {
    if (!photoVisitId) return;
    setLoadingPhotos(true);
    setPhotosLoadError(false);
    getPhotos(photoVisitId)
      .then((rows) => setPhotos(selectableReportPhotos(rows)))
      .catch((e) => {
        console.error("Error loading photos for report:", e);
        setPhotosLoadError(true);
      })
      .finally(() => setLoadingPhotos(false));
  }, [photoVisitId]);

  // Reloads the grid when the PHOTO picker moves. Note what is absent:
  // nothing clears selectedPhotos, which is what lets a set build up across
  // visits.
  useEffect(() => {
    setPhotos([]);
    loadPhotos();
  }, [loadPhotos]);

  const togglePhoto = (photo: Photo) =>
    setSelectedPhotos((current) =>
      current.some((p) => p.id === photo.id)
        ? current.filter((p) => p.id !== photo.id)
        : [...current, photo],
    );

  const selectedIds = new Set(selectedPhotos.map((p) => p.id));
  const visitDateById: Record<string, string> = Object.fromEntries(
    visits.map((v) => [v.id, v.visit_date]),
  );

  // Chronological by source visit, then by capture order within it, so the
  // report's (1)(2)(3) reads as a timeline rather than as click order.
  const orderedSelection = [...selectedPhotos].sort((a, b) => {
    const da = visitDateById[a.visit_id] || "";
    const db = visitDateById[b.visit_id] || "";
    if (da !== db) return da.localeCompare(db);
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  // Which visits the selection draws from, for the running summary and for
  // the report_visits linkage.
  const sourceVisitIds = [...new Set(orderedSelection.map((p) => p.visit_id))];

  const updateManual = <K extends keyof ReportManualFields>(key: K, value: ReportManualFields[K]) => {
    setManual((prev) => ({ ...prev, [key]: value }));
  };

  function addListEntry<T>(key: keyof ReportManualFields, empty: T) {
    setManual((prev) => ({
      ...prev,
      [key]: [...(prev[key] as unknown as T[]), empty],
    }));
  }

  function removeListEntry(key: keyof ReportManualFields, index: number) {
    setManual((prev) => {
      const list = prev[key] as unknown as unknown[];
      if (list.length <= 1) return prev;
      return { ...prev, [key]: list.filter((_, i) => i !== index) };
    });
  }

  function updateListEntry<T>(key: keyof ReportManualFields, index: number, updates: Partial<T>) {
    setManual((prev) => {
      const list = [...(prev[key] as unknown as T[])];
      list[index] = { ...list[index], ...updates };
      return { ...prev, [key]: list };
    });
  }

  // Allocates a NEW number and renders. Guarded by `report` below: once a
  // report exists the button becomes "Télécharger à nouveau", so re-tapping
  // cannot quietly burn A004, A005, A006 on the same visit.
  const handleGenerateReport = async () => {
    if (!project || !id) return;

    const visit = visits.find((v) => v.id === selectedVisitId);
    if (!visit) {
      toast.error("Veuillez sélectionner une visite de chantier");
      return;
    }

    setGenerating(true);

    let created: Report | null = null;
    try {
      // Derived before allocation: report_locations rows can only be written
      // inside create_report() (the join tables carry no INSERT policy), so
      // the links have to be known up front. Failing to resolve them must
      // not block the report — an unlinked report is still a valid report.
      let locationIds: string[] = [];
      try {
        // Observations only: déficiences no longer appear in the document,
        // so linking their locals would make LocationDetail claim coverage
        // the report doesn't provide.
        locationIds = deriveLocationIds(await getObservationsByVisit(visit.id));
      } catch (e) {
        console.error("Could not derive report locations:", e);
      }

      // The number must be inside the .docx, so it is allocated first and
      // rolled back below if the render throws.
      // Every visit that contributed a photo travels with the report, so
      // report_visits (and therefore location history) reflects what the
      // document actually contains. Primary first, deduped.
      const reportVisitIds = [...new Set([visit.id, ...sourceVisitIds])];
      created = await createReport(id, reportVisitIds, locationIds);

      await generateSiteVisitReport(
        project,
        visit,
        manual,
        firmName,
        preparedByNameTitle,
        created.reportNumber,
        { photos: orderedSelection, visitDates: visitDateById },
      );

      setReport(created);
      toast.success(`Rapport ${created.reportNumber} généré`);
    } catch (error) {
      console.error("Error generating report:", error);
      if (created) {
        // Give the number back. Since this row is the highest seq for the
        // project, the next attempt gets the same number.
        try {
          await deleteReport(created.id);
        } catch (rollbackError) {
          console.error("Could not roll back the allocated report:", rollbackError);
        }
      }
      toast.error("Erreur lors de la génération du rapport. Veuillez réessayer.");
    } finally {
      setGenerating(false);
    }
  };

  // Re-renders the SAME report row, so the document keeps its number.
  const handleDownloadAgain = async () => {
    if (!project || !report) return;
    const visit = visits.find((v) => v.id === selectedVisitId);
    if (!visit) return;

    setGenerating(true);
    try {
      await generateSiteVisitReport(
        project,
        visit,
        manual,
        firmName,
        preparedByNameTitle,
        report.reportNumber,
        { photos: orderedSelection, visitDates: visitDateById },
      );
      // Bookkeeping only — a failure here must not read as a failed download.
      try {
        setReport(await touchRegenerated(report.id));
      } catch (e) {
        console.error("Could not record the regeneration:", e);
      }
      toast.success(`Rapport ${report.reportNumber} téléchargé`);
    } catch (error) {
      console.error("Error regenerating report:", error);
      toast.error("Erreur lors du téléchargement. Veuillez réessayer.");
    } finally {
      setGenerating(false);
    }
  };

  // Explicit opt-in to burning a new number.
  const handleNewReport = () => setReport(null);

  const selectedVisit = visits.find((v) => v.id === selectedVisitId);
  // Once a visit has real start/end times recorded, those are what the
  // report uses — the manual field becomes a read-only preview of them.
  // Only visits with neither time set still take the free-text fallback.
  const visitTimeRange = selectedVisit
    ? formatVisitTimeRange(selectedVisit.start_time, selectedVisit.end_time)
    : "";

  usePageHeader("Générer un rapport", project?.name || undefined);

  return (
    <div className="min-h-screen pb-20 bg-canvas">
      {/* Toolbar — title/subtitle render in the global light header. */}
      <div className="px-4 sm:px-6 pt-4 max-w-2xl mx-auto">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-muted hover:text-ink transition-colors min-h-[44px] text-sm font-medium"
        >
          <ArrowLeft size={18} />
          <span>Retour</span>
        </button>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Visit selector */}
        <div className="bg-surface rounded-[4px] border border-line p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={18} className="text-brand-600" />
            <label className="text-sm font-semibold text-ink">Visite de chantier</label>
          </div>
          {!loading && visits.length === 0 ? (
            <p className="text-sm text-muted">Aucune visite trouvée pour ce projet.</p>
          ) : (
            <select
              value={selectedVisitId}
              onChange={(e) => setSelectedVisitId(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-line rounded-[4px] text-sm focus:outline-none focus:border-ink"
            >
              {visits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {formatDateLong(visit.visit_date)}
                  {visit.phase ? ` — ${visit.phase}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Report metadata not yet captured elsewhere in the app */}
        <div className="bg-surface rounded-[4px] border border-line p-5">
          <div className="flex items-center gap-2 mb-4">
            <Hash size={18} className="text-brand-600" />
            <label className="text-sm font-semibold text-ink">Informations du rapport</label>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-body mb-1">N° de note</label>
                {/* Read-only: the number is allocated server-side at
                    generation, sequentially per project, so it can't be
                    typed into a collision. */}
                <input
                  type="text"
                  value={report?.reportNumber || ""}
                  readOnly
                  aria-readonly="true"
                  className="w-full px-3 py-2 bg-subtle border border-line rounded-[4px] text-sm text-muted cursor-default"
                  placeholder="Attribué automatiquement"
                />
              </div>
              <div>
                <label className="block text-xs text-body mb-1">Nb pages</label>
                <input
                  type="text"
                  value={manual.pageCount}
                  onChange={(e) => updateManual("pageCount", e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-[4px] text-sm focus:outline-none focus:border-ink"
                  placeholder="À déterminer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-body mb-1">Transmis par</label>
                <input
                  type="text"
                  value={manual.transmittedBy}
                  onChange={(e) => updateManual("transmittedBy", e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-[4px] text-sm focus:outline-none focus:border-ink"
                  placeholder="Courriel"
                />
              </div>
              <div>
                <label className="block text-xs text-body mb-1">Heure de visite</label>
                {visitTimeRange ? (
                  <div className="w-full px-3 py-2 bg-subtle border border-line rounded-[4px] text-sm text-body">
                    {visitTimeRange}
                    <span className="text-faint"> (de la visite)</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={manual.time}
                    onChange={(e) => updateManual("time", e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-[4px] text-sm focus:outline-none focus:border-ink"
                    placeholder="9h00 - 10h00"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-body mb-1">Objet de la visite</label>
              <input
                type="text"
                value={manual.subject}
                onChange={(e) => updateManual("subject", e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-[4px] text-sm focus:outline-none focus:border-ink"
                placeholder="Visite de chantier / constatations."
              />
            </div>

            {/* Dossier numbers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-body">
                  Numéros de dossier
                  {project?.file_number && (
                    <span className="text-faint"> (pré-rempli du projet, modifiable)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => addListEntry("dossierNumbers", { label: "", number: "" })}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800"
                >
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
              <div className="space-y-2">
                {manual.dossierNumbers.map((entry, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={entry.label}
                      onChange={(e) =>
                        updateListEntry<DossierNumberEntry>("dossierNumbers", index, {
                          label: e.target.value,
                        })
                      }
                      className="w-24 px-2 py-1.5 bg-canvas border border-line rounded text-sm focus:outline-none focus:border-ink"
                      placeholder="JLPa"
                    />
                    <input
                      type="text"
                      value={entry.number}
                      onChange={(e) =>
                        updateListEntry<DossierNumberEntry>("dossierNumbers", index, {
                          number: e.target.value,
                        })
                      }
                      className="flex-1 px-2 py-1.5 bg-canvas border border-line rounded text-sm focus:outline-none focus:border-ink"
                      placeholder="Numéro"
                    />
                    {manual.dossierNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeListEntry("dossierNumbers", index)}
                        className="p-1.5 text-faint hover:text-brand-strong"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Photo selection — browses INDEPENDENTLY of the top visit selector.
            The report stays anchored to one visit; photos may be borrowed
            from any visit, and the selection accumulates as you move between
            them. Weather-evidence photos never appear here (see
            selectableReportPhotos), and the generator re-filters anyway. */}
        {!loading && visits.length > 0 && (
          <div className="bg-surface rounded-[4px] border border-line p-5">
            <h3 className="text-sm text-ink font-semibold mb-1">Photos du rapport</h3>
            <p className="text-xs text-muted mb-3">
              Choisissez une visite, cochez ses photos, puis changez de visite — la sélection est
              conservée.
            </p>

            {/* The photo section's OWN visit picker. */}
            <label className="block text-xs text-body mb-1">Photos de la visite</label>
            <select
              value={photoVisitId}
              onChange={(e) => setPhotoVisitId(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-line rounded-[4px] text-sm mb-3 min-h-[44px] focus:outline-none focus:border-ink"
            >
              {visits.map((v) => (
                <option key={v.id} value={v.id}>
                  {formatDateLong(v.visit_date)}
                  {v.phase ? ` — ${v.phase}` : ""}
                  {v.id === selectedVisitId ? " (visite du rapport)" : ""}
                </option>
              ))}
            </select>

            {/* Running summary across every visit contributing photos. */}
            <div className="bg-canvas border border-line rounded-[4px] px-3 py-2.5 mb-3">
              <div className="text-sm text-ink font-medium">
                {selectedPhotos.length} photo{selectedPhotos.length === 1 ? "" : "s"} sélectionnée
                {selectedPhotos.length === 1 ? "" : "s"}
                {sourceVisitIds.length > 1 ? ` · ${sourceVisitIds.length} visites` : ""}
              </div>
              {sourceVisitIds.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {sourceVisitIds.map((vid) => {
                    const count = orderedSelection.filter((p) => p.visit_id === vid).length;
                    return (
                      <li key={vid} className="text-xs text-muted">
                        {visitDateById[vid] ? formatDateLong(visitDateById[vid]) : "Visite inconnue"} ·{" "}
                        {count} photo{count === 1 ? "" : "s"}
                        {vid !== selectedVisitId && (
                          <span className="text-faint"> (empruntée)</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-xs text-muted mt-0.5">
                  Aucune photo — le rapport sera généré sans section photos.
                </div>
              )}
              {selectedPhotos.length > 0 && (
                <button
                  onClick={() => setSelectedPhotos([])}
                  className="mt-2 text-xs font-medium text-brand-strong hover:underline"
                >
                  Effacer toute la sélection
                </button>
              )}
            </div>

            {loadingPhotos ? (
              <div className="text-sm text-muted">Chargement des photos…</div>
            ) : photosLoadError ? (
              <div className="text-sm text-brand-strong flex items-center gap-2">
                Impossible de charger les photos.
                <button onClick={loadPhotos} className="underline font-medium">
                  Réessayer
                </button>
              </div>
            ) : photos.length === 0 ? (
              <div className="text-sm text-muted">Aucune photo pour cette visite.</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs text-muted">
                    {photos.filter((p) => selectedIds.has(p.id)).length} / {photos.length} dans cette
                    visite
                  </span>
                  <button
                    onClick={() => {
                      const allChosen = photos.every((p) => selectedIds.has(p.id));
                      setSelectedPhotos((current) =>
                        allChosen
                          ? // Only clears THIS visit's photos; other visits' stay.
                            current.filter((p) => !photos.some((v) => v.id === p.id))
                          : [
                              ...current,
                              ...photos.filter((p) => !current.some((c) => c.id === p.id)),
                            ],
                      );
                    }}
                    className="text-xs font-medium text-brand-strong hover:underline flex-shrink-0"
                  >
                    {photos.every((p) => selectedIds.has(p.id))
                      ? "Décocher cette visite"
                      : "Tout cocher"}
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {photos.map((photo) => {
                    const checked = selectedIds.has(photo.id);
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => togglePhoto(photo)}
                        aria-pressed={checked}
                        className={`relative aspect-square rounded-[4px] overflow-hidden bg-subtle transition-all ${
                          checked ? "ring-2 ring-brand-600" : "hover:opacity-90"
                        }`}
                      >
                        <SecureImage
                          storagePath={photo.storage_path}
                          alt="Photo de la visite"
                          className="w-full h-full object-cover"
                        />
                        {!checked && (
                          <span className="absolute inset-0 bg-black/25" aria-hidden="true" />
                        )}
                        <span
                          className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            checked
                              ? "bg-brand-600 border-brand-600 text-white"
                              : "bg-surface/90 border-line-strong"
                          }`}
                          aria-hidden="true"
                        >
                          {checked && <Check size={14} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Visit summary preview */}
        {!loading && selectedVisit && (
          <div className="bg-surface rounded-[4px] border border-line p-5">
            <h3 className="text-sm text-ink mb-2 font-semibold">Visite sélectionnée :</h3>
            <p className="text-sm text-body">
              {formatDateLong(selectedVisit.visit_date)}
              {selectedVisit.phase ? ` — ${selectedVisit.phase}` : ""}
            </p>
          </div>
        )}

        {/* Generate / re-download. Once a number is issued the primary
            action stops allocating: burning A004, A005, A006 on repeated
            taps for one visit is the failure mode this guards. */}
        {!report ? (
          <button
            onClick={() => void handleGenerateReport()}
            disabled={generating || loading || !selectedVisitId}
            className={`w-full py-4 rounded-[4px] flex items-center justify-center gap-3 transition-all ${
              generating ? "bg-line-strong cursor-not-allowed" : "bg-brand-600 hover:bg-brand-700 active:scale-[0.98]"
            } text-white disabled:opacity-50 shadow-md`}
          >
            {generating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Génération du rapport...</span>
              </>
            ) : (
              <>
                <FileText size={22} />
                <span>Générer le rapport Word</span>
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-surface border border-line rounded-[4px] p-4 flex items-center gap-3">
              <CheckCircle size={22} className="text-resolved flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">Rapport {report.reportNumber}</div>
                <div className="text-xs text-muted">
                  Généré le {formatDateLong(report.generatedAt)}
                </div>
              </div>
            </div>

            <button
              onClick={() => void handleDownloadAgain()}
              disabled={generating}
              className="w-full py-4 bg-ink text-white rounded-[4px] flex items-center justify-center gap-3 hover:bg-body active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
            >
              {generating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Téléchargement...</span>
                </>
              ) : (
                <>
                  <Send size={22} />
                  <span>Télécharger à nouveau</span>
                </>
              )}
            </button>

            {/* The only path to a new number. */}
            <button
              onClick={handleNewReport}
              disabled={generating}
              className="w-full py-3 bg-surface border border-line text-ink rounded-[4px] flex items-center justify-center gap-2 hover:border-brand-600 hover:text-brand-600 transition-colors disabled:opacity-50 min-h-[48px]"
            >
              <Plus size={18} />
              <span className="text-sm font-medium">Nouveau rapport</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
