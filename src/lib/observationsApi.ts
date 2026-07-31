// Client-side API for site-visit observations — the factual record of what
// was seen on site ("Le cadre de porte en acier a été installé."), which the
// report renders under OBSERVATIONS ET ACTIONS.
//
// Deliberately separate from issues (déficiences): an observation has no
// status, priority or assignee, because most need no action at all. The two
// coexist; see the report generator for how both reach the document.
//
// Backed by the `observations` table, RLS-gated exactly like photos/issues
// (members read; owner/editor write; admin full access).

import { supabase } from "./supabase";

export interface Observation {
  id: string;
  projectId: string;
  visitId: string;
  /** Optional — the report groups by location when set. */
  locationId: string | null;
  userId: string;
  text: string;
  /** "ACTIONS PAR :" in the report. Free text, often a company. */
  actionBy: string | null;
  sortOrder: number;
  createdAt: string | null;
}

// Gaps of 10 so a future "insert between" needs no renumbering pass.
const SORT_STEP = 10;

function rowToObservation(row: any): Observation {
  return {
    id: row.id,
    projectId: row.project_id,
    visitId: row.visit_id,
    locationId: row.location_id ?? null,
    userId: row.user_id,
    text: row.text,
    actionBy: row.action_by ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at ?? null,
  };
}

/** All observations for a visit, in display order. */
export async function getObservationsByVisit(visitId: string): Promise<Observation[]> {
  const { data, error } = await supabase
    .from("observations")
    .select("*")
    .eq("visit_id", visitId)
    // created_at breaks ties deterministically — two rows can share a
    // sort_order if they were added from different devices.
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error fetching observations:", error);
    throw error;
  }
  return (data || []).map(rowToObservation);
}

export interface CreateObservationInput {
  projectId: string;
  visitId: string;
  userId: string;
  text: string;
  locationId?: string | null;
  actionBy?: string | null;
}

export async function createObservation(input: CreateObservationInput): Promise<Observation> {
  // Append to the end: one more than the current highest sort_order.
  const { data: last } = await supabase
    .from("observations")
    .select("sort_order")
    .eq("visit_id", input.visitId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSort = ((last?.[0]?.sort_order as number | undefined) ?? 0) + SORT_STEP;

  const { data, error } = await supabase
    .from("observations")
    .insert([
      {
        project_id: input.projectId,
        visit_id: input.visitId,
        user_id: input.userId,
        location_id: input.locationId || null,
        text: input.text,
        action_by: input.actionBy || null,
        sort_order: nextSort,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("❌ Error creating observation:", error);
    throw error;
  }
  return rowToObservation(data);
}

export interface UpdateObservationInput {
  text?: string;
  locationId?: string | null;
  actionBy?: string | null;
}

export async function updateObservation(
  id: string,
  updates: UpdateObservationInput,
): Promise<Observation> {
  const patch: {
    updated_at: string;
    text?: string;
    location_id?: string | null;
    action_by?: string | null;
  } = { updated_at: new Date().toISOString() };
  if (updates.text !== undefined) patch.text = updates.text;
  if (updates.locationId !== undefined) patch.location_id = updates.locationId || null;
  if (updates.actionBy !== undefined) patch.action_by = updates.actionBy || null;

  const { data, error } = await supabase
    .from("observations")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("❌ Error updating observation:", error);
    throw error;
  }
  return rowToObservation(data);
}

export async function deleteObservation(id: string): Promise<void> {
  const { error } = await supabase.from("observations").delete().eq("id", id);
  if (error) {
    console.error("❌ Error deleting observation:", error);
    throw error;
  }
}

/**
 * Move one observation up or down among its siblings.
 *
 * Swaps sort_order with the adjacent row rather than rewriting the whole
 * list — two updates regardless of how many observations exist, and the
 * caller already holds the ordered array to find the neighbour from.
 *
 * Returns the reordered list so the caller can render optimistically
 * without a refetch.
 */
export async function moveObservation(
  ordered: Observation[],
  id: string,
  direction: "up" | "down",
): Promise<Observation[]> {
  const index = ordered.findIndex((o) => o.id === id);
  if (index === -1) return ordered;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return ordered; // already at the edge

  const a = ordered[index];
  const b = ordered[target];

  // Swap the two rows' stored sort_order values. Deriving new values from
  // array positions instead would be wrong whenever the stored values are
  // unevenly spaced — with orders 25/30/99, position-derived values could
  // place the moved row ahead of a sibling it was meant to stay behind.
  //
  // If the pair happens to share a sort_order the swap is a no-op, so fall
  // back to renumbering the whole list from its current display order.
  if (a.sortOrder === b.sortOrder) {
    const next = [...ordered];
    next[index] = b;
    next[target] = a;
    const renumbered = next.map((o, i) => ({ ...o, sortOrder: (i + 1) * SORT_STEP }));
    const results = await Promise.all(
      renumbered.map((o) =>
        supabase.from("observations").update({ sort_order: o.sortOrder }).eq("id", o.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("❌ Error renumbering observations:", failed.error);
      throw failed.error;
    }
    return renumbered;
  }

  const [{ error: errA }, { error: errB }] = await Promise.all([
    supabase.from("observations").update({ sort_order: b.sortOrder }).eq("id", a.id),
    supabase.from("observations").update({ sort_order: a.sortOrder }).eq("id", b.id),
  ]);
  if (errA || errB) {
    console.error("❌ Error reordering observations:", errA || errB);
    throw errA || errB;
  }

  const next = [...ordered];
  next[index] = { ...b, sortOrder: a.sortOrder };
  next[target] = { ...a, sortOrder: b.sortOrder };
  return next;
}
