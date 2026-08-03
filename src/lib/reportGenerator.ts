// Generates the "Note de visite de chantier" .docx report from a single site visit's
// real Supabase data (project, issues, photos), filled into the tagged firm template
// at public/templates/note-visite-chantier.docx via docxtemplater.
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";
import type { Project, SiteVisit, Photo } from "./supabase";
import { getPhotos, getPhotosSignedUrls } from "./supabaseApi";
import { getObservationsByVisit, type Observation } from "./observationsApi";
import { getLocations, type Location } from "./locationsApi";
import { formatDateLong, extractDateOnly } from "./dateUtils";
import { WEATHER_EVIDENCE_TAG } from "./issuePhotoUpload";

const TEMPLATE_URL = "/templates/note-visite-chantier.docx";
const PHOTO_MAX_WIDTH_PX = 195;
const PHOTO_MAX_HEIGHT_PX = 140;

export interface DossierNumberEntry {
  label: string;
  number: string;
}

// Fields the app doesn't capture yet — filled in manually on the report screen.
//
// Deliberately smaller than it was. The contractor block now comes from
// project.contractor_*, "préparé par" from the generating user's profile,
// and the distribution list is gone from both the form and the document —
// none of those were per-report facts, so asking for them each time invited
// two reports on one project to disagree with each other.
export interface ReportManualFields {
  noteNumber: string;
  pageCount: string;
  transmittedBy: string;
  dossierNumbers: DossierNumberEntry[];
  subject: string;
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
 * Observations only, grouped by location and labelled "AS1-51 — Toilette –
 * Phase 1" (the phase comes from the visit, since locations carry no phase
 * of their own).
 *
 * Déficiences used to be appended here under a "Déficiences" sub-heading.
 * They are deliberately no longer part of the document: déficiences are
 * tracked work with their own lifecycle in the app, and folding them into a
 * visit note conflated "what I saw" with "what must be fixed".
 *
 * Numbering is a single running counter across every group, matching the
 * note format (1.1, 1.2, 1.3 … continuing past each heading).
 */
function buildObservationZones(
  observations: Observation[],
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

  return zones;
}

/**
 * The locations a report covers, for the reports↔locations linkage that
 * powers "Rapports" on LocationDetail.
 *
 * Observations only. Déficiences used to contribute too, but they no longer
 * appear anywhere in the document — counting them would make LocationDetail
 * claim a report covers a local that the report says nothing about.
 *
 * Photos are not a source either, even though they can now be borrowed from
 * other visits: they store their location as free text in a JSONB column
 * with no location_id, so linking them would be guesswork.
 */
export function deriveLocationIds(observations: Observation[]): string[] {
  return [
    ...new Set(observations.map((o) => o.locationId).filter((id): id is string => !!id)),
  ];
}

/**
 * A photo set assembled on the report screen, possibly drawn from several
 * visits. The report itself stays anchored to ONE visit (its header, date,
 * observations and déficiences all come from that visit) — only the photos
 * may be borrowed.
 */
export interface ReportPhotoSelection {
  /** Already in the order they should appear; numbering follows this. */
  photos: Photo[];
  /** visit_id -> visit_date, so each caption can show its OWN visit's date. */
  visitDates: Record<string, string>;
}

/**
 * The visit's photos that are eligible for the report's PHOTOS section.
 *
 * Weather-evidence photos are excluded unconditionally. They exist to record
 * the site conditions on the visit form, not as findings — a shot of the sky
 * in the middle of a defect report reads as a mistake. Filtering here rather
 * than only in the picker means a stale selection can't reintroduce one.
 */
export function selectableReportPhotos(photos: Photo[]): Photo[] {
  return photos.filter((p) => !(p.tags || []).includes(WEATHER_EVIDENCE_TAG));
}

