// Client-side API for CONSTRUCTION STAGES — the "when in the build" axis.
//
// THE THREE TABLES, AND WHY THERE ARE THREE
//
//   construction_stages — the FIRM's master list (Fondation, Structure,
//     Enveloppe, Finitions). Curated once per firm, firm-scoped by
//     organization_id. Seeded in Stage 23.
//
//   project_stages — the stages ONE project uses. A COPY of the master, not a
//     reference: name and sort_order are duplicated at creation. If the firm
//     later renames "Enveloppe", visits already recorded against the old name
//     MUST NOT silently relabel — what was written on site is historical fact.
//     source_stage_id records provenance only.
//
//   site_visit_stages — which stages a visit covered. A LINK table, not a
//     column, because a visit covers SEVERAL stages: an architect walks the
//     foundations, the envelope and the finishes in one morning.
//
// Distinct from a LOT (lotApi.ts), which is the other axis: a lot says WHO is
// responsible (the contractual division, which carries the company), a stage
// says WHEN in the build. A déficience carries both.
//
// WHAT THE CLIENT MUST NEVER SEND
//
//   project_stages.source_org_id    — trigger-derived from the PROJECT's firm.
//   site_visit_stages.project_id    — trigger-derived from the VISIT.
//
// Both exist solely to carry composite FKs that make a cross-boundary row
// structurally impossible rather than merely denied by policy. The write types
// (InsertProjectStage, InsertVisitStage) omit them, so a call site cannot send
// one by accident.
//
// EMBEDS MUST NAME THEIR FOREIGN KEY
//
// Every guarded table has TWO foreign keys to its parent — the plain one and
// the composite guard — so PostgREST cannot infer which to join through and
// rejects an unqualified embed with PGRST201. Both hops here are affected:
//
//   site_visit_stages -> site_visits    (…_visit_id_fkey / …_visit_project_fkey)
//   site_visit_stages -> project_stages (…_stage_id_fkey / …_stage_project_fkey)
//
// Always use `target!constraint_name(...)` and pick the PLAIN single-column FK:
// the composite exists to make a cross-project row impossible, not to be
// traversed. Verified against PostgREST v12.2.3 — an unqualified embed here
// fails exactly as the Lot tab did.

import { supabase } from "./supabase";
import type { Insert, InsertProjectStage, InsertVisitStage } from "./supabase";

/** A stage as the project uses it. `id` is what visits link to. */
export interface ProjectStage {
  id: string;
  name: string;
  sortOrder: number;
}

/** Order stages the way the project reads them: sort_order, then name. */
function bySortThenName(a: ProjectStage, b: ProjectStage): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr");
}

/* ── PROJECT STAGES ─────────────────────────────────────────────────────── */

