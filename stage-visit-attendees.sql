-- Attendees ("ASSISTAIENT") move from the report form onto the visit itself:
-- who was on site is a fact about the visit, not about a document generated
-- from it. Stored as a JSON array of { name, organization, role, initials }.
--
-- Deliberately a jsonb column rather than a table: attendees are only ever
-- read as a whole list for one visit, and never queried across visits. If
-- cross-visit querying is ever needed this migrates to a table cleanly.
--
-- STRICTLY ADDITIVE: one new nullable column on an existing table, plus a
-- shape guard. No existing column, policy or function is altered. Safe to
-- re-run (idempotent).
--
-- No RLS changes: the column is covered by site_visits' existing policies
-- ("Creator can update their visits", "Members can view project visits",
-- "Admins have full access to site_visits").

ALTER TABLE "public"."site_visits"
    ADD COLUMN IF NOT EXISTS "attendees" "jsonb";

-- Guards against a scalar or object being written where the app always
-- expects an array. Existing rows are NULL, so this can never fail on
-- application.
DO $$ BEGIN
    ALTER TABLE "public"."site_visits"
        ADD CONSTRAINT "site_visits_attendees_is_array"
        CHECK ("attendees" IS NULL OR "jsonb_typeof"("attendees") = 'array');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN "public"."site_visits"."attendees" IS
    'Array of { name, organization, role, initials } — fills the report''s ASSISTAIENT table.';
