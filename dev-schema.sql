SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."handle_new_project"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- organization_id is filled by set_project_member_organization(), which
  -- derives it from the project row just inserted.
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (project_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- Organization (firm) helpers.
--
-- These replaced the old global `is_admin()`, which read profiles.org_role and
-- had NO firm scope at all — it made an admin powerful in every firm's data.
-- Both it and the column were dropped in Stage 5.
--
-- All three are SECURITY DEFINER because a policy ON organization_members
-- cannot itself query organization_members without infinite recursion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT "organization_id" FROM "public"."organization_members"
  WHERE "user_id" = "auth"."uid"();
$$;

COMMENT ON FUNCTION "public"."current_org_id"() IS 'The caller''s firm. Single-valued because organization_members has UNIQUE(user_id). SECURITY DEFINER to avoid RLS recursion.';


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."organization_members"
    WHERE "user_id" = "auth"."uid"()
      AND "organization_id" = "p_org_id"
      AND "org_role" = 'admin'
  );
$$;

COMMENT ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") IS 'Firm-scoped admin check. Deliberately takes an org id — there is no global admin in this model.';


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."organization_members" "om"
    WHERE "om"."user_id" = "p_user_id"
      AND "om"."organization_id" = "public"."current_org_id"()
  );
$$;

COMMENT ON FUNCTION "public"."is_org_member"("p_user_id" "uuid") IS 'True when the given user is in the CALLER''s firm. Returns false when the caller belongs to no firm (current_org_id() is NULL).';


-- Lets a firm admin enumerate the firm's projects for the access-management
-- screen WITHOUT granting a SELECT policy on projects — an admin manages
-- access, and deliberately does not gain read access to project contents.
CREATE OR REPLACE FUNCTION "public"."org_projects_for_admin"() RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.name
  FROM public.projects p
  WHERE p.organization_id = public.current_org_id()
    AND public.is_org_admin(p.organization_id)
  ORDER BY p.name;
$$;


-- Stamps projects.organization_id from the creator's firm. The client never
-- sends it; the RLS INSERT policy then requires it to equal current_org_id(),
-- so a forged value cannot survive either.
CREATE OR REPLACE FUNCTION "public"."set_project_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Cannot create a project: the current user belongs to no organization';
  END IF;
  RETURN NEW;
END;
$$;


-- Derives project_members.organization_id FROM THE PROJECT, never from the
-- caller — so the composite FKs below can make a cross-firm membership row
-- structurally unrepresentable rather than merely denied.
CREATE OR REPLACE FUNCTION "public"."set_project_member_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT p.organization_id INTO NEW.organization_id
  FROM public.projects p WHERE p.id = NEW.project_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Cannot add a member: project % has no organization', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."is_project_member"("p_project_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;


CREATE OR REPLACE FUNCTION "public"."has_project_role"("p_project_id" "uuid", "p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = ANY (p_roles)
  );
$$;


CREATE OR REPLACE FUNCTION "public"."comment_project_id"("p_photo_id" "uuid", "p_issue_id" "uuid", "p_visit_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT project_id FROM public.photos WHERE id = p_photo_id),
    (SELECT project_id FROM public.issues WHERE id = p_issue_id),
    (SELECT project_id FROM public.site_visits WHERE id = p_visit_id)
  );
$$;


CREATE OR REPLACE FUNCTION "public"."shares_project_with"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm1
    JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = auth.uid() AND pm2.user_id = p_user_id
  );
$$;


CREATE OR REPLACE FUNCTION "public"."find_invitable_user"("p_email" "text") RETURNS TABLE("id" "uuid", "name" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.name, p.email
  FROM public.profiles p
  JOIN public.organization_members om ON om.user_id = p.id
  WHERE lower(p.email) = lower(p_email)
    AND om.organization_id = public.current_org_id()
    AND (
      public.is_org_admin(public.current_org_id())
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.user_id = auth.uid() AND pm.role = 'owner'
      )
    );
$$;


CREATE OR REPLACE FUNCTION "public"."check_plan_project_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_plan_file_project_id uuid;
  v_level_project_id uuid;
