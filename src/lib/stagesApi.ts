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
//     Being a copy is also what makes the "Lots et étapes" tab's per-project
//     editing safe: a project may add, rename, reorder and delete its own
//     stages freely, and none of it touches the firm's master list or any
//     other project. A stage added here has no provenance at all
//     (source_stage_id NULL), which is the truth — nobody copied it.
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
import type {
  Insert,
  InsertProjectStage,
  InsertVisitStage,
  UpdateProjectStage,
} from "./supabase";

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

  // No cast needed — see createProjectStage. source_org_id is nullable, so the
  // generated Insert type has it optional and InsertProjectStage assigns
  // straight through. The type still omits the column, so a call site cannot
  // send one; that guarantee comes from the alias, not from a cast.
  const { error: insertError } = await supabase
    .from("project_stages")
    .insert(payload);

  // A concurrent caller may have seeded first — project_stages_project_name_key
  // makes that a duplicate rather than a double insert. Re-read either way:
  // the rows exist, which is all this function promises.
  if (insertError && !isDuplicate(insertError)) throw insertError;

  return getProjectStages(projectId);
}

/* ── MANAGING A PROJECT'S STAGES ────────────────────────────────────────── */

/**
 * Adds one stage to a project.
 *
 * source_stage_id is deliberately NOT set: a stage typed into a project came
 * from nobody's master list, and the paired CHECK constraint
 * (project_stages_source_org_paired) requires source_stage_id and source_org_id
 * to be null or non-null together. Leaving both null is the honest record —
 * see the column comment, which says exactly this.
 *
 * The name is trimmed and its internal whitespace collapsed before it is sent,
 * because project_stages_project_name_key indexes `lower(btrim(name))`: without
 * normalising, "  Structure " and "Structure" are one key to the database but
 * two different strings to every list that displays them.
 */
export async function createProjectStage(
  projectId: string,
  name: string,
  sortOrder: number,
): Promise<void> {
  const clean = normaliseName(name);
  if (!clean) throw new Error("Le nom de l'étape est requis.");

  const payload: InsertProjectStage = {
    project_id: projectId,
    name: clean,
    sort_order: sortOrder,
  };

  // NO boundary cast here, unlike createCompany / createLot. Those tables'
  // trigger-stamped column is NOT NULL, so the generated Insert type marks it
  // required and the payload will not typecheck without one. project_stages
  // .source_org_id is NULLABLE, so the generated type already has it optional
  // and InsertProjectStage assigns directly. Adding a cast would compile but
  // would switch OFF checking on every other column for no benefit.
  const { error } = await supabase.from("project_stages").insert(payload);
  if (error) throw error;
}

/**
 * Renames one stage.
 *
 * Renaming a PROJECT stage is safe in a way that renaming a firm-level one is
 * not: visits and déficiences reference the stage by id, so the label moves
 * with them and nothing is silently relabelled behind a historical record.
 * That is the whole reason project_stages is a copy rather than a reference —
 * see the module header.
 */
export async function renameProjectStage(id: string, name: string): Promise<void> {
  const clean = normaliseName(name);
  if (!clean) throw new Error("Le nom de l'étape est requis.");

  const payload: UpdateProjectStage = { name: clean };
  const { error } = await supabase.from("project_stages").update(payload).eq("id", id);
  if (error) throw error;
}

/**
 * Persists a new order for a project's stages.
 *
 * Individual updates rather than an upsert, for the reason reorderLots gives:
 * an upsert sends every column of every row, and any column it omitted would
 * be reset to its default. A reorder must touch sort_order and nothing else —
 * here that matters twice over, since restating source_stage_id would re-fire
 * the source-org trigger.
 */
export async function reorderProjectStages(
  ordered: { id: string; sortOrder: number }[],
): Promise<void> {
  const results = await Promise.all(
    ordered.map(({ id, sortOrder }) =>
      supabase.from("project_stages").update({ sort_order: sortOrder }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/** How many records a stage is attached to. Both zero means it is unused. */
export interface StageUsage {
  visits: number;
  issues: number;
}

/**
 * Counts what a stage is attached to, so deleting one can warn before it
 * unlinks anything.
 *
 * Two `head: true` counts in parallel. `head` means PostgREST returns the count
 * in the Content-Range header and NO rows at all, so this costs two index
 * lookups and transfers nothing — which is what makes it cheap enough to run on
 * every delete tap rather than precomputing.
 *
 * Deliberately NOT computed for the whole list up front: that needs a GROUP BY
 * per stage, which PostgREST cannot express without an RPC, and it would mean a
 * migration for a number that is only ever read at the moment of deletion.
 *
 * site_visit_stages is counted rather than site_visits: the link table is the
 * fact being counted, and it has one row per (visit, stage) pair, so the number
 * IS the number of visits covering this stage.
 */
export async function getStageUsage(stageId: string): Promise<StageUsage> {
  const [visitsRes, issuesRes] = await Promise.all([
    supabase
      .from("site_visit_stages")
      .select("stage_id", { count: "exact", head: true })
      .eq("stage_id", stageId),
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId),
  ]);

  if (visitsRes.error) throw visitsRes.error;
  if (issuesRes.error) throw issuesRes.error;

  return { visits: visitsRes.count ?? 0, issues: issuesRes.count ?? 0 };
}

/**
 * Deletes a stage. Anything attached to it is UNLINKED, not deleted.
 *
 * The database does the unlinking, and the two FKs do it differently on
 * purpose — verified in a sandbox against this exact constraint shape:
 *
 *   site_visit_stages → ON DELETE CASCADE. The link row is the statement "this
 *     visit covered this stage"; with the stage gone the statement has no
 *     meaning, so the row goes. The VISIT itself is untouched.
 *
 *   issues.stage_id → ON DELETE SET NULL (stage_id). Column-scoped, and that
 *     scoping is load-bearing: the FK is composite (stage_id, project_id), so
 *     the unqualified form would also null project_id — which is NOT NULL, so
 *     every delete of a used stage would abort instead of unlinking. The
 *     déficience survives and simply loses its stage.
 *
 * Callers should show getStageUsage's counts first when either is non-zero.
 */
export async function deleteProjectStage(id: string): Promise<void> {
  const { error } = await supabase.from("project_stages").delete().eq("id", id);
  if (error) throw error;
}

/** Trim and collapse internal runs of whitespace — see createProjectStage. */
function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** True when an error is the project_stages duplicate-name index firing. */
export function isDuplicateStageName(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    e?.code === "23505" ||
    (e?.message ?? "").includes("project_stages_project_name_key")
  );
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
