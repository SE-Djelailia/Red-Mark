-- ============================================================================
-- STAGE 13 — the deficiency lifecycle: four states, and a history that proves
--            them
-- ============================================================================
--
-- Requires Stage 12 (widened UPDATE policy + status/priority CHECKs).
--
-- WHAT THIS STAGE DOES, IN THE ORDER IT MUST HAPPEN
--
--   1. public.issue_status_events        — the timeline table
--   2. issues.status_changed_at          — for "how long in this state"
--   3. migrate the rows                  — open → signale, resolved → verifie
--   4. synthesise history for them       — so migrated rows have a timeline too
--   5. the triggers                      — created AFTER the migration, on
--                                          purpose: they must not fire for it
--   6. narrow the status CHECK           — only AFTER every row is migrated,
--                                          or the constraint fails on open/
--                                          resolved rows
--   7. set_issue_status()                — the RPC carrying note + visit
--
-- Steps 3 and 6 in that order is the load-bearing detail. Adding the narrow
-- constraint first would abort on the eight existing rows.
--
-- Step 5 after step 3 matters just as much: if the triggers existed during the
-- migration they would fire for all eight rows and stamp them with auth.uid()
-- — NULL, since the migration runs as the DBA — producing eight events
-- attributed to nobody, on top of the honest synthetic ones from step 4.
--
--
-- THE STATE MODEL
--
--   signale     — flagged on site. Nothing has been asked of anyone yet.
--   a_corriger  — issued to the contractor; their court now.
--   corrige     — the contractor says it is done. THEIR claim, not a fact.
--   verifie     — seen and confirmed on a later visit. The architect's fact.
--
-- The corrige/verifie split is the reason this table exists. Collapsing them
-- would make the record unable to distinguish "reported fixed" from "confirmed
-- fixed", which is exactly the distinction a deficiency log is FOR.
--
--
-- MIGRATION OF EXISTING ROWS (prod: 5 open, 3 resolved, no NULLs, no strays)
--
--   open     → signale   Flagged; nothing further is known.
--   resolved → verifie   Under the binary model the ONLY actor who could set
--                        this flag was a project editor — the architect. A
--                        contractor never had access. So a historical
--                        `resolved` already carries architect confirmation;
--                        that IS verification. Mapping it to `corrige` would
--                        be the timid choice and a less true one, and would
--                        resurrect every closed deficiency as outstanding.
--
-- Each migrated row gets synthetic history, marked as reconstructed. The
-- timeline should be honest that the precise who/when was not captured at the
-- time rather than presenting an inference as an observation.
--
-- IDEMPOTENT — every step is guarded. Safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; v_check text;
BEGIN
    IF to_regclass('public.issues') IS NULL THEN
        RAISE EXCEPTION 'public.issues does not exist';
    END IF;

    -- Stage 12 must be applied: this stage's RPC relies on the widened UPDATE
    -- policy for authorization and does no permission checking of its own.
    SELECT qual INTO v_check FROM pg_policies
    WHERE schemaname='public' AND tablename='issues' AND cmd='UPDATE';
    IF v_check IS NULL OR v_check NOT LIKE '%has_project_role%' THEN
        RAISE EXCEPTION 'Stage 12 not applied: issues UPDATE policy is not owner/editor scoped (found: %)', coalesce(v_check,'no policy');
    END IF;

    -- Nothing outside the two known vocabularies.
    SELECT count(*) INTO n FROM public.issues
    WHERE coalesce(status,'') NOT IN ('open','resolved','signale','a_corriger','corrige','verifie');
    IF n > 0 THEN
        RAISE EXCEPTION 'ABORTING: % issue row(s) carry an unexpected status. Inspect: SELECT DISTINCT status FROM public.issues;', n;
    END IF;

    RAISE NOTICE 'Stage 13 preconditions OK';
END $$;


-- ---------------------------------------------------------------------------
-- 1. THE TIMELINE TABLE
--
-- A table rather than JSONB on the issue: "who verified what across this
-- project, and when" has to be queryable, and every append would otherwise
-- rewrite the issue row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."issue_status_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_by" "uuid",
    "visit_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."issue_status_events" OWNER TO "postgres";

COMMENT ON TABLE "public"."issue_status_events" IS
  'Append-only timeline of deficiency status changes. Written ONLY by the trigger on public.issues — there is no INSERT policy, so a client cannot forge an event. No UPDATE or DELETE policy either: a timeline that can be rewritten is not evidence.';

