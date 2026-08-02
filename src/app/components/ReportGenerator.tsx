import { useState, useEffect } from "react";
import { useParams } from "react-router";
import {
  FileText,
  Calendar,
  CheckCircle,
  ArrowLeft,
  Users,
  Building2,
  User,
  Plus,
  X,
  Hash,
  Send,
} from "lucide-react";
import { getProject, getSiteVisits } from "../../lib/supabaseApi";
import type { Project, SiteVisit } from "../../lib/supabase";
import { formatDateLong } from "../../lib/dateUtils";
import { toast } from "sonner";
import { getObservationsByVisit } from "../../lib/observationsApi";
import { getIssuesByVisit } from "../../lib/issuesApi";
import { createReport, deleteReport, touchRegenerated, type Report } from "../../lib/reportsApi";
import {
  generateSiteVisitReport,
  deriveLocationIds,
  formatVisitTimeRange,
  type ReportManualFields,
  type DossierNumberEntry,
  type DistributionEntry,
  type AttendeeEntry,
} from "../../lib/reportGenerator";
import { useSmartBack } from "../../hooks/useSmartBack";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { useAuth } from "../../contexts/useAuth";

const EMPTY_MANUAL_FIELDS: ReportManualFields = {
  noteNumber: "",
  pageCount: "À déterminer",
  transmittedBy: "Courriel",
  dossierNumbers: [{ label: "Dossier", number: "" }],
  distribution: [{ name: "", company: "" }],
  attendees: [{ name: "", company: "", title: "", initials: "" }],
  contractorContactNameTitle: "",
  contractorCompany: "",
  contractorAddress: "",
  contractorPhone: "",
  contractorEmail: "",
  subject: "Visite de chantier / constatations.",
  preparedByNameTitle: "",
  time: "",
};