async function buildPhotoRows(
  photos: Photo[],
  visitDates: Record<string, string>,
): Promise<PhotoRow[]> {
  if (photos.length === 0) return [];

  const signedUrls = await getPhotosSignedUrls(photos.map((p) => p.storage_path));

  const slots: PhotoSlot[] = photos.map((photo, index) => {
    const zone = photo.location?.room || photo.location?.floor || "Zone non spécifiée";
    // The date of the visit the photo was TAKEN on — not the report's visit,
    // and not created_at. created_at is the upload timestamp, which drifts
    // from the visit whenever photos are added later; and with photos now
    // borrowable from other visits, the report's own date would be plainly
    // wrong on a borrowed shot.
    const sourceDate = visitDates[photo.visit_id];
    const date = extractDateOnly(sourceDate || photo.created_at);
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
// rendered values — most visibly on free-text placeholders, which came out
// as whole blocks of yellow.
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
  // The generating user's firm, for the footer's "PRÉPARÉ PAR" block. The
  // template used to hard-code one firm's name and letterhead; both are gone,
  // and an empty value simply leaves the line blank rather than substituting
  // somebody else's letterhead.
  firmName = "",
  // "PRÉPARÉ PAR" in the footer: the generating user's name and title, from
  // their profile. Blank leaves the line empty rather than guessing.
  preparedByNameTitle = "",
  // The allocated report number (A001…). Assigned server-side by
  // create_report() before this runs, because it has to appear inside the
  // document. Falls back to the manual field only for a caller that hasn't
  // been migrated to the numbering flow.
  reportNumber?: string,
  // The photos to include, chosen on the report screen and possibly drawn
  // from several visits. Undefined means "every eligible photo of this
  // visit" — the behaviour before selection existed, kept so other callers
  // don't silently lose their photo section.
  photoSelection?: ReportPhotoSelection,
): Promise<void> {
  const [templateBuffer, ownPhotos, observations, locations] = await Promise.all([
    fetchTemplate(),
    // Only needed for the no-selection fallback; skipped when the caller
    // supplies its own set.
    photoSelection ? Promise.resolve([] as Photo[]) : getPhotos(visit.id),
    getObservationsByVisit(visit.id),
    // Only needed to resolve location labels; an empty list degrades to
    // "Zone non spécifiée" rather than failing the whole report.
    getLocations(visit.project_id).catch(() => [] as Location[]),
  ]);

  // Observations are strictly this visit's. Only photos may come from
  // elsewhere — a report that silently merged findings from other visits
  // would misstate what was seen on the day it is dated.
  const zones = buildObservationZones(observations, locations, visit.phase);

  // selectableReportPhotos runs on the SELECTION too, not just the picker:
  // a weather shot must not be able to reach a client report through a stale
  // selection, whatever the UI passed.
  const includedPhotos = selectableReportPhotos(
    photoSelection ? photoSelection.photos : ownPhotos,
  );
  const visitDates = photoSelection
    ? photoSelection.visitDates
    : { [visit.id]: visit.visit_date };
  const photoRows = await buildPhotoRows(includedPhotos, visitDates);

  const data = {
    noteNumber: reportNumber || manual.noteNumber,
    pageCount: manual.pageCount,
    transmittedBy: manual.transmittedBy,
    date: formatDateLong(visit.visit_date),
    projectTitle: project.name,
    dossierNumbers: manual.dossierNumbers,
    owner: project.client_name || "",
    firmName,
    // The project's own file number, unprefixed. The template previously
    // printed a fixed "JLPa" prefix in front of this; the number now stands
    // on its own. Falls back to the first manually-entered dossier number
    // for projects saved before file_number was captured.
    primaryDossierNumber: project.file_number || manual.dossierNumbers[0]?.number || "",
    // ENTREPRENEUR comes straight off the project. These are properties of
    // the project, not of one report, so re-typing them per report was both
    // busywork and a way for two reports on the same project to disagree.
    contractorContactNameTitle: project.contractor_contact || "",
    contractorCompany: project.contractor_name || "",
    contractorAddress: project.contractor_address || "",
    contractorPhone: project.contractor_phone || "",
    contractorEmail: project.contractor_email || "",
    weather: [visit.weather, visit.temperature].filter(Boolean).join(", "),
    // Prefer the visit's real recorded times; manual.time only covers older
    // visits saved before start_time/end_time existed.
    time: formatVisitTimeRange(visit.start_time, visit.end_time) || manual.time,
    subject: manual.subject,
    // ASSISTAIENT comes off the visit now. The template's columns are named
    // company/title, the stored shape uses organization/role — mapped here
    // so the document keeps its existing placeholders untouched. A visit
    // with no attendees yields [], and docxtemplater's table-row loop drops
    // the repeating row, leaving just the ASSISTAIENT header.
    attendees: (visit.attendees ?? []).map((a) => ({
      name: a.name,
      company: a.organization,
      title: a.role,
      initials: a.initials,
    })),
    zones,
    photoRows,
    // PRÉPARÉ PAR is whoever generated it — taken from the account rather
    // than typed, so a report can't be signed with someone else's name.
    preparedByNameTitle,
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
