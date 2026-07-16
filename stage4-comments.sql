-- ============================================
-- Stage 4 (schema + RLS only): comments on photos, issues, and visits
-- Run against dev via: psql <connection-string> -f stage4-comments.sql
-- Does NOT touch application code.
-- ============================================

-- ============================================
-- comments: add issue_id / visit_id / parent_comment_id
-- ============================================
ALTER TABLE public.comments
  ALTER COLUMN photo_id DROP NOT NULL;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES public.issues(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES public.site_visits(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

-- Exactly one of photo_id / issue_id / visit_id must be set.
-- num_nonnulls() is a builtin (9.6+) — counts non-null arguments.
ALTER TABLE public.comments
  ADD CONSTRAINT comments_exactly_one_target_check
  CHECK (num_nonnulls(photo_id, issue_id, visit_id) = 1);

CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON public.comments USING btree (issue_id);
CREATE INDEX IF NOT EXISTS idx_comments_visit_id ON public.comments USING btree (visit_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON public.comments USING btree (parent_comment_id);

-- ============================================
-- comment_mentions: join table for @-mention tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.comment_mentions (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment_id ON public.comment_mentions USING btree (comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user_id ON public.comment_mentions USING btree (user_id);

ALTER TABLE public.comment_mentions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper: resolve whichever target is set on a comment row to its project_id
-- ============================================
-- SECURITY DEFINER + owned by postgres for the same reason as
-- is_project_member/has_project_role (Stage 3): bypasses photos/issues/
-- site_visits' own RLS policies so this lookup can't get tangled in
-- re-evaluating them, and stays consistent with the established pattern.
-- Functionally it would also be *correct* without SECURITY DEFINER (a
-- non-member's lookup would just resolve to NULL under RLS, and
-- is_project_member(NULL) is false — same access outcome) but this avoids
-- the extra policy evaluation and matches Stage 3's helpers.
CREATE OR REPLACE FUNCTION public.comment_project_id(p_photo_id uuid, p_issue_id uuid, p_visit_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT project_id FROM public.photos WHERE id = p_photo_id),
    (SELECT project_id FROM public.issues WHERE id = p_issue_id),
    (SELECT project_id FROM public.site_visits WHERE id = p_visit_id)
  );
$$;

-- ============================================
-- comments: rewrite the two policies that assumed photo_id was the only target
-- ============================================
-- "Admins have full access to comments" and "Users can
-- update/delete their own comments" are untouched — they don't reference
-- photo_id at all.
DROP POLICY IF EXISTS "Members can view comments" ON public.comments;
DROP POLICY IF EXISTS "Members can create comments" ON public.comments;

CREATE POLICY "Members can view comments" ON public.comments
  FOR SELECT USING (
    public.is_project_member(public.comment_project_id(photo_id, issue_id, visit_id))
  );

-- Tightened same as Stage 3's photos fix: the old policy never checked
-- auth.uid() = user_id, so any project member could insert a comment
-- impersonating another user_id. Now required explicitly.
CREATE POLICY "Members can create comments" ON public.comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_project_member(public.comment_project_id(photo_id, issue_id, visit_id))
  );

-- ============================================
-- comment_mentions policies
-- ============================================
CREATE POLICY "Admins have full access to comment_mentions" ON public.comment_mentions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Members can view mentions on visible comments" ON public.comment_mentions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.comments
      WHERE comments.id = comment_mentions.comment_id
        AND public.is_project_member(
          public.comment_project_id(comments.photo_id, comments.issue_id, comments.visit_id)
        )
    )
  );

-- Only the comment's own author creates/removes its mention rows (the app
-- inserts comment + mentions together when a comment is submitted).
CREATE POLICY "Comment authors can create mentions" ON public.comment_mentions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comments
      WHERE comments.id = comment_mentions.comment_id AND comments.user_id = auth.uid()
    )
  );

CREATE POLICY "Comment authors can delete mentions" ON public.comment_mentions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.comments
      WHERE comments.id = comment_mentions.comment_id AND comments.user_id = auth.uid()
    )
  );

-- ============================================
-- Addendum: two pre-existing RLS gaps discovered while implementing the
-- comments code (not caused by the comments feature, but blocking it).
-- ============================================

-- Gap 1: profiles SELECT only allowed auth.uid() = id — no one could ever
-- read a teammate's display name, which breaks comment-author rendering and
-- @-mention suggestions for anyone but yourself.
CREATE OR REPLACE FUNCTION public.shares_project_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm1
    JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = auth.uid() AND pm2.user_id = p_user_id
  );
$$;

CREATE POLICY "Project teammates can view each other's profiles" ON public.profiles
  FOR SELECT USING (public.shares_project_with(id));

-- Gap 2: the original project_members SELECT policy only let the project's
-- original creator (projects.user_id) see the full roster; every other
-- member could only see their own single row. Non-owner members would get
-- an empty mention-suggestion list. Uses Stage 3's is_project_member() so
-- any member (owner/editor/commenter) sees the whole roster.
DROP POLICY IF EXISTS "Users can view members of their projects" ON public.project_members;
CREATE POLICY "Members can view their project roster" ON public.project_members
  FOR SELECT USING (public.is_project_member(project_id));

-- Gap 3: notifications never had a DELETE policy at all (SELECT/UPDATE own,
-- INSERT open from Stage 3 — no DELETE). NotificationBell.tsx's per-item
-- delete button would silently no-op (confirmed: DELETE 0 before this fix).
CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);
