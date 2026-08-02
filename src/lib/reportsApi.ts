// Client-side API for generated site-visit reports.
//
// A `reports` row is created every time a report is generated, carrying a
// per-project sequential number (A001, A002…). The number is allocated
// server-side by the create_report() function, which holds a per-project
// advisory lock — never by the client, so two people generating at the same
// moment cannot collide on a number.
//
// The schema models a report as covering MANY visits (reports + the
// report_visits join) even though the generation flow writes exactly one
// today; "add more visits to a report" is therefore a UI change later, with
// no migration.

import { supabase } from "./supabase";

export interface Report {
  id: string;
  projectId: string;
  /** Ordering source of truth; reportNumber is its rendered form. */
  reportSeq: number;
  reportPrefix: string;
  reportNumber: string;
  generatedBy: string | null;
  generatedAt: string;
  regeneratedAt: string | null;
}

function rowToReport(row: any): Report {
  return {
    id: row.id,
    projectId: row.project_id,
    reportSeq: row.report_seq,
    reportPrefix: row.report_prefix ?? "A",
    reportNumber: row.report_number,
    generatedBy: row.generated_by ?? null,
    generatedAt: row.generated_at,
    regeneratedAt: row.regenerated_at ?? null,
  };
}

/**
 * Allocates the next number for the project and persists the report with its
 * visit and location links, atomically.
 *
 * Called BEFORE rendering, because the number has to appear inside the
 * document. If the render then fails, call deleteReport() — the row is the
 * highest seq, so the next attempt gets the same number back.
 *
 * `visitIds` is an array for forward compatibility; today it carries one.
 */
export async function createReport(
  projectId: string,
  visitIds: string[],
  locationIds: string[] = [],
): Promise<Report> {
  const { data, error } = await supabase.rpc("create_report", {
    p_project_id: projectId,
    p_visit_ids: visitIds,
    p_location_ids: locationIds,
  });
  if (error) throw error;
  // The function RETURNS reports (a single composite), which PostgREST may
  // surface either bare or wrapped in a one-element array.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("create_report n'a retourné aucun rapport.");
  return rowToReport(row);
}

/** Rollback for a render that failed after the number was allocated. */
export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from("reports").delete().eq("id", id);
  if (error) throw error;
}

/** Records that an existing report was downloaded again; number unchanged. */
export async function touchRegenerated(id: string): Promise<Report> {
  const { data, error } = await supabase
    .from("reports")
    .update({ regenerated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToReport(data);
}

/** Reports that covered this location, newest first. */
export async function getReportsForLocation(locationId: string): Promise<Report[]> {
  const { data, error } = await supabase
    .from("report_locations")
    .select("reports!inner(*)")
    .eq("location_id", locationId);
  if (error) throw error;
  return ((data as any[]) || [])
    .map((row) => rowToReport(row.reports))
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

/** Every report issued for a project, newest number first. */
export async function getReportsForProject(projectId: string): Promise<Report[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("project_id", projectId)
    .order("report_seq", { ascending: false });
  if (error) throw error;
  return ((data as any[]) || []).map(rowToReport);
}