BEGIN
  SELECT project_id INTO v_plan_file_project_id FROM public.plan_files WHERE id = NEW.plan_file_id;
  SELECT project_id INTO v_level_project_id FROM public.levels WHERE id = NEW.level_id;

  IF v_plan_file_project_id IS DISTINCT FROM v_level_project_id THEN
    RAISE EXCEPTION 'plan_file and level belong to different projects';
  END IF;

  IF NEW.project_id IS DISTINCT FROM v_plan_file_project_id THEN
    RAISE EXCEPTION 'plans.project_id must match plan_file/level project_id';
  END IF;

  RETURN NEW;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."comment_mentions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "photo_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "issue_id" "uuid",
    "visit_id" "uuid",
    "parent_comment_id" "uuid"
);


CREATE TABLE IF NOT EXISTS "public"."issues" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "visit_id" "uuid",
    "photo_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'open'::"text",
    "assigned_to" "uuid",
    "location" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "location_id" "uuid",
    "discipline" "text",
    "due_date" "date",
    "assigned_to_name" "text"
);


CREATE TABLE IF NOT EXISTS "public"."kv_store_9fe75696" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."levels" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "level_id" "uuid" NOT NULL,
    "location_number" "text" NOT NULL,
    "name" "text",
    "type" "text" NOT NULL,
    "discipline" "text",
    "parent_location_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "data" "jsonb",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "report_firm_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organizations_name_not_blank" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "organizations_slug_format" CHECK (("slug" ~ '^[a-z0-9][a-z0-9-]{1,62}$'::"text"))
);

COMMENT ON TABLE "public"."organizations" IS 'A firm. Top-level tenancy boundary: no data may cross organizations.';


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_members_org_role_check" CHECK (("org_role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);

COMMENT ON TABLE "public"."organization_members" IS 'Firm membership. UNIQUE(user_id) enforces one firm per user — the constraint the whole isolation model rests on.';


CREATE TABLE IF NOT EXISTS "public"."organization_invitations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "org_role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by" "uuid",
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_invitations_email_lowercase" CHECK ((("email" = "lower"("email")) AND ("strpos"("email", '@'::"text") > 1))),
    CONSTRAINT "organization_invitations_org_role_check" CHECK (("org_role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);

COMMENT ON TABLE "public"."organization_invitations" IS 'Pending firm invitations. Claimed by matching BOTH the token and the JWT-verified email; never the token alone.';


CREATE TABLE IF NOT EXISTS "public"."observations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "action_by" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."photos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "location" "jsonb",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid",
    "issue_id" "uuid"
);


CREATE TABLE IF NOT EXISTS "public"."pin_placements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "x" double precision NOT NULL,
    "y" double precision NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."plan_files" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "bucket" "text" DEFAULT 'project-plans'::"text" NOT NULL,
    "page_count" integer,
    "file_size_bytes" bigint,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "plan_file_id" "uuid" NOT NULL,
    "level_id" "uuid" NOT NULL,
    "page_number" integer NOT NULL,
    "type" "text" DEFAULT 'floor_plan'::"text" NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "firm" "text",
    "role" "text" DEFAULT 'architect'::"text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text",
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);

COMMENT ON COLUMN "public"."project_members"."organization_id" IS 'Denormalized from the project. Exists solely to carry the Stage 3 composite FKs that make cross-firm membership structurally impossible.';


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "client_name" "text",
    "status" "text" DEFAULT 'active'::"text",
    "start_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "file_number" "text",
    "contractor_name" "text",
    "contractor_contact" "text",
    "contractor_address" "text",
    "contractor_phone" "text",
    "contractor_email" "text",
    "organization_id" "uuid" NOT NULL
);

COMMENT ON COLUMN "public"."projects"."organization_id" IS 'Owning firm. NULLABLE during migration only; NOT NULL from Stage 3.';


