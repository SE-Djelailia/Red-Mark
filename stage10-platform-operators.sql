-- ============================================================================
-- STAGE 10 — public.platform_operators
-- ============================================================================
--
-- Introduces a tier ABOVE firms: an operator who can create a firm and
-- designate its first admin, and who must NEVER be able to read one byte of
-- any firm's data.
--
-- This is the concept Stage 5 deleted. The old `is_admin()` was a breach
-- vector, so the shape of this one is chosen specifically to make it unable to
-- become the same thing.
--
--
-- WHY THE ISOLATION IS NOT IMPLEMENTED HERE
--
--   Nothing in this file touches a data table. No policy, no grant, no helper
--   function is added to projects, site_visits, photos, observations, issues,
--   reports, comments, plans, or storage.objects.
--
--   It does not need to. Every data policy in this schema resolves through
--   current_org_id(), is_project_member() or has_project_role(), and all three
--   are already false for a user who belongs to no firm:
--
--     current_org_id()      → NULL   (no organization_members row)
--     `organization_id = NULL`       → NULL, which is not TRUE, so the policy
--                                      denies
--     is_project_member()   → false  (no project_members row)
--     has_project_role()    → false  (same)
--
--   A platform operator is a member of no firm. To every data table in this
--   database they are an ordinary firm-less stranger — a case the Stage 1–5
--   model already handles. Their isolation is INHERITED, not implemented,
--   which is why it can be proven by observation (select from every table and
--   count zero) rather than by trusting new code to be correct.
--
--   The corollary is the rule for everyone who touches this schema later:
--   granting an operator data access is not a matter of forgetting to deny it.
--   It requires somebody to actively ADD something. See the tripwire below.
--
--
-- WHY A TABLE AND DELIBERATELY NO is_platform_operator() FUNCTION
--
--   The old is_admin() was dangerous less because of what it read than because
--   of what it WAS: a callable boolean predicate sitting in the public schema.
--   Once such a function exists, `OR is_admin()` is one paste away from any
--   policy and reads as harmless in review. That is how it reached 19 of them.
--
--   So the predicate is not created. Callers test membership with an inline
--   EXISTS against this table, and there are exactly two of them: the edge
--   function (service role) and platform_create_organization() in Stage 11.
--
--   A future author who wants the backdoor cannot paste a tidy function call.
--   They have to write `EXISTS (SELECT 1 FROM public.platform_operators ...)`
--   into a policy body, which is conspicuous in a diff, greppable, and caught
--   by the post-condition at the bottom of this file.
--
--
-- WHY NOTHING WRITES THIS TABLE
--
--   There is no route, no RPC, and no UI that inserts here. Rows are added by
--   hand at a psql prompt (see GRANTING below).
--
--   This is stronger than "the grant route checks that the caller is already
--   an operator". A firm admin cannot escalate to platform operator because
--   there is no code path that writes this table at all — no endpoint to
--   attack, no parameter to forge, no check to get wrong. The ceremony of
--   opening psql is the point, not an inconvenience.
--
--
-- IDEMPOTENT — safe to re-run. The post-conditions are re-runnable on their
-- own and are worth re-running after ANY future policy change.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."platform_operators" (
    "user_id" "uuid" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."platform_operators" OWNER TO "postgres";

COMMENT ON TABLE "public"."platform_operators" IS
  'Allowlist of platform operators: may create firms and designate their first admin, and NOTHING else. Deliberately has no accessor function and no writer — rows are inserted by hand in psql. Must never be referenced by an RLS policy; see the tripwire in stage10.';

COMMENT ON COLUMN "public"."platform_operators"."note" IS
  'Who this is and why they were granted the tier. Free text, for the audit trail — a bare uuid in an allowlist is unreviewable a year later.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'platform_operators_pkey'
          AND "conrelid" = '"public"."platform_operators"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."platform_operators"
            ADD CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("user_id");
    END IF;

    -- ON DELETE CASCADE: deleting the account revokes the tier. There must be
    -- no way for an operator row to outlive the user it names and later be
    -- re-attached to a recycled uuid.
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conname" = 'platform_operators_user_id_fkey'
          AND "conrelid" = '"public"."platform_operators"'::"regclass"
    ) THEN
        ALTER TABLE ONLY "public"."platform_operators"
            ADD CONSTRAINT "platform_operators_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- LOCKDOWN — two independent denials
--
-- 1. RLS enabled with ZERO POLICIES. Under RLS, absent a permissive policy,
--    every row is invisible and every write refused. An operator cannot read
--    even their OWN row from the browser: there is no "read your own" policy,
--    on purpose. Nothing in the client ever needs to know; the edge function
--    decides and the client only ever sees the 403 or the data.
--
-- 2. Explicit REVOKE from anon and authenticated.
--
-- The REVOKE is NOT redundant belt-and-braces. This database runs
--    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--      GRANT ALL ON TABLES TO anon, authenticated, service_role;
-- so the CREATE TABLE above has ALREADY handed anon and authenticated full
-- privileges on this table. Without this REVOKE the only thing standing
-- between a browser and this allowlist would be the RLS default — one
-- accidental `CREATE POLICY ... USING (true)` away from being readable.
--
-- With both in place, a policy added by mistake still hits a missing grant,
-- and a grant added by mistake still hits RLS with no policy.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."platform_operators" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."platform_operators" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."platform_operators" FROM "anon";
REVOKE ALL ON TABLE "public"."platform_operators" FROM "authenticated";

