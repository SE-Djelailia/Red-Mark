-- ============================================
-- Stage 5: project invite flow (schema + RLS only)
-- Run against dev via: psql <connection-string> -f stage5-project-invites.sql
-- Does NOT touch application code.
-- ============================================

-- Narrow, purpose-built lookup for the invite flow. Not a general profiles
-- SELECT relaxation — only returns a match if the caller can actually invite
-- someone to something (admin, or owns/holds 'owner' role on at least one
-- project). Needed because "Project teammates can view each other's
-- profiles" (Stage 4) only covers people who already share a project — the
-- whole point of an invite is looking up someone who doesn't yet.
CREATE OR REPLACE FUNCTION public.find_invitable_user(p_email text)
RETURNS TABLE(id uuid, name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email
  FROM public.profiles p
  WHERE p.email = p_email
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.user_id = auth.uid() AND pm.role = 'owner'
      )
    );
$$;

-- Replace the single creator-only, no-admin-bypass FOR ALL policy with
-- proper per-verb policies keyed on actual project_members role (so any
-- 'owner'-role member can manage the roster, not just whoever's id happens
-- to sit in projects.user_id), plus an admin bypass.
DROP POLICY IF EXISTS "Project owners can manage members" ON public.project_members;

CREATE POLICY "Owners and admins can add members" ON public.project_members
  FOR INSERT WITH CHECK (public.is_admin() OR public.has_project_role(project_id, ARRAY['owner']));

CREATE POLICY "Owners and admins can update members" ON public.project_members
  FOR UPDATE USING (public.is_admin() OR public.has_project_role(project_id, ARRAY['owner']));

CREATE POLICY "Owners and admins can remove members" ON public.project_members
  FOR DELETE USING (public.is_admin() OR public.has_project_role(project_id, ARRAY['owner']));

-- "Members can view their project roster" (Stage 3/4) needs an admin bypass
-- too — otherwise an admin's INSERT/UPDATE/DELETE on a project they don't
-- belong to succeeds at the write, but a client's `.insert().select()` (the
-- normal Supabase pattern) fails, because Postgres can't project the
-- RETURNING row back under a SELECT policy that only recognizes membership.
-- Confirmed empirically: the same INSERT with RETURNING failed, without
-- RETURNING it silently succeeded — a RETURNING-visibility gap, not an
-- actual WITH CHECK failure (same class of gotcha as Stage 3's notifications
-- RETURNING case).
DROP POLICY IF EXISTS "Members can view their project roster" ON public.project_members;
CREATE POLICY "Members can view their project roster" ON public.project_members
  FOR SELECT USING (public.is_admin() OR public.is_project_member(project_id));
