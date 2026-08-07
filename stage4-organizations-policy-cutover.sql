-- ============================================================================
-- STAGE 4 of 5 — Firm access control: POLICY CUTOVER
-- ============================================================================
--
-- PREREQUISITE: Stage 3 applied (NOT NULL + both composite FKs).
--
-- THIS IS THE STAGE THAT CLOSES FINDING ①. Until now `is_admin()` has been a
-- GLOBAL superuser: `CREATE POLICY "Admins have full access to projects" ...
-- USING (is_admin())` grants read AND write on EVERY project regardless of
-- firm. With two firms in the database that is a cross-firm breach. This
-- stage removes it and replaces every use with the firm-scoped
-- is_org_admin(organization_id).
--
-- WHAT THIS STAGE DOES
--   1. projects   — drop the global-admin policy; scope INSERT/UPDATE to the
--                   caller's firm so organization_id cannot be forged.
--   2. project_members — is_admin() → is_org_admin(organization_id) (×4).
--   3. profiles   — widen SELECT to same-firm colleagues (approved).
--   4. find_invitable_user() — firm-scoped; no longer an email oracle.
--   5. Role set   — viewer → commenter, and the CHECK narrowed to 3 values.
--   6. org_projects_for_admin() — lets a firm admin manage access to projects
--                   they are not a member of WITHOUT seeing their contents.
--
-- DELIBERATELY NOT DONE HERE
--   - profiles.org_role is NOT dropped  ................. Stage 5
--   - is_admin() is NOT dropped; it becomes unreferenced . Stage 5
--
-- ONE TRANSACTION. Old and new policies must not coexist.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Pre-conditions
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM "pg_constraint"
    WHERE "conrelid" = '"public"."project_members"'::"regclass"
      AND "conname" IN ('project_members_project_org_fkey','project_members_user_org_fkey');
    IF n <> 2 THEN RAISE EXCEPTION 'Stage 3 has not been applied (composite FKs missing)'; END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 1a. DROP EVERY GLOBAL-ADMIN POLICY
--
--     SCOPE CORRECTION. The plan said finding ① was 5 policies. It is
--     NINETEEN call sites across FIFTEEN tables: every project-scoped table
--     plus comments, comment_mentions, reports, report_visits and
--     report_locations carries an
--
--         CREATE POLICY "Admins have full access to <t>" ON <t>
--             USING (is_admin()) WITH CHECK (is_admin())
--
--     — a FOR ALL policy, so read AND write, on every row, regardless of
--     firm. (The original investigation grepped for `is_admin()` and found
--     one hit; the policies spell it `"public"."is_admin"()` with quotes.)
--
--     These are DROPPED, not rewritten to is_org_admin(). Per the approved
--     decision a firm admin does not automatically see firm projects, so
--     blanket admin access to photos/issues/visits would contradict it.
--     Access to contents comes only from project_members.
--
--     ⚠ BEHAVIOURAL CHANGE ON PROD: se.djelailia currently has
--     profiles.org_role='admin' and can therefore see all 5 projects. After
--     this stage they see only projects they are a member of. Per the Stage 0
--     audit that means Bloc F and Test (owned by se.billing, with no
--     djelailia membership) will no longer be visible. Grant membership
--     explicitly if that access is wanted.
--
--     The loop is data-driven rather than a list of 15 DROP statements so it
--     cannot miss one that the audit didn't enumerate.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; n int := 0;
BEGIN
    FOR r IN
        SELECT "schemaname", "tablename", "policyname"
        FROM "pg_policies"
        WHERE "schemaname" = 'public'
          AND (coalesce("qual",'') LIKE '%is_admin%'
               OR coalesce("with_check",'') LIKE '%is_admin%')
          -- project_members is rewritten in section 2, not dropped: firm
          -- admins must retain the ability to manage access.
          AND "tablename" <> 'project_members'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                       r."policyname", r."schemaname", r."tablename");
        RAISE NOTICE 'dropped global-admin policy: %.%', r."tablename", r."policyname";
        n := n + 1;
    END LOOP;
    RAISE NOTICE 'Dropped % global-admin policies', n;
