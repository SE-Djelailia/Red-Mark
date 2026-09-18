-- STAGE 26 — let EDITORS update a visit, not only its creator.
--
-- THE BUG
--
-- site_visits still carries the original creator-only UPDATE policy:
--
--     CREATE POLICY "Creator can update their visits" ON site_visits
--       FOR UPDATE USING (auth.uid() = user_id);
--
-- This is exactly the shape the issues table had before Stage 12 widened it.
-- On a real project the architect who records the visit and the colleague who
-- corrects it are often different people, and the second one simply cannot.
--
-- WHY IT WAS INVISIBLE
--
-- A blocked UPDATE under RLS is NOT an error. Postgres matches zero rows and
-- reports success, so the app said "saved" and changed nothing. Verified in a
-- disposable Postgres 17 container against these exact policies:
--
--     editor updating another user's visit  -> UPDATE 0   (silent)
--     creator updating their own visit      -> UPDATE 1
--
-- That silence is why this survived until someone noticed an edit not
-- sticking, and it is the reason the client now verifies the returned row
-- (see updateSiteVisit) rather than trusting a successful response.
--
-- THE FIX
--
-- Match the issues policy exactly — same predicate, same roles, both USING and
-- WITH CHECK:
--
--     CREATE POLICY "Editors can update issues" ON issues FOR UPDATE
--       USING      (has_project_role(project_id, ARRAY['owner','editor']))
--       WITH CHECK (has_project_role(project_id, ARRAY['owner','editor']));
--
-- WITH CHECK matters as much as USING: without it an editor could move a visit
-- to a project they do not belong to by updating project_id.
--
-- VERIFIED IN THE SANDBOX, after applying this migration:
--
--     editor      -> UPDATE 1   (can now edit)
--     commenter   -> UPDATE 0   (still blocked)
--     non-member  -> UPDATE 0   (still blocked)
--
-- DELETE IS DELIBERATELY UNCHANGED
--
-- "Creator can delete their visits" stays creator-only. Editing a colleague's
-- visit is collaboration; deleting the record of a site visit that somebody
-- else attended is not, and destroying a visit destroys its photos,
-- observations and déficiences with it. Widening deletion is a separate
-- decision and is not made here.

BEGIN;

DROP POLICY IF EXISTS "Creator can update their visits" ON "public"."site_visits";

CREATE POLICY "Editors can update visits" ON "public"."site_visits"
  FOR UPDATE
  USING ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]))
  WITH CHECK ("public"."has_project_role"("project_id", ARRAY['owner'::"text", 'editor'::"text"]));

COMMIT;

-- Verification — run after applying. Expect exactly one row:
--   policyname = 'Editors can update visits', cmd = 'UPDATE'
--
-- SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'site_visits' AND cmd = 'UPDATE';
