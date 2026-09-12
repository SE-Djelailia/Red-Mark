-- ============================================================================
-- STAGE 21 — THE SPLIT-RENAME: phases -> lots
--
-- Stage 20 introduced the CONSTRUCTION STAGE as its own pair of tables. This
-- stage renames the older concept to the name it should always have had, so
-- the two stop competing for the word "phase":
--
--   LOT   = numbered contractual division, ONE company, the ASSIGNMENT target.
--           This is the table currently called `phases`.
--   STAGE = Fondation / Structure / Enveloppe / Finitions.
--           construction_stages + project_stages, created in Stage 20.
--
-- PURE RENAME. No column is added or dropped, no row is read or written, no
-- policy predicate changes. Every object keeps its definition and changes only
-- its NAME, because a name that lies is a defect that compounds: the next
-- person to read `phases_company_org_fkey` on a table called `lots` has to
-- reconstruct this conversation to know which concept it guards.
--
-- WHAT IS DELIBERATELY *NOT* RENAMED HERE
--
--   site_visit_phases — this is the STAGE concept, not the Lot. Stage 17
--     migrated the free-text site_visits.phase into it, and that column was
--     always construction stages. Renaming it to site_visit_lots would be
--     precisely wrong. Stage 22 repoints it at project_stages and renames it
--     site_visit_stages, as part of the data move.
--
--     Note that its FKs currently REFERENCE public.phases, so this rename
--     retargets them at `lots` automatically (PostgreSQL tracks the table by
--     OID, not by name). Their names — site_visit_phases_phase_id_fkey and
--     _phase_project_fkey — are therefore briefly misleading, pointing at a
--     table now called lots. They are left alone ON PURPOSE: Stage 22 drops
--     and rebuilds them against project_stages, and renaming them here would
--     be churn on constraints that are about to cease to exist.
--
--   site_visits.phase — read-only legacy, still the free-text stage. Stage 25
--     drops it once the client's references are migrated.
--
--   idx_site_visits_phase_trgm — the index on that legacy column. Goes with it.
--
-- CLIENT COUPLING — THE EMBED STRING
--
-- Renaming phases_company_id_fkey to lots_company_id_fkey BREAKS the client
-- the instant it is applied, because lots has TWO foreign keys to companies
-- and PostgREST refuses an ambiguous embed with PGRST201. src/lib/lotApi.ts
-- must name the new constraint in the same change:
--
--     company:companies!lots_company_id_fkey (...)
--
-- That edit ships in the same commit as this file. Applying one without the
-- other produces exactly the PGRST201 failure the Lot tab hit before.
--
-- Idempotent: every rename is guarded on the OLD name still existing, so a
-- re-run is a no-op rather than an error.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. THE TABLE
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'phases' AND c.relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public' AND c.relname = 'lots') THEN
    ALTER TABLE public.phases RENAME TO lots;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. THE COLUMN ON ISSUES
--
-- issues.phase_id becomes issues.lot_id. This is the ASSIGNMENT link — a
-- déficience is assigned to a Lot, which is what carries the company.
-- Stage 24 adds a SEPARATE issues.stage_id for the construction stage; a
-- déficience links to BOTH.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'issues' AND column_name = 'phase_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'issues' AND column_name = 'lot_id') THEN
    ALTER TABLE public.issues RENAME COLUMN phase_id TO lot_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. CONSTRAINTS
--
-- Renamed by name so nothing depends on ordering. Each is guarded, so this
-- block is safe to re-run and safe to apply to a partially-renamed database.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('lots', 'phases_pkey',              'lots_pkey'),
      ('lots', 'phases_id_project_id_key', 'lots_id_project_id_key'),
      ('lots', 'phases_project_id_fkey',   'lots_project_id_fkey'),
      ('lots', 'phases_company_id_fkey',   'lots_company_id_fkey'),
      ('lots', 'phases_company_org_fkey',  'lots_company_org_fkey'),
      ('lots', 'phases_created_by_fkey',   'lots_created_by_fkey'),
      ('lots', 'phases_name_not_blank',    'lots_name_not_blank'),
      ('lots', 'phases_company_org_paired','lots_company_org_paired'),
      ('issues', 'issues_phase_project_fkey', 'issues_lot_project_fkey')
    ) AS t(tbl, old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint con
               JOIN pg_class c ON c.oid = con.conrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = r.tbl AND con.conname = r.old_name)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint con
               JOIN pg_class c ON c.oid = con.conrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = r.tbl AND con.conname = r.new_name) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', r.tbl, r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. INDEXES
