-- ============================================================================
-- STAGE 9 — Carry the invitee's name and title on the invitation
-- ============================================================================
--
-- ADDS TWO NULLABLE COLUMNS to public.organization_invitations. No function,
-- policy, constraint or index changes.
--
-- WHY
--   A firm admin knows who they are inviting — the name and the job title —
--   at the moment they send the invitation. Both print on generated reports
--   ("Préparé par", and the ASSISTAIENT table), so a profile missing either
--   produces a report with an anonymous author.
--
--   Without somewhere to put them, that knowledge is lost between the invite
--   and the moment the person lands in the app, and every new colleague has to
--   re-type what the admin already knew.
--
--   These columns are a PRE-FILL, not an authority: the person confirms and
--   can correct both during activation, and the activation form requires them
--   whether or not the admin filled anything in. An admin's guess at a title
--   must never be the last word on someone's own title.
--
-- WHY NULLABLE
--   Both are optional on the invite form, and every invitation created before
--   this stage has neither.
--
-- IDEMPOTENT — ADD COLUMN IF NOT EXISTS; safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE "public"."organization_invitations"
  ADD COLUMN IF NOT EXISTS "invited_name" "text";

ALTER TABLE "public"."organization_invitations"
  ADD COLUMN IF NOT EXISTS "invited_role" "text";

COMMENT ON COLUMN "public"."organization_invitations"."invited_name" IS
  'Optional pre-fill for the invitee''s profile name, entered by the inviting admin. Confirmed and editable by the person during activation — never authoritative.';

COMMENT ON COLUMN "public"."organization_invitations"."invited_role" IS
  'Optional pre-fill for the invitee''s job title (profiles.role). Free text: the UI offers a picklist, but firms invent titles and one that is not on the list must still be storable.';


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
    FROM "information_schema"."columns"
    WHERE "table_schema" = 'public'
      AND "table_name"  = 'organization_invitations'
      AND "column_name" IN ('invited_name', 'invited_role');

    IF n <> 2 THEN
        RAISE EXCEPTION 'Expected both invited_name and invited_role on organization_invitations, found %', n;
    END IF;

    -- Neither may be NOT NULL: existing rows have no values, and both are
    -- optional on the invite form.
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns"
        WHERE "table_schema" = 'public'
          AND "table_name"  = 'organization_invitations'
          AND "column_name" IN ('invited_name', 'invited_role')
          AND "is_nullable" = 'NO'
    ) THEN
        RAISE EXCEPTION 'invited_name/invited_role must stay nullable';
    END IF;

    RAISE NOTICE 'Stage 9 OK — invited_name and invited_role added, both nullable';
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='organization_invitations'
--    AND column_name IN ('invited_name','invited_role');
-- ============================================================================