CREATE TABLE IF NOT EXISTS "public"."report_locations" (
    "report_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."report_visits" (
    "report_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "report_seq" integer NOT NULL,
    "report_prefix" "text" DEFAULT 'A'::"text" NOT NULL,
    "report_number" "text" NOT NULL,
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regenerated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


CREATE OR REPLACE FUNCTION "public"."create_report"("p_project_id" "uuid", "p_visit_ids" "uuid"[], "p_location_ids" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "public"."reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_seq    integer;
    v_report public.reports;
BEGIN
    IF NOT public.has_project_role(p_project_id, ARRAY['owner'::text, 'editor'::text]) THEN
        RAISE EXCEPTION 'Not permitted to generate reports for this project'
            USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('report_seq:' || p_project_id::text));

    SELECT COALESCE(MAX(report_seq), 0) + 1
      INTO v_seq
      FROM public.reports
     WHERE project_id = p_project_id;

    INSERT INTO public.reports (project_id, report_seq, report_number, generated_by)
    VALUES (p_project_id, v_seq, 'A' || lpad(v_seq::text, 3, '0'), auth.uid())
    RETURNING * INTO v_report;

    INSERT INTO public.report_visits (report_id, visit_id, sort_order)
    SELECT v_report.id, t.vid, t.ord - 1
      FROM unnest(p_visit_ids) WITH ORDINALITY AS t(vid, ord)
     WHERE EXISTS (SELECT 1 FROM public.site_visits sv
                    WHERE sv.id = t.vid AND sv.project_id = p_project_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.report_locations (report_id, location_id)
    SELECT v_report.id, l.lid
      FROM unnest(p_location_ids) AS l(lid)
     WHERE EXISTS (SELECT 1 FROM public.locations loc
                    WHERE loc.id = l.lid AND loc.project_id = p_project_id)
    ON CONFLICT DO NOTHING;

    RETURN v_report;
END $$;




CREATE TABLE IF NOT EXISTS "public"."site_visits" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "visit_date" "date" NOT NULL,
    "phase" "text",
    "weather" "text",
    "temperature" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "start_time" "time",
    "end_time" "time",
    "attendees" "jsonb"
);


COMMENT ON COLUMN "public"."site_visits"."attendees" IS 'Array of { name, organization, role, initials } — fills the report''s ASSISTAIENT table.';


ALTER TABLE ONLY "public"."comment_mentions"
    ADD CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_mentions"
    ADD CONSTRAINT "comment_mentions_comment_id_user_id_key" UNIQUE ("comment_id", "user_id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_exactly_one_target_check" CHECK (("num_nonnulls"("photo_id", "issue_id", "visit_id") = 1));



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kv_store_9fe75696"
    ADD CONSTRAINT "kv_store_9fe75696_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."levels"
    ADD CONSTRAINT "levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."levels"
    ADD CONSTRAINT "levels_project_id_name_key" UNIQUE ("project_id", "name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_type_check" CHECK (("type" = ANY (ARRAY['room'::"text", 'element'::"text", 'roof'::"text", 'envelope'::"text", 'exterior'::"text", 'parking'::"text"])));



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_level_id_location_number_key" UNIQUE ("level_id", "location_number");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



-- One firm per user. THE constraint the isolation model rests on.
ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_key" UNIQUE ("user_id");



-- Redundant given the line above, but required as the target of
-- project_members_user_org_fkey: a composite FK needs a matching composite
-- unique key to reference.
ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_org_key" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."observations"
    ADD CONSTRAINT "observations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_location_id_plan_id_key" UNIQUE ("location_id", "plan_id");



ALTER TABLE ONLY "public"."plan_files"
    ADD CONSTRAINT "plan_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_type_check" CHECK (("type" = ANY (ARRAY['floor_plan'::"text", 'ceiling'::"text", 'section'::"text", 'detail'::"text"])));



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_plan_file_id_page_number_key" UNIQUE ("plan_file_id", "page_number");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'commenter'::"text"])));



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



-- Target of project_members_project_org_fkey. Its only purpose is to let a
-- membership row reference (project, firm) as a pair, so a row naming a
-- project in one firm and an organization in another cannot exist.
ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_attendees_is_array" CHECK ((("attendees" IS NULL) OR ("jsonb_typeof"("attendees") = 'array'::"text")));


ALTER TABLE ONLY "public"."report_locations"
    ADD CONSTRAINT "report_locations_pkey" PRIMARY KEY ("report_id", "location_id");


ALTER TABLE ONLY "public"."report_visits"
    ADD CONSTRAINT "report_visits_pkey" PRIMARY KEY ("report_id", "visit_id");


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_project_number_key" UNIQUE ("project_id", "report_number");


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_project_seq_key" UNIQUE ("project_id", "report_seq");


ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id");



CREATE INDEX IF NOT EXISTS "report_locations_location_idx" ON "public"."report_locations" USING "btree" ("location_id");


CREATE INDEX IF NOT EXISTS "report_visits_visit_idx" ON "public"."report_visits" USING "btree" ("visit_id");


CREATE INDEX IF NOT EXISTS "reports_project_seq_idx" ON "public"."reports" USING "btree" ("project_id", "report_seq" DESC);


CREATE INDEX "idx_comment_mentions_comment_id" ON "public"."comment_mentions" USING "btree" ("comment_id");



CREATE INDEX "idx_comment_mentions_user_id" ON "public"."comment_mentions" USING "btree" ("user_id");



CREATE INDEX "idx_comments_issue_id" ON "public"."comments" USING "btree" ("issue_id");



CREATE INDEX "idx_comments_parent_comment_id" ON "public"."comments" USING "btree" ("parent_comment_id");



CREATE INDEX "idx_comments_photo_id" ON "public"."comments" USING "btree" ("photo_id");



CREATE INDEX "idx_comments_user_id" ON "public"."comments" USING "btree" ("user_id");



CREATE INDEX "idx_comments_visit_id" ON "public"."comments" USING "btree" ("visit_id");



CREATE INDEX "idx_issues_location_id" ON "public"."issues" USING "btree" ("location_id");



CREATE INDEX "idx_issues_priority" ON "public"."issues" USING "btree" ("priority");



CREATE INDEX "idx_issues_project_id" ON "public"."issues" USING "btree" ("project_id");



CREATE INDEX "idx_issues_status" ON "public"."issues" USING "btree" ("status");



CREATE INDEX "idx_issues_title_trgm" ON "public"."issues" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_issues_description_trgm" ON "public"."issues" USING "gin" ("description" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_issues_user_id" ON "public"."issues" USING "btree" ("user_id");



CREATE INDEX "idx_levels_project_id" ON "public"."levels" USING "btree" ("project_id");



CREATE INDEX "idx_locations_level_id" ON "public"."locations" USING "btree" ("level_id");



CREATE INDEX "idx_locations_parent_location_id" ON "public"."locations" USING "btree" ("parent_location_id");



CREATE INDEX "idx_locations_project_id" ON "public"."locations" USING "btree" ("project_id");



CREATE INDEX "idx_locations_number_trgm" ON "public"."locations" USING "gin" ("location_number" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_locations_name_trgm" ON "public"."locations" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_observations_location_id" ON "public"."observations" USING "btree" ("location_id");

CREATE INDEX "idx_observations_project_id" ON "public"."observations" USING "btree" ("project_id");

CREATE INDEX "idx_observations_visit_id" ON "public"."observations" USING "btree" ("visit_id");

CREATE INDEX "idx_observations_visit_sort" ON "public"."observations" USING "btree" ("visit_id", "sort_order");

CREATE INDEX "idx_photos_issue_id" ON "public"."photos" USING "btree" ("issue_id");



CREATE INDEX "idx_photos_location_id" ON "public"."photos" USING "btree" ("location_id");



CREATE INDEX "idx_photos_project_id" ON "public"."photos" USING "btree" ("project_id");



CREATE INDEX "idx_photos_tags" ON "public"."photos" USING "gin" ("tags");



CREATE INDEX "idx_photos_user_id" ON "public"."photos" USING "btree" ("user_id");



CREATE INDEX "idx_photos_visit_id" ON "public"."photos" USING "btree" ("visit_id");



CREATE INDEX "idx_pin_placements_location_id" ON "public"."pin_placements" USING "btree" ("location_id");



CREATE INDEX "idx_pin_placements_plan_id" ON "public"."pin_placements" USING "btree" ("plan_id");



CREATE INDEX "idx_pin_placements_project_id" ON "public"."pin_placements" USING "btree" ("project_id");



CREATE INDEX "idx_plan_files_project_id" ON "public"."plan_files" USING "btree" ("project_id");



CREATE INDEX "idx_plans_level_id" ON "public"."plans" USING "btree" ("level_id");



CREATE INDEX "idx_plans_plan_file_id" ON "public"."plans" USING "btree" ("plan_file_id");



CREATE INDEX "idx_plans_project_id" ON "public"."plans" USING "btree" ("project_id");



CREATE INDEX "idx_project_members_project_id" ON "public"."project_members" USING "btree" ("project_id");



CREATE INDEX "idx_project_members_user_id" ON "public"."project_members" USING "btree" ("user_id");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_projects_user_id" ON "public"."projects" USING "btree" ("user_id");



CREATE INDEX "idx_projects_name_trgm" ON "public"."projects" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX IF NOT EXISTS "idx_projects_organization_id" ON "public"."projects" USING "btree" ("organization_id");



CREATE INDEX IF NOT EXISTS "idx_project_members_organization_id" ON "public"."project_members" USING "btree" ("organization_id");



CREATE INDEX IF NOT EXISTS "idx_project_members_user_org" ON "public"."project_members" USING "btree" ("user_id", "organization_id");



CREATE INDEX IF NOT EXISTS "idx_organization_members_organization_id" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX IF NOT EXISTS "idx_organization_invitations_email" ON "public"."organization_invitations" USING "btree" ("email") WHERE ("accepted_at" IS NULL);



-- At most one PENDING invitation per (firm, email). Deliberately partial: an
-- accepted invitation must not block a later re-invite.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_organization_invitations_pending_unique" ON "public"."organization_invitations" USING "btree" ("organization_id", "email") WHERE ("accepted_at" IS NULL);



CREATE INDEX "idx_site_visits_date" ON "public"."site_visits" USING "btree" ("visit_date");



CREATE INDEX "idx_site_visits_project_id" ON "public"."site_visits" USING "btree" ("project_id");



CREATE INDEX "idx_site_visits_user_id" ON "public"."site_visits" USING "btree" ("user_id");



CREATE INDEX "idx_site_visits_phase_trgm" ON "public"."site_visits" USING "gin" ("phase" "extensions"."gin_trgm_ops");



CREATE INDEX "kv_store_9fe75696_key_idx" ON "public"."kv_store_9fe75696" USING "btree" ("key" "text_pattern_ops");



CREATE OR REPLACE TRIGGER "set_updated_at_issues" BEFORE UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_projects" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_site_visits" BEFORE UPDATE ON "public"."site_visits" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_project_created" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_project"();



CREATE OR REPLACE TRIGGER "set_updated_at_organizations" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



-- BEFORE INSERT only: a project must not be able to change firms after
-- creation, and RLS WITH CHECK is evaluated AFTER BEFORE-triggers, so the
-- stamped value is what the policy sees.
CREATE OR REPLACE TRIGGER "set_project_organization" BEFORE INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_project_organization"();



-- BEFORE INSERT OR UPDATE: re-derived on update too, so a membership row can
-- never be edited to point at another firm.
CREATE OR REPLACE TRIGGER "set_project_member_organization" BEFORE INSERT OR UPDATE ON "public"."project_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_project_member_organization"();



CREATE TRIGGER "check_plan_project_consistency_trigger" BEFORE INSERT OR UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."check_plan_project_consistency"();



ALTER TABLE ONLY "public"."report_locations"
    ADD CONSTRAINT "report_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."report_locations"
    ADD CONSTRAINT "report_locations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."report_visits"
    ADD CONSTRAINT "report_visits_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."report_visits"
    ADD CONSTRAINT "report_visits_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."comment_mentions"
    ADD CONSTRAINT "comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_mentions"
    ADD CONSTRAINT "comment_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."levels"
    ADD CONSTRAINT "levels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."observations"
    ADD CONSTRAINT "observations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."observations"
    ADD CONSTRAINT "observations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."observations"
    ADD CONSTRAINT "observations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."observations"
    ADD CONSTRAINT "observations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_files"
    ADD CONSTRAINT "plan_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_files"
    ADD CONSTRAINT "plan_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_plan_file_id_fkey" FOREIGN KEY ("plan_file_id") REFERENCES "public"."plan_files"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



-- ---------------------------------------------------------------------------
-- THE TWO COMPOSITE FOREIGN KEYS — the core of firm isolation.
--
-- Together they make a cross-firm membership row UNREPRESENTABLE rather than
-- merely denied: the row must name a (project, firm) pair that exists on
-- projects, AND a (user, firm) pair that exists on organization_members. No
-- policy, trigger or application check is involved — referential integrity is
-- the backstop, and it fails closed even if every policy above were dropped.
--
-- ON DELETE RESTRICT on the user side is deliberate: removing someone from a
-- firm while they still hold project memberships must fail loudly rather than
-- silently orphan their project access.
-- ---------------------------------------------------------------------------
ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_org_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "public"."projects"("id", "organization_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_org_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "public"."organization_members"("user_id", "organization_id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;









CREATE POLICY "Editors can delete reports" ON "public"."reports" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));


CREATE POLICY "Editors can update reports" ON "public"."reports" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"])) WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));


CREATE POLICY "Members can view report_locations" ON "public"."report_locations" FOR SELECT USING ((EXISTS ( SELECT 1 FROM "public"."reports" "r" WHERE (("r"."id" = "report_locations"."report_id") AND "public"."is_project_member"("r"."project_id")))));


CREATE POLICY "Members can view report_visits" ON "public"."report_visits" FOR SELECT USING ((EXISTS ( SELECT 1 FROM "public"."reports" "r" WHERE (("r"."id" = "report_visits"."report_id") AND "public"."is_project_member"("r"."project_id")))));


CREATE POLICY "Members can view reports" ON "public"."reports" FOR SELECT USING ("public"."is_project_member"("project_id"));


















CREATE POLICY "Editors can create observations" ON "public"."observations" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"])));

CREATE POLICY "Editors can delete observations" ON "public"."observations" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));

CREATE POLICY "Editors can update observations" ON "public"."observations" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"])) WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));

CREATE POLICY "Members can view observations" ON "public"."observations" FOR SELECT USING ("public"."is_project_member"("project_id"));



















CREATE POLICY "Authenticated users can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Comment authors can create mentions" ON "public"."comment_mentions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."comments"
  WHERE (("comments"."id" = "comment_mentions"."comment_id") AND ("comments"."user_id" = "auth"."uid"())))));



