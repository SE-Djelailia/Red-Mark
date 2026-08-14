-- ============================================================================
-- STAGE 11 — public.platform_create_organization()
-- ============================================================================
--
-- Creates a firm and installs its first admin, atomically.
--
-- Requires Stage 10 (public.platform_operators).
--
--
-- WHY A FUNCTION AT ALL
--
--   supabase-js cannot open a transaction. Creating a firm is two writes —
--   the organizations row and its first organization_members row — and a firm
--   that exists with no admin is a firm nobody can ever get into, repairable
--   only by hand in psql. So the pair has to be one statement, which means a
--   SECURITY DEFINER function called by RPC. Same reasoning as Stage 6 and
--   Stage 7.
--
--
-- WHERE ATOMICITY HONESTLY STOPS
--
--   Creating the admin's auth account is a GoTrue API call and cannot join a
--   Postgres transaction. So the edge route resolves p_admin_user_id FIRST
--   (admin.createUser for a new address, or the existing firm-less account for
--   an address already known) and only then calls this function.
--
--   If this function then fails, what is left behind is an auth account that
--   belongs to no firm. That is the same benign, recoverable state the
--   existing provisioning flow can already produce: re-running the creation
--   with the same email finds the account instead of making a second one.
--
--   So the atomic unit here is FIRM + ITS FIRST ADMIN'S MEMBERSHIP, with an
--   idempotent-by-email account step in front of it. Stating that plainly is
--   better than implying an end-to-end atomicity that is not achievable.
--
--
-- SECURITY
--
--   1. EXECUTE is service_role only. This function takes an actor id as a
--      PARAMETER, so if `authenticated` could execute it, any browser could
--      call it through PostgREST with p_actor_id set to a real operator's uuid
--      and create firms at will. Postgres grants EXECUTE to PUBLIC by default
--      and this database additionally runs ALTER DEFAULT PRIVILEGES ... GRANT
--      ALL ON FUNCTIONS TO anon, authenticated — so the REVOKE below is the
--      only thing standing between the browser and this function. It is
--      asserted in the post-conditions, not assumed. Same rule as Stage 6/7/8.
--
--   2. The actor is re-checked HERE, against platform_operators, even though
--      the edge route has already checked. The route is the door; this is the
--      lock. A future route, or a future maintainer calling this by hand,
--      cannot borrow the capability without being an operator.
--
--   3. The check is an INLINE EXISTS. There is deliberately no
--      is_platform_operator() function — see Stage 10 for why. This is one of
--      exactly two places in the system that reads platform_operators.
--
--   4. THE ACTOR IS NEVER INSERTED INTO organization_members. An operator
--      creates firms and joins none. The only trace they leave is
--      invited_by — provenance, not membership. Because organization_members
--      is what every data policy resolves through, this single omission is
--      what keeps "created every firm" from meaning "can read every firm".
--
--
-- IDEMPOTENT — CREATE OR REPLACE. Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDITION — Stage 10 must be applied.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "information_schema"."tables"
        WHERE "table_schema" = 'public' AND "table_name" = 'platform_operators'
    ) THEN
        RAISE EXCEPTION 'Stage 10 (public.platform_operators) must be applied first';
    END IF;
END $$;


