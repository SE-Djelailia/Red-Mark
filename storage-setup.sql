-- ============================================
-- Storage setup: project-photos bucket + RLS policies
-- ============================================
-- Storage (buckets, storage.objects) lives in its own `storage` schema,
-- managed by Supabase separately from the `public` schema tracked in
-- dev-schema.sql / prod-schema.sql — that's why it's a standalone file.
--
-- Tracked here for dev-to-prod parity, NOT yet applied anywhere. Production
-- already has this bucket + these policies; dev is currently missing them,
-- which is why photo uploads fail there with:
--   StorageApiError: new row violates row-level security policy
--
-- Prerequisite: create the `project-photos` bucket itself via the Supabase
-- dashboard first (Storage → New bucket → "project-photos") — bucket
-- creation isn't handled by this file. Once the bucket exists, run the
-- policies below against that project.
--
-- Policy names below are descriptive, not necessarily identical to
-- production's actual policy names (those weren't captured via query
-- output) — the conditions are what was confirmed to match production:
-- INSERT/SELECT/DELETE, open to the `public` role, gated only on
-- bucket_id = 'project-photos' (no per-user ownership check).
-- ============================================

CREATE POLICY "project-photos insert" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'project-photos');

CREATE POLICY "project-photos select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'project-photos');

CREATE POLICY "project-photos delete" ON storage.objects
  FOR DELETE TO public
  USING (bucket_id = 'project-photos');
