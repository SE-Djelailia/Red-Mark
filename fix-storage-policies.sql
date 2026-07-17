-- ============================================
-- Tighten project-photos storage.objects RLS policies
-- ============================================
-- Current policies (bucket_id check only, TO public, no user/role check)
-- allow ANY request — including a commenter's — to insert or delete any
-- file in the bucket. This is what let a commenter's photo delete succeed
-- at the storage layer while the (correctly-restricted) `photos` table
-- row delete silently failed, leaving an orphaned "Image indisponible"
-- reference.
--
-- Object path convention (set by uploadPhoto() in supabaseApi.ts):
--   ${userId}/${projectId}/${visitId}/${filename}
-- storage.foldername(name) returns the folder segments as an array, so
-- [1] = uploader's user id, [2] = project id.
-- ============================================

DROP POLICY IF EXISTS "project-photos insert" ON storage.objects;
DROP POLICY IF EXISTS "project-photos select" ON storage.objects;
DROP POLICY IF EXISTS "project-photos delete" ON storage.objects;

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