END $$;


-- ---------------------------------------------------------------------------
-- 1. projects
--
--    "Admins have full access to projects" is DELETED, not rewritten. There
--    is no firm-wide project read in this model: per the approved decision, a
--    firm admin sees only projects they are a member of. Access to contents
--    still comes exclusively from project_members.
--
--    INSERT/UPDATE now pin organization_id to the caller's own firm, so an
--    authenticated user cannot create a project inside another firm nor move
--    one out of theirs.
-- ---------------------------------------------------------------------------
-- (the global-admin policy on projects is dropped by section 1a below,
--  together with its fourteen siblings)

DROP POLICY IF EXISTS "Users can create their own projects" ON "public"."projects";
CREATE POLICY "Users can create their own projects"
    ON "public"."projects" FOR INSERT
    WITH CHECK (
        "auth"."uid"() = "user_id"
        AND "organization_id" = "public"."current_org_id"()
    );

-- WITH CHECK added: the old policy had only USING, so an owner could edit a
-- project into a different firm. The post-image must stay in their firm.
DROP POLICY IF EXISTS "Creator can update their projects" ON "public"."projects";
CREATE POLICY "Creator can update their projects"
    ON "public"."projects" FOR UPDATE
    USING ("auth"."uid"() = "user_id")
    WITH CHECK (
        "auth"."uid"() = "user_id"
        AND "organization_id" = "public"."current_org_id"()
    );

-- Unchanged in meaning, restated with an explicit firm predicate as defence
-- in depth. Redundant given the composite FKs — deliberately so.
DROP POLICY IF EXISTS "Members can view their projects" ON "public"."projects";
CREATE POLICY "Members can view their projects"
    ON "public"."projects" FOR SELECT
    USING (
        "public"."is_project_member"("id")
        AND "organization_id" = "public"."current_org_id"()
    );


-- ---------------------------------------------------------------------------
-- 2. project_members — the four is_admin() call sites
--
--    A firm admin may grant/revoke access to any project IN THEIR OWN FIRM,
--    including projects they cannot read. That is the "manage access from one
--    place" requirement, kept within the firm boundary.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view their project roster" ON "public"."project_members";
CREATE POLICY "Members can view their project roster"
    ON "public"."project_members" FOR SELECT
    USING (
        "public"."is_org_admin"("organization_id")
        OR "public"."is_project_member"("project_id")
    );

DROP POLICY IF EXISTS "Owners and admins can add members" ON "public"."project_members";
CREATE POLICY "Owners and admins can add members"
    ON "public"."project_members" FOR INSERT
    WITH CHECK (
        "organization_id" = "public"."current_org_id"()
        AND (
            "public"."is_org_admin"("organization_id")
            OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])
        )
    );

DROP POLICY IF EXISTS "Owners and admins can update members" ON "public"."project_members";
CREATE POLICY "Owners and admins can update members"
    ON "public"."project_members" FOR UPDATE
    USING (
        "public"."is_org_admin"("organization_id")
        OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])
    )
    WITH CHECK (
        "organization_id" = "public"."current_org_id"()
        AND (
            "public"."is_org_admin"("organization_id")
            OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])
        )
    );

DROP POLICY IF EXISTS "Owners and admins can remove members" ON "public"."project_members";
CREATE POLICY "Owners and admins can remove members"
    ON "public"."project_members" FOR DELETE
    USING (
        "public"."is_org_admin"("organization_id")
        OR "public"."has_project_role"("project_id", ARRAY['owner'::"text"])
    );


-- ---------------------------------------------------------------------------
-- 3. profiles — firm directory (approved widening)
--
--    A firm admin must be able to pick a colleague BEFORE that colleague is
--    on any project, so project-sharing alone is not enough. Scoped strictly
--    to the caller's own firm.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Project teammates can view each other's profiles" ON "public"."profiles";
CREATE POLICY "Project teammates can view each other's profiles"
    ON "public"."profiles" FOR SELECT
    USING ("public"."shares_project_with"("id"));