COMMENT ON COLUMN "public"."issue_status_events"."from_status" IS
  'NULL on the first event of an issue (its creation), where there is no previous state.';
COMMENT ON COLUMN "public"."issue_status_events"."changed_by" IS
  'auth.uid() at the time of the change. NULL for changes made outside a user session (a migration, or a service-role fix), which is itself informative.';
COMMENT ON COLUMN "public"."issue_status_events"."visit_id" IS
  'The site visit during which the change was recorded, when the client supplies one. This is what makes "verified on visit 5" provable rather than merely dated.';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='issue_status_events_pkey'
                   AND conrelid='public.issue_status_events'::regclass) THEN
        ALTER TABLE ONLY "public"."issue_status_events"
            ADD CONSTRAINT "issue_status_events_pkey" PRIMARY KEY ("id");
    END IF;

    -- CASCADE: deleting a deficiency deletes its timeline. The history is
    -- about the issue, and an orphan event references a row nobody can see.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='issue_status_events_issue_id_fkey'
                   AND conrelid='public.issue_status_events'::regclass) THEN
        ALTER TABLE ONLY "public"."issue_status_events"
            ADD CONSTRAINT "issue_status_events_issue_id_fkey"
            FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;
    END IF;

    -- SET NULL: removing a person must not erase the fact that a change
    -- happened. "Changed by someone since removed" beats a missing row.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='issue_status_events_changed_by_fkey'
                   AND conrelid='public.issue_status_events'::regclass) THEN
        ALTER TABLE ONLY "public"."issue_status_events"
            ADD CONSTRAINT "issue_status_events_changed_by_fkey"
            FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='issue_status_events_visit_id_fkey'
                   AND conrelid='public.issue_status_events'::regclass) THEN
        ALTER TABLE ONLY "public"."issue_status_events"
            ADD CONSTRAINT "issue_status_events_visit_id_fkey"
            FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='issue_status_events_to_status_check'
                   AND conrelid='public.issue_status_events'::regclass) THEN
        ALTER TABLE "public"."issue_status_events"
            ADD CONSTRAINT "issue_status_events_to_status_check" CHECK (
                "to_status" = ANY (ARRAY['signale'::"text",'a_corriger'::"text",'corrige'::"text",'verifie'::"text"])
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='issue_status_events_from_status_check'
                   AND conrelid='public.issue_status_events'::regclass) THEN
        ALTER TABLE "public"."issue_status_events"
            ADD CONSTRAINT "issue_status_events_from_status_check" CHECK (
                "from_status" IS NULL OR "from_status" = ANY (ARRAY['signale'::"text",'a_corriger'::"text",'corrige'::"text",'verifie'::"text"])
            );
    END IF;
END $$;

ALTER TABLE "public"."issue_status_events" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- APPEND-ONLY, ENFORCED BY OMISSION
--
-- SELECT only. There is deliberately NO INSERT policy, NO UPDATE policy and NO
-- DELETE policy for `authenticated`.
--
-- Under RLS, a command with no permissive policy is refused outright — so the
-- absence of those three IS the enforcement. UPDATE and DELETE are absent for
-- the obvious reason: a rewritable timeline proves nothing.
--
-- INSERT is absent for a less obvious one. The only legitimate source of an
-- event is a real status change, and the trigger below writes those. Granting
-- INSERT to `authenticated` would let a client POST a fabricated event —
-- "verified by the site supervisor on the 14th" — with no corresponding change
-- to the deficiency. Withholding it means every row in this table is the
-- by-product of an actual, policy-checked UPDATE to public.issues.
--
-- (NOTE: this is stricter than "SELECT + INSERT policies only" as specified.
--  The trigger is SECURITY DEFINER and needs no policy of its own, so granting
--  INSERT would add forgery surface and buy nothing. Say the word if you want
--  the INSERT policy anyway.)
--
-- Visibility follows the issue: if you can see the deficiency, you can see its
-- history. No wider, no narrower.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view issue status events" ON "public"."issue_status_events";
CREATE POLICY "Members can view issue status events" ON "public"."issue_status_events"
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM "public"."issues" i
        WHERE i."id" = "issue_status_events"."issue_id"
          AND "public"."is_project_member"(i."project_id")
    ));

