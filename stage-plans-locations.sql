-- ============================================
-- Stage: Plans & Locations
-- ============================================
-- New tables: levels, plan_files, plans, locations, pin_placements.
-- Additive columns: issues.location_id, photos.location_id.
--
-- Replaces the old floor-plan/pin system, which lived entirely in the
-- generic kv_store_9fe75696 table behind the make-server-9fe75696 Edge
-- Function (service-role key, RLS fully bypassed, no project-membership
-- check beyond "is this a valid logged-in user"). Everything here is a real
-- Postgres table under the same RLS model as the rest of the app — no
-- bypass, no side-channel.
--
-- Design decisions confirmed before writing this file:
--   - Editors can INSERT locations/plans/levels, and INSERT/UPDATE
--     pin_placements + locations (so field editors can place/fix pins and
--     edit location metadata day-to-day).
--   - Owner/admin only for UPDATE/DELETE on levels and plans (and on
--     plan_files, following the same structural-data reasoning), and for
--     DELETE on locations and pin_placements.
--   - A trigger enforces plans.plan_file_id and plans.level_id belong to
--     the same project (and match plans.project_id).
--   - UNIQUE(plan_file_id, page_number) kept as proposed.
--   - discipline stays free text (no CHECK) — populated by per-project
--     Excel import, a hard enum would reject unanticipated values.
--   - parent_location_id is ON DELETE SET NULL — deleting a room doesn't
--     cascade-delete its elements' history.
--   - location_id is added to issues and photos only, NOT comments —
--     comments keep their existing issue/photo/visit-only target model and
--     constraint, untouched.
-- ============================================


-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS "public"."levels" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."levels"
    ADD CONSTRAINT "levels_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."levels"
    ADD CONSTRAINT "levels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."levels"
    ADD CONSTRAINT "levels_project_id_name_key" UNIQUE ("project_id", "name");

CREATE INDEX "idx_levels_project_id" ON "public"."levels" USING "btree" ("project_id");


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

ALTER TABLE ONLY "public"."plan_files"
    ADD CONSTRAINT "plan_files_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."plan_files"
    ADD CONSTRAINT "plan_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."plan_files"
    ADD CONSTRAINT "plan_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");

CREATE INDEX "idx_plan_files_project_id" ON "public"."plan_files" USING "btree" ("project_id");


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

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_type_check" CHECK (("type" = ANY (ARRAY['floor_plan'::"text", 'ceiling'::"text", 'section'::"text", 'detail'::"text"])));

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_plan_file_id_fkey" FOREIGN KEY ("plan_file_id") REFERENCES "public"."plan_files"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_plan_file_id_page_number_key" UNIQUE ("plan_file_id", "page_number");

CREATE INDEX "idx_plans_project_id" ON "public"."plans" USING "btree" ("project_id");
CREATE INDEX "idx_plans_level_id" ON "public"."plans" USING "btree" ("level_id");
CREATE INDEX "idx_plans_plan_file_id" ON "public"."plans" USING "btree" ("plan_file_id");


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

ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_type_check" CHECK (("type" = ANY (ARRAY['room'::"text", 'element'::"text"])));

ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_level_id_location_number_key" UNIQUE ("level_id", "location_number");

CREATE INDEX "idx_locations_project_id" ON "public"."locations" USING "btree" ("project_id");
CREATE INDEX "idx_locations_level_id" ON "public"."locations" USING "btree" ("level_id");
CREATE INDEX "idx_locations_parent_location_id" ON "public"."locations" USING "btree" ("parent_location_id");


CREATE TABLE IF NOT EXISTS "public"."pin_placements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "x" double precision NOT NULL,
    "y" double precision NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."pin_placements"
    ADD CONSTRAINT "pin_placements_location_id_plan_id_key" UNIQUE ("location_id", "plan_id");

CREATE INDEX "idx_pin_placements_project_id" ON "public"."pin_placements" USING "btree" ("project_id");
CREATE INDEX "idx_pin_placements_location_id" ON "public"."pin_placements" USING "btree" ("location_id");
CREATE INDEX "idx_pin_placements_plan_id" ON "public"."pin_placements" USING "btree" ("plan_id");


-- ============================================
-- ADDITIVE COLUMNS: issues.location_id, photos.location_id
-- ============================================