DROP POLICY IF EXISTS "Firm colleagues can view each other's profiles" ON "public"."profiles";
CREATE POLICY "Firm colleagues can view each other's profiles"
    ON "public"."profiles" FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM "public"."organization_members" "om"
        WHERE "om"."user_id" = "profiles"."id"
          AND "om"."organization_id" = "public"."current_org_id"()
    ));


-- ---------------------------------------------------------------------------
-- 4. find_invitable_user() — was a cross-firm email oracle
--
--    Before: any user who owned ANY project could look up ANY profile by
--    email, across all firms. Now the target must be in the caller's firm,
--    and the caller must be a firm admin or a project owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."find_invitable_user"("p_email" "text")
RETURNS TABLE("id" "uuid", "name" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.name, p.email
  FROM public.profiles p
  JOIN public.organization_members om ON om.user_id = p.id
  WHERE lower(p.email) = lower(p_email)
    AND om.organization_id = public.current_org_id()
    AND (
      public.is_org_admin(public.current_org_id())
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.user_id = auth.uid() AND pm.role = 'owner'
      )
    );
$$;


-- ---------------------------------------------------------------------------
-- 5. Firm-admin project listing WITHOUT content access
--
--    The approved decision is that a firm admin does NOT automatically see
--    firm projects. But to assign access they must at least be able to pick a
--    project. RLS is row-level, not column-level, so granting SELECT on
--    `projects` would expose address / client / contractor too.
--
--    This returns ID AND NAME ONLY, for the caller's own firm, and only to a
--    firm admin. Contents (visits, photos, issues, reports) remain reachable
--    solely through project_members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."org_projects_for_admin"()
RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.name
  FROM public.projects p
  WHERE p.organization_id = public.current_org_id()
    AND public.is_org_admin(p.organization_id)
  ORDER BY p.name;
$$;

ALTER FUNCTION "public"."org_projects_for_admin"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."org_projects_for_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."org_projects_for_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."org_projects_for_admin"() TO "service_role";


-- ---------------------------------------------------------------------------
-- 6. Role-set collapse: viewer → commenter
--
--    Decision #5. 'commenter' survives as the lower role (can comment, cannot
--    edit); 'viewer' is removed. Prod has no viewer rows today, so the UPDATE
--    is a no-op there — it is written anyway so the file is correct against
--    any database, including the sandbox where viewer rows are planted.
-- ---------------------------------------------------------------------------
UPDATE "public"."project_members" SET "role" = 'commenter' WHERE "role" = 'viewer';

ALTER TABLE "public"."project_members" DROP CONSTRAINT IF EXISTS "project_members_role_check";
ALTER TABLE "public"."project_members"
    ADD CONSTRAINT "project_members_role_check"
    CHECK ("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'commenter'::"text"]));


-- ---------------------------------------------------------------------------
-- 6b. STORAGE POLICIES — the leak the public-schema sweep did not catch
--
--     FOUND BY THE ADVERSARIAL SWEEP, not by inspection. The first version of
--     this stage dropped global-admin policies WHERE schemaname='public', and
--     asserted the same. Both missed the `storage` schema entirely — so a
--     firm-A admin could still SELECT (and DELETE) firm-B's photos and plans.
--
--     Five policies on storage.objects carry `public.is_admin() OR ...`:
--       project-photos select, project-photos delete,
--       project-plans select, project-plans insert, project-plans delete
--
--     Each is recreated below with only the is_admin() branch removed. The
--     membership predicates are untouched, and because is_project_member() /
--     has_project_role() now imply firm scope (via the Stage 3 composite FKs),
--     storage inherits firm isolation from them.
--
--     ⚠ BEHAVIOURAL CHANGE: photo deletion is now uploader-only, and plan
--     deletion project-owner-only. Previously a global admin could delete any
--     file in any firm.
--
--     These definitions must be kept in sync with storage-setup.sql, which
--     remains the canonical home for storage policies (prod-schema.sql is a
--     public-only dump and does not cover them).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "project-photos select" ON "storage"."objects";
CREATE POLICY "project-photos select" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (
    "bucket_id" = 'project-photos'
    AND "public"."is_project_member"((("storage"."foldername"("name"))[2])::"uuid")
  );

DROP POLICY IF EXISTS "project-photos delete" ON "storage"."objects";
CREATE POLICY "project-photos delete" ON "storage"."objects"
  FOR DELETE TO "authenticated"
  USING (
    "bucket_id" = 'project-photos'
    AND ("storage"."foldername"("name"))[1] = "auth"."uid"()::"text"
  );

DROP POLICY IF EXISTS "project-plans select" ON "storage"."objects";
CREATE POLICY "project-plans select" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (
    "bucket_id" = 'project-plans'
    AND "public"."is_project_member"((("storage"."foldername"("name"))[1])::"uuid")
  );

DROP POLICY IF EXISTS "project-plans insert" ON "storage"."objects";
CREATE POLICY "project-plans insert" ON "storage"."objects"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "bucket_id" = 'project-plans'
    AND "public"."has_project_role"((("storage"."foldername"("name"))[1])::"uuid",
                                    ARRAY['owner'::"text",'editor'::"text"])
  );

