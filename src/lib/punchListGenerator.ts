// Generates the punch list ("liste de déficiences") .docx from a project's
// outstanding déficiences, using the shared docxEngine plumbing.
//
// Deliberately thin: the data shaping lives in punchListData.ts and the
// template mechanics in docxEngine.ts. What is here is only the mapping from
// the document model onto the template's placeholder names, plus the file
// name.

import type { Project } from "./supabase";
import { fetchTemplate, renderDocx, triggerDownload } from "./docxEngine";
import { buildPunchList, type PunchListOptions } from "./punchListData";
import { formatDateLong } from "./dateUtils";

const TEMPLATE_URL = "/templates/liste-deficiences.docx";

// Smaller than the note de visite's 195×140: the punch list puts photos
// inside a per-déficience block rather than a full-width 3-up grid, so the
// box has to fit beside the item's text.
const PHOTO_MAX_WIDTH_PX = 150;
const PHOTO_MAX_HEIGHT_PX = 110;

export interface PunchListMeta {
  /** Firm name for the letterhead block. */
  firmName?: string;
  /** "PRÉPARÉ PAR" — the generating user's name and title. */
  preparedByNameTitle?: string;
}

export async function generatePunchList(
  project: Project,
  options: PunchListOptions,
  meta: PunchListMeta = {},
): Promise<{ itemCount: number }> {
  // Template first. Gathering the déficiences and signing every photo before
  // discovering the gabarit is absent burns a dozen queries to reach the same
  // failure — and on a slow site connection that is a real wait for nothing.
  const templateBuffer = await fetchTemplate(TEMPLATE_URL);

  const doc = await buildPunchList(project.id, options);

  const scopeLabel =
    options.cut.kind === "complete" ? "Toutes disciplines" : options.cut.discipline;

  const data = {
    // ---- Header / letterhead ----
    projectTitle: project.name,
    projectAddress: project.address || "",
    owner: project.client_name || "",
    primaryDossierNumber: project.file_number || "",
    firmName: meta.firmName || "",
    preparedByNameTitle: meta.preparedByNameTitle || "",
    // The date the list was pulled. A punch list is a snapshot, so the
    // generation date IS the document's date — there is no visit behind it.
    date: formatDateLong(new Date().toISOString()),

    // ---- Contractor block (same source as the note de visite) ----
    contractorContactNameTitle: project.contractor_contact || "",
    contractorCompany: project.contractor_name || "",
    contractorAddress: project.contractor_address || "",
    contractorPhone: project.contractor_phone || "",
    contractorEmail: project.contractor_email || "",

    // ---- Scope ----
    scopeLabel,
    // Booleans so the template can show/hide whole regions with {#…}{/…}
    // rather than printing a word.
    isCompleteList: options.cut.kind === "complete",
    isDisciplineList: options.cut.kind === "discipline",
    discipline: options.cut.kind === "discipline" ? options.cut.discipline : "",

    // ---- Counts ----
    outstandingCount: doc.counts.outstanding,
    verifiedCount: doc.counts.verified,
    totalCount: doc.counts.total,

    // ---- Body ----
    items: doc.items,
    hasItems: doc.items.length > 0,

    // ---- Closeout appendix ----
    verifiedItems: doc.verifiedItems,
    hasVerifiedItems: doc.verifiedItems.length > 0,
  };

  const blob = await renderDocx({
    template: templateBuffer,
    data,
    photoMaxWidthPx: PHOTO_MAX_WIDTH_PX,
    photoMaxHeightPx: PHOTO_MAX_HEIGHT_PX,
  });

  const slug = project.name.replace(/\s+/g, "_");
  const scopeSlug =
    options.cut.kind === "complete" ? "Complete" : options.cut.discipline.replace(/\s+/g, "_");
  const today = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `ListeDeficiences_${slug}_${scopeSlug}_${today}.docx`);

  return { itemCount: doc.items.length };
}
