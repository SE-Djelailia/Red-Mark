// Client-side API for construction phases and the firm's company directory
// (Stages 15-19 of the schema).
//
// WHAT THE CLIENT MUST NEVER SEND
//
// Two columns are the database's to fill, and sending them is not merely
// unnecessary — it is the thing the schema guards against:
//
//   companies.organization_id  — stamped by set_company_organization() from
//     the caller's firm. The INSERT policy then requires it to equal
//     current_org_id(), so a forged value cannot survive either.
//
//   phases.company_org_id      — stamped by set_phase_company_org() FROM THE
//     PROJECT'S FIRM, never from the company the caller named. The composite
//     FK (company_id, company_org_id) -> companies(id, organization_id) then
//     finds no matching pair when the company belongs to another firm, and
//     the write is rejected by the database rather than by policy.
//
// The write types (InsertTriggerOrg, InsertPhase, UpdatePhase) omit both, so
// a call site cannot send them by accident.
//
// EMBEDS MUST NAME THEIR FOREIGN KEY
//
// A side effect of those composite guards: every guarded table has TWO
// foreign keys to its parent, so PostgREST cannot infer which to join
// through and rejects an unqualified embed with PGRST201. Always use the
// `target!constraint_name(...)` form and pick the PLAIN single-column FK —
// the composite exists to make a cross-boundary row impossible, not to be
// traversed.
//
// The same applies to these pairs, none of which the client embeds yet:
//   site_visit_phases -> site_visits   (…_visit_id_fkey / …_visit_project_fkey)
//   site_visit_phases -> phases        (…_phase_id_fkey / …_phase_project_fkey)
//   observation_photos -> observations (…_observation_id_fkey / …_observation_project_fkey)
//   observation_photos -> photos       (…_photo_id_fkey / …_photo_project_fkey)
//
// PERMISSIONS, mirrored from the RLS policies so the UI can hide what the
// database would refuse:
//   phases    — read: any project member; write: owner/editor only.
//   companies — read/create/update: any member of the firm;
//               delete: firm admins only (and deletion is not exposed here —
//               a company may be referenced by phases in projects the caller
//               cannot see, so removing one is an admin action, not a
//               side-effect of tidying a picker).

import { supabase } from "./supabase";
import type { InsertPhase, InsertTriggerOrg, UpdatePhase } from "./supabase";

export interface Company {
  id: string;
  name: string;
  contactName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** Advisory label only — issues.discipline remains the trade taxonomy. */
  trade: string | null;
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  companyId: string | null;
  sortOrder: number;
  /** Joined for display. Null when the phase has no company yet. */
  company: Company | null;
}

/** The fields a user may type when creating or editing a company. */
export interface CompanyInput {
  name: string;
  contactName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  trade?: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  contact_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  trade: string | null;
}

function rowToCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    trade: row.trade,
  };
}

const COMPANY_COLUMNS = "id, name, contact_name, address, phone, email, trade";

/**
 * Trims and collapses whitespace, matching what the unique index compares.
 *
 * companies_org_name_key is UNIQUE (organization_id, lower(btrim(name))), so
 * "  Construction ABC " and "construction abc" are the SAME company to the
 * database. Normalising here means the duplicate is caught before the round
 * trip rather than surfacing as a constraint violation.
 */
export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/* ── COMPANIES ──────────────────────────────────────────────────────────── */

/** Every company in the caller's firm, alphabetical. */
export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToCompany);
}

/**
 * Creates a company in the caller's firm.
 *
 * `organization_id` is deliberately absent from the payload — see the header.
 * Blank optional fields are sent as NULL rather than "": an empty string is a
 * value, and it would print as one on a report.
 */
export async function createCompany(input: CompanyInput): Promise<Company> {
  const name = normalizeCompanyName(input.name);
  if (!name) throw new Error("Le nom de l'entreprise est requis.");

  const payload: InsertTriggerOrg<"companies"> = {
    name,
    contact_name: blankToNull(input.contactName),
    address: blankToNull(input.address),
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    trade: blankToNull(input.trade),
  };

  const { data, error } = await supabase
    .from("companies")
    .insert(payload)
    .select(COMPANY_COLUMNS)
    .single();

  if (error) throw error;
  return rowToCompany(data);
}

