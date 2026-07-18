// Client-side API for managing plan files (uploaded PDFs) and plans (a
// specific page of a plan file designated as pinnable for a level). Backed
// by Supabase (tables `plan_files` and `plans`), RLS-gated per the Plans &
// Locations schema (admin full access; owner/editor can write; other
// members can only read). Replaces the old floorPlansApi.ts, which ran
// entirely through the legacy Edge Function + kv_store, bypassing RLS.

import { supabase } from "./supabase";

export const PLAN_FILES_BUCKET = "project-plans";

export interface PlanFile {
  id: string;
  projectId: string;
  name: string;
  storagePath: string;
  bucket: string;
  pageCount: number | null;
  fileSizeBytes: number | null;
  uploadedBy: string;
  createdAt: string;
}

export type PlanType = "floor_plan" | "ceiling" | "section" | "detail";

export interface Plan {
  id: string;
  projectId: string;
  planFileId: string;
  levelId: string;
  pageNumber: number;
  type: PlanType;
  name: string | null;
  createdAt: string;
}

function rowToPlanFile(row: any): PlanFile {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    storagePath: row.storage_path,
    bucket: row.bucket,
    pageCount: row.page_count,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

function rowToPlan(row: any): Plan {
  return {
    id: row.id,
    projectId: row.project_id,
    planFileId: row.plan_file_id,
    levelId: row.level_id,
    pageNumber: row.page_number,
    type: row.type,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function getPlanFiles(projectId: string): Promise<PlanFile[]> {
  const { data, error } = await supabase
    .from("plan_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching plan files:", error);
    throw error;
  }
  return (data || []).map(rowToPlanFile);
}

export async function getPlanFile(id: string): Promise<PlanFile | null> {
  const { data, error } = await supabase.from("plan_files").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("Error fetching plan file:", error);
    throw error;
  }
  return data ? rowToPlanFile(data) : null;
}

export async function createPlanFile(input: {
  projectId: string;
  name: string;
  storagePath: string;
  pageCount: number;
  fileSizeBytes: number;
  uploadedBy: string;
}): Promise<PlanFile> {
  const { data, error } = await supabase
    .from("plan_files")
    .insert([
      {
        project_id: input.projectId,
        name: input.name,
        storage_path: input.storagePath,
        bucket: PLAN_FILES_BUCKET,
        page_count: input.pageCount,
        file_size_bytes: input.fileSizeBytes,
        uploaded_by: input.uploadedBy,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating plan file:", error);
    throw error;
  }
  return rowToPlanFile(data);
}

export async function deletePlanFile(id: string): Promise<void> {
  // Look up the storage path first so we can remove the underlying object
  // too — deleting only the row would leave an orphaned file in the bucket.
  const { data: existing, error: fetchError } = await supabase
    .from("plan_files")
    .select("storage_path, bucket")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("Error looking up plan file before delete:", fetchError);
    throw fetchError;
  }

  const { error: deleteRowError } = await supabase.from("plan_files").delete().eq("id", id);
  if (deleteRowError) {
    console.error("Error deleting plan file row:", deleteRowError);
    throw deleteRowError;
  }

  if (existing?.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(existing.bucket || PLAN_FILES_BUCKET)
      .remove([existing.storage_path]);
    if (storageError) {
      // Row is already gone at this point; log but don't fail the whole
      // operation over a storage cleanup miss.
      console.error("Error removing plan file from storage:", storageError);
    }
  }
}

export async function getPlanFileSignedUrl(planFile: Pick<PlanFile, "bucket" | "storagePath">): Promise<string> {
  const { data, error } = await supabase.storage
    .from(planFile.bucket)
    .createSignedUrl(planFile.storagePath, 86400); // 24 hours, matches photo/floor-plan signed URL convention

  if (error) {
    console.error("Error creating signed URL for plan file:", error);
    throw error;
  }
  return data.signedUrl;
}

export async function getPlans(projectId: string): Promise<Plan[]> {
  const { data, error } = await supabase.from("plans").select("*").eq("project_id", projectId);

  if (error) {
    console.error("Error fetching plans:", error);
    throw error;
  }
  return (data || []).map(rowToPlan);
}

export async function getPlansForFile(planFileId: string): Promise<Plan[]> {
  const { data, error } = await supabase.from("plans").select("*").eq("plan_file_id", planFileId);

  if (error) {
    console.error("Error fetching plans for file:", error);
    throw error;
  }
  return (data || []).map(rowToPlan);
}

export async function createPlan(input: {
  projectId: string;
  planFileId: string;
  levelId: string;
  pageNumber: number;
  type?: PlanType;
  name?: string | null;
}): Promise<Plan> {
  const { data, error } = await supabase
    .from("plans")
    .insert([
      {
        project_id: input.projectId,
        plan_file_id: input.planFileId,
        level_id: input.levelId,
        page_number: input.pageNumber,
        type: input.type || "floor_plan",
        name: input.name || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating plan:", error);
    throw error;
  }
  return rowToPlan(data);
}

export async function updatePlan(
  id: string,
  patch: Partial<{ levelId: string; type: PlanType; name: string | null }>,
): Promise<Plan> {
  const dbPatch: Record<string, unknown> = {};
  if ("levelId" in patch) dbPatch.level_id = patch.levelId;
  if ("type" in patch) dbPatch.type = patch.type;
  if ("name" in patch) dbPatch.name = patch.name;

  const { data, error } = await supabase.from("plans").update(dbPatch).eq("id", id).select().single();

  if (error) {
    console.error("Error updating plan:", error);
    throw error;
  }
  return rowToPlan(data);
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) {
    console.error("Error deleting plan:", error);
    throw error;
  }
}
