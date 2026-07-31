-- Observations: factual site-visit records ("Le cadre de porte en acier a été
-- installé."), separate from déficiences. No status/priority — these are
-- plain records, not tracked work.
--
-- STRICTLY ADDITIVE: creates one new table and nothing else. No existing
-- table, column, policy or function is altered. Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS "public"."observations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    -- "ACTIONS PAR :" in the report. Plain text, not a user FK: this is
    -- often a company ("Entrepreneur", "JLP") rather than a person, and
    -- observations carry no assignment/notification semantics.
    "action_by" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."observations" OWNER TO "postgres";

DO $$ BEGIN
    ALTER TABLE ONLY "public"."observations"
        ADD CONSTRAINT "observations_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."observations"
        ADD CONSTRAINT "observations_project_id_fkey" FOREIGN KEY ("project_id")
        REFERENCES "public"."projects"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."observations"
        ADD CONSTRAINT "observations_visit_id_fkey" FOREIGN KEY ("visit_id")
        REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Location is optional context: deleting a local must not delete the record
-- of what was observed there.
DO $$ BEGIN
    ALTER TABLE ONLY "public"."observations"
        ADD CONSTRAINT "observations_location_id_fkey" FOREIGN KEY ("location_id")
        REFERENCES "public"."locations"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."observations"
        ADD CONSTRAINT "observations_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "auth"."users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_observations_visit_id"
    ON "public"."observations" USING "btree" ("visit_id");
CREATE INDEX IF NOT EXISTS "idx_observations_project_id"
    ON "public"."observations" USING "btree" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_observations_location_id"
    ON "public"."observations" USING "btree" ("location_id");
-- Covers the report's per-visit ordered read.
CREATE INDEX IF NOT EXISTS "idx_observations_visit_sort"
    ON "public"."observations" USING "btree" ("visit_id", "sort_order");

ALTER TABLE "public"."observations" ENABLE ROW LEVEL SECURITY;

-- Policies mirror photos/issues exactly.
DROP POLICY IF EXISTS "Members can view observations" ON "public"."observations";
CREATE POLICY "Members can view observations" ON "public"."observations"
    FOR SELECT USING ("public"."is_project_member"("project_id"));

DROP POLICY IF EXISTS "Editors can create observations" ON "public"."observations";
CREATE POLICY "Editors can create observations" ON "public"."observations"
    FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id")
        AND "public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"])));

DROP POLICY IF EXISTS "Editors can update observations" ON "public"."observations";
CREATE POLICY "Editors can update observations" ON "public"."observations"
    FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]))
    WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));

DROP POLICY IF EXISTS "Editors can delete observations" ON "public"."observations";
CREATE POLICY "Editors can delete observations" ON "public"."observations"
    FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));

DROP POLICY IF EXISTS "Admins have full access to observations" ON "public"."observations";
CREATE POLICY "Admins have full access to observations" ON "public"."observations"
    USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

GRANT ALL ON TABLE "public"."observations" TO "anon";
GRANT ALL ON TABLE "public"."observations" TO "authenticated";
GRANT ALL ON TABLE "public"."observations" TO "service_role";