--
-- Renaming a constraint renames its backing index with it, so lots_pkey and
-- lots_id_project_id_key are already correct by this point. These are the
-- standalone indexes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('phases_project_name_key', 'lots_project_name_key'),
      ('idx_phases_project',      'idx_lots_project'),
      ('idx_phases_company',      'idx_lots_company'),
      ('idx_issues_phase',        'idx_issues_lot'),
      ('idx_issues_project_phase','idx_issues_project_lot')
    ) AS t(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = r.old_name AND c.relkind = 'i')
       AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                       WHERE n.nspname = 'public' AND c.relname = r.new_name) THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. TRIGGERS AND THE TRIGGER FUNCTION
--
-- set_phase_company_org() becomes set_lot_company_org(). The body is
-- unchanged except for the error-message wording; it is re-created rather
-- than renamed because CREATE OR REPLACE cannot rename, and a DROP of the old
-- name must come AFTER the trigger stops pointing at it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_lot_company_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_org_id := NULL;
  ELSE
    SELECT p.organization_id INTO NEW.company_org_id
    FROM public.projects p
    WHERE p.id = NEW.project_id;

    IF NEW.company_org_id IS NULL THEN
      RAISE EXCEPTION 'Cannot resolve the owning firm for project %', NEW.project_id;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_lot_company_org() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_lot_company_org() FROM PUBLIC;

-- Repoint the trigger at the new function, under the new name.
DROP TRIGGER IF EXISTS trg_phases_set_company_org ON public.lots;
DROP TRIGGER IF EXISTS trg_lots_set_company_org ON public.lots;
CREATE TRIGGER trg_lots_set_company_org
  BEFORE INSERT OR UPDATE OF company_id, project_id ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.set_lot_company_org();

-- Now that nothing references it, retire the old function name.
DROP FUNCTION IF EXISTS public.set_phase_company_org();

-- The updated_at trigger is a plain rename: it calls the shared
-- handle_updated_at(), which is not phase-specific.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'lots'
               AND t.tgname = 'set_updated_at_phases')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'lots'
               AND t.tgname = 'set_updated_at_lots') THEN
    ALTER TRIGGER set_updated_at_phases ON public.lots RENAME TO set_updated_at_lots;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. POLICIES
--
-- Predicates are UNCHANGED — is_project_member / has_project_role on
-- project_id, with WITH CHECK on every writing command. Only the names move.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Members can view phases',   'Members can view lots'),
      ('Editors can create phases', 'Editors can create lots'),
      ('Editors can update phases', 'Editors can update lots'),
      ('Editors can delete phases', 'Editors can delete lots')
    ) AS t(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = r.old_name)
       AND NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = r.new_name) THEN
      EXECUTE format('ALTER POLICY %I ON public.lots RENAME TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. COMMENTS
--
-- Re-stated for the split, since the old text defined the table against the
-- word this stage is taking away.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.lots IS
  'Contractual division of a project (a "lot"), optionally executed by one company. The ASSIGNMENT target for a déficience. Distinct from a construction stage (project_stages): a Lot is who is responsible, a stage is when in the build. Complements issues.discipline (trade taxonomy). Firm-scoped through project_id, not through an organization_id column.';

COMMENT ON COLUMN public.lots.company_org_id IS
  'Denormalised companies.organization_id, stamped by trigger. Exists only to support the composite FK that makes a cross-firm lot->company link structurally impossible. Never set by the client.';

COMMENT ON COLUMN public.lots.sort_order IS
  'Display order within the project. Not unique: ties broken by name.';

COMMENT ON COLUMN public.issues.lot_id IS
  'The contractual lot this déficience is assigned to. Guarded by the composite FK (lot_id, project_id) so a cross-project assignment is unrepresentable. Stage 24 adds a separate stage_id for the construction stage — a déficience carries both.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lots TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (read-only)
--
-- Expected: no object in the public schema still carries "phase" in its name
-- EXCEPT the four that belong to the stage concept and are Stage 22/25's —
-- site_visit_phases (+ its 5 constraints, 3 indexes, 1 trigger), the
-- set_visit_phase_project() function, site_visits.phase, and
-- idx_site_visits_phase_trgm.
-- ---------------------------------------------------------------------------
-- SELECT 'CONSTRAINT' AS kind, con.conname AS name, c.relname AS on_table
-- FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND con.conname LIKE '%phase%'
-- UNION ALL
-- SELECT 'INDEX', indexname, tablename FROM pg_indexes
-- WHERE schemaname = 'public' AND indexname LIKE '%phase%'
-- UNION ALL
-- SELECT 'POLICY', policyname, tablename FROM pg_policies
-- WHERE schemaname = 'public' AND policyname LIKE '%phase%'
-- UNION ALL
-- SELECT 'COLUMN', a.attname, c.relname FROM pg_attribute a
-- JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0
--   AND NOT a.attisdropped AND a.attname LIKE '%phase%'
-- ORDER BY 1, 2;
--
-- -- Row counts must be unchanged by a rename.
-- SELECT (SELECT count(*) FROM public.lots) AS lots,
--        (SELECT count(*) FROM public.issues WHERE lot_id IS NOT NULL) AS issues_with_lot;