CREATE POLICY "Comment authors can delete mentions" ON "public"."comment_mentions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."comments"
  WHERE (("comments"."id" = "comment_mentions"."comment_id") AND ("comments"."user_id" = "auth"."uid"())))));



CREATE POLICY "Creator can delete their issues" ON "public"."issues" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Creator can delete their photos" ON "public"."photos" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Creator can delete their projects" ON "public"."projects" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Creator can delete their visits" ON "public"."site_visits" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Creator can update their issues" ON "public"."issues" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Creator can update their photos" ON "public"."photos" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Creator can update their projects" ON "public"."projects" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "Creator can update their visits" ON "public"."site_visits" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Editors and owners can create issues" ON "public"."issues" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Editors can update project photos" ON "public"."photos" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"])) WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Members can create comments" ON "public"."comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_project_member"("public"."comment_project_id"("photo_id", "issue_id", "visit_id"))));



CREATE POLICY "Members can create visits" ON "public"."site_visits" FOR INSERT WITH CHECK ("public"."is_project_member"("project_id"));



CREATE POLICY "Members can upload photos" ON "public"."photos" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_project_member"("project_id")));



CREATE POLICY "Members can view comments" ON "public"."comments" FOR SELECT USING ("public"."is_project_member"("public"."comment_project_id"("photo_id", "issue_id", "visit_id")));



