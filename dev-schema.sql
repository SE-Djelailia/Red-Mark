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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "photo_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
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
    "resolved_at" timestamp with time zone
);


CREATE TABLE IF NOT EXISTS "public"."kv_store_9fe75696" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL
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


ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kv_store_9fe75696"
    ADD CONSTRAINT "kv_store_9fe75696_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_comments_photo_id" ON "public"."comments" USING "btree" ("photo_id");



CREATE INDEX "idx_comments_user_id" ON "public"."comments" USING "btree" ("user_id");



CREATE INDEX "idx_issues_priority" ON "public"."issues" USING "btree" ("priority");



CREATE INDEX "idx_issues_project_id" ON "public"."issues" USING "btree" ("project_id");



CREATE INDEX "idx_issues_status" ON "public"."issues" USING "btree" ("status");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_photos_project_id" ON "public"."photos" USING "btree" ("project_id");



CREATE INDEX "idx_photos_tags" ON "public"."photos" USING "gin" ("tags");



CREATE INDEX "idx_photos_user_id" ON "public"."photos" USING "btree" ("user_id");



CREATE INDEX "idx_photos_visit_id" ON "public"."photos" USING "btree" ("visit_id");



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



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;



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



CREATE POLICY "Project owners can manage members" ON "public"."project_members" USING ((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_members"."project_id") AND ("projects"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create comments on accessible photos" ON "public"."comments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."photos"
  WHERE (("photos"."id" = "comments"."photo_id") AND (("photos"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."project_members"
          WHERE (("project_members"."project_id" = "photos"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can create issues for their projects" ON "public"."issues" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "issues"."project_id") AND (("projects"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."project_members"
          WHERE (("project_members"."project_id" = "issues"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can create photos for their visits" ON "public"."photos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own projects" ON "public"."projects" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create visits for their projects" ON "public"."site_visits" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "site_visits"."project_id") AND (("projects"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."project_members"
          WHERE (("project_members"."project_id" = "site_visits"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can delete issues they created" ON "public"."issues" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own comments" ON "public"."comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own photos" ON "public"."photos" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own projects" ON "public"."projects" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own visits" ON "public"."site_visits" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update issues they created" ON "public"."issues" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own comments" ON "public"."comments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own photos" ON "public"."photos" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own projects" ON "public"."projects" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own visits" ON "public"."site_visits" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view comments on photos they can access" ON "public"."comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."photos"
  WHERE (("photos"."id" = "comments"."photo_id") AND (("photos"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."project_members"
          WHERE (("project_members"."project_id" = "photos"."project_id") AND ("project_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can view issues of their projects" ON "public"."issues" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "issues"."project_id") AND ("project_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view members of their projects" ON "public"."project_members" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "project_members"."project_id") AND ("projects"."user_id" = "auth"."uid"())))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can view photos of their projects" ON "public"."photos" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "photos"."project_id") AND ("project_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own projects" ON "public"."projects" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view visits of their projects" ON "public"."site_visits" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "site_visits"."project_id") AND ("project_members"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kv_store_9fe75696" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_visits" ENABLE ROW LEVEL SECURITY;
