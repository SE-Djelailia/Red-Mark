// THE MODEL PROJECT — the single fictional job the four walkthroughs narrate.
//
// ⚠ EVERYTHING HERE IS INVENTED. The landing page is public, so no real
// client, building, address, contractor or déficience may appear. The names
// below were chosen to read as plausible Québec institutional construction
// without naming anything that exists:
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
// One story across four frames: the project is created, visited, a
// déficience is raised and progresses through its lifecycle, and the report
// goes out. Anything shown in more than one walkthrough must come from here
// so the narrative cannot drift.

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