CREATE POLICY "Members can view issues" ON "public"."issues" FOR SELECT USING ("public"."is_project_member"("project_id"));



CREATE POLICY "Members can view levels" ON "public"."levels" FOR SELECT USING ("public"."is_project_member"("project_id"));



CREATE POLICY "Members can view locations" ON "public"."locations" FOR SELECT USING ("public"."is_project_member"("project_id"));



CREATE POLICY "Members can view mentions on visible comments" ON "public"."comment_mentions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."comments"
  WHERE (("comments"."id" = "comment_mentions"."comment_id") AND "public"."is_project_member"("public"."comment_project_id"("comments"."photo_id", "comments"."issue_id", "comments"."visit_id"))))));



CREATE POLICY "Members can view photos" ON "public"."photos" FOR SELECT USING ("public"."is_project_member"("project_id"));



CREATE POLICY "Members can view pin_placements" ON "public"."pin_placements" FOR SELECT USING ("public"."is_project_member"("project_id"));



CREATE POLICY "Members can view plan_files" ON "public"."plan_files" FOR SELECT USING ("public"."is_project_member"("project_id"));



CREATE POLICY "Members can view plans" ON "public"."plans" FOR SELECT USING ("public"."is_project_member"("project_id"));



-- ---------------------------------------------------------------------------
-- Organization tables.
--
-- SELECT only. organization_members and organization_invitations have NO
-- INSERT/UPDATE/DELETE policy for `authenticated` — deliberately: a user must
-- not be able to place themselves in a firm, or promote themselves within one.
-- Every membership mutation goes through the edge function on the service
-- role, which derives the target firm from the CALLER, never from the request.
-- ---------------------------------------------------------------------------
CREATE POLICY "Members can view their organization" ON "public"."organizations" FOR SELECT USING (("id" = "public"."current_org_id"()));