ALTER TABLE "public"."issues" ADD COLUMN IF NOT EXISTS "location_id" "uuid";
ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;
CREATE INDEX "idx_issues_location_id" ON "public"."issues" USING "btree" ("location_id");

ALTER TABLE "public"."photos" ADD COLUMN IF NOT EXISTS "location_id" "uuid";
ALTER TABLE ONLY "public"."photos"
    ADD CONSTRAINT "photos_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;
CREATE INDEX "idx_photos_location_id" ON "public"."photos" USING "btree" ("location_id");


-- ============================================
-- TRIGGER: plans.plan_file_id and plans.level_id must belong to the same
-- project, and that project must match plans.project_id.
-- ============================================

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

CREATE TRIGGER "check_plan_project_consistency_trigger"
    BEFORE INSERT OR UPDATE ON "public"."plans"
    FOR EACH ROW EXECUTE FUNCTION "public"."check_plan_project_consistency"();


-- ============================================
-- RLS
-- ============================================

ALTER TABLE "public"."levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."plan_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pin_placements" ENABLE ROW LEVEL SECURITY;

-- levels
CREATE POLICY "Admins have full access to levels" ON "public"."levels" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
CREATE POLICY "Members can view levels" ON "public"."levels" FOR SELECT USING ("public"."is_project_member"("project_id"));
CREATE POLICY "Owners and editors can create levels" ON "public"."levels" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));
CREATE POLICY "Owners can update levels" ON "public"."levels" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));
CREATE POLICY "Owners can delete levels" ON "public"."levels" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));

-- plan_files
CREATE POLICY "Admins have full access to plan_files" ON "public"."plan_files" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
CREATE POLICY "Members can view plan_files" ON "public"."plan_files" FOR SELECT USING ("public"."is_project_member"("project_id"));
CREATE POLICY "Owners and editors can create plan_files" ON "public"."plan_files" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));
CREATE POLICY "Owners can update plan_files" ON "public"."plan_files" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));
CREATE POLICY "Owners can delete plan_files" ON "public"."plan_files" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));

-- plans
CREATE POLICY "Admins have full access to plans" ON "public"."plans" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
CREATE POLICY "Members can view plans" ON "public"."plans" FOR SELECT USING ("public"."is_project_member"("project_id"));
CREATE POLICY "Owners and editors can create plans" ON "public"."plans" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));
CREATE POLICY "Owners can update plans" ON "public"."plans" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));
CREATE POLICY "Owners can delete plans" ON "public"."plans" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));

-- locations
CREATE POLICY "Admins have full access to locations" ON "public"."locations" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
CREATE POLICY "Members can view locations" ON "public"."locations" FOR SELECT USING ("public"."is_project_member"("project_id"));
CREATE POLICY "Owners and editors can create locations" ON "public"."locations" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));
CREATE POLICY "Owners and editors can update locations" ON "public"."locations" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));
CREATE POLICY "Owners can delete locations" ON "public"."locations" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));

-- pin_placements
CREATE POLICY "Admins have full access to pin_placements" ON "public"."pin_placements" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());
CREATE POLICY "Members can view pin_placements" ON "public"."pin_placements" FOR SELECT USING ("public"."is_project_member"("project_id"));
CREATE POLICY "Owners and editors can create pin_placements" ON "public"."pin_placements" FOR INSERT WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));
CREATE POLICY "Owners and editors can update pin_placements" ON "public"."pin_placements" FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));
CREATE POLICY "Owners can delete pin_placements" ON "public"."pin_placements" FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text"]));


-- ============================================
-- STORAGE: project-plans bucket policies (tightened pattern, matching the
-- fixed project-photos policies — NOT the old wide-open pattern)
-- ============================================
-- Path convention: `${projectId}/${planFileId}.${ext}` — project_id is the
-- FIRST path segment (unlike project-photos, where the uploader's user_id
-- is first). Plan files are shared project assets managed by role, not
-- personally owned by whoever uploaded them, so gating by project + role
-- fits better than gating by uploader identity.

CREATE POLICY "project-plans select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-plans'
    AND (
      public.is_admin()
      OR public.is_project_member(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "project-plans insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-plans'
    AND (
      public.is_admin()
      OR public.has_project_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','editor'])
    )
  );

CREATE POLICY "project-plans delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-plans'
    AND (
      public.is_admin()
      OR public.has_project_role(((storage.foldername(name))[1])::uuid, ARRAY['owner'])
    )
  );
