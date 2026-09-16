// Client-side API for observation → photo cross-references.
//
// An observation may cite the specific photos it refers to, so the report can
// print "(voir photos 3 et 4)" after the observation's text. The numbers are
// NEVER stored: they are positions in one particular report's photo selection,
// and the same observation cited in two reports can legitimately carry
// different numbers. See resolvePhotoReferences in reportGenerator.
//
// Backed by `observation_photos` (Stage 19). Two things about that table shape
// matter here:
//
// 1. project_id is TRIGGER-STAMPED from the observation
//    (set_observation_photo_project). The client must never send it — a
//    supplied value is overwritten, and the composite FKs exist precisely so a
//    citation that straddles two projects is unrepresentable rather than
//    merely denied. Verified in a sandbox: an insert naming a photo from
//    another project is rejected before it can be written.
//
// 2. BOTH of its foreign-key pairs are composite-guarded — observation_id and
//    photo_id each have a plain FK *and* a (id, project_id) composite one (see
//    lotApi.ts:52-55). So `photos(...)` in a select is ambiguous and PostgREST
//    answers PGRST201; it would need
//    `photos!observation_photos_photo_id_fkey(...)`.
//
//    This module deliberately does NOT embed. Everything callers need —
//    photo_id and sort_order — lives on the link table itself, so reading the
//    plain columns avoids the ambiguity entirely rather than navigating it.
//    The photo rows are already loaded by the surfaces that need them (the
//    visit's photo grid, the report's selection), so an embed would re-fetch
//    what the caller already holds.

import { supabase } from "./supabase";
import type { Insert } from "./supabase";

/** One citation: which photo, and the editorial order within the observation. */
export interface ObservationPhotoLink {
  observationId: string;
  photoId: string;
  sortOrder: number;
}

/**
 * project_id is the database's to fill, exactly like the other trigger-stamped
 * columns (see InsertTriggerOrg / InsertVisitStage in supabase.ts). Omitting it
 * from the write type states that in the type system rather than in a comment
 * at the call site.
 */
type InsertObservationPhoto = Omit<Insert<"observation_photos">, "project_id">;

function rowToLink(row: {
  observation_id: string;
  photo_id: string;
  sort_order: number | null;
}): ObservationPhotoLink {
  return {
    observationId: row.observation_id,
    photoId: row.photo_id,
    sortOrder: row.sort_order ?? 0,
  };
}

/**
 * Every citation for a set of observations, in one query.
 *
 * Batched rather than per-observation: the observations list and the report
 * generator both need all of them at once, and an N+1 here would be one
 * request per line of the report.
 */
export async function getObservationPhotoLinks(
  observationIds: string[],
): Promise<ObservationPhotoLink[]> {
  if (observationIds.length === 0) return [];

  const { data, error } = await supabase
    .from("observation_photos")
    .select("observation_id, photo_id, sort_order")
    .in("observation_id", observationIds)
    // created_at breaks ties deterministically: sort_order is not unique, and
    // two citations added from different devices can share one.
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error fetching observation photo links:", error);
    throw error;
  }
  return (data || []).map(rowToLink);
}

/** The photo ids one observation cites, in citation order. */
export async function getObservationPhotoIds(observationId: string): Promise<string[]> {
  const links = await getObservationPhotoLinks([observationId]);
  return links.map((l) => l.photoId);
}

/**
 * Replaces an observation's citations with exactly `photoIds`.
 *
 * Delete-then-insert, like setVisitStages: the set is a handful of rows, and
 * diffing would add bug surface for no measurable gain. sort_order follows the
 * array's order, so the caller controls how the reference reads.
 *
 * project_id is omitted on purpose — see the module header.
 */
export async function setObservationPhotos(
  observationId: string,
  photoIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("observation_photos")
    .delete()
    .eq("observation_id", observationId);

  if (deleteError) {
    console.error("❌ Error clearing observation photo links:", deleteError);
    throw deleteError;
  }

  if (photoIds.length === 0) return;

  const payload: InsertObservationPhoto[] = photoIds.map((photoId, index) => ({
    observation_id: observationId,
    photo_id: photoId,
    sort_order: index,
  }));

  const { error: insertError } = await supabase
    .from("observation_photos")
    // Cast at the boundary, matching createCompany / createProject: the
    // generated Insert type marks project_id required because the column is
    // NOT NULL with no default, and the generator cannot see the BEFORE INSERT
    // trigger that supplies it. `payload` stays typed as the Omit'd alias, so
    // no call site can send one.
    .insert(payload as Insert<"observation_photos">[]);

  if (insertError) {
    console.error("❌ Error linking photos to observation:", insertError);
    throw insertError;
  }
}
