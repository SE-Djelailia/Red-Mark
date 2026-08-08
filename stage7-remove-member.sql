-- ============================================================================
-- STAGE 7 — Removing someone from a firm, as one atomic revoke
-- ============================================================================
--
-- ADDS ONE FUNCTION. No table, column, constraint or policy changes.
--
-- WHY A DATABASE FUNCTION
--   Removing a person is now two deletes that must both happen or neither:
--   their project_members rows across the firm, then their organization_members
--   row. supabase-js cannot open a transaction, so doing this from the edge
--   function would leave a window where a crash strips someone's project
--   access while leaving them in the firm — access silently gone, with nothing
--   to show it happened.
--
--   The order is forced by the schema: project_members_user_org_fkey is
--   ON DELETE RESTRICT, so the firm membership CANNOT be deleted first. That
--   RESTRICT is still doing its job here — it is what guarantees this function
--   is the only way the two can come apart.
--
-- WHY THE GUARDS ARE REPEATED HERE
--   The edge function already checks admin / own-firm / last-admin / self.
--   They are re-checked inside this transaction anyway, because the edge
--   function's checks are separate round trips and therefore racy: two admins
--   removing each other simultaneously would both pass a check-then-act done
--   outside a transaction and leave the firm with zero administrators — an
--   unadministrable firm, since promoting anyone requires an admin.
--
--   The FOR UPDATE lock on the admin rows below is what actually prevents
--   that. It is not belt-and-braces; it is the only correct place for it.
--
-- WHAT THIS DOES NOT DO
--   It does not delete the auth account. The person keeps a login that belongs
--   to no firm and can therefore reach nothing — FirmGate shows them the
--   "you're not in a firm" screen. Deleting the identity itself is a separate
--   decision (and a separate destructive action) and is deliberately not
--   bundled into "revoke access".
--
-- IDEMPOTENT — CREATE OR REPLACE; safe to re-run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION "public"."remove_organization_member"(
    "p_org_id"   "uuid",
    "p_user_id"  "uuid",
    "p_actor_id" "uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_role     text;
    v_admins   int;
    v_projects int;
BEGIN
    -- -----------------------------------------------------------------------
    -- 1. Self-removal. An admin removing themselves is almost always a
    --    mistake, and if they are the only admin it strands the firm.
    -- -----------------------------------------------------------------------
    IF p_user_id = p_actor_id THEN
        RETURN jsonb_build_object('status', 'self_removal');
    END IF;

    -- -----------------------------------------------------------------------
    -- 2. The target must be in THIS firm. Scoped by organization_id, so a
    --    caller naming someone in another firm gets 'not_found' — the same
    --    answer as a nonexistent user, with no cross-firm membership oracle.
    --
    --    FOR UPDATE also pins the row for the rest of the transaction.
    -- -----------------------------------------------------------------------
    SELECT "org_role" INTO v_role
    FROM "public"."organization_members"
    WHERE "organization_id" = p_org_id AND "user_id" = p_user_id
    FOR UPDATE;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    -- -----------------------------------------------------------------------
    -- 3. The actor must be an admin OF THIS FIRM. Re-derived from the same
    --    table rather than trusted from the caller.
    -- -----------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM "public"."organization_members"
        WHERE "organization_id" = p_org_id
          AND "user_id" = p_actor_id
          AND "org_role" = 'admin'
    ) THEN
        RETURN jsonb_build_object('status', 'not_admin');
    END IF;

    -- -----------------------------------------------------------------------
    -- 4. Last-admin guard, inside the lock.
    --
    --    THE LOCK IS THE LOAD-BEARING PART, NOT THE COUNT. PERFORM ... FOR
    --    UPDATE locks every admin row of this firm. Two admins removing each
    --    other simultaneously therefore serialize here: the second transaction
    --    blocks, and by the time it proceeds it sees post-commit state instead
    --    of its own stale snapshot. Sandbox-verified — one backend observed
    --    waiting on a lock, and the firm ended with an administrator.
    --
    --    The `v_admins <= 1` branch below is, on inspection, unreachable in
    --    practice: reaching it requires an admin target and an admin actor who
    --    are different people, which already implies two admin rows — and if
    --    the actor's own row was deleted concurrently, check 3 above rejects
    --    with 'not_admin' first. That is exactly what the concurrent test
    --    observed. It is kept as defence in depth: it costs one count, and it
    --    means reordering the checks above cannot silently strand a firm.
    --
    --    (Written as PERFORM-then-count because FOR UPDATE cannot be combined
    --    with an aggregate in a single statement.)
    -- -----------------------------------------------------------------------
    IF v_role = 'admin' THEN
        PERFORM 1 FROM "public"."organization_members"
         WHERE "organization_id" = p_org_id AND "org_role" = 'admin'
         FOR UPDATE;

        SELECT count(*) INTO v_admins
        FROM "public"."organization_members"
        WHERE "organization_id" = p_org_id AND "org_role" = 'admin';

        IF v_admins <= 1 THEN
            RETURN jsonb_build_object('status', 'last_admin');
        END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- 5. The revoke itself. Project access first — the RESTRICT foreign key
    --    would reject the reverse order, which is precisely the property that
    --    makes a half-finished removal impossible.
    --
    --    Scoped by organization_id as well as user_id. Redundant given
    --    UNIQUE(user_id) and the composite FKs (a person's project_members
    --    rows can only ever belong to their one firm), but this is the
    --    statement that deletes another user's data, so it names the firm
    --    explicitly rather than relying on an invariant proved elsewhere.
    -- -----------------------------------------------------------------------
    DELETE FROM "public"."project_members"
     WHERE "user_id" = p_user_id
       AND "organization_id" = p_org_id;
    GET DIAGNOSTICS v_projects = ROW_COUNT;

    DELETE FROM "public"."organization_members"
     WHERE "organization_id" = p_org_id AND "user_id" = p_user_id;

    RETURN jsonb_build_object(
        'status',           'removed',
        'projects_removed', v_projects
    );
