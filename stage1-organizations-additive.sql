-- ============================================================================
-- STAGE 1 of 5 — Firm (organization) access control: ADDITIVE ONLY
-- ============================================================================
--
-- WHAT THIS STAGE DOES
--   Creates the three new tables and adds `organization_id` to `projects` and
--   `project_members` as NULLABLE columns. Nothing is backfilled, nothing is
--   constrained, no policy is changed, no existing behaviour is altered.
--
-- WHAT THIS STAGE DELIBERATELY DOES *NOT* DO
--   - No NOT NULL, no composite foreign keys  ......... Stage 3
--   - No backfill of organization_id  ................. Stage 2
--   - No change to is_admin() or any existing policy  .. Stage 4
--   - No drop of profiles.org_role  ................... Stage 5
--
-- SAFETY
--   Purely additive. After this runs the app behaves exactly as before: the
--   new columns are NULL everywhere and nothing reads them yet.
--   Reversible: see the ROLLBACK block at the bottom (commented out).
--
--   RLS is enabled on all three new tables with restrictive policies from the
--   moment they are created — an empty table with RLS off is a table that
--   leaks the day someone inserts into it.
--
-- IDEMPOTENT
--   Safe to run more than once. Every object uses IF NOT EXISTS or is guarded
--   by a DO block trapping duplicate_object.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. organizations — the firm itself
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    -- Stable, URL-safe handle. Not used for access control (never trust a
    -- client-supplied slug); exists for future routing and display.
    "slug" "text" NOT NULL,
    -- Firm identity as it should appear on generated reports. Today this
    -- lives in the free-text, self-editable profiles.firm — which is fine for
    -- a letterhead but must never be an authority. Moving it here makes the
    -- report identity a property of the firm, not of whoever clicked
    -- "generate".
    "report_firm_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."organizations" OWNER TO "postgres";