/** The stages this project uses, in display order. */
export async function getProjectStages(projectId: string): Promise<ProjectStage[]> {
  const { data, error } = await supabase
    .from("project_stages")
    .select("id, name, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}

/**
 * Guarantees a project has a stage list, copying the firm's master if not.
 *
 * WHY COPY-ON-FIRST-NEED RATHER THAN COPY-ON-CREATE
 *
 * Nothing populates project_stages when a project is created — handle_new_project
 * only creates the owner membership. A project created today therefore has no
 * stages at all, and the visit form would offer an empty list.
 *
 * Doing it here rather than in createProject makes it SELF-HEALING: it fixes
 * new projects and any existing project that somehow has none, and it needs no
 * migration. It runs once per project in practice — every later call sees rows
 * and returns them unchanged.
 *
 * Returns the project's stages either way. An empty result means the FIRM has
 * no master list (a firm created after the Stage 23 seed), which the caller
 * surfaces as "set your stages up in the firm settings" rather than silently
 * showing nothing.
 *
 * Only ACTIVE master stages are copied: is_active=false is how a firm retires
 * a stage from the pick list without deleting it, and a retired stage should
 * not reappear on the next project.
 */
export async function ensureProjectStages(projectId: string): Promise<ProjectStage[]> {
  const existing = await getProjectStages(projectId);
  if (existing.length > 0) return existing;

  const { data: master, error: masterError } = await supabase
    .from("construction_stages")
    .select("id, name, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (masterError) throw masterError;
  // No firm master list: the caller shows the empty state. Not an error —
  // a firm that has not set its stages up yet is a valid state, not a fault.
  if (!master || master.length === 0) return [];

  // source_stage_id records provenance; source_org_id is the database's to
  // stamp. The composite FK then verifies the pair, so copying another firm's
  // stage is rejected by the database rather than by policy.
  const payload: InsertProjectStage[] = master.map((m) => ({
    project_id: projectId,
    name: m.name,
    sort_order: m.sort_order,
    source_stage_id: m.id,
  }));

  // Cast at the boundary, matching createCompany: the generated Insert type
  // marks the trigger-filled column required because it is NOT NULL with no
  // default, and the generator cannot see the trigger. `payload` stays typed
  // as InsertProjectStage, so a call site still cannot send source_org_id.
  const { error: insertError } = await supabase
    .from("project_stages")
    .insert(payload as Insert<"project_stages">[]);

  // A concurrent caller may have seeded first — project_stages_project_name_key
  // makes that a duplicate rather than a double insert. Re-read either way:
  // the rows exist, which is all this function promises.
  if (insertError && !isDuplicate(insertError)) throw insertError;

  return getProjectStages(projectId);
}

/* ── VISIT ↔ STAGE LINKS ────────────────────────────────────────────────── */

/** The stages one visit covered, in display order. */
export async function getVisitStages(visitId: string): Promise<ProjectStage[]> {
  const { data, error } = await supabase
    .from("site_visit_stages")
    .select("stage_id, project_stages!site_visit_stages_stage_id_fkey (id, name, sort_order)")
    .eq("visit_id", visitId);

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const r = row as unknown as {
        project_stages: { id: string; name: string; sort_order: number } | { id: string; name: string; sort_order: number }[] | null;
      };
      // PostgREST returns a to-one embed as an object, but some versions
      // surface it as a single-element array. Normalise both.
      const ps = Array.isArray(r.project_stages) ? (r.project_stages[0] ?? null) : r.project_stages;
      return ps ? { id: ps.id, name: ps.name, sortOrder: ps.sort_order } : null;
    })
    .filter((s): s is ProjectStage => s !== null)
    .sort(bySortThenName);
}

/**
 * Sets exactly which stages a visit covered.
 *
 * Delete-then-insert rather than a diff: the set is tiny (four or five rows at
 * most), and computing a diff to save one round trip would add a class of bug
 * — a stale read producing a link that should have gone — for no measurable
 * gain. `project_id` is never sent; the trigger derives it from the visit.
 */
export async function setVisitStages(visitId: string, stageIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from("site_visit_stages")
    .delete()
    .eq("visit_id", visitId);
  if (deleteError) throw deleteError;

  if (stageIds.length === 0) return;

  const payload: InsertVisitStage[] = stageIds.map((stageId) => ({
    visit_id: visitId,
    stage_id: stageId,
  }));

  const { error: insertError } = await supabase
    .from("site_visit_stages")
    .insert(payload as Insert<"site_visit_stages">[]);
  if (insertError) throw insertError;
}

/**
 * The string written to the legacy site_visits.phase column.
 *
 * site_visits.phase is still read in ~44 display places (report headers, visit
 * cards, search titles, the calendar chip) and Stage 25 drops it only once
 * those migrate. Joining the selected names keeps every one of them truthful:
 * "Fondation, Enveloppe" is what an architect would have typed anyway.
 *
 * The two readers this does NOT satisfy — the phase filter dropdown and its
 * exact-match query — were migrated to the link table instead, because a
 * joined string breaks them: the dropdown would start offering combinations as
 * if they were stages, and .eq("phase", "Fondation") would silently omit a
 * visit that genuinely covered Fondation. See getVisitStageOptions and the
 * stageId filter in supabaseApi.ts.
 */
export function joinStageNames(stages: ProjectStage[]): string {
  return [...stages].sort(bySortThenName).map((s) => s.name).join(", ");
}

function isDuplicate(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || (error.message ?? "").includes("duplicate key");
}
