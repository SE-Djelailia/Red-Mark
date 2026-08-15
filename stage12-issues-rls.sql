-- ============================================================================
-- STAGE 12 — issues: fix the UPDATE policy, close the cross-firm write, and
--                    constrain status/priority
-- ============================================================================
--
-- Prerequisite for the deficiency lifecycle, but worth applying on its own:
-- it fixes a live tenancy-boundary write and unblocks a feature that cannot
-- otherwise work.
--
--
-- WHAT IS WRONG TODAY
--
-- 1. THE BLOCKER — UPDATE is creator-only.
--
--      CREATE POLICY "Creator can update their issues" ON public.issues
--        FOR UPDATE USING (auth.uid() = user_id);
--
--    This is the ONLY update policy on the table. A deficiency can be edited
--    by the person who flagged it and by nobody else.
--
--    The lifecycle being built rests on the opposite: one person flags a
--    deficiency, and a colleague confirms the fix on a later visit. Under this
--    policy that colleague's write matches no row, so PostgREST reports
--    success having changed nothing. Not an error — a silent no-op, which is
--    the worst shape a permission failure can take.
--
--    It is also already wrong for ordinary editing: an editor cannot correct
--    a typo in a teammate's deficiency, though they may create and read them
--    freely.
--
-- 2. THE MISSING WITH CHECK IS NOT A HOLE. Recorded because the obvious
--    reading of this table says otherwise, and that reading is wrong.
--
--    The UPDATE policy has no WITH CHECK, which looks like it would let a
--    creator move a deficiency into another firm's project:
--
--      UPDATE public.issues SET project_id = '<another firm's project>' ...
--
--    It does not, for two independent reasons, both verified in a sandbox
--    rather than reasoned about:
--
--      a) PostgreSQL applies SELECT policies to the NEW row on UPDATE: a row
--         may not be updated into a state where the updater could no longer
--         see it. With `SELECT USING (true)` the move succeeds; with the real
--         is_project_member() policy it fails. So the read policy is already
--         doing WITH CHECK's job.
--
--      b) When an UPDATE policy omits WITH CHECK, PostgreSQL uses its USING
--         expression as the WITH CHECK. There is no unchecked case.
--
--    Which means the explicit WITH CHECK added below is BEHAVIOURALLY
--    REDUNDANT — identical to the implicit fallback, since it repeats the same
--    predicate. Confirmed by running the widened policy both with and without
--    it: same refusal, same SQLSTATE.
--
--    It is written out anyway, for one reason only: if someone later widens
--    USING — say to let any project member update a deficiency — the implicit
--    WITH CHECK widens silently with it, and the destination of a move becomes
--    unconstrained in a commit that looks like it is only about who may edit.
--    Stating the rule explicitly forces that to be a deliberate second edit.
--    That is a documentation benefit, not a security fix, and this stage does
--    not claim otherwise.
--
--    (`site_visits`, `photos` and `projects` have UPDATE policies of the same
--    shape, and the same implicit protection. Not touched here.)
--
-- 3. status AND priority ARE UNCONSTRAINED FREE TEXT.
--
--    Both have defaults and no CHECK. Any string is storable, which is how a
--    status vocabulary drifts. Stage 13 depends on the value set being known.
--
--
-- WHAT THIS STAGE DELIBERATELY DOES NOT DO
--
--    It does not migrate any status value. status stays 'open'/'resolved'
--    here, and the CHECK below accepts BOTH vocabularies — the old two and the
--    new four — so that this stage is safe to apply while the client still
--    writes the old words. Stage 13 migrates the data and narrows the CHECK to
--    the four states alone. Applying 12 without 13 leaves a working system.
--
--    DELETE is left creator-only. Deleting a deficiency is not part of the
--    lifecycle, and widening it is a separate decision.
--
--
-- IDEMPOTENT — policies are dropped before creation; constraints are added
-- only when absent. Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDITIONS — fail loudly rather than half-apply.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    IF to_regclass('public.issues') IS NULL THEN
        RAISE EXCEPTION 'public.issues does not exist';
    END IF;

    -- has_project_role() is what the new policy delegates to. It must be the
    -- SECURITY DEFINER version from the organization migration.
    SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'has_project_role' AND p.prosecdef;
    IF n <> 1 THEN
        RAISE EXCEPTION 'public.has_project_role() (SECURITY DEFINER) not found — apply the organization migration first';
    END IF;

    -- Every existing row must satisfy the CHECK we are about to add. With no
    -- constraint in place until now, this cannot be assumed.
    SELECT count(*) INTO n FROM public.issues
    WHERE status IS NOT NULL
      AND status NOT IN ('open','resolved','signale','a_corriger','corrige','verifie');
    IF n > 0 THEN
        RAISE EXCEPTION
            'ABORTING: % issue row(s) carry a status outside the accepted set. Inspect with: SELECT DISTINCT status FROM public.issues;', n;
    END IF;

    SELECT count(*) INTO n FROM public.issues
    WHERE priority IS NOT NULL AND priority NOT IN ('low','medium','high','critical');
    IF n > 0 THEN
        RAISE EXCEPTION
            'ABORTING: % issue row(s) carry a priority outside (low, medium, high, critical). Inspect with: SELECT DISTINCT priority FROM public.issues;', n;
    END IF;

    RAISE NOTICE 'Stage 12 preconditions OK';
END $$;


