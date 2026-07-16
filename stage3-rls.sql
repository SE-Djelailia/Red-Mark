-- ============================================
-- Stage 3: collaboration-model RLS rewrite
-- Run against dev via: psql <connection-string> -f stage3-rls.sql
-- ============================================

-- Helper: is the current user an org-level admin?
-- Not SECURITY DEFINER: it only ever reads the caller's own profiles row
-- (id = auth.uid()), which the existing "Users can view their own profile"
-- policy already permits, so no elevated privilege is needed, and profiles'
-- own policies don't reference any other RLS-protected table (no recursion risk).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND org_role = 'admin'
  );
$$;

-- Helper: does the current user have a project_members row for this project?
-- SECURITY DEFINER + owned by postgres (which bypasses RLS) is required here:
-- project_members' own pre-existing policy ("Project owners can manage
-- members") queries projects, and projects' policies now query
-- project_members. Without bypassing RLS on this read, that's a cycle
-- ("infinite recursion detected in policy for relation project_members") —
-- confirmed by hitting it in the sandbox test below. Owning it as postgres
-- (bypassrls) breaks the cycle: this function reads project_members
-- directly, without re-triggering project_members' own policies.
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;

-- Helper: does the current user have one of the given project_members roles
-- on this project? Same recursion-avoidance rationale as is_project_member.
CREATE OR REPLACE FUNCTION public.has_project_role(p_project_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND role = ANY (p_roles)
  );
$$;

-- ============================================
-- projects
-- ============================================
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;

CREATE POLICY "Admins have full access to projects" ON public.projects
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Members can view their projects" ON public.projects
  FOR SELECT USING (public.is_project_member(id));

-- Unchanged: creating a project can't check project_members membership yet
-- (the row doesn't exist until handle_new_project's AFTER INSERT trigger runs).
CREATE POLICY "Users can create their own projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creator can update their projects" ON public.projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Creator can delete their projects" ON public.projects
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- site_visits
-- ============================================
DROP POLICY IF EXISTS "Users can view visits of their projects" ON public.site_visits;
DROP POLICY IF EXISTS "Users can create visits for their projects" ON public.site_visits;
DROP POLICY IF EXISTS "Users can update their own visits" ON public.site_visits;
DROP POLICY IF EXISTS "Users can delete their own visits" ON public.site_visits;

CREATE POLICY "Admins have full access to site_visits" ON public.site_visits
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Members can view visits" ON public.site_visits
  FOR SELECT USING (public.is_project_member(project_id));

CREATE POLICY "Members can create visits" ON public.site_visits
  FOR INSERT WITH CHECK (public.is_project_member(project_id));

CREATE POLICY "Creator can update their visits" ON public.site_visits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Creator can delete their visits" ON public.site_visits
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- photos
-- ============================================
DROP POLICY IF EXISTS "Users can view photos of their projects" ON public.photos;
DROP POLICY IF EXISTS "Users can create photos for their visits" ON public.photos;
DROP POLICY IF EXISTS "Users can update their own photos" ON public.photos;
DROP POLICY IF EXISTS "Users can delete their own photos" ON public.photos;

CREATE POLICY "Admins have full access to photos" ON public.photos
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Members can view photos" ON public.photos
  FOR SELECT USING (public.is_project_member(project_id));

-- Tightened: the old policy only checked auth.uid() = user_id, with no
-- membership check at all, so any authenticated user could attach a photo
-- to any project_id. Now also requires project membership.
CREATE POLICY "Members can upload photos" ON public.photos
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.is_project_member(project_id)
  );

CREATE POLICY "Creator can update their photos" ON public.photos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Creator can delete their photos" ON public.photos
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- issues
-- ============================================
DROP POLICY IF EXISTS "Users can view issues of their projects" ON public.issues;
DROP POLICY IF EXISTS "Users can create issues for their projects" ON public.issues;
DROP POLICY IF EXISTS "Users can update issues they created" ON public.issues;
DROP POLICY IF EXISTS "Users can delete issues they created" ON public.issues;

CREATE POLICY "Admins have full access to issues" ON public.issues
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Members can view issues" ON public.issues
  FOR SELECT USING (public.is_project_member(project_id));

CREATE POLICY "Editors and owners can create issues" ON public.issues
  FOR INSERT WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'editor']));

CREATE POLICY "Creator can update their issues" ON public.issues
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Creator can delete their issues" ON public.issues
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- comments
-- ============================================
DROP POLICY IF EXISTS "Users can view comments on photos they can access" ON public.comments;
DROP POLICY IF EXISTS "Users can create comments on accessible photos" ON public.comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;

CREATE POLICY "Admins have full access to comments" ON public.comments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Members can view comments" ON public.comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.photos
            WHERE photos.id = comments.photo_id
              AND public.is_project_member(photos.project_id))
  );

CREATE POLICY "Members can create comments" ON public.comments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.photos
            WHERE photos.id = comments.photo_id
              AND public.is_project_member(photos.project_id))
  );

CREATE POLICY "Users can update their own comments" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON public.comments
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- notifications: missing INSERT policy
-- ============================================
-- notifications.user_id is the RECIPIENT, not the inserter (see
-- CommentThread.tsx's mention/reply flow: fromUserId notifies userId).
-- The table has no project_id/issue_id FK to scope against, so there's no
-- structural way to check "inserter shares a project with the recipient"
-- without a schema change. Defaulting to "any authenticated user" — tell me
-- if you want it scoped once notifications carry a project reference.
CREATE POLICY "Authenticated users can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
