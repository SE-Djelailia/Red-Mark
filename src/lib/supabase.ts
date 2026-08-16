import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import type { Database } from "./database.types";
import { indexedDbAuthStorage } from "./authStorage";
import type { IssueStatus } from "./issueStatus";

// Supabase URL et clé publique
const supabaseUrl = `https://${projectId}.supabase.co`;
const supabaseAnonKey = publicAnonKey;

// Créer le client Supabase (singleton)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // IndexedDB instead of the default localStorage — see authStorage.ts
    // for why (iOS eviction mitigation) and how existing localStorage
    // sessions are migrated in automatically, not lost.
    storage: indexedDbAuthStorage,
  },
});

// Types TypeScript pour la base de données
export interface Profile {
  id: string;
  email: string;
  name?: string;
  firm?: string;
  role?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  // NOTE: `firm` above is free text the user edits on their own profile. It
  // is a display/letterhead value only and carries NO authority — firm
  // membership lives in organization_members. The authoritative firm name for
  // reports is organizations.report_firm_name.
  //
  // `org_role` used to live here. It was the old GLOBAL admin flag; firm-admin
  // status now comes from organization_members.org_role, which is scoped to
  // one organization. The column still exists in the database until Stage 5
  // drops it, but nothing in the client reads it any more.
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
//
// DERIVED from database.types.ts rather than hand-written. These used to be
// hand-copied parallel declarations, and they had drifted from the real
// schema in a way that mattered: a dozen genuinely-nullable columns were
// declared `?: string` (i.e. `string | undefined`). Postgres returns `null`,
// never `undefined`, so `??` / `?.` guards behaved as written but any
// `field === undefined` test or `Object.keys`-style check silently missed the
// null case, and the compiler could not warn about it.
//
// Deriving means the next `supabase gen types` run cannot leave them stale.
// Where the app genuinely knows more than the schema does, the narrowing is
// stated explicitly below with the reason.

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

// Write shapes. A row type is NOT a valid insert payload — the generated
// Insert/Update types mark defaulted and trigger-filled columns optional,
// and PostgREST rejects excess properties — so write signatures must use
// these rather than `Partial<Row>`.
export type Insert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// `organization_id` is NOT NULL on projects/project_members, so the generated
// Insert types demand it — but a BEFORE INSERT trigger
// (set_project_organization / set_project_member_organization) derives it
// from the caller's firm, and the RLS INSERT policy then requires it to match.
// The client must NOT send one: a supplied value is overwritten by the
// trigger, and the composite FKs exist precisely so a cross-firm row is
// unrepresentable rather than merely denied. This alias states that the
// column is the database's to fill.
export type InsertTriggerOrg<T extends "projects" | "project_members"> = Omit<
  Insert<T>,
  "organization_id"
>;

/** One row of the report's ASSISTAIENT table. Stored on the visit. */
export interface VisitAttendee {
  name: string;
  organization: string;
  role: string;
  initials: string;
}

/**
 * The `location` jsonb blob carried on photos and issues.
 *
 * Two unrelated things share this column:
 *
 *  - `lat`/`lng`, the GPS fix captured at upload time. Still written.
 *  - `floor`/`room`, the LEGACY free-text label. No longer written — photos
 *    now carry a real `location_id` FK to the imported locations list — but
 *    it is still READ, so photos taken before that change keep their label
 *    in the report, the visit grid and the lightbox. See resolvePhotoZone.
 *
 * `lat`/`lng` were being written all along and were simply missing from this
 * type, so the declaration was quietly narrower than the data.
 */
export interface LocationExtras {
  /** @deprecated Legacy free text. Read for old rows; never write. */
  floor?: string;
  /** @deprecated Legacy free text. Read for old rows; never write. */
  room?: string;
  lat?: number;
  lng?: number;
}

export type Project = Omit<Row<"projects">, "status"> & {
  // `status` is a plain text column with a DEFAULT of 'active' and no CHECK
  // constraint, so the database will return whatever is stored. The union is
  // the set the app writes and understands; `& {}` keeps an unrecognised
  // legacy value assignable rather than making a stale row a type error.
  status: ProjectStatus | (string & {}) | null;
};

export type ProjectStatus =
  | "planning"
  | "in-progress"
  | "on-hold"
  | "completed"
  | "active"
  | "archived";

export type SiteVisit = Omit<Row<"site_visits">, "attendees"> & {
  // Stored as jsonb; the app is the only writer and always writes this shape.
  // Null on visits saved before attendees existed.
  attendees?: VisitAttendee[] | null;
};

export type Photo = Omit<Row<"photos">, "location"> & {
  location?: LocationExtras | null;
};

export type Issue = Omit<Row<"issues">, "location" | "status"> & {
  location?: LocationExtras | null;
  // Narrowed against the DB CHECK constraint (Stage 12/13), which now permits
  // exactly these four values — so unlike `Project.status` this union really
  // is exhaustive. Still nullable: the column has a default, not NOT NULL.
  status: IssueStatus | null;
};

export type Comment = Row<"comments">;

export type Notification = Row<"notifications">;

export type ProjectMember = Omit<Row<"project_members">, "role"> & {
  // Column default is 'viewer' with no CHECK, but every write path in the app
  // sets one of these three. Same `& {}` escape hatch as Project.status for
  // rows predating the current vocabulary.
  role: ProjectRole | (string & {}) | null;
};

export type ProjectRole = "owner" | "editor" | "commenter";

export type CommentMention = Row<"comment_mentions">;


