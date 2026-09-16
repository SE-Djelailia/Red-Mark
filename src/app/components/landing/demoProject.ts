// THE MODEL PROJECT — the single fictional job the demo-capture tool renders.
//
// ⚠ EVERYTHING HERE IS INVENTED. These fixtures feed /demo-capture, whose
// screenshots may end up in a sales deck, so no real client, building,
// address, contractor or déficience may appear. The names were chosen to
// read as plausible Québec institutional construction without naming
// anything that exists:
//
//   · "Centre communautaire Saint-Alphonse" — the parish-name convention is
//     ubiquitous in Québec municipal buildings, so it reads as real. There is
//     no such centre; the saint's name is common enough to belong to no one
//     building in particular.
//   · "rue des Carrières" is a real Montréal street NAME, but 4180 is not a
//     civic address that corresponds to a community centre — a plausible
//     address on a plausible street, pointing at nothing.
//   · The contractors are invented firms with ordinary Québec trade-company
//     shapes ("Construction Bêta inc.", "Plomberie Rousseau").
//   · The déficiences are written the way a real architect writes them:
//     defect, building element, precise location. That specificity is what
//     makes them read as genuine to the audience being sold to.
//
// The landing page itself no longer shows screenshots — the HistoryDiagram
// is its visual — so this file is used ONLY by the capture tool
// (src/app/components/demo/). It lives beside the landing code because that
// is where the fiction was authored, and the capture tool imports it from
// here rather than owning a second copy.

export const DEMO_PROJECT = {
  name: "Centre communautaire Saint-Alphonse",
  /** What the phone header shows — the full name does not fit. */
  shortName: "Centre Saint-Alphonse",
  address: "4180, rue des Carrières, Montréal",
  client: "Ville de Montréal",
  fileNumber: "2026-047",
  /** The visit the déficience and the report both belong to. */
  visitDate: "12 sept. 2026",
  visitDateLong: "12 septembre 2026",
  weather: "4 °C · Nuageux",
  reportNumber: "A003",
} as const;

/** The firm's construction stages, in order — the real default vocabulary. */
export const DEMO_STAGES = ["Fondation", "Structure", "Enveloppe", "Finitions"] as const;

/** Lots, each with the fictional company contracted to it. */
export const DEMO_LOTS = [
  { name: "Lot 3 — Plomberie", company: "Plomberie Rousseau" },
  { name: "Lot 5 — Enveloppe", company: "Construction Bêta inc." },
] as const;

/**
 * The déficiences. The FIRST is the one the déficience walkthrough creates
 * and the report prints, so it is the story's spine; the others give the
 * lists something true to show around it.
 *
 * Written in trade language — defect, element, location — because that is
 * how an architect actually records one, and a vague "problème au mur"
 * would announce that nobody who does this work wrote the demo.
 */
export const DEMO_ISSUES = [
  {
    title: "Fissure au mur de fondation, coin nord-est",
    short: "Fissure au mur de fondation",
    stage: "Fondation",
    lot: "Lot 5 — Enveloppe",
    priority: "Élevée",
    location: "S-01 — Sous-sol",
  },
  {
    title: "Joint de scellant manquant, fenêtre bureau 204",
    short: "Joint de scellant manquant",
    stage: "Enveloppe",
    lot: "Lot 5 — Enveloppe",
    priority: "Normale",
    location: "204 — Bureau",
  },
  {
    title: "Finition de gypse incomplète, corridor niveau 2",
    short: "Finition de gypse incomplète",
    stage: "Finitions",
    lot: "Lot 3 — Plomberie",
    priority: "Normale",
    location: "C-2 — Corridor",
  },
] as const;

/** One observation, for the report walkthrough's OBSERVATIONS section. */
export const DEMO_OBSERVATION =
  "Le cadre de porte en acier du local 204 a été installé.";

