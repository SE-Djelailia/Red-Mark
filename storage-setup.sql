-- ============================================
-- Storage setup: bucket RLS policies
-- ============================================
-- Storage (buckets, storage.objects) lives in its own `storage` schema,
-- managed by Supabase separately from the `public` schema tracked in
-- dev-schema.sql / prod-schema.sql — that's why it's a standalone file.
-- Those two dumps are public-only and contain NOTHING from this file; this
-- is the canonical record of the storage policies.
--
-- Bucket creation itself is NOT handled by this file — buckets are created
-- via the Supabase dashboard (Storage → New bucket), then the policies
-- below are run against that project.
--
-- STATE OF RECORD: post-Stage-4 (the organization / firm cutover).
--
-- Until Stage 4, five of these six policies carried a `public.is_admin() OR`
-- branch. is_admin() was the old GLOBAL admin flag — no firm scope at all —
-- so a firm-A admin could read and delete firm-B's photos and plans. That
-- leak survived Stage 4's first draft because the drop loop and its assertion
-- were both scoped `WHERE schemaname = 'public'`, and it was found only by
-- the adversarial sweep. Stage 5 then dropped is_admin() outright, so this
-- file as previously written would now FAIL to run: the function no longer
-- exists.
--
-- Firm isolation is not lost by removing that branch — it is strengthened.
-- is_project_member() and has_project_role() read project_members, whose
-- Stage 3 composite foreign keys make a cross-firm membership row
-- unrepresentable. Storage therefore inherits firm scope structurally.
--
-- ⚠ BEHAVIOURAL CHANGE vs. the pre-Stage-4 version: photo deletion is now
-- uploader-only, and plan deletion project-owner-only. No one can delete
-- another firm's — or another user's — files by virtue of an admin flag.
--
-- Re-running: DROP POLICY IF EXISTS precedes each CREATE, so this file is
-- idempotent and safe to apply to a project that already has these policies.
-- ============================================


-- ============================================
-- project-photos
-- ============================================
-- Object path convention (set by uploadPhoto() in supabaseApi.ts):
--   ${userId}/${projectId}/${visitId}/${filename}
-- [1] = uploader's user id, [2] = project id.
-- ============================================

DROP POLICY IF EXISTS "project-photos select" ON storage.objects;
CREATE POLICY "project-photos select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND public.is_project_member(((storage.foldername(name))[2])::uuid)
  );

-- Unchanged by Stage 4 — this policy never had an is_admin() branch. The
-- uploader-id check on [1] is what makes the delete policy below meaningful.
DROP POLICY IF EXISTS "project-photos insert" ON storage.objects;
CREATE POLICY "project-photos insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_project_role(((storage.foldername(name))[2])::uuid, ARRAY['owner','editor'])
  );

-- Uploader-only. Stricter than the `photos` table's own delete policy by
-- design: an orphaned storage object is worse than an orphaned row.
DROP POLICY IF EXISTS "project-photos delete" ON storage.objects;
CREATE POLICY "project-photos delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================
-- project-plans
-- ============================================
-- Object path convention (set by the plan-file upload flow):
--   ${projectId}/${planFileId}.${ext}
-- [1] = project id. Plan files are shared project assets managed by role,
-- not personally owned by whoever uploaded them (unlike project-photos,
-- where the uploader's user_id leads the path) — so gating by project +
-- role fits better than gating by uploader identity.
-- ============================================

DROP POLICY IF EXISTS "project-plans select" ON storage.objects;
CREATE POLICY "project-plans select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-plans'
    AND public.is_project_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "project-plans insert" ON storage.objects;
CREATE POLICY "project-plans insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-plans'
    AND public.has_project_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','editor'])
  );

DROP POLICY IF EXISTS "project-plans delete" ON storage.objects;
CREATE POLICY "project-plans delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-plans'
    AND public.has_project_role(((storage.foldername(name))[1])::uuid, ARRAY['owner'])
  );


-- ============================================
-- VERIFICATION (run after)
-- ============================================
-- Expect 6 rows, and NO row mentioning is_admin:
--
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--    ORDER BY policyname;
--
--   SELECT count(*) AS should_be_zero FROM pg_policies
--    WHERE coalesce(qual,'') LIKE '%is_admin%'
--       OR coalesce(with_check,'') LIKE '%is_admin%';
-- ============================================