export async function updateCompany(id: string, input: CompanyInput): Promise<Company> {
  const name = normalizeCompanyName(input.name);
  if (!name) throw new Error("Le nom de l'entreprise est requis.");

  const { data, error } = await supabase
    .from("companies")
    .update({
      name,
      contact_name: blankToNull(input.contactName),
      address: blankToNull(input.address),
      phone: blankToNull(input.phone),
      email: blankToNull(input.email),
      trade: blankToNull(input.trade),
    })
    .eq("id", id)
    .select(COMPANY_COLUMNS)
    .single();

  if (error) throw error;
  return rowToCompany(data);
}

/* ── PHASES ─────────────────────────────────────────────────────────────── */

/**
 * A project's phases in display order.
 *
 * Ordered by sort_order then name: sort_order is not unique, and leaving the
 * tie to the database would let two phases swap places between renders.
 */
export async function getPhases(projectId: string): Promise<Phase[]> {
  const { data, error } = await supabase
    .from("phases")
    // The embed MUST name its foreign key. phases has TWO FKs to companies —
    // the plain company_id -> companies(id), and the Stage 16 composite guard
    // (company_id, company_org_id) -> companies(id, organization_id) — so an
    // unqualified `companies(...)` is ambiguous and PostgREST refuses it with
    // PGRST201 rather than guessing.
    //
    // Embed through the PLAIN FK: it is the single-column relationship that
    // actually expresses "this phase's company". The composite one exists to
    // make a cross-firm link structurally impossible, not to be traversed.
    .select(`id, project_id, name, description, company_id, sort_order,
             company:companies!phases_company_id_fkey (${COMPANY_COLUMNS})`)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      project_id: string;
      name: string;
      description: string | null;
      company_id: string | null;
      sort_order: number;
      company: CompanyRow | CompanyRow[] | null;
    };
    // PostgREST returns an embedded to-one relation as an object, but some
    // versions surface it as a single-element array. Normalise both.
    const co = Array.isArray(r.company) ? (r.company[0] ?? null) : r.company;
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      description: r.description,
      companyId: r.company_id,
      sortOrder: r.sort_order,
      company: co ? rowToCompany(co) : null,
    };
  });
}

export interface PhaseInput {
  name: string;
  description?: string | null;
  companyId?: string | null;
  sortOrder?: number;
}

/**
 * Creates a phase. `company_org_id` is never sent — the trigger derives it
 * from the project's firm and the composite FK validates the pair.
 */
export async function createPhase(projectId: string, input: PhaseInput): Promise<void> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Le nom de la phase est requis.");

  const payload: InsertPhase = {
    project_id: projectId,
    name,
    description: blankToNull(input.description),
    company_id: input.companyId || null,
    sort_order: input.sortOrder ?? 0,
  };

  const { error } = await supabase.from("phases").insert(payload as never);
  if (error) throw error;
}

export async function updatePhase(id: string, input: PhaseInput): Promise<void> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Le nom de la phase est requis.");

  const payload: UpdatePhase = {
    name,
    description: blankToNull(input.description),
    company_id: input.companyId || null,
  };
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;

  const { error } = await supabase.from("phases").update(payload as never).eq("id", id);
  if (error) throw error;
}

export async function deletePhase(id: string): Promise<void> {
  const { error } = await supabase.from("phases").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Persists a new order for a project's phases.
 *
 * Written as individual updates rather than an upsert: an upsert would need
 * to send every column of every row, and any column it omitted would be
 * overwritten with a default. Reordering must touch sort_order and nothing
 * else.
 */
export async function reorderPhases(ordered: { id: string; sortOrder: number }[]): Promise<void> {
  const results = await Promise.all(
    ordered.map(({ id, sortOrder }) =>
      supabase.from("phases").update({ sort_order: sortOrder } as never).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

function blankToNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}
