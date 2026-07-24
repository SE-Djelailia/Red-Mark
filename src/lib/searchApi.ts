// Global search — one query per entity type (projects/visits/issues/
// locations), run in parallel, each independently limited. RLS (member-scoped
// SELECT policies already on all four tables) is the actual security
// boundary; scoping by projectIds here is a query-shape optimization, not a
// substitute for it. See stage-search-trgm.sql for the GIN trigram indexes
// that make the ilike queries below index scans instead of sequential scans.
import { supabase } from "./supabase";
import { getProjects } from "./supabaseApi";

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  linkPath: string;
}

export interface SearchResults {
  projects: SearchResultItem[];
  visits: SearchResultItem[];
  issues: SearchResultItem[];
  locations: SearchResultItem[];
}

const RESULT_LIMIT = 20;
const EMPTY_RESULTS: SearchResults = { projects: [], visits: [], issues: [], locations: [] };

// Strips characters that would either break PostgREST's `.or()` filter-list
// syntax (comma, parentheses) or the ilike pattern itself (%, ") — a search
// box has no legitimate use for typing those literally.
function sanitizeQuery(value: string): string {
  return value.replace(/[,()%"]/g, "").trim();
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function globalSearch(userId: string, rawQuery: string): Promise<SearchResults> {
  const query = sanitizeQuery(rawQuery);
  if (query.length < 2) return EMPTY_RESULTS;

  const projects = await getProjects(userId);
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return EMPTY_RESULTS;

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const likePattern = `%${query}%`;
  const lowerQuery = query.toLowerCase();

  const matchingProjects: SearchResultItem[] = projects
    .filter((p) => p.name.toLowerCase().includes(lowerQuery))
    .slice(0, RESULT_LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.address || "",
      linkPath: `/app/projects/${p.id}`,
    }));

  // Visit author search needs matching profile ids first (site_visits.user_id
  // has no FK to profiles for PostgREST to embed — same limitation noted in
  // getSiteVisitsPage), then OR'd into the visits query alongside phase/date.
  const [profilesResult, issuesResult, locationsResult] = await Promise.all([
    supabase.from("profiles").select("id").or(`name.ilike.${likePattern},email.ilike.${likePattern}`),
    supabase
      .from("issues")
      .select("id, title, project_id")
      .in("project_id", projectIds)
      .or(`title.ilike.${likePattern},description.ilike.${likePattern}`)
      .limit(RESULT_LIMIT),
    supabase
      .from("locations")
      .select("id, location_number, name, project_id")
      .in("project_id", projectIds)
      .or(`location_number.ilike.${likePattern},name.ilike.${likePattern}`)
      .limit(RESULT_LIMIT),
  ]);

  if (profilesResult.error) console.error("Error searching author profiles:", profilesResult.error);
  if (issuesResult.error) throw issuesResult.error;
  if (locationsResult.error) throw locationsResult.error;

  const matchingAuthorIds = (profilesResult.data || []).map((p: { id: string }) => p.id);

  const visitOrParts = [`phase.ilike.${likePattern}`];
  if (isIsoDate(query)) visitOrParts.push(`visit_date.eq.${query}`);
  if (matchingAuthorIds.length > 0) {
    visitOrParts.push(`user_id.in.(${matchingAuthorIds.join(",")})`);
  }

  const { data: visitRows, error: visitsError } = await supabase
    .from("site_visits")
    .select("id, project_id, visit_date, phase")
    .in("project_id", projectIds)
    .or(visitOrParts.join(","))
    .limit(RESULT_LIMIT);
  if (visitsError) throw visitsError;

  const visits: SearchResultItem[] = (visitRows || []).map((row) => ({
    id: row.id,
    title: row.phase ? `${row.phase}` : "Visite de chantier",
    subtitle: `${projectNameById.get(row.project_id) || "Projet inconnu"} · ${row.visit_date}`,
    linkPath: `/app/projects/${row.project_id}/visits/${row.id}`,
  }));

  const issues: SearchResultItem[] = (issuesResult.data || []).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: projectNameById.get(row.project_id) || "Projet inconnu",
    linkPath: `/app/projects/${row.project_id}/issues/${row.id}`,
  }));

  const locations: SearchResultItem[] = (locationsResult.data || []).map((row) => ({
    id: row.id,
    title: row.name ? `${row.location_number} — ${row.name}` : row.location_number,
    subtitle: projectNameById.get(row.project_id) || "Projet inconnu",
    linkPath: `/app/projects/${row.project_id}/locations/${row.id}`,
  }));

  return { projects: matchingProjects, visits, issues, locations };
}