DROP POLICY IF EXISTS "project-plans delete" ON "storage"."objects";
CREATE POLICY "project-plans delete" ON "storage"."objects"
  FOR DELETE TO "authenticated"
  USING (
    "bucket_id" = 'project-plans'
    AND "public"."has_project_role"((("storage"."foldername"("name"))[1])::"uuid",
                                    ARRAY['owner'::"text"])
  );


-- ---------------------------------------------------------------------------
-- 7. Deprecation marker. is_admin() is now referenced by NO policy. It is
--    left in place so anything unseen that calls it keeps working; Stage 5
--    drops it together with profiles.org_role.
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION "public"."is_admin"() IS
  'DEPRECATED — global, cross-firm admin flag. Replaced by is_org_admin(uuid). Referenced by no policy as of Stage 4; dropped in Stage 5 with profiles.org_role.';


-- ---------------------------------------------------------------------------
-- 8. Post-conditions
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    -- THE headline assertion: no policy anywhere may still call is_admin().
    -- ALL SCHEMAS, not just public. Scoping this to 'public' is exactly the
    -- mistake that let five storage.objects policies keep a global-admin
    -- branch through the first draft of this stage.
    SELECT count(*) INTO n
    FROM "pg_policies"
    WHERE coalesce("qual",'') LIKE '%is_admin%' OR coalesce("with_check",'') LIKE '%is_admin%';
    IF n > 0 THEN
        RAISE EXCEPTION '% policy/policies still reference the global is_admin() (checked ALL schemas)', n;
    END IF;

    SELECT count(*) INTO n FROM "public"."project_members" WHERE "role" = 'viewer';
    IF n > 0 THEN RAISE EXCEPTION '% viewer row(s) survived the role collapse', n; END IF;

    RAISE NOTICE 'Stage 4 OK — is_admin() unreferenced by any policy, role set collapsed to owner/editor/commenter';
END $$;

COMMIT;


-- ============================================================================
-- CLIENT / EDGE-FUNCTION RECONCILIATION (code, applied separately)
--   src/lib/supabase.ts:155         "owner"|"editor"|"viewer"  → commenter
--   src/lib/supabaseApi.ts:1102     "owner"|"editor"|"viewer"  → commenter
--   supabase/functions/.../index.ts:560   role || "viewer" → "commenter"
--   supabase/functions/.../index.ts:1272  role || "viewer" → "commenter"
--   Plus firm checks in the edge function, which runs as service_role and
--   therefore BYPASSES every policy above.
--
-- VERIFICATION
--   SELECT tablename, policyname FROM pg_policies
--    WHERE schemaname='public'
--      AND (qual LIKE '%is_admin()%' OR with_check LIKE '%is_admin()%');   -- 0 rows
--
--   SELECT DISTINCT role FROM public.project_members;   -- no 'viewer'
-- ============================================================================
