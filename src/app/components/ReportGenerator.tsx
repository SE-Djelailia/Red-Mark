import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  FileText,
  Download,
  Calendar,
  Filter,
  CheckCircle,
  ArrowLeft,
  Users,
  Building2,
  User,
  Plus,
  X,
  Image as ImageIcon,
  MapPin,
  Edit2,
} from "lucide-react";
import { getProject, getSiteVisits, getPhotos, updatePhoto } from "../../lib/supabaseApi";
import { getUserIssues } from "../../lib/issuesApi";
import type { Project, SiteVisit, Photo } from "../../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseLocalDate, isDateInRange, extractDateOnly } from "../../lib/dateUtils";
// Temporarily commented out to fix hooks error
// import { PhotoLocationEditor, BulkLocationEditor } from "./PhotoLocationEditor";

// Extended Photo interface for report generator with additional fields
interface ReportPhoto extends Photo {
  uploadedAt: string;
  visitId: string;
  visitDate: string;
  visitPhase?: string;
}

interface ReportConfig {
  startDate: string;
  endDate: string;
  phases: string[];
}

interface Participant {
  name: string;
  affiliation: string;
  role: string;
  initials: string;
}

interface ReportMetadata {
  transmittedBy: string;
  dossierNumber: string;
  proprietaireNumber: string;
  entrepreneur: string;
  entrepreneurContact: string;
  distribution: {
    client: boolean;
    entrepreneur: boolean;
    engineer: boolean;
    architect: boolean;
    other: boolean;
  };
  visitObject: string;
  participants: Participant[];
  preparedBy: string;
  preparedByTitle: string;
}

interface Issue {
  id: string;
  visitId: string;
  projectId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved";
  assignedTo: string;
  createdBy: string;
  createdDate: string;
  photos: { id: string; url: string }[];
  tags: string[];
  location: string;
}

