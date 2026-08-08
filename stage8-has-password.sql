-- ============================================================================
-- STAGE 8 — "Has this account ever had a password set?"
-- ============================================================================
--
-- ADDS ONE FUNCTION. No table, column, constraint or policy changes.
--
-- WHY
--   The re-issue-recovery-link route must refuse to mint a password link for
--   anyone who already has working credentials — that is what stops a firm
--   admin from silently taking over a colleague's account. It was gating on
--   `last_sign_in_at IS NULL` as a stand-in for "never activated", because the
--   Supabase admin API exposes NOTHING about passwords: the User object it
--   returns carries invited_at, recovery_sent_at, confirmed_at and
--   last_sign_in_at, and no password field of any kind.
--
--   That proxy is wrong, and it broke in production. GoTrue's /auth/v1/verify
--   endpoint validates a recovery token, ISSUES A SESSION, and stamps
--   last_sign_in_at — and only then redirects. So a provisioned user who
--   clicked a link whose redirect was broken had last_sign_in_at set while
--   still having no password at all. The gate then refused to help them: an
--   account that could never be activated and could never be re-issued a link.
--
--   This function reads the actual fact instead.
--
-- WHAT IT DOES NOT EXPOSE
--   A boolean. Never the hash, never the algorithm, never its length. The
--   comparison happens inside the function body and only its result crosses
--   the boundary — enforced by the return type, not by convention.
--
-- FAIL-CLOSED
--   An unknown user id returns TRUE ("has a password"), so the caller refuses.
--   The safe direction here is to decline to mint a link, never to mint one.
--
-- IDEMPOTENT — CREATE OR REPLACE; safe to re-run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION "public"."auth_user_has_password"("p_user_id" "uuid")
RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(
    (
      -- Passwordless accounts (admin.createUser with no password, or an
      -- invite that was never completed) carry NULL or ''. Both must read as
      -- "no password".
      SELECT coalesce(u."encrypted_password", '') <> ''
      FROM "auth"."users" u
      WHERE u."id" = p_user_id
    ),
    -- No such user → fail closed.
    true
  );
$$;

ALTER FUNCTION "public"."auth_user_has_password"("p_user_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."auth_user_has_password"("p_user_id" "uuid") IS
  'True when the account has a password set. Returns a boolean only — never the hash. Used by the firm-admin recovery-link route to refuse minting a link for an account with working credentials. Fails closed (true) for an unknown id. EXECUTE granted to service_role only.';

-- ---------------------------------------------------------------------------
-- GRANTS — service_role only.
--
-- p_user_id is a parameter, so a PostgREST RPC from the browser could
-- otherwise probe any account. Even a boolean is worth withholding: it would
-- reveal which addresses have completed activation. Same reasoning as
-- claim_organization_invitation() (Stage 6) and remove_organization_member()
-- (Stage 7).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."auth_user_has_password"("p_user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."auth_user_has_password"("p_user_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."auth_user_has_password"("p_user_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."auth_user_has_password"("p_user_id" "uuid") TO "service_role";


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_acl text; v_ret text;
BEGIN
    IF to_regprocedure('public.auth_user_has_password(uuid)') IS NULL THEN
        RAISE EXCEPTION 'auth_user_has_password() was not created';
    END IF;

    -- The return type IS the containment guarantee. Assert it, so a later
    -- edit that widens it to a record or text fails here instead of quietly
    -- shipping a password hash to the caller.
    SELECT pg_get_function_result(p.oid) INTO v_ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_user_has_password';

    IF v_ret <> 'boolean' THEN
        RAISE EXCEPTION 'auth_user_has_password() must return boolean, got %', v_ret;
    END IF;

    SELECT coalesce(array_to_string(p.proacl, ','), '') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_user_has_password';

    IF v_acl LIKE '%authenticated=%' OR v_acl LIKE '%anon=%' THEN
        RAISE EXCEPTION 'auth_user_has_password() is executable by anon/authenticated — refusing: %', v_acl;
    END IF;

    IF v_acl NOT LIKE '%service_role=%' THEN
        RAISE EXCEPTION 'service_role cannot execute auth_user_has_password() — the edge function would break';
    END IF;

    RAISE NOTICE 'Stage 8 OK — auth_user_has_password() created, returns boolean, service_role only';
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT proname, pg_get_function_result(oid), proacl
--   FROM pg_proc WHERE proname = 'auth_user_has_password';
--   -- expect: boolean, and proacl listing postgres + service_role only
--
-- Diagnose the limbo account (should show has_password = false with
-- last_sign_in_at SET — the exact state the old gate mis-read):
--
-- SELECT email,
--        (coalesce(encrypted_password,'') <> '') AS has_password,
--        email_confirmed_at, last_sign_in_at, invited_at, recovery_sent_at
--   FROM auth.users WHERE email = 'the-address@example.com';
-- ============================================================================
