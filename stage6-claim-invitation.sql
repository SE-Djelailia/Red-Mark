-- ============================================================================
-- STAGE 6 — The invitation handshake, as one atomic function
-- ============================================================================
--
-- ADDS ONE FUNCTION. No table, column, constraint or policy changes.
--
-- WHY A DATABASE FUNCTION AT ALL
--   Claiming an invitation is two writes that must both happen or neither:
--   stamp the invitation as accepted, and create the organization_members row.
--   supabase-js cannot open a transaction, so doing this from the edge
--   function would leave a window where a crash produces a consumed
--   invitation with no membership (locking the person out permanently) or a
--   membership with a still-pending invitation (claimable twice).
--
-- WHY IT TAKES NO EMAIL
--   The email is the credential in this handshake — it is what proves the
--   claimant is the invitee. So it is never a parameter. This function reads
--   auth.users itself, keyed on the user id, and uses that address and its
--   email_confirmed_at. There is nothing to forge.
--
-- WHY EXECUTE IS RESTRICTED
--   Granted to service_role ONLY (see the bottom of this file). p_user_id
--   would otherwise be forgeable by any authenticated caller via PostgREST
--   RPC. Both defences are deliberate: the restricted grant stops the call,
--   and the auth.users lookup means a widened grant still could not let
--   someone claim an invitation addressed to a mailbox they do not control.
--
-- IDEMPOTENT — CREATE OR REPLACE; safe to re-run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION "public"."claim_organization_invitation"(
    "p_user_id" "uuid",
    "p_token"   "text" DEFAULT NULL
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_email        text;
    v_confirmed_at timestamptz;
    v_existing_org uuid;
    v_n            int;
    v_n_any        int;
    v_inv_id       uuid;
    v_claimed      public.organization_invitations%ROWTYPE;
BEGIN
    -- -----------------------------------------------------------------------
    -- 1. Identity, from auth.users — NEVER from a parameter.
    -- -----------------------------------------------------------------------
    SELECT lower(u.email), u.email_confirmed_at
      INTO v_email, v_confirmed_at
    FROM auth.users u
    WHERE u.id = p_user_id;

    IF v_email IS NULL THEN
        RETURN jsonb_build_object('status', 'no_user');
    END IF;

    -- An unconfirmed address proves nothing. Self-signup lets anyone type a
    -- colleague's address; without this check, doing so would claim that
    -- colleague's pending invitation. This is THE gate of the whole model.
    IF v_confirmed_at IS NULL THEN
        RETURN jsonb_build_object('status', 'email_unverified');
    END IF;

    -- -----------------------------------------------------------------------
    -- 2. Already in a firm? Idempotent success, not an error — the client
    --    calls this on login and must be safe to call twice.
    -- -----------------------------------------------------------------------
    SELECT organization_id INTO v_existing_org
    FROM public.organization_members
    WHERE user_id = p_user_id;

    IF v_existing_org IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_member',
                                  'organization_id', v_existing_org);
    END IF;

    -- -----------------------------------------------------------------------
    -- 3. Find the pending, unexpired invitations for this VERIFIED address.
    --
    --    The token, when supplied, only narrows this set. A verified-email
    --    match is required either way — a token alone can never claim.
    -- -----------------------------------------------------------------------
    SELECT count(*) INTO v_n
    FROM public.organization_invitations i
    WHERE lower(i.email) = v_email
      AND i.accepted_at IS NULL
      AND i.expires_at > now()
      AND (p_token IS NULL OR i.token = p_token);

    IF v_n = 0 THEN
        -- Distinguish "nothing was ever sent to you" from "you waited too
        -- long" / "you already used it", so the UI can say something useful.
        SELECT count(*) INTO v_n_any
        FROM public.organization_invitations i
        WHERE lower(i.email) = v_email
          AND (p_token IS NULL OR i.token = p_token);

        IF v_n_any = 0 THEN
            RETURN jsonb_build_object('status', 'none');
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.organization_invitations i
            WHERE lower(i.email) = v_email
              AND (p_token IS NULL OR i.token = p_token)
              AND i.accepted_at IS NOT NULL
        ) THEN
            RETURN jsonb_build_object('status', 'already_accepted');
        END IF;

        RETURN jsonb_build_object('status', 'expired');
    END IF;

    -- Two firms can each have a pending invitation for the same address: the
    -- partial unique index is per (organization_id, email), not global. Which
    -- one wins would otherwise be arbitrary — and a firm could deliberately
    -- race another's invitation. Refuse and make the caller name one.
    IF v_n > 1 AND p_token IS NULL THEN
        RETURN jsonb_build_object('status', 'ambiguous', 'count', v_n);
    END IF;

    SELECT i.id INTO v_inv_id
    FROM public.organization_invitations i
    WHERE lower(i.email) = v_email
      AND i.accepted_at IS NULL
      AND i.expires_at > now()
      AND (p_token IS NULL OR i.token = p_token)
    ORDER BY i.created_at
    LIMIT 1;

    -- -----------------------------------------------------------------------
    -- 4. Consume the invitation FIRST.
    --
    --    Order matters. `WHERE accepted_at IS NULL` plus the row lock this
    --    UPDATE takes is what serializes two concurrent claims: the second
    --    blocks here, re-evaluates the predicate after the first commits,
    --    matches 0 rows, and bails out below. UNIQUE(user_id) on
    --    organization_members is the second, independent backstop.
    -- -----------------------------------------------------------------------
    UPDATE public.organization_invitations
       SET accepted_at = now(),
           accepted_by = p_user_id
     WHERE id = v_inv_id
       AND accepted_at IS NULL
    RETURNING * INTO v_claimed;

    IF v_claimed.id IS NULL THEN
        RETURN jsonb_build_object('status', 'already_accepted');
    END IF;

    -- -----------------------------------------------------------------------
    -- 5. Create the membership. A unique_violation here means the user was
    --    placed in a firm between step 2 and now; the whole function is one
    --    transaction, so the invitation stamp above rolls back with it and
    --    stays claimable.
    -- -----------------------------------------------------------------------
    BEGIN
        INSERT INTO public.organization_members
            (organization_id, user_id, org_role, invited_by)
        VALUES
            (v_claimed.organization_id, p_user_id, v_claimed.org_role, v_claimed.invited_by);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_IN_FIRM'
            USING ERRCODE = 'raise_exception';
    END;

    RETURN jsonb_build_object(
        'status',          'claimed',
        'organization_id', v_claimed.organization_id,
        'org_role',        v_claimed.org_role
    );