export default function ReportGenerator() {
  const { id } = useParams();
  const { user } = useAuth();
  // Fills the footer's "PRÉPARÉ PAR" firm line. Same profile field the
  // Profile screen edits; blank when the user hasn't set one.
  const firmName = (user?.user_metadata?.firm || "").trim();
  const goBack = useSmartBack(`/app/projects/${id}`);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  // The report row for the CURRENT allocation. Non-null means a number has
  // been issued for this visit; the primary button then becomes a re-download
  // of that same document rather than a fresh allocation.
  const [report, setReport] = useState<Report | null>(null);

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
          // Pre-fill fixed identifying details from the project so they don't
          // have to be retyped on every report; still plain editable inputs
          // below, so a specific report can override any of them.
          setManual((prev) => ({
            ...prev,
            dossierNumbers: projectData.file_number
              ? [
                  { ...prev.dossierNumbers[0], number: projectData.file_number },
                  ...prev.dossierNumbers.slice(1),
                ]
              : prev.dossierNumbers,
            contractorCompany: projectData.contractor_name || prev.contractorCompany,
            contractorContactNameTitle: projectData.contractor_contact || prev.contractorContactNameTitle,
            contractorAddress: projectData.contractor_address || prev.contractorAddress,
            contractorPhone: projectData.contractor_phone || prev.contractorPhone,
            contractorEmail: projectData.contractor_email || prev.contractorEmail,
          }));

          const visitsData = await getSiteVisits(id);
          setVisits(visitsData);
          if (visitsData.length > 0) {
            setSelectedVisitId(visitsData[0].id);
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
  }, [id]);

  // Switching visits abandons the current allocation: the issued number
  // belongs to the visit it was generated for.
  useEffect(() => {
    setReport(null);
  }, [selectedVisitId]);

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
        const [observations, issues] = await Promise.all([
          getObservationsByVisit(visit.id),
          getIssuesByVisit(visit.id),
        ]);
        locationIds = deriveLocationIds(observations, issues);
      } catch (e) {
        console.error("Could not derive report locations:", e);
      }

      // The number must be inside the .docx, so it is allocated first and
      // rolled back below if the render throws.
      created = await createReport(id, [visit.id], locationIds);

      await generateSiteVisitReport(project, visit, manual, firmName, created.reportNumber);

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
      await generateSiteVisitReport(project, visit, manual, firmName, report.reportNumber);
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
        <div className="bg-white rounded-xl border border-line p-5">
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
              className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
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
        <div className="bg-white rounded-xl border border-line p-5">
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
                  className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-sm text-muted cursor-default"
                  placeholder="Attribué automatiquement"
                />
              </div>
              <div>
                <label className="block text-xs text-body mb-1">Nb pages</label>
                <input
                  type="text"
                  value={manual.pageCount}
                  onChange={(e) => updateManual("pageCount", e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
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
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
                  placeholder="Courriel"
                />
              </div>
              <div>
                <label className="block text-xs text-body mb-1">Heure de visite</label>
                {visitTimeRange ? (
                  <div className="w-full px-3 py-2 bg-subtle border border-line rounded-lg text-sm text-body">
                    {visitTimeRange}
                    <span className="text-faint"> (de la visite)</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={manual.time}
                    onChange={(e) => updateManual("time", e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
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
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
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
                      className="w-24 px-2 py-1.5 bg-canvas border border-line rounded text-sm focus:outline-none focus:border-brand-600"
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
                      className="flex-1 px-2 py-1.5 bg-canvas border border-line rounded text-sm focus:outline-none focus:border-brand-600"
                      placeholder="Numéro"
                    />
                    {manual.dossierNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeListEntry("dossierNumbers", index)}
                        className="p-1.5 text-faint hover:text-red-600"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Distribution list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-body">Distribution du rapport</label>
                <button
                  type="button"
                  onClick={() => addListEntry("distribution", { name: "", company: "" })}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800"
                >
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
              <div className="space-y-2">
                {manual.distribution.map((entry, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={entry.name}
                      onChange={(e) =>
                        updateListEntry<DistributionEntry>("distribution", index, {
                          name: e.target.value,
                        })
                      }
                      className="flex-1 px-2 py-1.5 bg-canvas border border-line rounded text-sm focus:outline-none focus:border-brand-600"
                      placeholder="Nom"
                    />
                    <input
                      type="text"
                      value={entry.company}
                      onChange={(e) =>
                        updateListEntry<DistributionEntry>("distribution", index, {
                          company: e.target.value,
                        })
                      }
                      className="flex-1 px-2 py-1.5 bg-canvas border border-line rounded text-sm focus:outline-none focus:border-brand-600"
                      placeholder="Compagnie"
                    />
                    {manual.distribution.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeListEntry("distribution", index)}
                        className="p-1.5 text-faint hover:text-red-600"
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

        {/* Contractor */}
        <div className="bg-white rounded-xl border border-line p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-brand-600" />
            <label className="text-sm font-semibold text-ink">Entrepreneur</label>
            {project?.contractor_name && (
              <span className="text-xs text-faint">(pré-rempli du projet, modifiable)</span>
            )}
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={manual.contractorContactNameTitle}
              onChange={(e) => updateManual("contractorContactNameTitle", e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
              placeholder="Nom du contact, titre"
            />
            <input
              type="text"
              value={manual.contractorCompany}
              onChange={(e) => updateManual("contractorCompany", e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
              placeholder="Nom de la compagnie"
            />
            <input
              type="text"
              value={manual.contractorAddress}
              onChange={(e) => updateManual("contractorAddress", e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
              placeholder="Adresse"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={manual.contractorPhone}
                onChange={(e) => updateManual("contractorPhone", e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
                placeholder="Téléphone"
              />
              <input
                type="email"
                value={manual.contractorEmail}
                onChange={(e) => updateManual("contractorEmail", e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
                placeholder="Courriel"
              />
            </div>
          </div>
        </div>

        {/* Attendees */}
        <div className="bg-white rounded-xl border border-line p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-brand-600" />
              <label className="text-sm font-semibold text-ink">Assistaient</label>
            </div>
            <button
              onClick={() =>
                addListEntry("attendees", { name: "", company: "", title: "", initials: "" })
              }
              className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs hover:bg-brand-700 transition-colors"
            >
              <Plus size={14} />
              Ajouter
            </button>
          </div>

          <div className="space-y-3">
            {manual.attendees.map((attendee, index) => (
              <div key={index} className="relative bg-canvas rounded-lg p-3 border border-line">
                {manual.attendees.length > 1 && (
                  <button
                    onClick={() => removeListEntry("attendees", index)}
                    className="absolute top-2 right-2 p-1 text-faint hover:text-red-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-body mb-1">Nom</label>
                    <input
                      type="text"
                      value={attendee.name}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, { name: e.target.value })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-line rounded text-sm focus:outline-none focus:border-brand-600"
                      placeholder="Nom complet"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-body mb-1">Compagnie</label>
                    <input
                      type="text"
                      value={attendee.company}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, { company: e.target.value })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-line rounded text-sm focus:outline-none focus:border-brand-600"
                      placeholder="Entreprise"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-body mb-1">Titre</label>
                    <input
                      type="text"
                      value={attendee.title}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, { title: e.target.value })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-line rounded text-sm focus:outline-none focus:border-brand-600"
                      placeholder="Fonction"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-body mb-1">Initiales</label>
                    <input
                      type="text"
                      value={attendee.initials}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, {
                          initials: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-line rounded text-sm focus:outline-none focus:border-brand-600"
                      placeholder="AB"
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prepared by */}
        <div className="bg-white rounded-xl border border-line p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-brand-600" />
            <label className="text-sm font-semibold text-ink">Préparé par</label>
          </div>
          <input
            type="text"
            value={manual.preparedByNameTitle}
            onChange={(e) => updateManual("preparedByNameTitle", e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-line rounded-lg text-sm focus:outline-none focus:border-brand-600"
            placeholder="Nom, titre"
          />
        </div>

        {/* Visit summary preview */}
        {!loading && selectedVisit && (
          <div className="bg-white rounded-xl border border-line p-5">
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
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 transition-all ${
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
            <div className="bg-surface border border-line rounded-xl p-4 flex items-center gap-3">
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
              className="w-full py-4 bg-ink text-white rounded-xl flex items-center justify-center gap-3 hover:bg-body active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
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
              className="w-full py-3 bg-surface border border-line text-ink rounded-xl flex items-center justify-center gap-2 hover:border-brand-600 hover:text-brand-600 transition-colors disabled:opacity-50 min-h-[48px]"
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
