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
    AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (project_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND org_role = 'admin'
  );
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
  WHERE p.email = p_email
    AND (
      public.is_admin()
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
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "org_role" "text" DEFAULT 'member'::"text" NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text",
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "client_name" "text",
    "status" "text" DEFAULT 'active'::"text",
    "start_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


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
    "updated_at" timestamp with time zone DEFAULT "now"()
);


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
    ADD CONSTRAINT "locations_type_check" CHECK (("type" = ANY (ARRAY['room'::"text", 'element'::"text"])));



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_level_id_location_number_key" UNIQUE ("level_id", "location_number");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



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
    ADD CONSTRAINT "profiles_org_role_check" CHECK (("org_role" = ANY (ARRAY['admin'::"text", 'member'::"text"])));



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'commenter'::"text", 'viewer'::"text"])));



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_issues_user_id" ON "public"."issues" USING "btree" ("user_id");



CREATE INDEX "idx_levels_project_id" ON "public"."levels" USING "btree" ("project_id");



CREATE INDEX "idx_locations_level_id" ON "public"."locations" USING "btree" ("level_id");



CREATE INDEX "idx_locations_parent_location_id" ON "public"."locations" USING "btree" ("parent_location_id");



CREATE INDEX "idx_locations_project_id" ON "public"."locations" USING "btree" ("project_id");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



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



CREATE INDEX "idx_site_visits_date" ON "public"."site_visits" USING "btree" ("visit_date");



CREATE INDEX "idx_site_visits_project_id" ON "public"."site_visits" USING "btree" ("project_id");



CREATE INDEX "idx_site_visits_user_id" ON "public"."site_visits" USING "btree" ("user_id");



CREATE INDEX "kv_store_9fe75696_key_idx" ON "public"."kv_store_9fe75696" USING "btree" ("key" "text_pattern_ops");



CREATE OR REPLACE TRIGGER "set_updated_at_issues" BEFORE UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_projects" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_site_visits" BEFORE UPDATE ON "public"."site_visits" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_project_created" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_project"();



CREATE TRIGGER "check_plan_project_consistency_trigger" BEFORE INSERT OR UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."check_plan_project_consistency"();



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



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins have full access to comment_mentions" ON "public"."comment_mentions" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to comments" ON "public"."comments" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to issues" ON "public"."issues" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to levels" ON "public"."levels" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to locations" ON "public"."locations" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to photos" ON "public"."photos" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to pin_placements" ON "public"."pin_placements" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to plan_files" ON "public"."plan_files" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to plans" ON "public"."plans" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to projects" ON "public"."projects" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins have full access to site_visits" ON "public"."site_visits" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



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



CREATE POLICY "Creator can update their projects" ON "public"."projects" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Creator can update their visits" ON "public"."site_visits" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Editors and owners can create issues" ON "public"."issues" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));



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



CREATE POLICY "Members can view their project roster" ON "public"."project_members" FOR SELECT USING (("public"."is_admin"() OR "public"."is_project_member"("project_id")));



CREATE POLICY "Members can view their projects" ON "public"."projects" FOR SELECT USING ("public"."is_project_member"("id"));



CREATE POLICY "Owners and admins can add members" ON "public"."project_members" FOR INSERT WITH CHECK (("public"."is_admin"() OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])));



CREATE POLICY "Owners and admins can remove members" ON "public"."project_members" FOR DELETE USING (("public"."is_admin"() OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])));



CREATE POLICY "Owners and admins can update members" ON "public"."project_members" FOR UPDATE USING (("public"."is_admin"() OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])));



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



CREATE POLICY "Users can create their own projects" ON "public"."projects" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own comments" ON "public"."comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own comments" ON "public"."comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."comment_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kv_store_9fe75696" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pin_placements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_visits" ENABLE ROW LEVEL SECURITY;