-- ---------------------------------------------------------------------------
-- 1 + 2. THE UPDATE POLICY
--
-- Scope moves from "the creator" to "an owner or editor of the project",
-- matching the INSERT policy exactly. Someone trusted to CREATE a deficiency
-- on a project is trusted to advance one; the previous split had no rationale
-- and made verification impossible.
--
-- USING      — which rows may be touched: those on a project where the caller
--              is owner or editor.
-- WITH CHECK — what the row may BECOME. Evaluated against the NEW row, so a
--              project_id rewrite is tested against the DESTINATION project:
--              the caller must be owner or editor THERE too. A move between
--              two projects the caller genuinely writes to still works, which
--              is legitimate.
--
-- The WITH CHECK repeats USING deliberately. PostgreSQL would apply USING as
-- the WITH CHECK anyway (note 2), so this changes no behaviour today — it
-- exists so that widening USING later cannot silently widen what a row may be
-- turned INTO. Redundancy here is the point, not an oversight.
--
-- has_project_role() is SECURITY DEFINER and reads project_members, so this
-- does not recurse through the project_members policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Creator can update their issues" ON "public"."issues";
DROP POLICY IF EXISTS "Editors can update issues" ON "public"."issues";

CREATE POLICY "Editors can update issues" ON "public"."issues"
    FOR UPDATE
    USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]))
    WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));


-- ---------------------------------------------------------------------------
-- 3. VALUE CONSTRAINTS
--
-- status accepts BOTH vocabularies for the duration of Stage 12→13:
--
--   open, resolved                              ← what the client writes today
--   signale, a_corriger, corrige, verifie       ← the lifecycle, from Stage 13
--
-- Stage 13 migrates the rows and replaces this constraint with one that admits
-- the four states only. Accepting both here is what makes the two stages
-- independently applicable — apply 12 today, 13 whenever, with a working
-- system in between.
--
-- ASCII slugs rather than accented French: these values end up in URLs, filter
-- params and constraint bodies. The French labels live in the client
-- (Badge.tsx), which is where display text belongs.
--
-- NULL is permitted by both constraints because the columns are nullable and
-- some rows may predate the defaults. Stage 13 backfills status; priority
-- keeps its NULL tolerance since the UI treats absent as 'medium'.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'issues_status_check' AND conrelid = 'public.issues'::regclass
    ) THEN
        ALTER TABLE "public"."issues"
            ADD CONSTRAINT "issues_status_check" CHECK (
                "status" IS NULL OR "status" = ANY (ARRAY[
                    'open'::"text", 'resolved'::"text",
                    'signale'::"text", 'a_corriger'::"text",
                    'corrige'::"text", 'verifie'::"text"
                ])
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'issues_priority_check' AND conrelid = 'public.issues'::regclass
    ) THEN
        ALTER TABLE "public"."issues"
            ADD CONSTRAINT "issues_priority_check" CHECK (
                "priority" IS NULL OR "priority" = ANY (ARRAY[
                    'low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"
                ])
            );
    END IF;
END $$;

COMMENT ON CONSTRAINT "issues_status_check" ON "public"."issues" IS
  'Accepts the legacy pair (open, resolved) AND the lifecycle four (signale, a_corriger, corrige, verifie) so Stage 12 and Stage 13 can be applied independently. Stage 13 narrows this to the four.';


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_using text;
    v_check text;
    n int;
BEGIN
    SELECT qual, with_check INTO v_using, v_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'issues' AND cmd = 'UPDATE';

    IF v_using IS NULL THEN
        RAISE EXCEPTION 'No UPDATE policy on public.issues after Stage 12';
    END IF;

    -- The blocker: the policy must no longer be keyed on the creator.
    IF v_using LIKE '%uid() = user_id%' OR v_using LIKE '%user_id = %uid()%' THEN
        RAISE EXCEPTION 'UPDATE policy is still creator-scoped: %', v_using;
    END IF;

    -- The cross-firm write: WITH CHECK must exist and must gate the new row.
    IF v_check IS NULL THEN
        RAISE EXCEPTION 'UPDATE policy has no WITH CHECK — a project_id rewrite would still be unchecked';
    END IF;
    IF v_check NOT LIKE '%has_project_role%' THEN
        RAISE EXCEPTION 'UPDATE policy WITH CHECK does not delegate to has_project_role: %', v_check;
    END IF;

    -- Exactly one UPDATE policy. Permissive policies OR together, so a
    -- leftover creator-scoped policy would re-open what this stage closes.
    SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'issues' AND cmd = 'UPDATE';
    IF n <> 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 UPDATE policy on issues, found %', n;
    END IF;

    -- Constraints present and validated.
    SELECT count(*) INTO n FROM pg_constraint
    WHERE conrelid = 'public.issues'::regclass
      AND conname IN ('issues_status_check','issues_priority_check')
      AND contype = 'c' AND convalidated;
    IF n <> 2 THEN
        RAISE EXCEPTION 'Expected 2 validated CHECK constraints on issues, found %', n;
    END IF;

    -- The other three policies are untouched.
    SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'issues';
    IF n <> 4 THEN
        RAISE EXCEPTION 'Expected 4 policies on issues (SELECT/INSERT/UPDATE/DELETE), found %', n;
    END IF;

    RAISE NOTICE 'Stage 12 OK — UPDATE is owner/editor with WITH CHECK; status/priority constrained';
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE schemaname='public' AND tablename='issues'
--  ORDER BY cmd;
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid='public.issues'::regclass AND contype='c';
--
-- -- Unchanged by this stage; Stage 13 migrates these:
-- SELECT coalesce(status,'(null)') AS status, count(*) FROM public.issues GROUP BY 1;
-- ============================================================================
