-- ============================================================================
-- STAGE 2 of 5 — Firm access control: BACKFILL
-- ============================================================================
--
-- PREREQUISITE: Stage 1 applied (3 tables + nullable organization_id columns
--               + current_org_id()/is_org_admin()). Asserted below.
--
-- WHAT THIS STAGE DOES
--   1. Creates the single organization.
--   2. Inserts the 3 existing accounts into organization_members.
--   3. Stamps organization_id onto all 5 projects.
--   4. Stamps organization_id onto all 7 project_members — DERIVED FROM THE
--      PROJECT, never assigned independently.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   - No NOT NULL, no composite FKs  ................... Stage 3
--   - No policy changes, no is_admin() removal  ........ Stage 4
--   - No role-set change (viewer→commenter)  ........... Stage 4
--
-- SAFETY
--   Writes only to columns that are NULL and to the new tables. No existing
--   column is modified, no row is deleted, no ownership is reassigned.
--   Reversible: see ROLLBACK at the bottom.
--
--   The whole stage is one transaction. Every assertion RAISEs, so any
--   surprise rolls the entire thing back rather than leaving a half-migrated
--   database.
--
-- IDEMPOTENT
--   Safe to re-run: the org is keyed by slug, memberships by ON CONFLICT, and
--   both backfills only touch rows that are not already correct.
--
-- STAGE 0 AUDIT THIS IS BUILT FROM (2026-08-07)
--   accounts     3  se.djelailia (admin), se.billing, se.internet
--   projects     5  Bloc F, École, Hopital, tEST, Test
--   memberships  7  all within those 3 accounts — no cross-firm rows
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight. Fail loudly and roll back rather than backfill onto a
--    database that isn't shaped the way the audit said it was.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_missing text;
    v_projects int;
    v_members int;
BEGIN
    -- Stage 1 must be in place.
    IF to_regclass('public.organizations') IS NULL
       OR to_regclass('public.organization_members') IS NULL THEN
        RAISE EXCEPTION 'Stage 1 has not been applied: organizations/organization_members missing';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='projects'
                     AND column_name='organization_id') THEN
        RAISE EXCEPTION 'Stage 1 has not been applied: projects.organization_id missing';
    END IF;

    -- Every user id below must really exist. This is the typo guard: a
    -- mistyped uuid would otherwise silently create a membership for nobody
    -- and leave a real account orphaned.
    SELECT string_agg(u.id::text, ', ') INTO v_missing
    FROM (VALUES
        ('0a7b92ef-a526-4f92-9371-617b554027ed'::uuid),
        ('f5951606-c2cc-478d-8dc6-e1de8dc4eaeb'::uuid),
        ('d80c7da1-d8e9-46fb-8c6b-50320e2d77e5'::uuid)
    ) AS u(id)
    WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id);

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'These user ids do not exist in auth.users: %', v_missing;
    END IF;

    -- Report actual shape against the audit. NOT fatal — you may legitimately
    -- have created a project since Stage 0 — but it must be seen, because the
    -- completeness assertions at the end are what actually guarantee safety.
    SELECT count(*) INTO v_projects FROM public.projects;
    SELECT count(*) INTO v_members  FROM public.project_members;

    RAISE NOTICE 'Pre-flight: % projects (audit said 5), % project_members (audit said 7)',
                 v_projects, v_members;
    IF v_projects <> 5 OR v_members <> 7 THEN
        RAISE WARNING 'Row counts differ from the Stage 0 audit. The backfill covers ALL rows, so this is safe — but confirm the difference is expected before running Stage 3.';
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 1. The organization
--
--    Keyed by slug so a re-run is a no-op rather than a second firm. The slug
--    must satisfy Stage 1's organizations_slug_format check.
-- ---------------------------------------------------------------------------
INSERT INTO "public"."organizations" ("name", "slug", "report_firm_name")
VALUES (
    'Jodoin Lamarre Pratte architectes',
    'jodoin-lamarre-pratte',
    'Jodoin Lamarre Pratte architectes'
)
ON CONFLICT ("slug") DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Firm membership for the 3 existing accounts
--
--    ON CONFLICT (user_id): organization_members has UNIQUE(user_id), so a
--    re-run cannot duplicate a member and cannot move someone into a second
--    firm. Existing rows are left as-is rather than overwritten — if a role
--    is later changed by hand, re-running this file will not silently revert
--    it.
-- ---------------------------------------------------------------------------
INSERT INTO "public"."organization_members" ("organization_id", "user_id", "org_role")
SELECT "o"."id", "v"."user_id", "v"."org_role"
FROM "public"."organizations" "o"
CROSS JOIN (VALUES
    -- se.djelailia — firm admin
    ('0a7b92ef-a526-4f92-9371-617b554027ed'::"uuid", 'admin'),
    -- se.billing
    ('f5951606-c2cc-478d-8dc6-e1de8dc4eaeb'::"uuid", 'member'),
    -- se.internet
    ('d80c7da1-d8e9-46fb-8c6b-50320e2d77e5'::"uuid", 'member')
) AS "v"("user_id", "org_role")
WHERE "o"."slug" = 'jodoin-lamarre-pratte'
ON CONFLICT ("user_id") DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Stamp the firm onto every project
--
--    All 5 projects belong to the one firm. Only NULL rows are touched, so a
--    re-run is a no-op and a project already assigned is never reassigned.
-- ---------------------------------------------------------------------------
UPDATE "public"."projects" "p"
SET "organization_id" = "o"."id"
FROM "public"."organizations" "o"
WHERE "o"."slug" = 'jodoin-lamarre-pratte'
  AND "p"."organization_id" IS NULL;