END;
$$;

ALTER FUNCTION "public"."remove_organization_member"("p_org_id" "uuid", "p_user_id" "uuid", "p_actor_id" "uuid")
    OWNER TO "postgres";

COMMENT ON FUNCTION "public"."remove_organization_member"("p_org_id" "uuid", "p_user_id" "uuid", "p_actor_id" "uuid") IS
  'Atomically revokes a person''s firm and project access. Project rows first (project_members_user_org_fkey is RESTRICT), then the membership. Re-checks admin/own-firm/last-admin/self inside the transaction. Does NOT delete the auth account. EXECUTE granted to service_role only.';

-- ---------------------------------------------------------------------------
-- GRANTS — service_role only.
--
-- p_actor_id is a parameter, so a PostgREST RPC from the browser could
-- otherwise claim to be an admin. Same reasoning as
-- claim_organization_invitation() in Stage 6.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."remove_organization_member"("p_org_id" "uuid", "p_user_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."remove_organization_member"("p_org_id" "uuid", "p_user_id" "uuid", "p_actor_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."remove_organization_member"("p_org_id" "uuid", "p_user_id" "uuid", "p_actor_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."remove_organization_member"("p_org_id" "uuid", "p_user_id" "uuid", "p_actor_id" "uuid") TO "service_role";


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_acl text;
BEGIN
    IF to_regprocedure('public.remove_organization_member(uuid, uuid, uuid)') IS NULL THEN
        RAISE EXCEPTION 'remove_organization_member() was not created';
    END IF;

    SELECT coalesce(array_to_string(proacl, ','), '') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'remove_organization_member';

    IF v_acl LIKE '%authenticated=%' OR v_acl LIKE '%anon=%' THEN
        RAISE EXCEPTION 'remove_organization_member() is executable by anon/authenticated — refusing: %', v_acl;
    END IF;

    IF v_acl NOT LIKE '%service_role=%' THEN
        RAISE EXCEPTION 'service_role cannot execute remove_organization_member() — the edge function would break';
    END IF;

    RAISE NOTICE 'Stage 7 OK — remove_organization_member() created, service_role only';
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT proname, pg_get_function_identity_arguments(oid), proacl
--   FROM pg_proc WHERE proname = 'remove_organization_member';
--   -- expect proacl to list postgres and service_role, NOT anon/authenticated
-- ============================================================================
