// Client-side API for managing levels and locations (Construction Objects).
// Backed by Supabase (tables `levels` and `locations`), RLS-gated per the
// Plans & Locations schema (admin full access; owner/editor can write;
// commenters/other members can only read).

import { supabase } from "./supabase";

export interface Level {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
}

export interface Location {
  id: string;
  projectId: string;
  levelId: string;
  locationNumber: string;
  name: string | null;
  type: "room" | "element";
  discipline: string | null;
  parentLocationId: string | null;
}

function rowToLevel(row: any): Level {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

function rowToLocation(row: any): Location {
  return {
    id: row.id,
    projectId: row.project_id,
    levelId: row.level_id,
    locationNumber: row.location_number,
    name: row.name,
    type: row.type,
    discipline: row.discipline,
    parentLocationId: row.parent_location_id,
  };
}

export async function getLevels(projectId: string): Promise<Level[]> {
  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching levels:", error);
    throw error;
  }
  return (data || []).map(rowToLevel);
}

export async function createLevel(
  projectId: string,
  name: string,
  sortOrder: number,
): Promise<Level> {
  const { data, error } = await supabase
    .from("levels")
    .insert([{ project_id: projectId, name, sort_order: sortOrder }])
    .select()
    .single();

  if (error) {
    console.error("Error creating level:", error);
    throw error;
  }
  return rowToLevel(data);
}

export async function getLocations(projectId: string): Promise<Location[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("project_id", projectId);

  if (error) {
    console.error("Error fetching locations:", error);
    throw error;
  }
  return (data || []).map(rowToLocation);
}

export async function createLocation(input: {
  projectId: string;
  levelId: string;
  locationNumber: string;
  name?: string | null;
  type: "room" | "element";
  discipline?: string | null;
}): Promise<Location> {
  const { data, error } = await supabase
    .from("locations")
    .insert([
      {
        project_id: input.projectId,
        level_id: input.levelId,
        location_number: input.locationNumber,
        name: input.name || null,
        type: input.type,
        discipline: input.discipline || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating location:", error);
    throw error;
  }
  return rowToLocation(data);
}

export async function updateLocation(
  id: string,
  patch: Partial<{
    name: string | null;
    discipline: string | null;
    type: "room" | "element";
    parentLocationId: string | null;
  }>,
): Promise<Location> {
  const dbPatch: Record<string, unknown> = {};
  if ("name" in patch) dbPatch.name = patch.name;
  if ("discipline" in patch) dbPatch.discipline = patch.discipline;
  if ("type" in patch) dbPatch.type = patch.type;
  if ("parentLocationId" in patch) dbPatch.parent_location_id = patch.parentLocationId;

  const { data, error } = await supabase
    .from("locations")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating location:", error);
    throw error;
  }
  return rowToLocation(data);
}
