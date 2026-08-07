-- ============================================================================
-- STAGE 3 of 5 — Firm access control: CONSTRAIN
-- ============================================================================
--
-- PREREQUISITE: Stage 2 applied and verified (0 NULL organization_id, 0
--               membership/project org mismatches, 0 cross-firm memberships).
--
-- THIS IS THE MOMENT OF TRUTH. The two composite foreign keys below make a
-- cross-firm row STRUCTURALLY IMPOSSIBLE — not "rejected by a policy", but
-- unrepresentable, enforced by referential integrity. If any cross-firm
-- membership exists, creating them FAILS and the whole transaction rolls
-- back. That is a successful outcome: it means the boundary is real.
--
-- TAKE A FRESH pg_dump IMMEDIATELY BEFORE RUNNING THIS.
--
-- WHAT THIS STAGE DOES
--   1. Makes writes keep working under NOT NULL (triggers — see below).
--   2. SET NOT NULL on both organization_id columns.
--   3. UNIQUE (id, organization_id) on projects — the composite FK target.
--   4. The two composite FKs on project_members.
--
-- WHY THE TRIGGERS ARE PART OF THIS STAGE, NOT OPTIONAL
--   NOT NULL alone would BREAK project creation immediately: the client
--   inserts projects without organization_id, and handle_new_project() inserts
--   the owner's project_members row without one either. Both would violate
--   NOT NULL and every "create project" would fail.
--
--   So this stage adds:
--     - projects: BEFORE INSERT default from current_org_id()
--     - project_members: BEFORE INSERT/UPDATE, organization_id is DERIVED
--       from the project — always, overriding whatever the caller passed.
--
--   The project_members trigger is a security control as well as a
--   convenience: it makes a forged organization_id on that table impossible
--   even for a caller that bypasses RLS.
--
-- WHAT IT DOES NOT DO
--   - No policy changes, no is_admin() removal, no role-set change .. Stage 4
--
-- IDEMPOTENT / TRANSACTIONAL
--   One explicit transaction. Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Re-assert the Stage 3 pre-conditions inside this transaction.
--    Stage 2 checked these, but data may have changed since. Checking here
--    means a violation aborts before any DDL rather than midway through.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM "public"."projects" WHERE "organization_id" IS NULL;
    IF n > 0 THEN RAISE EXCEPTION '% project(s) have NULL organization_id — run Stage 2 first', n; END IF;

    SELECT count(*) INTO n FROM "public"."project_members" WHERE "organization_id" IS NULL;
    IF n > 0 THEN RAISE EXCEPTION '% project_members row(s) have NULL organization_id — run Stage 2 first', n; END IF;

    SELECT count(*) INTO n
    FROM "public"."project_members" "pm"
    JOIN "public"."projects" "p" ON "p"."id" = "pm"."project_id"
    WHERE "pm"."organization_id" IS DISTINCT FROM "p"."organization_id";
    IF n > 0 THEN RAISE EXCEPTION '% membership(s) disagree with their project''s organization', n; END IF;

    SELECT count(*) INTO n
    FROM "public"."project_members" "pm"
    WHERE NOT EXISTS (
        SELECT 1 FROM "public"."organization_members" "om"
        WHERE "om"."user_id" = "pm"."user_id" AND "om"."organization_id" = "pm"."organization_id");
    IF n > 0 THEN
        RAISE EXCEPTION 'CROSS-FIRM MEMBERSHIP: % row(s). The composite FK below would fail. Resolve first.', n;
    END IF;

    RAISE NOTICE 'Stage 3 pre-conditions clean';
END $$;


-- ---------------------------------------------------------------------------
-- 1. Keep writes working under NOT NULL
-- ---------------------------------------------------------------------------

-- A new project belongs to its creator's firm. Only fills a NULL, so an
-- explicit organization_id (service role, migrations) still wins; RLS in
-- Stage 4 is what stops an authenticated user forging one.
CREATE OR REPLACE FUNCTION "public"."set_project_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Cannot create a project: the current user belongs to no organization';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_project_organization"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "set_project_organization" ON "public"."projects";
CREATE TRIGGER "set_project_organization"
    BEFORE INSERT ON "public"."projects"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_project_organization"();

-- project_members.organization_id is ALWAYS derived from the project, never
-- accepted from the caller. This is what makes a forged organization_id on
-- this table impossible — including for the service role, which bypasses RLS.
CREATE OR REPLACE FUNCTION "public"."set_project_member_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT p.organization_id INTO NEW.organization_id
  FROM public.projects p WHERE p.id = NEW.project_id;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Cannot add a member: project % has no organization', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_project_member_organization"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "set_project_member_organization" ON "public"."project_members";
