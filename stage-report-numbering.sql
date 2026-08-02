-- Report numbering: sequential per project (A001, A002…), with each generated
-- report persisted so location history can point back at it.
--
-- Modelled to SUPPORT a report spanning several visits (reports + report_visits
-- join) even though the generation flow writes exactly one visit today — so
-- "add more visits to a report" becomes a pure UI change later, with no
-- migration.
--
-- STRICTLY ADDITIVE: three new tables and one new function. No existing table,
-- column, policy or function is altered. Safe to re-run (idempotent).

-- ---------------------------------------------------------------- reports
CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    -- Source of truth for ordering. report_number is the rendered form, kept
    -- so historical numbers never shift if the format ever changes.
    "report_seq" integer NOT NULL,
    "report_prefix" "text" DEFAULT 'A'::"text" NOT NULL,
    "report_number" "text" NOT NULL,
    -- Nullable + SET NULL: deleting a user must not delete report history.
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regenerated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."reports" OWNER TO "postgres";

DO $$ BEGIN
    ALTER TABLE ONLY "public"."reports" ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."reports"
        ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id")
        REFERENCES "public"."projects"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."reports"
        ADD CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("generated_by")
        REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The hard guarantee against collision. The advisory lock in create_report()
-- makes this essentially never fire; correctness does not depend on it doing so.
DO $$ BEGIN
    ALTER TABLE ONLY "public"."reports"
        ADD CONSTRAINT "reports_project_seq_key" UNIQUE ("project_id", "report_seq");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."reports"
        ADD CONSTRAINT "reports_project_number_key" UNIQUE ("project_id", "report_number");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "reports_project_seq_idx"
    ON "public"."reports" USING "btree" ("project_id", "report_seq" DESC);

-- ----------------------------------------------------------- report_visits
CREATE TABLE IF NOT EXISTS "public"."report_visits" (
    "report_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "public"."report_visits" OWNER TO "postgres";

DO $$ BEGIN
    ALTER TABLE ONLY "public"."report_visits"
        ADD CONSTRAINT "report_visits_pkey" PRIMARY KEY ("report_id", "visit_id");
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."report_visits"
        ADD CONSTRAINT "report_visits_report_id_fkey" FOREIGN KEY ("report_id")
        REFERENCES "public"."reports"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Deleting a visit drops the link but leaves the report and its number intact:
-- the document was issued and its number must never be reused.
DO $$ BEGIN
    ALTER TABLE ONLY "public"."report_visits"
        ADD CONSTRAINT "report_visits_visit_id_fkey" FOREIGN KEY ("visit_id")
        REFERENCES "public"."site_visits"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "report_visits_visit_idx"
    ON "public"."report_visits" USING "btree" ("visit_id");

-- -------------------------------------------------------- report_locations
-- Which locations a report covered, derived at generation from the
-- observations' and issues' location_id. Feeds the "Rapports" history on
-- LocationDetail.
CREATE TABLE IF NOT EXISTS "public"."report_locations" (
    "report_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL
);

ALTER TABLE "public"."report_locations" OWNER TO "postgres";

DO $$ BEGIN
    ALTER TABLE ONLY "public"."report_locations"
        ADD CONSTRAINT "report_locations_pkey" PRIMARY KEY ("report_id", "location_id");
EXCEPTION WHEN duplicate_table OR invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."report_locations"
        ADD CONSTRAINT "report_locations_report_id_fkey" FOREIGN KEY ("report_id")
        REFERENCES "public"."reports"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY "public"."report_locations"
        ADD CONSTRAINT "report_locations_location_id_fkey" FOREIGN KEY ("location_id")
        REFERENCES "public"."locations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "report_locations_location_idx"
    ON "public"."report_locations" USING "btree" ("location_id");

-- -------------------------------------------------------------- allocation
-- Allocates the next per-project number and writes the report with its
-- visit/location links, atomically.
--
-- SECURITY DEFINER so the advisory lock and the MAX() read work regardless of
-- the caller's RLS view — the membership check below is therefore NOT
-- optional, it is the only gate (there is deliberately no INSERT policy on
-- reports). auth.uid() still resolves here: it reads the request's JWT claim
-- GUC, not the current role.
CREATE OR REPLACE FUNCTION "public"."create_report"(
    "p_project_id" "uuid",
    "p_visit_ids" "uuid"[],
    "p_location_ids" "uuid"[] DEFAULT '{}'::"uuid"[]
) RETURNS "public"."reports"
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

    -- Serializes concurrent generation for THIS project only. Transaction-
    -- scoped, so it is released on commit or rollback with no cleanup path.
    PERFORM pg_advisory_xact_lock(hashtext('report_seq:' || p_project_id::text));

    SELECT COALESCE(MAX(report_seq), 0) + 1
      INTO v_seq
      FROM public.reports
     WHERE project_id = p_project_id;

    INSERT INTO public.reports (project_id, report_seq, report_number, generated_by)
    VALUES (p_project_id, v_seq, 'A' || lpad(v_seq::text, 3, '0'), auth.uid())
    RETURNING * INTO v_report;

    -- WHERE EXISTS: silently ignores ids that don't belong to this project,
    -- so a malformed client call cannot link a report across projects.
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

ALTER FUNCTION "public"."create_report"("uuid", "uuid"[], "uuid"[]) OWNER TO "postgres";

-- --------------------------------------------------------------------- RLS
ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_locations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view reports" ON "public"."reports";
CREATE POLICY "Members can view reports" ON "public"."reports"
    FOR SELECT USING ("public"."is_project_member"("project_id"));

-- No INSERT policy by design: reports are created only through
-- create_report(), so a number can never be allocated outside the lock.
DROP POLICY IF EXISTS "Editors can update reports" ON "public"."reports";
CREATE POLICY "Editors can update reports" ON "public"."reports"
    FOR UPDATE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]))
    WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));