/* ── ROW-SHAPED FIXTURES FOR /demo-capture ──────────────────────────────────
   Everything below is the SAME model project, expressed as the raw PostgREST
   rows the API layer expects, so the real screens can be mounted against it.

   WHY RAW ROWS AND NOT MAPPED OBJECTS

   The capture route intercepts `fetch` at the PostgREST boundary rather than
   stubbing the API modules. That means getProjects, getLots and
   ensureProjectStages all run their REAL code — their mapping, their ordering,
   their error handling — and only the network is fake. A fixture shaped like
   the mapped `Project` object would bypass exactly the code we are trying to
   photograph.

   The ids are fixed, human-readable UUIDs so a screenshot diff is stable
   between runs. They point at nothing; this project does not exist.
─────────────────────────────────────────────────────────────────────────── */

/** Stable ids, so repeated captures are byte-comparable. */
export const DEMO_IDS = {
  org: "00000000-0000-4000-8000-000000000001",
  user: "00000000-0000-4000-8000-000000000002",
  project: "00000000-0000-4000-8000-000000000010",
  visit: "00000000-0000-4000-8000-000000000020",
} as const;

const DEMO_TS = "2026-09-12T14:30:00.000Z";

/** `projects` rows — what getProjects returns, newest first. */
export const DEMO_PROJECT_ROWS = [
  {
    id: DEMO_IDS.project,
    name: DEMO_PROJECT.name,
    address: DEMO_PROJECT.address,
    client_name: DEMO_PROJECT.client,
    file_number: DEMO_PROJECT.fileNumber,
    status: "in-progress",
    start_date: "2026-04-06",
    organization_id: DEMO_IDS.org,
    user_id: DEMO_IDS.user,
    created_at: "2026-04-01T09:00:00.000Z",
    updated_at: DEMO_TS,
    contractor_name: "Construction Bêta inc.",
    contractor_company_id: null,
    contractor_address: null,
    contractor_contact: null,
    contractor_email: null,
    contractor_phone: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000011",
    name: "École primaire des Mésanges — agrandissement",
    address: "2255, avenue Lacombe, Laval",
    client_name: "Centre de services scolaire de Laval",
    file_number: "2026-031",
    status: "in-progress",
    start_date: "2026-02-16",
    organization_id: DEMO_IDS.org,
    user_id: DEMO_IDS.user,
    created_at: "2026-02-10T09:00:00.000Z",
    updated_at: "2026-09-08T16:10:00.000Z",
    contractor_name: "Groupe Ferland",
    contractor_company_id: null,
    contractor_address: null,
    contractor_contact: null,
    contractor_email: null,
    contractor_phone: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    name: "Caserne 12 — réfection de l'enveloppe",
    address: "760, rue Sainte-Catherine Est, Montréal",
    client_name: "Ville de Montréal",
    file_number: "2025-118",
    status: "completed",
    start_date: "2025-05-05",
    organization_id: DEMO_IDS.org,
    user_id: DEMO_IDS.user,
    created_at: "2025-04-28T09:00:00.000Z",
    updated_at: "2026-06-30T11:45:00.000Z",
    contractor_name: "Rénovations Delisle",
    contractor_company_id: null,
    contractor_address: null,
    contractor_contact: null,
    contractor_email: null,
    contractor_phone: null,
  },
] as const;

/** `lots` rows for the model project — IssueForm's lot <select>. */
export const DEMO_LOT_ROWS = DEMO_LOTS.map((lot, i) => ({
  id: `00000000-0000-4000-8000-00000000003${i}`,
  project_id: DEMO_IDS.project,
  name: lot.name,
  description: null,
  company_id: null,
  company_org_id: null,
  sort_order: i,
  created_by: DEMO_IDS.user,
  created_at: DEMO_TS,
  updated_at: DEMO_TS,
}));

/** `project_stages` rows — IssueForm's étape <select>. */
export const DEMO_STAGE_ROWS = DEMO_STAGES.map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000004${i}`,
  project_id: DEMO_IDS.project,
  name,
  sort_order: i,
  source_stage_id: null,
  source_org_id: null,
  created_by: DEMO_IDS.user,
  created_at: DEMO_TS,
  updated_at: DEMO_TS,
}));