-- The browser roles get SELECT and nothing else. INSERT/UPDATE/DELETE are
-- revoked at the grant level too, so a policy added by mistake later still
-- hits a missing privilege.
REVOKE ALL ON TABLE "public"."issue_status_events" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."issue_status_events" FROM "anon";
REVOKE ALL ON TABLE "public"."issue_status_events" FROM "authenticated";
GRANT SELECT ON TABLE "public"."issue_status_events" TO "authenticated";
GRANT ALL ON TABLE "public"."issue_status_events" TO "service_role";


-- ---------------------------------------------------------------------------
-- 2. AGE IN THE CURRENT STATE
--
-- Derivable from the timeline, but denormalised so the outstanding-deficiency
-- view can sort on it with an index instead of a correlated subquery. Sorting
-- by "how long has this been sitting" is the primary sort of that screen.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."issues" ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp with time zone;

COMMENT ON COLUMN "public"."issues"."status_changed_at" IS
  'When the issue entered its CURRENT status. Maintained by trg_issues_status_stamp. issues.created_at remains "first seen".';


-- ---------------------------------------------------------------------------
-- 3. MIGRATE THE ROWS  (before the triggers exist, before the CHECK narrows)
-- ---------------------------------------------------------------------------
UPDATE "public"."issues" SET "status" = 'signale'
 WHERE "status" = 'open' OR "status" IS NULL;

UPDATE "public"."issues" SET "status" = 'verifie'
 WHERE "status" = 'resolved';

-- Age baseline: a verified row has been verified since resolved_at; anything
-- else has been in its state since it was created. updated_at is deliberately
-- not used — it moves for edits that have nothing to do with status.
UPDATE "public"."issues"
   SET "status_changed_at" = CASE
         WHEN "status" = 'verifie' THEN coalesce("resolved_at", "updated_at", "created_at")
         ELSE coalesce("created_at", "updated_at", "now"())
       END
 WHERE "status_changed_at" IS NULL;


-- ---------------------------------------------------------------------------
-- 4. SYNTHETIC HISTORY FOR THE MIGRATED ROWS
--
-- Every issue gets a creation event, so no timeline starts mid-story. Verified
-- issues get a second event stamped from resolved_at.
--
-- Both are marked as reconstructed. The migration knows WHAT happened and
-- roughly WHEN; it does not know who pressed the button, and says so rather
-- than quietly attributing it.
-- ---------------------------------------------------------------------------
INSERT INTO "public"."issue_status_events"
    ("issue_id","from_status","to_status","changed_by","note","created_at")
SELECT i."id", NULL, 'signale', i."user_id",
       'Reconstitué lors de la migration : historique antérieur non enregistré.',
       coalesce(i."created_at", "now"())
  FROM "public"."issues" i
 WHERE NOT EXISTS (SELECT 1 FROM "public"."issue_status_events" e WHERE e."issue_id" = i."id");

-- greatest(): a timeline whose verification precedes its creation is not a
-- timeline. resolved_at is unconstrained legacy data and nothing guaranteed it
-- was later than created_at, so the event is clamped to at least the creation
-- instant rather than trusted blindly. Caught in the sandbox on exactly such a
-- row; cheap insurance against prod holding one.
INSERT INTO "public"."issue_status_events"
    ("issue_id","from_status","to_status","changed_by","note","created_at")
SELECT i."id", 'signale', 'verifie', i."user_id",
       'Reconstitué lors de la migration : « résolu » sous l''ancien modèle binaire, que seul un éditeur du projet pouvait inscrire.',
       GREATEST(
           coalesce(i."resolved_at", i."updated_at", i."created_at", "now"()),
           coalesce(i."created_at", '-infinity'::timestamptz)
       )
  FROM "public"."issues" i
 WHERE i."status" = 'verifie'
   AND NOT EXISTS (
        SELECT 1 FROM "public"."issue_status_events" e
         WHERE e."issue_id" = i."id" AND e."to_status" = 'verifie');


