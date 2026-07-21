-- ============================================================================
-- stage-visit-times.sql
-- DEV-ONLY staging migration: adds optional start/end time to site visits.
-- Sandbox-tested against a disposable Postgres container before being
-- applied to the real dev database.
-- ============================================================================

ALTER TABLE "public"."site_visits"
    ADD COLUMN IF NOT EXISTS "start_time" "time",
    ADD COLUMN IF NOT EXISTS "end_time" "time";