COMMENT ON TABLE "public"."organizations" IS
  'A firm. Top-level tenancy boundary: no data may cross organizations.';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organizations_pkey'
          AND "conrelid" = '"public"."organizations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organizations"
            ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organizations_slug_key'
          AND "conrelid" = '"public"."organizations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organizations"
            ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organizations_name_not_blank'
          AND "conrelid" = '"public"."organizations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organizations"
            ADD CONSTRAINT "organizations_name_not_blank"
            CHECK ("length"("btrim"("name")) > 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organizations_slug_format'
          AND "conrelid" = '"public"."organizations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organizations"
            ADD CONSTRAINT "organizations_slug_format"
            CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{1,62}$');
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. organization_members — who belongs to a firm, and at what level
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    -- 'admin' = firm admin: manages membership and project access.
    -- 'member' = ordinary account; project access still comes from
    -- project_members, exactly as today.
    "org_role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."organization_members" OWNER TO "postgres";

COMMENT ON TABLE "public"."organization_members" IS
  'Firm membership. UNIQUE(user_id) enforces one firm per user — the constraint the whole isolation model rests on.';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_members_pkey'
          AND "conrelid" = '"public"."organization_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_members"
            ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");
    END IF;
END $$;

-- ONE FIRM PER USER. Confirmed decision. This is what makes "which firm am I
-- acting as?" a non-question, and therefore what keeps every downstream
-- policy honest. Widening this later would require revisiting every policy
-- written in Stage 4.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_members_user_id_key'
          AND "conrelid" = '"public"."organization_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_members"
            ADD CONSTRAINT "organization_members_user_id_key" UNIQUE ("user_id");
    END IF;
END $$;

-- Composite UNIQUE whose ONLY purpose is to be the target of a composite FK
-- from project_members in Stage 3. Redundant with the PK + UNIQUE(user_id)
-- for querying; structurally necessary for the isolation guarantee.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_members_user_org_key'
          AND "conrelid" = '"public"."organization_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_members"
            ADD CONSTRAINT "organization_members_user_org_key"
            UNIQUE ("user_id", "organization_id");
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_members_org_role_check'
          AND "conrelid" = '"public"."organization_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_members"
            ADD CONSTRAINT "organization_members_org_role_check"
            CHECK ("org_role" = ANY (ARRAY['admin'::"text", 'member'::"text"]));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_members_organization_id_fkey'
          AND "conrelid" = '"public"."organization_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_members"
            ADD CONSTRAINT "organization_members_organization_id_fkey"
            FOREIGN KEY ("organization_id")
            REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_members_user_id_fkey'
          AND "conrelid" = '"public"."organization_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_members"
            ADD CONSTRAINT "organization_members_user_id_fkey"
            FOREIGN KEY ("user_id")
            REFERENCES "auth"."users"("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_members_invited_by_fkey'
          AND "conrelid" = '"public"."organization_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_members"
            ADD CONSTRAINT "organization_members_invited_by_fkey"
            FOREIGN KEY ("invited_by")
            REFERENCES "auth"."users"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_organization_members_organization_id"
    ON "public"."organization_members" USING "btree" ("organization_id");


-- ---------------------------------------------------------------------------
-- 3. organization_invitations — invite-by-email, pending acceptance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."organization_invitations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    -- Stored lower-cased (enforced by CHECK below) so the signup handshake
    -- can match the JWT's verified email without case ambiguity. citext is
    -- not assumed to be installed; lower() + CHECK achieves the same here.
    "email" "text" NOT NULL,
    "org_role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by" "uuid",
    -- Opaque, unguessable. The claim handshake matches on the VERIFIED email
    -- from the JWT as well — the token alone is never sufficient, so a leaked
    -- link cannot be redeemed by a different person.
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."organization_invitations" OWNER TO "postgres";

COMMENT ON TABLE "public"."organization_invitations" IS
  'Pending firm invitations. Claimed by matching BOTH the token and the JWT-verified email; never the token alone.';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_invitations_pkey'
          AND "conrelid" = '"public"."organization_invitations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_invitations"
            ADD CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id");
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_invitations_token_key'
          AND "conrelid" = '"public"."organization_invitations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_invitations"
            ADD CONSTRAINT "organization_invitations_token_key" UNIQUE ("token");
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_invitations_email_lowercase'
          AND "conrelid" = '"public"."organization_invitations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_invitations"
            ADD CONSTRAINT "organization_invitations_email_lowercase"
            -- strpos(), not position(x IN y): the latter is special SQL syntax
            -- that cannot be spelled with a quoted function name.
            CHECK ("email" = "lower"("email") AND "strpos"("email", '@') > 1);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_invitations_org_role_check'
          AND "conrelid" = '"public"."organization_invitations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_invitations"
            ADD CONSTRAINT "organization_invitations_org_role_check"
            CHECK ("org_role" = ANY (ARRAY['admin'::"text", 'member'::"text"]));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_invitations_organization_id_fkey'
          AND "conrelid" = '"public"."organization_invitations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_invitations"
            ADD CONSTRAINT "organization_invitations_organization_id_fkey"
            FOREIGN KEY ("organization_id")
            REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_invitations_invited_by_fkey'
          AND "conrelid" = '"public"."organization_invitations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_invitations"
            ADD CONSTRAINT "organization_invitations_invited_by_fkey"
            FOREIGN KEY ("invited_by")
            REFERENCES "auth"."users"("id") ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'organization_invitations_accepted_by_fkey'
          AND "conrelid" = '"public"."organization_invitations"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."organization_invitations"
            ADD CONSTRAINT "organization_invitations_accepted_by_fkey"
            FOREIGN KEY ("accepted_by")
            REFERENCES "auth"."users"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- One live invitation per (org, email). Partial: once accepted, the row is
-- history and must not block a future re-invite.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_organization_invitations_pending_unique"
    ON "public"."organization_invitations" ("organization_id", "email")
    WHERE "accepted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_organization_invitations_email"
    ON "public"."organization_invitations" USING "btree" ("email")
    WHERE "accepted_at" IS NULL;


-- ---------------------------------------------------------------------------
-- 4. NULLABLE organization_id on the two existing tables
--
--    EXISTING-TABLE CHANGES — the only two in this stage:
--      public.projects         + organization_id uuid NULL
--      public.project_members  + organization_id uuid NULL
--
--    NULL for now. Stage 2 backfills, Stage 3 makes them NOT NULL and adds
--    the composite FKs that make a cross-firm row impossible.
--
--    The plain FK to organizations is added HERE (it is safe against NULLs)
--    so that even mid-migration an organization_id cannot point at a
--    nonexistent firm.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."projects"
    ADD COLUMN IF NOT EXISTS "organization_id" "uuid";

COMMENT ON COLUMN "public"."projects"."organization_id" IS
  'Owning firm. NULLABLE during migration only; NOT NULL from Stage 3.';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'projects_organization_id_fkey'
          AND "conrelid" = '"public"."projects"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."projects"
            ADD CONSTRAINT "projects_organization_id_fkey"
            FOREIGN KEY ("organization_id")
            REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_projects_organization_id"
    ON "public"."projects" USING "btree" ("organization_id");

ALTER TABLE "public"."project_members"
    ADD COLUMN IF NOT EXISTS "organization_id" "uuid";

COMMENT ON COLUMN "public"."project_members"."organization_id" IS
  'Denormalized from the project. Exists solely to carry the Stage 3 composite FKs that make cross-firm membership structurally impossible.';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'project_members_organization_id_fkey'
          AND "conrelid" = '"public"."project_members"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."project_members"
            ADD CONSTRAINT "project_members_organization_id_fkey"
            FOREIGN KEY ("organization_id")
            REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_project_members_organization_id"
    ON "public"."project_members" USING "btree" ("organization_id");


-- ---------------------------------------------------------------------------
-- 5. RLS on the three new tables
--
--    Enabled NOW, not in Stage 4. These tables are empty today, so there is
--    no behaviour to preserve — and a new table with RLS disabled is a table
--    that leaks the moment Stage 2 inserts into it.
--
--    THE HELPERS ARE MANDATORY, NOT STYLISTIC. The first draft of this stage
--    wrote the roster policy as an inline EXISTS against organization_members
--    — which is a policy ON organization_members that QUERIES
--    organization_members. Postgres re-applies the policy to that inner read
--    and fails with:
--
--        ERROR: infinite recursion detected in policy for relation
--               "organization_members"
--
--    A SECURITY DEFINER function is the standard break in that loop: it runs
--    as its owner and is therefore not subject to the policy it is being used
--    to evaluate. Both helpers are introduced here rather than in Stage 4
--    because Stage 1's own policies cannot be written without them.
--
--    Both are STABLE with search_path pinned, matching is_project_member() /
--    has_project_role(). Stage 4 reuses them unchanged.
--
--    Note there is no INSERT/UPDATE/DELETE policy for `authenticated` on any
--    of the three. Membership changes go through the edge function on the
--    service role (which bypasses RLS) after an explicit firm-admin check.
--    A user therefore cannot add themselves to a firm, which is the point.
-- ---------------------------------------------------------------------------
-- The caller's firm, or NULL if they belong to none. SECURITY DEFINER so it
-- can read organization_members from inside a policy ON organization_members.
CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT "organization_id" FROM "public"."organization_members"
  WHERE "user_id" = "auth"."uid"();
$$;

ALTER FUNCTION "public"."current_org_id"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."current_org_id"() IS
  'The caller''s firm. Single-valued because organization_members has UNIQUE(user_id). SECURITY DEFINER to avoid RLS recursion.';

-- Firm-admin test, scoped to a specific firm. Never a global admin: the
-- p_org_id argument is what stops this becoming the cross-firm superuser that
-- is_admin() is today.
CREATE OR REPLACE FUNCTION "public"."is_org_admin"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."organization_members"
    WHERE "user_id" = "auth"."uid"()
      AND "organization_id" = "p_org_id"
      AND "org_role" = 'admin'
  );
$$;

ALTER FUNCTION "public"."is_org_admin"("p_org_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") IS
  'Firm-scoped admin check. Deliberately takes an org id — there is no global admin in this model.';

GRANT ALL ON FUNCTION "public"."current_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "service_role";

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;

-- You can see your own firm, and only your own.
DROP POLICY IF EXISTS "Members can view their organization" ON "public"."organizations";
CREATE POLICY "Members can view their organization"
    ON "public"."organizations" FOR SELECT
    USING ("id" = "public"."current_org_id"());

-- Firm-wide directory visibility (approved decision): every member can see
-- the roster of their own firm, and no other.
DROP POLICY IF EXISTS "Members can view their organization roster" ON "public"."organization_members";
CREATE POLICY "Members can view their organization roster"
    ON "public"."organization_members" FOR SELECT
    USING ("organization_id" = "public"."current_org_id"());

-- Only firm admins can read pending invitations, and only their firm's.
-- Ordinary members must not be able to enumerate who is being recruited.
DROP POLICY IF EXISTS "Org admins can view their invitations" ON "public"."organization_invitations";
CREATE POLICY "Org admins can view their invitations"
    ON "public"."organization_invitations" FOR SELECT
    USING ("public"."is_org_admin"("organization_id"));


-- ---------------------------------------------------------------------------
-- 6. Grants — matching the pattern already used by every other public table
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";

GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";

GRANT ALL ON TABLE "public"."organization_invitations" TO "anon";
GRANT ALL ON TABLE "public"."organization_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitations" TO "service_role";


-- ---------------------------------------------------------------------------
-- 7. updated_at trigger for organizations, reusing the existing function
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "set_updated_at_organizations" ON "public"."organizations";
CREATE OR REPLACE TRIGGER "set_updated_at_organizations"
    BEFORE UPDATE ON "public"."organizations"
    FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

COMMIT;


-- ============================================================================
-- VERIFICATION (run after; all should report OK)
-- ============================================================================
-- SELECT 'tables', count(*) = 3 AS ok FROM pg_tables
--   WHERE schemaname='public'
--     AND tablename IN ('organizations','organization_members','organization_invitations');
--
-- SELECT 'rls', bool_and(rowsecurity) AS ok FROM pg_tables
--   WHERE schemaname='public'
--     AND tablename IN ('organizations','organization_members','organization_invitations');
--
-- SELECT 'new columns', count(*) = 2 AS ok FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='organization_id'
--     AND table_name IN ('projects','project_members');
--
-- SELECT 'still nullable', bool_and(is_nullable='YES') AS ok FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='organization_id'
--     AND table_name IN ('projects','project_members');
--
-- SELECT 'no data touched', count(*) AS projects_with_org FROM public.projects
--   WHERE organization_id IS NOT NULL;   -- expect 0
--
-- ============================================================================
-- ROLLBACK (Stage 1 only, before Stage 2 runs)
-- ============================================================================
-- BEGIN;
--   ALTER TABLE public.project_members DROP COLUMN IF EXISTS organization_id;
--   ALTER TABLE public.projects        DROP COLUMN IF EXISTS organization_id;
--   DROP TABLE IF EXISTS public.organization_invitations;
--   DROP TABLE IF EXISTS public.organization_members;
--   DROP TABLE IF EXISTS public.organizations;
-- COMMIT;
-- ============================================================================