-- ---------------------------------------------------------------------------
-- 5. THE TRIGGERS
--
-- TWO triggers, each with one job:
--
--   BEFORE — maintains status_changed_at and resolved_at on the row itself.
--   AFTER  — appends the event, once the row is guaranteed to exist (the FK
--            from issue_status_events would fail in a BEFORE INSERT).
--
-- WHY A TRIGGER AND NOT CLIENT-SIDE INSERTS
--
-- Several code paths already write issues.status. Any of them that forgot to
-- also insert an event would leave a silent hole in the record — and a hole is
-- indistinguishable from "nothing happened". A trigger cannot be forgotten: a
-- bare `UPDATE issues SET status = ...` from psql logs an event exactly like
-- the RPC does.
--
-- THE GUC
--
-- A trigger cannot see the caller's intent, so note and visit_id arrive
-- through transaction-local settings that set_issue_status() writes first.
-- current_setting(..., true) returns NULL when unset, so a direct UPDATE
-- simply produces an event with no note — never an error.
--
-- The settings are cleared after being read, so a second status change in the
-- same transaction cannot inherit the first one's note.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."issues_status_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.status := coalesce(NEW.status, 'signale');
        NEW.status_changed_at := coalesce(NEW.status_changed_at, now());
        IF NEW.status = 'verifie' THEN
            NEW.resolved_at := coalesce(NEW.resolved_at, now());
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE, status actually changed. IS DISTINCT FROM so that re-saving a
    -- form with an unchanged status neither stamps nor logs.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := now();

        -- resolved_at now means "reached verifie", and is cleared on the way
        -- back out — a deficiency reopened after verification is not resolved.
        IF NEW.status = 'verifie' THEN
            NEW.resolved_at := now();
        ELSIF OLD.status = 'verifie' THEN
            NEW.resolved_at := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."issues_status_stamp"() OWNER TO "postgres";

-- SECURITY DEFINER: issue_status_events has no INSERT policy at all, so the
-- append must run with the table owner's rights. This is what lets the history
-- be unforgeable by clients while still being written on every real change.
CREATE OR REPLACE FUNCTION "public"."issues_log_status_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_note  text := nullif(btrim(coalesce(current_setting('app.issue_status_note', true), '')), '');
    v_visit uuid;
    v_actor uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;   -- AFTER trigger: return value ignored
    END IF;

    BEGIN
        v_visit := nullif(btrim(coalesce(current_setting('app.issue_status_visit', true), '')), '')::uuid;
    EXCEPTION WHEN others THEN
        v_visit := NULL;   -- a malformed setting must never block the change
    END;

    -- auth.uid() reads and casts a GUC, so a malformed or blank JWT claim can
    -- make it RAISE rather than return NULL. Unhandled, that would abort the
    -- whole status change — the logging of a change must never be what
    -- prevents it. An unattributed event is a far better outcome than a
    -- refused update, and "changed_by IS NULL" is itself informative.
    BEGIN
        v_actor := auth.uid();
    EXCEPTION WHEN others THEN
        v_actor := NULL;
    END;

    INSERT INTO public.issue_status_events
        (issue_id, from_status, to_status, changed_by, visit_id, note)
    VALUES (
        NEW.id,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
        NEW.status,
        v_actor,
        v_visit,
        v_note
    );

    -- Consume the context so it cannot leak onto a later change in the same
    -- transaction.
    PERFORM set_config('app.issue_status_note',  '', true);
    PERFORM set_config('app.issue_status_visit', '', true);

    RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."issues_log_status_event"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_issues_status_stamp" ON "public"."issues";
CREATE TRIGGER "trg_issues_status_stamp"
    BEFORE INSERT OR UPDATE ON "public"."issues"
    FOR EACH ROW EXECUTE FUNCTION "public"."issues_status_stamp"();

DROP TRIGGER IF EXISTS "trg_issues_log_status_event" ON "public"."issues";
CREATE TRIGGER "trg_issues_log_status_event"
    AFTER INSERT OR UPDATE OF "status" ON "public"."issues"
    FOR EACH ROW EXECUTE FUNCTION "public"."issues_log_status_event"();


-- ---------------------------------------------------------------------------
-- 6. NARROW THE STATUS CHECK  (only now — every row is migrated)
--
-- THE COLUMN DEFAULT MUST MOVE FIRST, and it is easy to miss: it is still
-- 'open', a value the narrowed constraint below is about to forbid. Any INSERT
-- that does not name a status — which is how the client creates a deficiency —
-- would take that default and be rejected outright. Caught in the sandbox by
-- an insert probe; without it, Stage 13 would have made creating a new
-- deficiency impossible the moment it was applied.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."issues" ALTER COLUMN "status" SET DEFAULT 'signale'::"text";

