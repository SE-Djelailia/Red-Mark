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
import {
  generateSiteVisitReport,
  formatVisitTimeRange,
  type ReportManualFields,
  type DossierNumberEntry,
  type DistributionEntry,
  type AttendeeEntry,
} from "../../lib/reportGenerator";
import { useSmartBack } from "../../hooks/useSmartBack";

const EMPTY_MANUAL_FIELDS: ReportManualFields = {
  noteNumber: "",
  pageCount: "À déterminer",
  transmittedBy: "Courriel",
  dossierNumbers: [{ label: "JLPa", number: "" }],
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
  const goBack = useSmartBack(`/app/projects/${id}`);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

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

  const handleGenerateReport = async () => {
    if (!project) return;

    const visit = visits.find((v) => v.id === selectedVisitId);
    if (!visit) {
      toast.error("Veuillez sélectionner une visite de chantier");
      return;
    }

    setGenerating(true);
    setGenerated(false);

    try {
      await generateSiteVisitReport(project, visit, manual);
      setGenerated(true);
      toast.success("Rapport généré avec succès !");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Erreur lors de la génération du rapport. Veuillez réessayer.");
    } finally {
      setGenerating(false);
    }
  };

  const selectedVisit = visits.find((v) => v.id === selectedVisitId);
  // Once a visit has real start/end times recorded, those are what the
  // report uses — the manual field becomes a read-only preview of them.
  // Only visits with neither time set still take the free-text fallback.
  const visitTimeRange = selectedVisit
    ? formatVisitTimeRange(selectedVisit.start_time, selectedVisit.end_time)
    : "";

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          <span>Retour</span>
        </button>
        <h1 className="text-2xl md:text-3xl">Générer un rapport</h1>
        <p className="text-gray-400 mt-1 text-sm">{project?.name || "Chargement..."}</p>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Visit selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Visite de chantier</label>
          </div>
          {!loading && visits.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune visite trouvée pour ce projet.</p>
          ) : (
            <select
              value={selectedVisitId}
              onChange={(e) => setSelectedVisitId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
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
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Hash size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Informations du rapport</label>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">N° de note</label>
                <input
                  type="text"
                  value={manual.noteNumber}
                  onChange={(e) => updateManual("noteNumber", e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                  placeholder="A001"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Nb pages</label>
                <input
                  type="text"
                  value={manual.pageCount}
                  onChange={(e) => updateManual("pageCount", e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                  placeholder="À déterminer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Transmis par</label>
                <input
                  type="text"
                  value={manual.transmittedBy}
                  onChange={(e) => updateManual("transmittedBy", e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                  placeholder="Courriel"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Heure de visite</label>
                {visitTimeRange ? (
                  <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600">
                    {visitTimeRange}
                    <span className="text-gray-400"> (de la visite)</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={manual.time}
                    onChange={(e) => updateManual("time", e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                    placeholder="9h00 - 10h00"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Objet de la visite</label>
              <input
                type="text"
                value={manual.subject}
                onChange={(e) => updateManual("subject", e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Visite de chantier / constatations."
              />
            </div>

            {/* Dossier numbers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-600">
                  Numéros de dossier
                  {project?.file_number && (
                    <span className="text-gray-400"> (pré-rempli du projet, modifiable)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => addListEntry("dossierNumbers", { label: "", number: "" })}
                  className="flex items-center gap-1 text-xs text-[#E10600] hover:text-[#C00500]"
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
                      className="w-24 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
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
                      className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Numéro"
                    />
                    {manual.dossierNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeListEntry("dossierNumbers", index)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
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
                <label className="text-xs text-gray-600">Distribution du rapport</label>
                <button
                  type="button"
                  onClick={() => addListEntry("distribution", { name: "", company: "" })}
                  className="flex items-center gap-1 text-xs text-[#E10600] hover:text-[#C00500]"
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
                      className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
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
                      className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Compagnie"
                    />
                    {manual.distribution.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeListEntry("distribution", index)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
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
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Entrepreneur</label>
            {project?.contractor_name && (
              <span className="text-xs text-gray-400">(pré-rempli du projet, modifiable)</span>
            )}
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={manual.contractorContactNameTitle}
              onChange={(e) => updateManual("contractorContactNameTitle", e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
              placeholder="Nom du contact, titre"
            />
            <input
              type="text"
              value={manual.contractorCompany}
              onChange={(e) => updateManual("contractorCompany", e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
              placeholder="Nom de la compagnie"
            />
            <input
              type="text"
              value={manual.contractorAddress}
              onChange={(e) => updateManual("contractorAddress", e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
              placeholder="Adresse"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={manual.contractorPhone}
                onChange={(e) => updateManual("contractorPhone", e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Téléphone"
              />
              <input
                type="email"
                value={manual.contractorEmail}
                onChange={(e) => updateManual("contractorEmail", e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Courriel"
              />
            </div>
          </div>
        </div>

        {/* Attendees */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#E10600]" />
              <label className="text-sm font-semibold text-[#1A1A1A]">Assistaient</label>
            </div>
            <button
              onClick={() =>
                addListEntry("attendees", { name: "", company: "", title: "", initials: "" })
              }
              className="flex items-center gap-1 px-3 py-1.5 bg-[#E10600] text-white rounded-lg text-xs hover:bg-[#C00500] transition-colors"
            >
              <Plus size={14} />
              Ajouter
            </button>
          </div>

          <div className="space-y-3">
            {manual.attendees.map((attendee, index) => (
              <div key={index} className="relative bg-gray-50 rounded-lg p-3 border border-gray-200">
                {manual.attendees.length > 1 && (
                  <button
                    onClick={() => removeListEntry("attendees", index)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Nom</label>
                    <input
                      type="text"
                      value={attendee.name}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, { name: e.target.value })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Nom complet"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Compagnie</label>
                    <input
                      type="text"
                      value={attendee.company}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, { company: e.target.value })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Entreprise"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Titre</label>
                    <input
                      type="text"
                      value={attendee.title}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, { title: e.target.value })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Fonction"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Initiales</label>
                    <input
                      type="text"
                      value={attendee.initials}
                      onChange={(e) =>
                        updateListEntry<AttendeeEntry>("attendees", index, {
                          initials: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
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
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Préparé par</label>
          </div>
          <input
            type="text"
            value={manual.preparedByNameTitle}
            onChange={(e) => updateManual("preparedByNameTitle", e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
            placeholder="Nom, titre"
          />
        </div>

        {/* Visit summary preview */}
        {!loading && selectedVisit && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm text-[#1A1A1A] mb-2 font-semibold">Visite sélectionnée :</h3>
            <p className="text-sm text-gray-600">
              {formatDateLong(selectedVisit.visit_date)}
              {selectedVisit.phase ? ` — ${selectedVisit.phase}` : ""}
            </p>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={() => void handleGenerateReport()}
          disabled={generating || loading || !selectedVisitId}
          className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 transition-all ${
            generating
              ? "bg-gray-400 cursor-not-allowed"
              : generated
                ? "bg-green-600 hover:bg-green-700"
                : "bg-[#E10600] hover:bg-[#C00500] active:scale-[0.98]"
          } text-white disabled:opacity-50 shadow-md`}
        >
          {generating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Génération du rapport...</span>
            </>
          ) : generated ? (
            <>
              <CheckCircle size={22} />
              <span>Rapport généré avec succès !</span>
            </>
          ) : (
            <>
              <FileText size={22} />
              <span>Générer le rapport Word</span>
            </>
          )}
        </button>

        {generated && (
          <button
            onClick={() => void handleGenerateReport()}
            className="w-full py-4 bg-[#1A1A1A] text-white rounded-xl flex items-center justify-center gap-3 hover:bg-black active:scale-[0.98] transition-all shadow-md"
          >
            <Send size={22} />
            <span>Télécharger à nouveau</span>
          </button>
        )}
      </div>
    </div>
  );
}