CREATE POLICY "Members can view their organization roster" ON "public"."organization_members" FOR SELECT USING (("organization_id" = "public"."current_org_id"()));


CREATE POLICY "Org admins can view their invitations" ON "public"."organization_invitations" FOR SELECT USING ("public"."is_org_admin"("organization_id"));


-- Replaces nothing — added alongside "Users can view their own profile" and
-- "Project teammates can view each other's profiles". Permissive policies OR
-- together, so the effective rule is: own OR shares a project OR same firm.
CREATE POLICY "Firm colleagues can view each other's profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_org_member"("id"));


CREATE POLICY "Members can view their project roster" ON "public"."project_members" FOR SELECT USING (("public"."is_org_admin"("organization_id") OR "public"."is_project_member"("project_id")));



CREATE POLICY "Members can view their projects" ON "public"."projects" FOR SELECT USING (("public"."is_project_member"("id") AND ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "Owners and admins can add members" ON "public"."project_members" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_org_id"()) AND ("public"."is_org_admin"("organization_id") OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"]))));



CREATE POLICY "Owners and admins can remove members" ON "public"."project_members" FOR DELETE USING (("public"."is_org_admin"("organization_id") OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])));



CREATE POLICY "Owners and admins can update members" ON "public"."project_members" FOR UPDATE USING (("public"."is_org_admin"("organization_id") OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"]))) WITH CHECK ((("organization_id" = "public"."current_org_id"()) AND ("public"."is_org_admin"("organization_id") OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"]))));