CREATE TRIGGER "set_project_member_organization"
    BEFORE INSERT OR UPDATE ON "public"."project_members"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_project_member_organization"();

-- handle_new_project() inserts the owner's membership. It does not set
-- organization_id — the trigger above now derives it — but it is redefined
-- here with an explicit comment so the dependency is not invisible.
CREATE OR REPLACE FUNCTION "public"."handle_new_project"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- organization_id is filled by set_project_member_organization(), which
  -- derives it from the project row just inserted.
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (project_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. NOT NULL
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."projects"        ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "public"."project_members" ALTER COLUMN "organization_id" SET NOT NULL;


-- ---------------------------------------------------------------------------
-- 3. Composite FK target on projects
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'projects_id_organization_id_key'
          AND "conrelid" = '"public"."projects"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."projects"
            ADD CONSTRAINT "projects_id_organization_id_key" UNIQUE ("id", "organization_id");
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 4. THE TWO COMPOSITE FOREIGN KEYS
--
--    Together these make cross-firm membership unrepresentable:
--
--      (project_id, organization_id) → projects(id, organization_id)
--          the membership's firm must be the PROJECT's firm
--
--      (user_id, organization_id) → organization_members(user_id, organization_id)
--          the membership's firm must be the USER's firm
--
--    Both must hold, so the user's firm and the project's firm must be the
--    same firm. No policy is involved. A bug in Stage 4's policies, a
--    service-role write, or a future migration that forgets the rule all hit
--    this instead of leaking.
--
--    ON UPDATE CASCADE on the project FK: if a project ever moves firm, its
--    memberships follow rather than dangling. Moving a user between firms is
--    deliberately NOT cascaded — that must be an explicit, reviewed action.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'project_members_project_org_fkey'
          AND "conrelid" = '"public"."project_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."project_members"
            ADD CONSTRAINT "project_members_project_org_fkey"
            FOREIGN KEY ("project_id", "organization_id")
            REFERENCES "public"."projects"("id", "organization_id")
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'project_members_user_org_fkey'
          AND "conrelid" = '"public"."project_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."project_members"
            ADD CONSTRAINT "project_members_user_org_fkey"
            FOREIGN KEY ("user_id", "organization_id")
            REFERENCES "public"."organization_members"("user_id", "organization_id")
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

-- Supporting index for the user-side composite FK.
CREATE INDEX IF NOT EXISTS "idx_project_members_user_org"
    ON "public"."project_members" USING "btree" ("user_id", "organization_id");


-- ---------------------------------------------------------------------------
-- 5. Post-conditions
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM "pg_constraint"
    WHERE "conrelid" = '"public"."project_members"'::"regclass"
      AND "conname" IN ('project_members_project_org_fkey','project_members_user_org_fkey');
    IF n <> 2 THEN RAISE EXCEPTION 'Expected both composite FKs, found %', n; END IF;

    SELECT count(*) INTO n FROM "information_schema"."columns"
    WHERE "table_schema" = 'public' AND "column_name" = 'organization_id'
      AND "table_name" IN ('projects','project_members') AND "is_nullable" = 'NO';
    IF n <> 2 THEN RAISE EXCEPTION 'Expected both columns NOT NULL, found %', n; END IF;

    RAISE NOTICE 'Stage 3 OK — both columns NOT NULL, both composite FKs in place';
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.project_members'::regclass AND contype = 'f';
--
-- -- Must FAIL with a foreign key violation:
-- INSERT INTO public.project_members (project_id, user_id, role)
-- VALUES ('<a project in firm A>', '<a user in firm B>', 'editor');
--
-- ============================================================================
-- ROLLBACK (Stage 3 only)
-- ============================================================================
-- BEGIN;
--   ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_user_org_fkey;
--   ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_project_org_fkey;
--   ALTER TABLE public.projects        DROP CONSTRAINT IF EXISTS projects_id_organization_id_key;
--   ALTER TABLE public.project_members ALTER COLUMN organization_id DROP NOT NULL;
--   ALTER TABLE public.projects        ALTER COLUMN organization_id DROP NOT NULL;
--   DROP TRIGGER IF EXISTS set_project_member_organization ON public.project_members;
--   DROP TRIGGER IF EXISTS set_project_organization ON public.projects;
-- COMMIT;
-- ============================================================================