CREATE OR REPLACE FUNCTION "public"."platform_create_organization"(
    "p_name" "text",
    "p_slug" "text",
    "p_report_firm_name" "text",
    "p_admin_user_id" "uuid",
    "p_actor_id" "uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_org        public.organizations;
    v_name       text := btrim(coalesce(p_name, ''));
    v_slug       text := lower(btrim(coalesce(p_slug, '')));
    v_report     text := nullif(btrim(coalesce(p_report_firm_name, '')), '');
    v_constraint text;
BEGIN
    -- 1. ACTOR MUST BE A PLATFORM OPERATOR.
    --    Inline EXISTS by design; there is no accessor function (Stage 10).
    IF p_actor_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.platform_operators WHERE user_id = p_actor_id
    ) THEN
        RETURN jsonb_build_object('status', 'not_operator');
    END IF;

    -- 2. TARGET ADMIN MUST BE A REAL ACCOUNT.
    --    Checked against auth.users rather than profiles: profiles is
    --    populated by a trigger, and a race there must not be able to make a
    --    firm with a dangling admin.
    IF p_admin_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM auth.users WHERE id = p_admin_user_id
    ) THEN
        RETURN jsonb_build_object('status', 'no_user');
    END IF;

    -- 3. SHAPE OF THE FIRM.
    --    Validated here rather than relying on the CHECK constraints, so the
    --    caller gets a named status instead of a constraint-violation
    --    exception it would have to parse.
    IF v_name = '' THEN
        RETURN jsonb_build_object('status', 'invalid_name');
    END IF;

    IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN
        RETURN jsonb_build_object('status', 'invalid_slug');
    END IF;

    -- 4. ONE FIRM PER USER.
    --    organization_members.UNIQUE(user_id) enforces this regardless; the
    --    check is here to return a status a human can act on rather than a
    --    23505. The subtransaction below still catches the concurrent case.
    IF EXISTS (
        SELECT 1 FROM public.organization_members WHERE user_id = p_admin_user_id
    ) THEN
        RETURN jsonb_build_object('status', 'already_in_firm');
    END IF;

    -- 5. THE ATOMIC PAIR.
    --
    --    Both inserts sit inside ONE subtransaction. If either raises, the
    --    handler rolls BOTH back — so a firm can never exist without the admin
    --    row that makes it reachable, and the caller still gets a clean status
    --    rather than a fatal error.
    --
    --    CONSTRAINT_NAME disambiguates the two unique violations that can
    --    legitimately race here: a slug taken between the caller's
    --    availability check and now, and the target being placed in some firm
    --    concurrently.
    BEGIN
        INSERT INTO public.organizations (name, slug, report_firm_name)
        VALUES (v_name, v_slug, v_report)
        RETURNING * INTO v_org;

        -- invited_by = the operator. PROVENANCE, NOT MEMBERSHIP: this is the
        -- only row in the database that records the operator's involvement,
        -- and it grants nothing, because no policy reads invited_by.
        INSERT INTO public.organization_members (organization_id, user_id, org_role, invited_by)
        VALUES (v_org.id, p_admin_user_id, 'admin', p_actor_id);

    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'organizations_slug_key' THEN
            RETURN jsonb_build_object('status', 'slug_taken');
        END IF;
        RETURN jsonb_build_object('status', 'already_in_firm');
    END;

    -- NOTE WHAT IS ABSENT: no second INSERT placing p_actor_id in the firm.
    -- The operator created it and is not in it.

    RETURN jsonb_build_object(
        'status',       'created',
        'organization', jsonb_build_object(
            'id',                v_org.id,
            'name',              v_org.name,
            'slug',              v_org.slug,
            'report_firm_name',  v_org.report_firm_name,
            'created_at',        v_org.created_at
        ),
        'admin_user_id', p_admin_user_id
    );
END;
$$;


ALTER FUNCTION "public"."platform_create_organization"("text", "text", "text", "uuid", "uuid")
    OWNER TO "postgres";

COMMENT ON FUNCTION "public"."platform_create_organization"("text", "text", "text", "uuid", "uuid") IS
  'Creates a firm and its first admin in one transaction. service_role only: it takes an actor id as a parameter, so browser EXECUTE would let anyone forge an operator identity. Never inserts the actor into the firm — an operator creates firms and joins none.';