CREATE POLICY "Owners and editors can create levels" ON "public"."levels" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Owners and editors can create locations" ON "public"."locations" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Owners and editors can create pin_placements" ON "public"."pin_placements" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Owners and editors can create plan_files" ON "public"."plan_files" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Owners and editors can create plans" ON "public"."plans" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Owners and editors can update locations" ON "public"."locations" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Owners and editors can update pin_placements" ON "public"."pin_placements" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



CREATE POLICY "Owners can delete levels" ON "public"."levels" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Owners can delete locations" ON "public"."locations" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Owners can delete pin_placements" ON "public"."pin_placements" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Owners can delete plan_files" ON "public"."plan_files" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Owners can delete plans" ON "public"."plans" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Owners can update levels" ON "public"."levels" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Owners can update plan_files" ON "public"."plan_files" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Owners can update plans" ON "public"."plans" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));



CREATE POLICY "Project teammates can view each other's profiles" ON "public"."profiles" FOR SELECT USING ("public"."shares_project_with"("id"));



CREATE POLICY "Users can create their own projects" ON "public"."projects" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("organization_id" = "public"."current_org_id"())));



CREATE POLICY "Users can delete their own comments" ON "public"."comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own comments" ON "public"."comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."report_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comment_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kv_store_9fe75696" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."observations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pin_placements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_visits" ENABLE ROW LEVEL SECURITY;


-- Explicit grants for the organization objects. The rest of this dump relies
-- on the database's default privileges; these are spelled out because Stage 1
-- and Stage 4 issued them explicitly on prod, and the two files must describe
-- the same catalog.
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "service_role";

GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_org_member"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."org_projects_for_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."org_projects_for_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."org_projects_for_admin"() TO "service_role";

GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";

GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";

GRANT ALL ON TABLE "public"."organization_invitations" TO "anon";
GRANT ALL ON TABLE "public"."organization_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitations" TO "service_role";