-- ---------------------------------------------------------------------------
-- 4. Stamp the firm onto every project_members row — DERIVED FROM THE PROJECT
--
--    This is the important one. project_members.organization_id is NOT
--    assigned independently; it is copied from the project it points at. That
--    is precisely the invariant Stage 3's composite FK will enforce, so
--    deriving it here means Stage 3 cannot fail on data this step produced.
--
--    Writing the same constant into both tables by hand would look identical
--    today and drift the first time a second firm exists.
-- ---------------------------------------------------------------------------
UPDATE "public"."project_members" "pm"
SET "organization_id" = "p"."organization_id"
FROM "public"."projects" "p"
WHERE "p"."id" = "pm"."project_id"
  AND "pm"."organization_id" IS DISTINCT FROM "p"."organization_id";


-- ---------------------------------------------------------------------------
-- 5. Completeness assertions — the actual safety net
--
--    These are the Stage 3 pre-conditions. If any fails, Stage 3's NOT NULL
--    or composite FKs would fail; better to find out here, inside a
--    transaction that rolls back cleanly.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_org uuid;
    n int;
BEGIN
    SELECT "id" INTO v_org FROM "public"."organizations" WHERE "slug" = 'jodoin-lamarre-pratte';
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Organization was not created';
    END IF;

    SELECT count(*) INTO n FROM "public"."organization_members" WHERE "organization_id" = v_org;
    IF n <> 3 THEN
        RAISE EXCEPTION 'Expected 3 organization_members, found %', n;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "public"."organization_members"
        WHERE "organization_id" = v_org
          AND "user_id" = '0a7b92ef-a526-4f92-9371-617b554027ed'
          AND "org_role" = 'admin'
    ) THEN
        RAISE EXCEPTION 'se.djelailia is not the firm admin';
    END IF;

    -- No project left behind.
    SELECT count(*) INTO n FROM "public"."projects" WHERE "organization_id" IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION '% project(s) still have a NULL organization_id', n;
    END IF;

    -- No membership left behind.
    SELECT count(*) INTO n FROM "public"."project_members" WHERE "organization_id" IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION '% project_members row(s) still have a NULL organization_id', n;
    END IF;

    -- STAGE 3 PRE-CONDITION A: every membership's org matches its project's
    -- org. This is what the (project_id, organization_id) composite FK will
    -- require.
    SELECT count(*) INTO n
    FROM "public"."project_members" "pm"
    JOIN "public"."projects" "p" ON "p"."id" = "pm"."project_id"
    WHERE "pm"."organization_id" IS DISTINCT FROM "p"."organization_id";
    IF n > 0 THEN
        RAISE EXCEPTION '% project_members row(s) disagree with their project''s organization', n;
    END IF;

    -- STAGE 3 PRE-CONDITION B: every member of a project belongs to that
    -- project's firm. This is what the (user_id, organization_id) composite FK
    -- will require — i.e. the cross-firm membership check.
    SELECT count(*) INTO n
    FROM "public"."project_members" "pm"
    WHERE NOT EXISTS (
        SELECT 1 FROM "public"."organization_members" "om"
        WHERE "om"."user_id" = "pm"."user_id"
          AND "om"."organization_id" = "pm"."organization_id"
    );
    IF n > 0 THEN
        RAISE EXCEPTION 'CROSS-FIRM MEMBERSHIP: % project_members row(s) reference a user who is not in that project''s firm. Stage 3 would fail. Resolve before continuing.', n;
    END IF;

    RAISE NOTICE 'Stage 2 OK — org %, 3 members, all projects and memberships stamped, Stage 3 pre-conditions satisfied', v_org;
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT o.name, o.slug, o.report_firm_name FROM public.organizations o;
--
-- SELECT om.org_role, p.email
--   FROM public.organization_members om
--   JOIN public.profiles p ON p.id = om.user_id
--  ORDER BY om.org_role, p.email;                    -- expect 1 admin, 2 member
--
-- SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_orgs,
--        count(*)                                    AS total
--   FROM public.projects;                             -- expect 0, 5
--
-- SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_orgs,
--        count(*)                                    AS total
--   FROM public.project_members;                      -- expect 0, 7
--
-- -- Must return zero rows: any row here is a cross-firm membership.
-- SELECT pm.* FROM public.project_members pm
--  WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om
--                     WHERE om.user_id = pm.user_id
--                       AND om.organization_id = pm.organization_id);
--
-- ============================================================================
-- ROLLBACK (Stage 2 only, before Stage 3 runs)
--   Un-stamps the columns and removes the firm. Leaves Stage 1's structure in
--   place. Destroys no project, visit, photo or membership row.
-- ============================================================================
-- BEGIN;
--   UPDATE public.project_members SET organization_id = NULL;
--   UPDATE public.projects        SET organization_id = NULL;
--   DELETE FROM public.organization_members
--    WHERE organization_id = (SELECT id FROM public.organizations
--                              WHERE slug = 'jodoin-lamarre-pratte');
--   DELETE FROM public.organizations WHERE slug = 'jodoin-lamarre-pratte';
-- COMMIT;
-- ============================================================================