END;
$$;

ALTER FUNCTION "public"."claim_organization_invitation"("p_user_id" "uuid", "p_token" "text")
    OWNER TO "postgres";

COMMENT ON FUNCTION "public"."claim_organization_invitation"("p_user_id" "uuid", "p_token" "text") IS
  'Atomically claims a firm invitation. Reads the email and email_confirmed_at from auth.users — never from a parameter — so a claim always requires control of the invited mailbox. EXECUTE is granted to service_role only.';

-- ---------------------------------------------------------------------------
-- GRANTS — service_role only.
--
-- Every other function in this schema is granted to anon/authenticated/
-- service_role alike. This one must not be: p_user_id is a parameter, and a
-- PostgREST RPC from the browser could otherwise pass someone else's id.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION "public"."claim_organization_invitation"("p_user_id" "uuid", "p_token" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."claim_organization_invitation"("p_user_id" "uuid", "p_token" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."claim_organization_invitation"("p_user_id" "uuid", "p_token" "text") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."claim_organization_invitation"("p_user_id" "uuid", "p_token" "text") TO "service_role";


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_acl text;
BEGIN
    IF to_regprocedure('public.claim_organization_invitation(uuid, text)') IS NULL THEN
        RAISE EXCEPTION 'claim_organization_invitation() was not created';
    END IF;

    SELECT coalesce(array_to_string(proacl, ','), '') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_organization_invitation';

    IF v_acl LIKE '%authenticated=%' OR v_acl LIKE '%anon=%' THEN
        RAISE EXCEPTION 'claim_organization_invitation() is executable by anon/authenticated — refusing: %', v_acl;
    END IF;

    IF v_acl NOT LIKE '%service_role=%' THEN
        RAISE EXCEPTION 'service_role cannot execute claim_organization_invitation() — the edge function would break';
    END IF;

    RAISE NOTICE 'Stage 6 OK — claim_organization_invitation() created, service_role only';
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT proname, pg_get_function_identity_arguments(oid), proacl
--   FROM pg_proc WHERE proname = 'claim_organization_invitation';
--   -- expect proacl to list postgres and service_role, NOT anon/authenticated
-- ============================================================================