-- service_role only, and only SELECT. The edge function reads this table to
-- authorize; it never writes it. INSERT/UPDATE/DELETE are withheld so that a
-- compromised service-role key cannot mint a new operator either — that still
-- requires a superuser at a psql prompt.
GRANT SELECT ON TABLE "public"."platform_operators" TO "service_role";


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    n int;
BEGIN
    -- P7a — the anti-backdoor tripwire.
    --
    -- THIS IS THE CHECK THAT MATTERS MOST IN THIS FILE, and the one thing
    -- is_admin() never had. It asserts that no RLS policy anywhere in the
    -- database mentions platform_operators — i.e. that the operator tier has
    -- not leaked into a data policy as `OR EXISTS (SELECT 1 FROM
    -- public.platform_operators ...)`.
    --
    -- Re-run this block after ANY policy change. It is cheap, and it turns
    -- "we agreed not to do that" into something the database checks.
    SELECT count(*) INTO n
    FROM "pg_policies"
    WHERE coalesce("qual"::"text", '') LIKE '%platform_operators%'
       OR coalesce("with_check"::"text", '') LIKE '%platform_operators%';

    IF n <> 0 THEN
        RAISE EXCEPTION
            'TRIPWIRE: % RLS polic(ies) reference platform_operators. The operator tier must never appear in a policy — it is not a data-access mechanism.', n;
    END IF;

    -- P7b — no accessor function was created, here or anywhere.
    SELECT count(*) INTO n
    FROM "pg_proc" p
    JOIN "pg_namespace" ns ON ns."oid" = p."pronamespace"
    WHERE ns."nspname" = 'public'
      AND p."proname" ILIKE '%platform_operator%';

    IF n <> 0 THEN
        RAISE EXCEPTION
            'TRIPWIRE: % function(s) named like a platform-operator accessor exist. The predicate is deliberately absent; callers use an inline EXISTS.', n;
    END IF;

    -- P7c — the table itself is unreachable from the browser roles.
    IF "has_table_privilege"('anon', '"public"."platform_operators"', 'SELECT')
       OR "has_table_privilege"('authenticated', '"public"."platform_operators"', 'SELECT') THEN
        RAISE EXCEPTION 'platform_operators must not be SELECT-able by anon or authenticated';
    END IF;

    IF "has_table_privilege"('authenticated', '"public"."platform_operators"', 'INSERT')
       OR "has_table_privilege"('authenticated', '"public"."platform_operators"', 'UPDATE')
       OR "has_table_privilege"('authenticated', '"public"."platform_operators"', 'DELETE') THEN
        RAISE EXCEPTION 'platform_operators must not be writable by authenticated';
    END IF;

    -- P7d — RLS on, and no policy on this table either.
    IF NOT (SELECT "relrowsecurity" FROM "pg_class"
             WHERE "oid" = '"public"."platform_operators"'::"regclass") THEN
        RAISE EXCEPTION 'RLS is not enabled on platform_operators';
    END IF;

    SELECT count(*) INTO n FROM "pg_policies"
    WHERE "schemaname" = 'public' AND "tablename" = 'platform_operators';

    IF n <> 0 THEN
        RAISE EXCEPTION 'platform_operators must have ZERO policies, found %', n;
    END IF;

    -- Nothing was added to any data table.
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND "column_name" IN ('is_platform_operator', 'platform_operator')
    ) THEN
        RAISE EXCEPTION 'A platform-operator flag column leaked onto a table. The tier lives in one allowlist, not on rows.';
    END IF;

    RAISE NOTICE 'Stage 10 OK — platform_operators created; RLS on with zero policies; anon/authenticated revoked; no accessor function; tripwire clean';
END $$;

COMMIT;


-- ============================================================================
-- GRANTING THE TIER (by hand — this is the only way, on purpose)
-- ============================================================================
--
--   INSERT INTO public.platform_operators (user_id, note)
--   SELECT id, 'Salah Eddine Djelailia — founder, platform administration'
--     FROM auth.users WHERE email = 'se.djelailia@example.com';
--
-- Revoking:
--
--   DELETE FROM public.platform_operators WHERE user_id = '...';
--
-- Reviewing who holds it:
--
--   SELECT po.user_id, u.email, po.note, po.created_at
--     FROM public.platform_operators po
--     JOIN auth.users u ON u.id = po.user_id
--    ORDER BY po.created_at;
--
-- Do NOT add the operator to organization_members. An operator who joins a
-- firm gains that firm's data through ordinary membership — which is allowed
-- and safe, but it is a different hat. Keep them separate unless you mean it.
-- ============================================================================


-- ============================================================================
-- RE-RUNNABLE TRIPWIRE (run after any future policy change)
-- ============================================================================
-- SELECT count(*) AS policies_referencing_platform_operators
--   FROM pg_policies
--  WHERE coalesce(qual::text,'')       LIKE '%platform_operators%'
--     OR coalesce(with_check::text,'') LIKE '%platform_operators%';
-- -- MUST BE 0
-- ============================================================================