-- ---------------------------------------------------------------------------
-- EXECUTE — service_role only.
--
-- Both REVOKEs are required: Postgres grants EXECUTE to PUBLIC on every new
-- function, and this database additionally has ALTER DEFAULT PRIVILEGES
-- granting ALL ON FUNCTIONS to anon and authenticated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."platform_create_organization"("text", "text", "text", "uuid", "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."platform_create_organization"("text", "text", "text", "uuid", "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."platform_create_organization"("text", "text", "text", "uuid", "uuid") FROM "authenticated";

GRANT EXECUTE ON FUNCTION "public"."platform_create_organization"("text", "text", "text", "uuid", "uuid") TO "service_role";


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_oid   "oid";
    v_acl   "text";
    n       int;
BEGIN
    SELECT p."oid" INTO v_oid
    FROM "pg_proc" p
    JOIN "pg_namespace" ns ON ns."oid" = p."pronamespace"
    WHERE ns."nspname" = 'public' AND p."proname" = 'platform_create_organization';

    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'platform_create_organization was not created';
    END IF;

    -- Must be SECURITY DEFINER, or the inline EXISTS against platform_operators
    -- would run as the caller, who has no grant on that table.
    IF NOT (SELECT p."prosecdef" FROM "pg_proc" p WHERE p."oid" = v_oid) THEN
        RAISE EXCEPTION 'platform_create_organization must be SECURITY DEFINER';
    END IF;

    -- The whole security argument for this function rests on this ACL.
    SELECT coalesce("proacl"::"text", '') INTO v_acl FROM "pg_proc" WHERE "oid" = v_oid;

    IF v_acl = '' THEN
        RAISE EXCEPTION 'platform_create_organization has a default ACL — EXECUTE is open to PUBLIC';
    END IF;

    -- has_function_privilege resolves PUBLIC grants and role inheritance too,
    -- so it is the authoritative check; v_acl is carried only for the message.
    IF "has_function_privilege"('anon', v_oid, 'EXECUTE')
       OR "has_function_privilege"('authenticated', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'platform_create_organization must NOT be executable by anon or authenticated (acl: %)', v_acl;
    END IF;

    IF NOT "has_function_privilege"('service_role', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must be able to execute platform_create_organization';
    END IF;

    -- Stage 10's tripwire, re-asserted: adding this function must not have
    -- been an occasion for platform_operators to appear in a policy.
    SELECT count(*) INTO n
    FROM "pg_policies"
    WHERE coalesce("qual"::"text", '') LIKE '%platform_operators%'
       OR coalesce("with_check"::"text", '') LIKE '%platform_operators%';

    IF n <> 0 THEN
        RAISE EXCEPTION 'TRIPWIRE: % RLS polic(ies) now reference platform_operators', n;
    END IF;

    -- And no accessor function crept in alongside this one.
    SELECT count(*) INTO n
    FROM "pg_proc" p
    JOIN "pg_namespace" ns ON ns."oid" = p."pronamespace"
    WHERE ns."nspname" = 'public'
      AND p."proname" ILIKE '%is_platform_operator%';

    IF n <> 0 THEN
        RAISE EXCEPTION 'TRIPWIRE: an is_platform_operator() accessor exists; the predicate is deliberately absent';
    END IF;

    RAISE NOTICE 'Stage 11 OK — platform_create_organization created; SECURITY DEFINER; EXECUTE service_role only; tripwire clean';
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT p.proname,
--        p.prosecdef                       AS security_definer,
--        pg_get_function_result(p.oid)     AS returns,
--        p.proacl                          AS acl
--   FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
--  WHERE ns.nspname='public' AND p.proname='platform_create_organization';
--
-- -- Must be FALSE, FALSE, TRUE:
-- SELECT has_function_privilege('anon',          'public.platform_create_organization(text,text,text,uuid,uuid)', 'EXECUTE'),
--        has_function_privilege('authenticated', 'public.platform_create_organization(text,text,text,uuid,uuid)', 'EXECUTE'),
--        has_function_privilege('service_role',  'public.platform_create_organization(text,text,text,uuid,uuid)', 'EXECUTE');
-- ============================================================================
