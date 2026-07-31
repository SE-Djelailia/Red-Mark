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
import { getObservationsByVisit, type Observation } from "./observationsApi";
import { getLocations, type Location } from "./locationsApi";
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
  // Fallback only. The report prefers the visit's real start_time/end_time
  // (added later as time columns); this free-text value is used only for
  // older visits that predate those columns and have neither set.
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

/**
 * Build the OBSERVATIONS ET ACTIONS section.
 *
 * Observations come first, grouped by location and labelled
 * "AS1-51 — Toilette – Phase 1" (the phase comes from the visit, since
 * locations carry no phase of their own). Déficiences follow under a
 * sub-heading — a temporary arrangement until they get their own template
 * section; the report reads as one numbered list either way.
 *
 * Numbering is a single running counter across every group, matching the
 * firm's note format (1.1, 1.2, 1.3 … continuing past each heading).
 */
function buildObservationZones(
  observations: Observation[],
  issues: Issue[],
  locations: Location[],
  visitPhase?: string | null,
): Zone[] {
  const zones: Zone[] = [];
  const zoneByKey = new Map<string, Zone>();
  let counter = 1;

  const phaseSuffix = visitPhase ? ` – ${visitPhase}` : "";
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const zoneFor = (key: string, name: string): Zone => {
    let zone = zoneByKey.get(key);
    if (!zone) {
      zone = { zoneName: name, items: [] };
      zoneByKey.set(key, zone);
      zones.push(zone);
    }
    return zone;
  };

  for (const obs of observations) {
    const loc = obs.locationId ? locationById.get(obs.locationId) : undefined;
    const zoneName = loc
      ? `${loc.name ? `${loc.locationNumber} — ${loc.name}` : loc.locationNumber}${phaseSuffix}`
      : "Zone non spécifiée";
    zoneFor(obs.locationId ?? "__none__", zoneName).items.push({
      number: `1.${counter}`,
      text: obs.text,
      actionBy: obs.actionBy || "",
    });
    counter++;
  }

  // Déficiences keep their own grouping (by the free-text label on the
  // issue, which is all they carry) under a single sub-heading, so the
  // reader can tell records from things needing action.
  if (issues.length > 0) {
    const heading = zoneFor("__deficiences__", "Déficiences");
    for (const issue of issues) {
      const label = issue.location ? `${issue.location} — ` : "";
      heading.items.push({
        number: `1.${counter}`,
        text: `${label}${issue.description || issue.title}`,
        actionBy: issue.assignedTo || "",
      });
      counter++;
    }
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

// "09:00:00" / "09:00" -> "9 h 00" (Québec French convention).
function formatTimeOfDay(value: string): string {
  const parts = value.split(":");
  if (parts.length < 2) return value;
  const hours = parseInt(parts[0], 10);
  if (Number.isNaN(hours)) return value;
  return `${hours} h ${parts[1]}`;
}

// The visit's real recorded times, as the report's "heure de visite".
// Tolerates only one of the two being set (both columns are nullable).
export function formatVisitTimeRange(
  startTime?: string | null,
  endTime?: string | null,
): string {
  const start = startTime ? formatTimeOfDay(startTime) : "";
  const end = endTime ? formatTimeOfDay(endTime) : "";
  if (start && end) return `${start} à ${end}`;
  return start || end || "";
}

// The template's footers already carry real Word PAGE / NUMPAGES fields, but
// Word renders the *cached* value stored in the file until something forces a
// recalculation — so a generated report showed the template's stale numbers
// (footer2 is saved as "2 / 2") rather than its own pagination. Setting
// updateFields makes Word recalculate every field on open, which is what
// actually makes the page numbers correct.
function forceFieldUpdateOnOpen(zip: PizZip): void {
  const path = "word/settings.xml";
  const file = zip.file(path);
  if (!file) return;

  const xml = file.asText();
  if (xml.includes("<w:updateFields")) return; // already set — keep idempotent

  const patched = xml.replace(/(<w:settings\b[^>]*>)/, `$1<w:updateFields w:val="true"/>`);
  if (patched !== xml) zip.file(path, patched);
}

// The template's placeholders were authored with a yellow highlight so the
// person tagging the document could find them. docxtemplater preserves run
// formatting when it substitutes text, so that highlight survived onto the
// rendered values — most visibly on {generalNotes}, a full free-text
// paragraph under GÉNÉRALITÉS ET AVANCEMENT that came out as a block of
// yellow.
//
// The highlights have been stripped from the template file itself; this is
// a safety net so re-saving the template from Word with highlights on
// cannot reintroduce the bug. Body only — the footers' highlights are on
// page-number fields and are left alone.
function stripBodyHighlights(zip: PizZip): void {
  const path = "word/document.xml";
  const file = zip.file(path);
  if (!file) return;

  const xml = file.asText();
  const stripped = xml.replace(/<w:highlight\s+w:val="yellow"\s*\/>/g, "");
  if (stripped !== xml) zip.file(path, stripped);
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
  const [templateBuffer, issues, photos, observations, locations] = await Promise.all([
    fetchTemplate(),
    getIssuesByVisit(visit.id),
    getPhotos(visit.id),
    getObservationsByVisit(visit.id),
    // Only needed to resolve location labels; an empty list degrades to
    // "Zone non spécifiée" rather than failing the whole report.
    getLocations(visit.project_id).catch(() => [] as Location[]),
  ]);

  const zones = buildObservationZones(observations, issues, locations, visit.phase);
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
    // Prefer the visit's real recorded times; manual.time only covers older
    // visits saved before start_time/end_time existed.
    time: formatVisitTimeRange(visit.start_time, visit.end_time) || manual.time,
    subject: manual.subject,
    attendees: manual.attendees,
    generalNotes: visit.notes || "",
    zones,
    photoRows,
    preparedByNameTitle: manual.preparedByNameTitle,
  };

  const zip = new PizZip(templateBuffer);
  // Before rendering: the highlight lives in the placeholder's run
  // properties, which docxtemplater carries over to the substituted value.
  stripBodyHighlights(zip);
  const imageModule = new ImageModule({ centered: false, getImage, getSize });
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule],
  });

  await doc.renderAsync(data);
  forceFieldUpdateOnOpen(doc.getZip());

  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }) as Blob;

  const fileName = `NoteVisite_${project.name.replace(/\s+/g, "_")}_${extractDateOnly(visit.visit_date)}.docx`;
  triggerDownload(blob, fileName);
}