-- Needed for the failed-render rollback: the number is allocated before the
-- .docx is rendered, so a render crash deletes the row it just created.
DROP POLICY IF EXISTS "Editors can delete reports" ON "public"."reports";
CREATE POLICY "Editors can delete reports" ON "public"."reports"
    FOR DELETE USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));

DROP POLICY IF EXISTS "Admins have full access to reports" ON "public"."reports";
CREATE POLICY "Admins have full access to reports" ON "public"."reports"
    USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

DROP POLICY IF EXISTS "Members can view report_visits" ON "public"."report_visits";
CREATE POLICY "Members can view report_visits" ON "public"."report_visits"
    FOR SELECT USING (EXISTS (SELECT 1 FROM "public"."reports" r
        WHERE r."id" = "report_id" AND "public"."is_project_member"(r."project_id")));

DROP POLICY IF EXISTS "Admins have full access to report_visits" ON "public"."report_visits";
CREATE POLICY "Admins have full access to report_visits" ON "public"."report_visits"
    USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

DROP POLICY IF EXISTS "Members can view report_locations" ON "public"."report_locations";
CREATE POLICY "Members can view report_locations" ON "public"."report_locations"
    FOR SELECT USING (EXISTS (SELECT 1 FROM "public"."reports" r
        WHERE r."id" = "report_id" AND "public"."is_project_member"(r."project_id")));

DROP POLICY IF EXISTS "Admins have full access to report_locations" ON "public"."report_locations";
CREATE POLICY "Admins have full access to report_locations" ON "public"."report_locations"
    USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";
GRANT ALL ON TABLE "public"."report_visits" TO "anon";
GRANT ALL ON TABLE "public"."report_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."report_visits" TO "service_role";
GRANT ALL ON TABLE "public"."report_locations" TO "anon";
GRANT ALL ON TABLE "public"."report_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."report_locations" TO "service_role";

GRANT ALL ON FUNCTION "public"."create_report"("uuid", "uuid"[], "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_report"("uuid", "uuid"[], "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_report"("uuid", "uuid"[], "uuid"[]) TO "service_role";
