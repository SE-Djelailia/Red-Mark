-- ============================================
-- Storage setup: bucket RLS policies
-- ============================================
-- Storage (buckets, storage.objects) lives in its own `storage` schema,
-- managed by Supabase separately from the `public` schema tracked in
-- dev-schema.sql / prod-schema.sql — that's why it's a standalone file.
--
-- Bucket creation itself is NOT handled by this file — buckets are created
-- via the Supabase dashboard (Storage → New bucket), then the policies
-- below are run against that project.
-- ============================================


-- ============================================
-- project-photos
-- ============================================
-- Originally shipped wide open (bucket_id check only, TO public, no
-- user/role check — anyone could insert/delete any file). Tightened after
-- a commenter's photo delete succeeded at the storage layer while the
-- (correctly-restricted) `photos` table row delete silently failed,
-- leaving an orphaned "Image indisponible" reference. See
-- fix-storage-policies.sql for the sandbox-tested fix; the policies below
-- are that fix, folded in as the current state of record (both dev and
-- prod are on this version now).
--
-- Object path convention (set by uploadPhoto() in supabaseApi.ts):
--   ${userId}/${projectId}/${visitId}/${filename}
-- [1] = uploader's user id, [2] = project id.
-- ============================================

CREATE POLICY "project-photos select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND (
      public.is_admin()
      OR public.is_project_member(((storage.foldername(name))[2])::uuid)
    )
  );

CREATE POLICY "project-photos insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_project_role(((storage.foldername(name))[2])::uuid, ARRAY['owner','editor'])
  );

CREATE POLICY "project-photos delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-photos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );


-- ============================================
-- project-plans
-- ============================================
-- New with the Plans & Locations feature. Built tightened from the start
-- (path-based project + role checks) — unlike project-photos, this bucket
-- never had a wide-open phase. Applied to dev via stage-plans-locations.sql.
--
-- Object path convention (set by the plan-file upload flow):
--   ${projectId}/${planFileId}.${ext}
-- [1] = project id. Plan files are shared project assets managed by role,
-- not personally owned by whoever uploaded them (unlike project-photos,
-- where the uploader's user_id leads the path) — so gating by project +
-- role fits better than gating by uploader identity.
-- ============================================

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