export default function ReportGenerator() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(true);

  const [project, setProject] = useState<Project | null>(null);
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [photoFilterTag, setPhotoFilterTag] = useState<string>("all");
  const [bulkEditNiveau, setBulkEditNiveau] = useState<string>("");
  const [bulkEditZone, setBulkEditZone] = useState<string>("");
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  const [config, setConfig] = useState<ReportConfig>({
    startDate: "2026-02-01",
    endDate: new Date().toISOString().split("T")[0],
    phases: ["Fondation", "Charpente", "ÉMÉ", "Finitions", "Extérieur"],
  });

  const [metadata, setMetadata] = useState<ReportMetadata>({
    transmittedBy: "RedMark",
    dossierNumber: "",
    proprietaireNumber: "",
    entrepreneur: "",
    entrepreneurContact: "",
    distribution: {
      client: false,
      entrepreneur: false,
      engineer: false,
      architect: true,
      other: false,
    },
    visitObject: "Visite de chantier régulière",
    participants: [
      { name: "", affiliation: "", role: "", initials: "" },
      { name: "", affiliation: "", role: "", initials: "" },
    ],
    preparedBy: "",
    preparedByTitle: "Architecte",
  });

  const phases = ["Fondation", "Charpente", "ÉMÉ", "Finitions", "Extérieur"];

  // Load project data
  useEffect(() => {
    async function loadData() {
      if (!id) return;

      setLoading(true);
      try {
        const projectData = await getProject(id);
        setProject(projectData);

        if (projectData) {
          const visitsData = await getSiteVisits(id);
          setVisits(visitsData);

          // Load photos from ALL visits
          const allPhotos: ReportPhoto[] = [];
          for (const visit of visitsData) {
            const visitPhotos = await getPhotos(visit.id);
            // Transform to match ReportPhoto type
            const transformedPhotos: ReportPhoto[] = visitPhotos.map((p) => ({
              ...p, // Spread all Photo properties
              url: p.file_url,
              uploadedAt: p.created_at, // Use created_at from Supabase
              visitId: visit.id,
              visitDate: visit.visit_date,
              visitPhase: visit.phase,
            }));
            allPhotos.push(...transformedPhotos);
          }

          console.log("📸 Loaded total photos from all visits:", allPhotos.length);
          console.log(
            "📍 Photo locations:",
            allPhotos.map((p) => ({ id: p.id, location: p.location, tags: p.tags })),
          );
          setPhotos(allPhotos);

          const allIssues = await getUserIssues();
          const projectIssues = allIssues.filter((issue) => issue.projectId === id);
          setIssues(projectIssues);

          // Initialize metadata with project data
          setMetadata((prev) => ({
            ...prev,
            dossierNumber: projectData.id?.substring(0, 8) || "",
            entrepreneur: projectData.client || "",
          }));

          // Select all photos by default
          setSelectedPhotoIds(new Set(allPhotos.map((p) => p.id)));
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  const togglePhase = (phase: string) => {
    if (config.phases.includes(phase)) {
      setConfig({
        ...config,
        phases: config.phases.filter((p) => p !== phase),
      });
    } else {
      setConfig({ ...config, phases: [...config.phases, phase] });
    }
  };

  const addParticipant = () => {
    setMetadata({
      ...metadata,
      participants: [
        ...metadata.participants,
        { name: "", affiliation: "", role: "", initials: "" },
      ],
    });
  };

  const removeParticipant = (index: number) => {
    if (metadata.participants.length > 1) {
      setMetadata({
        ...metadata,
        participants: metadata.participants.filter((_, i) => i !== index),
      });
    }
  };

  const updateParticipant = (index: number, field: keyof Participant, value: string) => {
    const updated = [...metadata.participants];
    updated[index] = { ...updated[index], [field]: value };
    setMetadata({ ...metadata, participants: updated });
  };

  // Photo selection functions
  const togglePhotoSelection = (photoId: string) => {
    const newSet = new Set(selectedPhotoIds);
    if (newSet.has(photoId)) {
      newSet.delete(photoId);
    } else {
      newSet.add(photoId);
    }
    setSelectedPhotoIds(newSet);
  };

  const selectAllFilteredPhotos = () => {
    const filtered = getFilteredPhotos();
    setSelectedPhotoIds(new Set(filtered.map((p) => p.id)));
  };

  const deselectAllPhotos = () => {
    setSelectedPhotoIds(new Set());
  };

  const getFilteredPhotos = () => {
    return photos.filter((photo) => {
      // Use isDateInRange to compare only dates (not times)
      const inDateRange = isDateInRange(photo.uploadedAt, config.startDate, config.endDate);
      const matchesTag = photoFilterTag === "all" || photo.tags?.includes(photoFilterTag);

      return inDateRange && matchesTag;
    });
  };

  const handleGenerateReport = async () => {
    if (!project) return;

    setGenerating(true);
    setGenerated(false);

    try {
      // Filter data based on config
      const filteredVisits = visits.filter((visit) => {
        const visitDate = parseLocalDate(visit.visit_date);
        const startDate = parseLocalDate(config.startDate);
        const endDate = parseLocalDate(config.endDate);

        return (
          visitDate >= startDate &&
          visitDate <= endDate &&
          config.phases.includes(visit.phase || "")
        );
      });

      // Only include selected photos
      const selectedPhotos = photos.filter((p) => selectedPhotoIds.has(p.id));

      const filteredIssues = issues.filter((issue) => {
        const issueDate = parseLocalDate(issue.createdDate);
        const startDate = parseLocalDate(config.startDate);
        const endDate = parseLocalDate(config.endDate);

        return issueDate >= startDate && issueDate <= endDate;
      });

      // Generate PDF
      await generatePDF(project, filteredVisits, selectedPhotos, filteredIssues, config, metadata);

      setGenerated(true);
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Erreur lors de la génération du rapport. Veuillez réessayer.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    await handleGenerateReport();
  };

  // Helper function to load image as base64
  const loadImageAsBase64 = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL("image/jpeg", 0.8);
            resolve(dataURL);
          } else {
            reject(new Error("Could not get canvas context"));
          }
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = url;
    });
  };

  // PDF Generation function
  async function generatePDF(
    project: Project,
    visits: SiteVisit[],
    photos: ReportPhoto[],
    issues: Issue[],
    config: ReportConfig,
    metadata: ReportMetadata,
  ) {
    const doc = new jsPDF();
    let pageNumber = 1;

    // Helper to add footer on every page
    const addFooter = (currentPage: number, totalPages: number) => {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);

      // Page number
      doc.text(`${currentPage}/${totalPages}`, 105, 287, { align: "center" });

      // Project info at bottom left
      doc.text(project.name, 20, 287);

      // Logo space placeholder at bottom right (no logo, just reserved space)
      doc.setDrawColor(200, 200, 200);
      doc.rect(140, 280, 50, 10); // Reserved space for company logo
      doc.setFontSize(6);
      doc.setTextColor(150, 150, 150);
      doc.text("ESPACE LOGO", 165, 285, { align: "center" });
    };

    // ==================== PAGE 1: TITLE AND PROJECT INFO ====================
    let yPos = 20;

    // Title centered
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("NOTE DE VISITE DE CHANTIER", 105, yPos, { align: "center" });

    // Visit number aligned right
    doc.setFontSize(12);
    const visitNumber = visits.length > 0 ? String(visits.length).padStart(3, "0") : "001";
    doc.text(visitNumber, 190, yPos, { align: "right" });

    yPos += 5;

    // Horizontal line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);

    yPos += 10;

    // Transmission info table
    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    autoTable(doc, {
      startY: yPos,
      head: [["NB PAGES", "TRANSMIS PAR", "DATE"]],
      body: [["À déterminer", metadata.transmittedBy, new Date().toLocaleDateString("fr-CA")]],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
      margin: { left: 20, right: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // PROJET section
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("PROJET", 20, yPos);
    yPos += 6;

    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    doc.text(project.name, 20, yPos);
    yPos += 5;
    if (project.address) {
      doc.text(project.address, 20, yPos);
      yPos += 5;
    }

    doc.setFont(undefined, "bold");
    doc.text("N° DOSSIER:", 20, yPos);
    doc.setFont(undefined, "normal");
    doc.text(metadata.dossierNumber || "N/A", 50, yPos);

    if (metadata.proprietaireNumber) {
      doc.setFont(undefined, "bold");
      doc.text("N° PROPRIÉTAIRE:", 110, yPos);
      doc.setFont(undefined, "normal");
      doc.text(metadata.proprietaireNumber, 160, yPos);
    }

    yPos += 10;

    // ENTREPRENEUR + DISTRIBUTION section
    doc.setFont(undefined, "bold");
    doc.text("ENTREPRENEUR", 20, yPos);
    yPos += 6;

    doc.setFont(undefined, "normal");
    doc.text(metadata.entrepreneur || project.client || "N/A", 20, yPos);
    yPos += 5;
    if (metadata.entrepreneurContact) {
      doc.text(metadata.entrepreneurContact, 20, yPos);
      yPos += 5;
    } else {
      yPos += 0;
    }

    yPos += 5;
    doc.setFont(undefined, "bold");
    doc.text("DISTRIBUTION", 20, yPos);
    yPos += 6;

    doc.setFont(undefined, "normal");
    doc.text(`${metadata.distribution.client ? "☑" : "☐"} Client`, 20, yPos);
    doc.text(`${metadata.distribution.entrepreneur ? "☑" : "☐"} Entrepreneur`, 60, yPos);
    doc.text(`${metadata.distribution.engineer ? "☑" : "☐"} Ingénieur`, 110, yPos);
    yPos += 5;
    doc.text(`${metadata.distribution.architect ? "☑" : "☐"} Architecte`, 20, yPos);
    doc.text(`${metadata.distribution.other ? "☑" : "☐"} Autre`, 60, yPos);

    yPos += 10;

    // CONDITIONS CLIMATIQUES
    doc.setFont(undefined, "bold");
    doc.text("CONDITIONS CLIMATIQUES", 20, yPos);
    yPos += 6;

    const latestVisit = visits.length > 0 ? visits[0] : null;
    doc.setFont(undefined, "normal");
    doc.text(`Météo: ${latestVisit?.weather || "N/A"}`, 20, yPos);
    doc.text(
      `Date: ${latestVisit ? new Date(latestVisit.visit_date).toLocaleDateString("fr-CA") : "N/A"}`,
      80,
      yPos,
    );

    yPos += 10;

    // OBJET
    doc.setFont(undefined, "bold");
    doc.text("OBJET", 20, yPos);
    yPos += 6;

    doc.setFont(undefined, "normal");
    doc.text(metadata.visitObject, 20, yPos);

    yPos += 10;

    // ASSISTAIENT table
    doc.setFont(undefined, "bold");
    doc.text("ASSISTAIENT", 20, yPos);
    yPos += 6;

    const participantRows = metadata.participants.map((p) => [
      p.name || "",
      p.affiliation || "",
      p.role || "",
      p.initials || "",
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Participants", "Affiliation", "Rôle", "Initiales"]],
      body:
        participantRows.length > 0
          ? participantRows
          : [
              ["", "", "", ""],
              ["", "", "", ""],
            ],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
      margin: { left: 20, right: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // PRÉPARÉ PAR
    doc.setFont(undefined, "bold");
    doc.text("PRÉPARÉ PAR", 20, yPos);
    yPos += 6;

    doc.setFont(undefined, "normal");
    const preparedByText = metadata.preparedBy
      ? `${metadata.preparedBy} - ${metadata.preparedByTitle}`
      : `${metadata.preparedByTitle} / RedMark`;
    doc.text(preparedByText, 20, yPos);
    yPos += 10;

    // Signature line
    doc.setDrawColor(0, 0, 0);
    doc.line(20, yPos, 100, yPos);
    yPos += 4;
    doc.setFontSize(8);
    doc.text("Signature", 20, yPos);

    yPos += 8;

    // Legal note
    doc.setFont(undefined, "italic");
    doc.setFontSize(7);
    const legalNote = "Ce document est confidentiel et destiné uniquement aux parties mentionnées.";
    doc.text(legalNote, 20, yPos);

    // ==================== PAGE 2+: OBSERVATIONS AND ACTIONS ====================
    doc.addPage();
    pageNumber++;
    yPos = 20;

    // GÉNÉRALITÉS ET AVANCEMENT
    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text("GÉNÉRALITÉS ET AVANCEMENT", 20, yPos);
    yPos += 8;

    doc.setFont(undefined, "normal");
    doc.setFontSize(9);

    let itemNumber = 1;

    // Add visits as numbered items
    visits.forEach((visit) => {
      const checkPageBreak = () => {
        if (yPos > 260) {
          doc.addPage();
          pageNumber++;
          yPos = 20;
        }
      };

      checkPageBreak();

      doc.setFont(undefined, "bold");
      doc.text(`${itemNumber}.`, 20, yPos);
      doc.setFont(undefined, "normal");

      const visitText = `Visite du ${new Date(visit.visit_date).toLocaleDateString("fr-CA")} - Phase: ${visit.phase}`;
      doc.text(visitText, 27, yPos);
      yPos += 5;

      if (visit.notes) {
        checkPageBreak();
        const splitNotes = doc.splitTextToSize(visit.notes, 160);
        doc.text(splitNotes, 27, yPos);
        yPos += splitNotes.length * 5;
      }

      yPos += 3;
      itemNumber++;
    });

    yPos += 10;

    // OBSERVATIONS ET ACTIONS
    if (yPos > 240) {
      doc.addPage();
      pageNumber++;
      yPos = 20;
    }

    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text("OBSERVATIONS ET ACTIONS", 20, yPos);
    doc.text("ACTIONS PAR", 160, yPos);
    yPos += 8;

    doc.setFont(undefined, "normal");
    doc.setFontSize(9);

    // Add issues as numbered observations
    issues.forEach((issue, index) => {
      const checkPageBreak = () => {
        if (yPos > 260) {
          doc.addPage();
          pageNumber++;
          yPos = 20;
        }
      };

      checkPageBreak();

      doc.setFont(undefined, "bold");
      doc.text(`${itemNumber}.${index + 1}`, 20, yPos);

      // Issue title
      const titleText = doc.splitTextToSize(issue.title, 130);
      doc.text(titleText, 27, yPos);

      // Action by (right aligned)
      doc.setFont(undefined, "normal");
      const actionBy = issue.assignedTo || "N/A";
      doc.text(actionBy, 190, yPos, { align: "right" });

      yPos += titleText.length * 5;

      // Issue description
      if (issue.description) {
        checkPageBreak();
        doc.setFont(undefined, "normal");
        const descText = doc.splitTextToSize(`  ${issue.description}`, 130);
        doc.text(descText, 30, yPos);
        yPos += descText.length * 5;
      }

      // Priority indicator
      if (issue.priority === "critical" || issue.priority === "high") {
        doc.setFont(undefined, "bold");
        doc.setTextColor(225, 6, 0);
        doc.text("  [URGENT]", 30, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 5;
      }

      yPos += 3;
    });

    // ==================== LAST PAGES: PHOTO GALLERY 3x3 WITH REAL IMAGES ====================
    if (photos.length > 0) {
      const photosPerPage = 9; // 3x3 grid
      const photoPages = Math.ceil(photos.length / photosPerPage);

      for (let pageIndex = 0; pageIndex < photoPages; pageIndex++) {
        doc.addPage();
        pageNumber++;

        const startIdx = pageIndex * photosPerPage;
        const endIdx = Math.min(startIdx + photosPerPage, photos.length);
        const pagePhotos = photos.slice(startIdx, endIdx);

        // 3x3 grid layout
        const gridCols = 3;
        const cellWidth = 58;
        const cellHeight = 58;
        const startX = 15;
        const startY = 20;
        const gapX = 3;
        const gapY = 3;

        for (let idx = 0; idx < pagePhotos.length; idx++) {
          const photo = pagePhotos[idx];
          const row = Math.floor(idx / gridCols);
          const col = idx % gridCols;

          const x = startX + col * (cellWidth + gapX);
          const y = startY + row * (cellHeight + gapY);

          // Draw border
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.5);
          doc.rect(x, y, cellWidth, cellHeight);

          // Try to load and embed actual photo
          try {
            const imageData = await loadImageAsBase64(photo.url);
            // Add image inside the box (leave space at bottom for caption)
            doc.addImage(imageData, "JPEG", x + 1, y + 1, cellWidth - 2, cellHeight - 12);
          } catch (error) {
            console.error(`Could not load image for photo ${photo.id}:`, error);
            // If image fails to load, show placeholder
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text("Image non disponible", x + cellWidth / 2, y + cellHeight / 2, {
              align: "center",
            });
            doc.setTextColor(0, 0, 0);
          }

          // Add photo caption with niveau and zone (no tags in PDF)
          doc.setFontSize(6);
          doc.setTextColor(0, 0, 0);

          const captionParts = [];
          captionParts.push(`(${startIdx + idx + 1})`);

          // Format: Niveau X - Zone Y
          const niveau = photo.location?.floor || "-";
          const zone = photo.location?.room || "-";
          captionParts.push(`Niveau ${niveau} - ${zone}`);

          const caption = captionParts.join(" | ");
          const splitCaption = doc.splitTextToSize(caption, cellWidth - 4);
          doc.text(splitCaption, x + 2, y + cellHeight - 8);
        }
      }

      // Add "FIN DU RAPPORT" on last page
      doc.addPage();
      pageNumber++;

      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text("FIN DU RAPPORT", 105, 140, { align: "center" });
    }

    // ==================== ADD FOOTERS TO ALL PAGES ====================
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i, totalPages);
    }

    // Save the PDF
    const fileName = `NoteVisite_${project.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  }

  const filteredPhotos = getFilteredPhotos();
  const selectedCount = Array.from(selectedPhotoIds).filter((id) =>
    filteredPhotos.some((p) => p.id === id),
  ).length;

  // Get all unique tags from photos within the date range
  const availableTags = Array.from(
    new Set(
      photos
        .filter((p) => {
          const photoDate = parseLocalDate(p.uploadedAt);
          return (
            photoDate >= parseLocalDate(config.startDate) &&
            photoDate <= parseLocalDate(config.endDate)
          );
        })
        .flatMap((p) => p.tags || []),
    ),
  ).sort();

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-6 py-6 md:py-8">
        <button
          onClick={() => navigate(`/app/projects/${id}`)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          <span>Retour au projet</span>
        </button>
        <h1 className="text-2xl md:text-3xl">Générer un rapport</h1>
        <p className="text-gray-400 mt-1 text-sm">{project?.name || "Chargement..."}</p>
      </div>

      {/* Configuration Form */}
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {/* Date Range */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Période du rapport</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Du</label>
              <input
                type="date"
                value={config.startDate}
                onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Au</label>
              <input
                type="date"
                value={config.endDate}
                onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
              />
            </div>
          </div>
        </div>

        {/* Phase Filter */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Phases à inclure</label>
          </div>
          <div className="flex flex-wrap gap-2">
            {phases.map((phase) => (
              <button
                key={phase}
                onClick={() => togglePhase(phase)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  config.phases.includes(phase)
                    ? "bg-[#E10600] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {phase}
              </button>
            ))}
          </div>
        </div>

        {/* Report Metadata */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Informations du rapport</label>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Transmis par</label>
                <input
                  type="text"
                  value={metadata.transmittedBy}
                  onChange={(e) => setMetadata({ ...metadata, transmittedBy: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                  placeholder="RedMark"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">N° Dossier</label>
                <input
                  type="text"
                  value={metadata.dossierNumber}
                  onChange={(e) => setMetadata({ ...metadata, dossierNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                  placeholder="Numéro de dossier"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                N° Propriétaire (optionnel)
              </label>
              <input
                type="text"
                value={metadata.proprietaireNumber}
                onChange={(e) => setMetadata({ ...metadata, proprietaireNumber: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Numéro propriétaire"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Entrepreneur</label>
              <input
                type="text"
                value={metadata.entrepreneur}
                onChange={(e) => setMetadata({ ...metadata, entrepreneur: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Nom de l'entrepreneur"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Contact entrepreneur (optionnel)
              </label>
              <input
                type="text"
                value={metadata.entrepreneurContact}
                onChange={(e) => setMetadata({ ...metadata, entrepreneurContact: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Téléphone / Email"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-2">Distribution du rapport</label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={metadata.distribution.client}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        distribution: { ...metadata.distribution, client: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-[#E10600] border-gray-300 rounded focus:ring-[#E10600]"
                  />
                  <span className="text-sm text-gray-700">Client</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={metadata.distribution.entrepreneur}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        distribution: { ...metadata.distribution, entrepreneur: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-[#E10600] border-gray-300 rounded focus:ring-[#E10600]"
                  />
                  <span className="text-sm text-gray-700">Entrepreneur</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={metadata.distribution.engineer}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        distribution: { ...metadata.distribution, engineer: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-[#E10600] border-gray-300 rounded focus:ring-[#E10600]"
                  />
                  <span className="text-sm text-gray-700">Ingénieur</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={metadata.distribution.architect}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        distribution: { ...metadata.distribution, architect: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-[#E10600] border-gray-300 rounded focus:ring-[#E10600]"
                  />
                  <span className="text-sm text-gray-700">Architecte</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={metadata.distribution.other}
                    onChange={(e) =>
                      setMetadata({
                        ...metadata,
                        distribution: { ...metadata.distribution, other: e.target.checked },
                      })
                    }
                    className="w-4 h-4 text-[#E10600] border-gray-300 rounded focus:ring-[#E10600]"
                  />
                  <span className="text-sm text-gray-700">Autre</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Objet de la visite</label>
              <input
                type="text"
                value={metadata.visitObject}
                onChange={(e) => setMetadata({ ...metadata, visitObject: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Visite de chantier régulière"
              />
            </div>
          </div>
        </div>

        {/* Participants */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[#E10600]" />
              <label className="text-sm font-semibold text-[#1A1A1A]">Participants</label>
            </div>
            <button
              onClick={addParticipant}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#E10600] text-white rounded-lg text-xs hover:bg-[#C00500] transition-colors"
            >
              <Plus size={14} />
              Ajouter
            </button>
          </div>

          <div className="space-y-3">
            {metadata.participants.map((participant, index) => (
              <div
                key={index}
                className="relative bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                {metadata.participants.length > 1 && (
                  <button
                    onClick={() => removeParticipant(index)}
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
                      value={participant.name}
                      onChange={(e) => updateParticipant(index, "name", e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Nom complet"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Affiliation</label>
                    <input
                      type="text"
                      value={participant.affiliation}
                      onChange={(e) => updateParticipant(index, "affiliation", e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Entreprise"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Rôle</label>
                    <input
                      type="text"
                      value={participant.role}
                      onChange={(e) => updateParticipant(index, "role", e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm focus:outline-none focus:border-[#E10600]"
                      placeholder="Fonction"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Initiales</label>
                    <input
                      type="text"
                      value={participant.initials}
                      onChange={(e) => updateParticipant(index, "initials", e.target.value)}
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

        {/* Prepared By */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-[#E10600]" />
            <label className="text-sm font-semibold text-[#1A1A1A]">Préparé par</label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Nom</label>
              <input
                type="text"
                value={metadata.preparedBy}
                onChange={(e) => setMetadata({ ...metadata, preparedBy: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Votre nom"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Titre</label>
              <input
                type="text"
                value={metadata.preparedByTitle}
                onChange={(e) => setMetadata({ ...metadata, preparedByTitle: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#E10600]"
                placeholder="Architecte"
              />
            </div>
          </div>
        </div>

        {/* PHOTO SELECTION GALLERY */}
        {!loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon size={18} className="text-[#E10600]" />
                <label className="text-sm font-semibold text-[#1A1A1A]">
                  Sélection des photos ({selectedCount} / {filteredPhotos.length})
                </label>
              </div>
            </div>

            {/* Photo Filter by Phase */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-xs text-gray-600 mb-2">Filtrer par étiquette :</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPhotoFilterTag("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    photoFilterTag === "all"
                      ? "bg-[#E10600] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Toutes (
                  {
                    photos.filter((p) => {
                      const photoDate = new Date(p.uploadedAt);
                      return (
                        photoDate >= new Date(config.startDate) &&
                        photoDate <= new Date(config.endDate)
                      );
                    }).length
                  }
                  )
                </button>
                {availableTags.length > 0 ? (
                  availableTags.map((tag) => {
                    const count = photos.filter((p) => {
                      const photoDate = new Date(p.uploadedAt);
                      return (
                        photoDate >= new Date(config.startDate) &&
                        photoDate <= new Date(config.endDate) &&
                        p.tags?.includes(tag)
                      );
                    }).length;
                    return (
                      <button
                        key={tag}
                        onClick={() => setPhotoFilterTag(tag)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          photoFilterTag === tag
                            ? "bg-[#E10600] text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {tag} ({count})
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-500 italic">
                    Aucune étiquette disponible dans cette période
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            {filteredPhotos.length > 0 && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={selectAllFilteredPhotos}
                  className="flex-1 px-3 py-2 bg-[#E10600] text-white rounded-lg text-sm hover:bg-[#C00500] transition-colors font-medium"
                >
                  ✓ Tout sélectionner ({filteredPhotos.length})
                </button>
                <button
                  onClick={deselectAllPhotos}
                  className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition-colors font-medium"
                >
                  ✗ Tout désélectionner
                </button>
              </div>
            )}

            {filteredPhotos.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <ImageIcon size={48} className="mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600 text-sm font-medium mb-2">
                  Aucune photo pour ce filtre
                </p>
                <p className="text-gray-500 text-xs mb-4">
                  Essayez un autre filtre de phase ou ajustez la période.
                </p>

                {/* DEBUG INFO */}
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left max-w-md mx-auto">
                  <p className="text-xs font-bold text-yellow-900 mb-2">🔍 Info de débogage :</p>
                  <div className="space-y-1 text-xs text-yellow-800">
                    <p>
                      <strong>Total de photos dans le projet :</strong> {photos.length}
                    </p>
                    <p>
                      <strong>Période sélectionnée :</strong> {config.startDate} au {config.endDate}
                    </p>
                    <p>
                      <strong>Filtre actuel :</strong> {photoFilterTag}
                    </p>

                    {photos.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-yellow-300">
                        <p className="font-bold mb-1">Détails des photos :</p>
                        {photos.slice(0, 5).map((photo, idx) => (
                          <div
                            key={photo.id}
                            className="ml-2 mb-2 p-2 bg-white rounded border border-yellow-200"
                          >
                            <p>
                              <strong>Photo #{idx + 1}</strong>
                            </p>
                            <p>Date upload: {photo.uploadedAt}</p>
                            <p>
                              Tags:{" "}
                              {photo.tags && photo.tags.length > 0
                                ? photo.tags.join(", ")
                                : "❌ Aucun tag"}
                            </p>
                            <p className="text-red-600">
                              {new Date(photo.uploadedAt) >= new Date(config.startDate) &&
                              new Date(photo.uploadedAt) <= new Date(config.endDate)
                                ? "✅ Dans la période"
                                : "❌ Hors période"}
                            </p>
                          </div>
                        ))}
                        {photos.length > 5 && (
                          <p className="text-gray-600 italic">
                            ... et {photos.length - 5} autres photos
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => togglePhotoSelection(photo.id)}
                    className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-4 transition-all shadow-sm hover:shadow-lg ${
                      selectedPhotoIds.has(photo.id)
                        ? "border-[#E10600] ring-4 ring-[#E10600] ring-opacity-30 scale-[0.98]"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.tags?.join(", ") || "Photo"}
                      className="w-full h-full object-cover"
                    />

                    {/* Large Checkbox overlay */}
                    <div className="absolute top-3 right-3">
                      <div
                        className={`w-8 h-8 rounded-full border-3 flex items-center justify-center shadow-lg transition-all ${
                          selectedPhotoIds.has(photo.id)
                            ? "bg-[#E10600] border-white scale-110"
                            : "bg-white border-gray-400"
                        }`}
                      ></div>
                    </div>

                    {/* Tags overlay */}
                    {(photo.tags && photo.tags.length > 0) || photo.location ? (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent px-3 py-3">
                        {photo.location && (photo.location.floor || photo.location.room) && (
                          <p className="text-white text-xs font-medium mb-1">
                            📍{" "}
                            {photo.location.floor && photo.location.room
                              ? `${photo.location.floor} - ${photo.location.room}`
                              : photo.location.floor || photo.location.room}
                          </p>
                        )}
                        {photo.tags && photo.tags.length > 0 && (
                          <p className="text-white text-sm font-medium">{photo.tags.join(" • ")}</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {/* Info message */}
            {filteredPhotos.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  💡 <strong>Astuce :</strong> Cliquez sur une photo pour la
                  sélectionner/désélectionner. Les photos sélectionnées auront un cadre rouge et une
                  coche blanche.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Statistics Preview */}
        {!loading && project && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm text-[#1A1A1A] mb-4 font-semibold">Aperçu des données :</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-[#E10600]">
                  {
                    visits.filter((v) => {
                      const visitDate = parseLocalDate(v.visit_date);
                      return (
                        visitDate >= parseLocalDate(config.startDate) &&
                        visitDate <= parseLocalDate(config.endDate) &&
                        config.phases.includes(v.phase || "")
                      );
                    }).length
                  }
                </div>
                <div className="text-xs text-gray-600 mt-1">Visites</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-[#E10600]">{selectedCount}</div>
                <div className="text-xs text-gray-600 mt-1">Photos sélectionnées</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-[#E10600]">
                  {
                    issues.filter((i) => {
                      const issueDate = parseLocalDate(i.createdDate);
                      return (
                        issueDate >= parseLocalDate(config.startDate) &&
                        issueDate <= parseLocalDate(config.endDate)
                      );
                    }).length
                  }
                </div>
                <div className="text-xs text-gray-600 mt-1">Déficiences</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-[#E10600]">
                  {
                    issues.filter((i) => {
                      const issueDate = parseLocalDate(i.createdDate);
                      return (
                        issueDate >= parseLocalDate(config.startDate) &&
                        issueDate <= parseLocalDate(config.endDate) &&
                        i.status === "open"
                      );
                    }).length
                  }
                </div>
                <div className="text-xs text-gray-600 mt-1">Ouvertes</div>
              </div>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerateReport}
          disabled={generating || config.phases.length === 0 || selectedCount === 0}
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
              <span>Générer le rapport PDF</span>
            </>
          )}
        </button>

        {/* Download Button */}
        {generated && (
          <button
            onClick={handleDownload}
            className="w-full py-4 bg-[#1A1A1A] text-white rounded-xl flex items-center justify-center gap-3 hover:bg-black active:scale-[0.98] transition-all shadow-md"
          >
            <Download size={22} />
            <span>Télécharger à nouveau</span>
          </button>
        )}
      </div>
    </div>
  );
}
