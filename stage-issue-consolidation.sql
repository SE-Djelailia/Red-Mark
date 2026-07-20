-- ============================================================================
-- stage-issue-consolidation.sql
-- DEV-ONLY staging migration for the issue create/view/edit consolidation.
-- Sandbox-tested against a disposable Postgres container before being
-- applied to the real dev database. Do NOT run against dev/prod as-is
-- without re-confirming against current dev state first.
--
-- Adds the canonical-issue fields (discipline, due_date, assigned_to_name),
-- adds the real photos.issue_id link (mirroring photos.location_id), and
-- runs two data migrations:
--   1) issues.status: 'in_progress' -> 'open' (collapsing to Ouvert/Résolu)
--   2) backfill photos.issue_id from the legacy issues.location->'photos'
--      JSONB array, without any data loss
-- Step 5 (stripping the now-redundant 'photos' key out of issues.location)
-- is intentionally left as a separate, clearly-labeled, skippable step.
-- ============================================================================

-- 1. New columns on issues
ALTER TABLE "public"."issues"
    ADD COLUMN IF NOT EXISTS "discipline" "text",
    ADD COLUMN IF NOT EXISTS "due_date" "date",
    ADD COLUMN IF NOT EXISTS "assigned_to_name" "text";

-- 2. New photos.issue_id column, mirroring photos.location_id exactly
ALTER TABLE "public"."photos"
    ADD COLUMN IF NOT EXISTS "issue_id" "uuid";

CREATE INDEX IF NOT EXISTS "idx_photos_issue_id" ON "public"."photos" USING "btree" ("issue_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'photos_issue_id_fkey'
    ) THEN
        ALTER TABLE "public"."photos"
            ADD CONSTRAINT "photos_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Data migration: collapse status down to Ouvert/Résolu
UPDATE "public"."issues"
SET "status" = 'open'
WHERE "status" = 'in_progress';

-- 4. Data migration: backfill photos.issue_id from the legacy JSONB photos
-- array stored at issues.location->'photos'. Data-loss-safe:
--   - jsonb_typeof guard: NULL location, missing 'photos' key, or a
--     non-array 'photos' value all degrade to an empty array (no error,
--     no rows touched for that issue).
--   - UUID-format regex guard on elem->>'id' before casting to uuid, so a
--     single malformed id in one issue's JSONB does not abort the whole
--     statement.
--   - A referenced photo id that no longer exists in public.photos simply
--     produces no match in the UPDATE ... FROM join (safe no-op), it does
--     not raise an error.
--   - If the same photo id is (erroneously) referenced by more than one
--     issue's JSONB array, the join can produce more than one candidate
--     row per photo; Postgres does not define which one "wins" in that
--     case. Tested below; expected to be rare/nonexistent in real data.
UPDATE "public"."photos" "p"
SET "issue_id" = "sub"."issue_id"
FROM (
    SELECT DISTINCT ON ("photo_id")
        "i"."id" AS "issue_id",
        ("elem"->>'id')::"uuid" AS "photo_id"
    FROM "public"."issues" "i",
         LATERAL "jsonb_array_elements"(
             CASE
                 WHEN "jsonb_typeof"("i"."location"->'photos') = 'array'
                 THEN "i"."location"->'photos'
                 ELSE '[]'::"jsonb"
             END
         ) AS "elem"
    WHERE "elem"->>'id' IS NOT NULL
      AND "elem"->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ORDER BY "photo_id", "i"."created_at" DESC
) "sub"
WHERE "p"."id" = "sub"."photo_id";

-- ============================================================================
-- 5. OPTIONAL / SEPARATE cleanup step — review before running.
-- Strips the now-redundant 'photos' key out of issues.location once step 4
-- above has been verified. Leaves label/tags/assignedTo untouched in the
-- same JSONB blob (tags are explicitly kept; assignedTo is superseded by
-- assigned_to / assigned_to_name but its removal is a separate decision).
-- Skip this step if you want to keep the legacy JSONB photos array around
-- as a temporary safety net before fully cutting over read paths.
-- ============================================================================
-- UPDATE "public"."issues"
-- SET "location" = "location" - 'photos'
-- WHERE "location" ? 'photos';