ALTER TABLE "public"."issues" DROP CONSTRAINT IF EXISTS "issues_status_check";
ALTER TABLE "public"."issues"
    ADD CONSTRAINT "issues_status_check" CHECK (
        "status" = ANY (ARRAY['signale'::"text",'a_corriger'::"text",'corrige'::"text",'verifie'::"text"])
    );

COMMENT ON CONSTRAINT "issues_status_check" ON "public"."issues" IS
  'The four lifecycle states. The legacy pair (open, resolved) was accepted between Stage 12 and Stage 13 and is now refused — every row was migrated in this transaction.';


-- ---------------------------------------------------------------------------
-- 7. THE RPC
--
-- SECURITY INVOKER, deliberately. It does no permission checking of its own:
-- the UPDATE runs as the caller and is gated by the Stage 12 policy
-- (owner/editor of the project). Authorization stays in exactly one place.
--
-- A SECURITY DEFINER version would have to re-implement that check, and every
-- such duplicate is a chance for the two to drift apart.
--
-- Returns a status rather than raising, so the client can tell "you may not"
-- from "no such issue" without parsing an error string. A 0-row UPDATE is the
-- signature of a policy denial — the same silent no-op Stage 12 fixed for
-- verification — so it is checked explicitly and reported.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."set_issue_status"(
    "p_issue_id" "uuid",
    "p_to_status" "text",
    "p_note" "text" DEFAULT NULL,
    "p_visit_id" "uuid" DEFAULT NULL
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_from text;
    n int;
BEGIN
    IF p_to_status IS NULL OR p_to_status NOT IN ('signale','a_corriger','corrige','verifie') THEN
        RETURN jsonb_build_object('status','invalid_status');
    END IF;

    -- Visible under the SELECT policy? Distinguishes "not found" from "not
    -- permitted to change" below.
    SELECT status INTO v_from FROM public.issues WHERE id = p_issue_id;
    IF v_from IS NULL THEN
        RETURN jsonb_build_object('status','not_found');
    END IF;

    IF v_from = p_to_status THEN
        RETURN jsonb_build_object('status','unchanged','from',v_from,'to',p_to_status);
    END IF;

    -- Context for the trigger. is_local = true: dies with the transaction, so
    -- it cannot leak into another request on the same pooled connection.
    PERFORM set_config('app.issue_status_note',  coalesce(p_note,''), true);
    PERFORM set_config('app.issue_status_visit', coalesce(p_visit_id::text,''), true);

    UPDATE public.issues SET status = p_to_status WHERE id = p_issue_id;
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n = 0 THEN
        -- Visible but not updatable: the caller is a commenter, or not a
        -- member with a write role. Stage 12's policy refused it.
        PERFORM set_config('app.issue_status_note',  '', true);
        PERFORM set_config('app.issue_status_visit', '', true);
        RETURN jsonb_build_object('status','not_permitted');
    END IF;

    RETURN jsonb_build_object('status','changed','from',v_from,'to',p_to_status);
END;
$$;

ALTER FUNCTION "public"."set_issue_status"("uuid","text","text","uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."set_issue_status"("uuid","text","text","uuid") IS
  'Changes a deficiency status and records the timeline entry atomically. SECURITY INVOKER: authorization comes from the issues UPDATE policy, not from here. note/visit_id reach the trigger through transaction-local settings.';

-- Callable from the browser: it is SECURITY INVOKER and takes no user id, so
-- RLS is the gate and there is no identity to forge.
REVOKE ALL ON FUNCTION "public"."set_issue_status"("uuid","text","text","uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_issue_status"("uuid","text","text","uuid") TO "authenticated", "service_role";


-- ---------------------------------------------------------------------------
-- POST-CONDITIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; m int;
BEGIN
    SELECT count(*) INTO n FROM public.issues
     WHERE status NOT IN ('signale','a_corriger','corrige','verifie');
    IF n > 0 THEN RAISE EXCEPTION '% issue(s) left un-migrated', n; END IF;

    SELECT count(*) INTO n FROM public.issues WHERE status_changed_at IS NULL;
    IF n > 0 THEN RAISE EXCEPTION '% issue(s) have no status_changed_at', n; END IF;

    -- The column default must be a value the CHECK accepts, or every INSERT
    -- that omits status fails. This is the assertion that would have caught
    -- the default being left at 'open'.
    IF (SELECT column_default FROM information_schema.columns
         WHERE table_schema='public' AND table_name='issues' AND column_name='status')
       NOT LIKE '%signale%' THEN
        RAISE EXCEPTION 'issues.status default is not signale — a plain INSERT would violate issues_status_check';
    END IF;

    -- Every issue has a creation event.
    SELECT count(*) INTO n FROM public.issues i
     WHERE NOT EXISTS (SELECT 1 FROM public.issue_status_events e WHERE e.issue_id = i.id);
    IF n > 0 THEN RAISE EXCEPTION '% issue(s) have no history event', n; END IF;

    -- Every verified issue has a verification event.
    SELECT count(*) INTO n FROM public.issues i
     WHERE i.status = 'verifie'
       AND NOT EXISTS (SELECT 1 FROM public.issue_status_events e
                        WHERE e.issue_id = i.id AND e.to_status = 'verifie');
    IF n > 0 THEN RAISE EXCEPTION '% verified issue(s) have no verification event', n; END IF;

    -- No timeline runs backwards: every event is at or after its issue's
    -- creation, and no issue's first event is preceded by a later one.
    SELECT count(*) INTO n
      FROM public.issue_status_events e JOIN public.issues i ON i.id = e.issue_id
     WHERE i.created_at IS NOT NULL AND e.created_at < i.created_at;
    IF n > 0 THEN RAISE EXCEPTION '% history event(s) predate their issue', n; END IF;

    -- Append-only: SELECT policy present, and no INSERT/UPDATE/DELETE policy.
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='public' AND tablename='issue_status_events';
    SELECT count(*) INTO m FROM pg_policies
     WHERE schemaname='public' AND tablename='issue_status_events' AND cmd='SELECT';
    IF n <> 1 OR m <> 1 THEN
        RAISE EXCEPTION 'issue_status_events must have exactly one policy (SELECT); found % total, % select', n, m;
    END IF;

    IF has_table_privilege('authenticated','public.issue_status_events','INSERT')
       OR has_table_privilege('authenticated','public.issue_status_events','UPDATE')
       OR has_table_privilege('authenticated','public.issue_status_events','DELETE') THEN
        RAISE EXCEPTION 'issue_status_events must not be writable by authenticated';
    END IF;

    IF NOT has_table_privilege('authenticated','public.issue_status_events','SELECT') THEN
        RAISE EXCEPTION 'authenticated must be able to read the timeline';
    END IF;

    -- Both triggers present.
    SELECT count(*) INTO n FROM pg_trigger
     WHERE tgrelid='public.issues'::regclass
       AND tgname IN ('trg_issues_status_stamp','trg_issues_log_status_event')
       AND NOT tgisinternal;
    IF n <> 2 THEN RAISE EXCEPTION 'Expected both status triggers on issues, found %', n; END IF;

    -- The logging trigger must be SECURITY DEFINER or it cannot write.
    IF NOT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
             WHERE ns.nspname='public' AND p.proname='issues_log_status_event') THEN
        RAISE EXCEPTION 'issues_log_status_event must be SECURITY DEFINER';
    END IF;

    -- The RPC must NOT be SECURITY DEFINER: authorization belongs to RLS.
    IF (SELECT prosecdef FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
         WHERE ns.nspname='public' AND p.proname='set_issue_status') THEN
        RAISE EXCEPTION 'set_issue_status must be SECURITY INVOKER so the issues UPDATE policy gates it';
    END IF;

    RAISE NOTICE 'Stage 13 OK — % issues migrated, % history events, triggers armed, CHECK narrowed',
        (SELECT count(*) FROM public.issues),
        (SELECT count(*) FROM public.issue_status_events);
END $$;

COMMIT;


-- ============================================================================
-- VERIFICATION (run after)
-- ============================================================================
-- SELECT status, count(*) FROM public.issues GROUP BY 1 ORDER BY 1;
--   -- expect: signale 5, verifie 3
--
-- SELECT i.title, e.from_status, e.to_status, e.created_at, e.note
--   FROM public.issue_status_events e JOIN public.issues i ON i.id = e.issue_id
--  ORDER BY i.title, e.created_at;
--   -- expect: 5 issues with one 'signale' event; 3 with 'signale' then 'verifie'
--
-- SELECT policyname, cmd FROM pg_policies
--  WHERE tablename='issue_status_events';           -- exactly one: SELECT
-- ============================================================================
