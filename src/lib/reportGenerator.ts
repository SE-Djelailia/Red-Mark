// Generates the "Note de visite de chantier" .docx report from a single site visit's
// real Supabase data (project, issues, photos), filled into the tagged firm template
// at public/templates/note-visite-chantier.docx via docxtemplater.
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import type { Project, SiteVisit, Photo } from "./supabase";
import type { Issue } from "./issuesApi";
import { getPhotos, getPhotosSignedUrls } from "./supabaseApi";
import { getIssuesByVisit } from "./issuesApi";
import { formatDateLong, extractDateOnly } from "./dateUtils";

const TEMPLATE_URL = "/templates/note-visite-chantier.docx";
const PHOTO_MAX_WIDTH_PX = 195;
const PHOTO_MAX_HEIGHT_PX = 140;

export interface DossierNumberEntry {
  label: string;
  number: string;
}

export interface DistributionEntry {
  name: string;
  company: string;
}

export interface AttendeeEntry {
  name: string;
  company: string;
  title: string;
  initials: string;
}

// Fields the app doesn't capture yet — filled in manually on the report screen.
export interface ReportManualFields {
  noteNumber: string;
  pageCount: string;
  transmittedBy: string;
  dossierNumbers: DossierNumberEntry[];
  distribution: DistributionEntry[];
  attendees: AttendeeEntry[];
  contractorContactNameTitle: string;
  contractorCompany: string;
  contractorAddress: string;
  contractorPhone: string;
  contractorEmail: string;
  subject: string;
  preparedByNameTitle: string;
  // SiteVisit has no time-range column, only a free-text notes/weather/temperature set.
  time: string;
}

interface ZoneItem {
  number: string;
  text: string;
  actionBy: string;
}

interface Zone {
  zoneName: string;
  items: ZoneItem[];
}

interface PhotoSlot {
  image: string;
  caption: string;
  number: number;
}

interface PhotoRow {
  photo1?: PhotoSlot;
  photo2?: PhotoSlot;
  photo3?: PhotoSlot;
}

function groupIssuesIntoZones(issues: Issue[]): Zone[] {
  const zones: Zone[] = [];
  const zoneByName = new Map<string, Zone>();
  let counter = 1;

  for (const issue of issues) {
    const zoneName = issue.location || "Zone non spécifiée";
    let zone = zoneByName.get(zoneName);
    if (!zone) {
      zone = { zoneName, items: [] };
      zoneByName.set(zoneName, zone);
      zones.push(zone);
    }
    zone.items.push({
      number: `1.${counter}`,
      text: issue.description || issue.title,
      actionBy: issue.assignedTo || "",
    });
    counter++;
  }

  return zones;
}

async function buildPhotoRows(photos: Photo[]): Promise<PhotoRow[]> {
  if (photos.length === 0) return [];

  const signedUrls = await getPhotosSignedUrls(photos.map((p) => p.storage_path));

  const slots: PhotoSlot[] = photos.map((photo, index) => {
    const zone = photo.location?.room || photo.location?.floor || "Zone non spécifiée";
    const date = extractDateOnly(photo.created_at);
    return {
      image: signedUrls[index],
      caption: `${zone} (${date})`,
      number: index + 1,
    };
  });

  const rows: PhotoRow[] = [];
  for (let i = 0; i < slots.length; i += 3) {
    rows.push({
      photo1: slots[i],
      photo2: slots[i + 1],
      photo3: slots[i + 2],
    });
  }
  return rows;
}

async function fetchTemplate(): Promise<ArrayBuffer> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) {
    throw new Error(`Could not load report template (${res.status})`);
  }
  return res.arrayBuffer();
}

async function getImage(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load photo for report: ${url}`);
  }
  return res.arrayBuffer();
}

async function getSize(imgBuffer: ArrayBuffer): Promise<[number, number]> {
  const bitmap = await createImageBitmap(new Blob([imgBuffer]));
  const ratio = Math.min(PHOTO_MAX_WIDTH_PX / bitmap.width, PHOTO_MAX_HEIGHT_PX / bitmap.height, 1);
  const size: [number, number] = [Math.round(bitmap.width * ratio), Math.round(bitmap.height * ratio)];
  bitmap.close();
  return size;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function generateSiteVisitReport(
  project: Project,
  visit: SiteVisit,
  manual: ReportManualFields,
): Promise<void> {
  const [templateBuffer, issues, photos] = await Promise.all([
    fetchTemplate(),
    getIssuesByVisit(visit.id),
    getPhotos(visit.id),
  ]);

  const zones = groupIssuesIntoZones(issues);
  const photoRows = await buildPhotoRows(photos);

  const data = {
    noteNumber: manual.noteNumber,
    pageCount: manual.pageCount,
    transmittedBy: manual.transmittedBy,
    date: formatDateLong(visit.visit_date),
    projectTitle: project.name,
    dossierNumbers: manual.dossierNumbers,
    owner: project.client_name || "",
    primaryDossierNumber: manual.dossierNumbers[0]?.number || "",
    contractorContactNameTitle: manual.contractorContactNameTitle,
    contractorCompany: manual.contractorCompany,
    contractorAddress: manual.contractorAddress,
    contractorPhone: manual.contractorPhone,
    contractorEmail: manual.contractorEmail,
    distribution: manual.distribution,
    weather: [visit.weather, visit.temperature].filter(Boolean).join(", "),
    time: manual.time,
    subject: manual.subject,
    attendees: manual.attendees,
    generalNotes: visit.notes || "",
    zones,
    photoRows,
    preparedByNameTitle: manual.preparedByNameTitle,
  };

  const zip = new PizZip(templateBuffer);
  const imageModule = new ImageModule({ centered: false, getImage, getSize });
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule],
  });

  await doc.renderAsync(data);

  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }) as Blob;

  const fileName = `NoteVisite_${project.name.replace(/\s+/g, "_")}_${extractDateOnly(visit.visit_date)}.docx`;
  triggerDownload(blob, fileName);
}
