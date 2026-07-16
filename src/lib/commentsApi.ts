// Client-side API for managing comments on photos, issues, and visits.
// Backed by Supabase (tables `comments` and `comment_mentions`).

import { supabase } from "./supabase";

export interface Comment {
  id: string;
  issueId?: string; // Optional - for issue comments
  visitId?: string; // Optional - for visit comments
  photoId?: string; // Optional - for photo comments
  author: string;
  authorId: string;
  date: string;
  text: string;
  parentCommentId?: string; // For threaded replies
  mentions?: string[]; // User IDs mentioned in the comment
}

export interface Teammate {
  id: string;
  name: string;
  email: string;
}

type Target = { issueId: string } | { visitId: string } | { photoId: string };

function targetColumns(target: Target) {
  if ("issueId" in target) return { issue_id: target.issueId, visit_id: null, photo_id: null };
  if ("visitId" in target) return { issue_id: null, visit_id: target.visitId, photo_id: null };
  return { issue_id: null, visit_id: null, photo_id: target.photoId };
}

function rowToComment(row: any, authorName: string, mentions: string[]): Comment {
  return {
    id: row.id,
    issueId: row.issue_id || undefined,
    visitId: row.visit_id || undefined,
    photoId: row.photo_id || undefined,
    author: authorName,
    authorId: row.user_id,
    date: row.created_at,
    text: row.content,
    parentCommentId: row.parent_comment_id || undefined,
    mentions: mentions.length > 0 ? mentions : undefined,
  };
}

// Batch-resolve display names for a set of user IDs via `profiles`
async function resolveAuthorNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return names;

  const { data, error } = await supabase.from("profiles").select("id, name, email").in("id", uniqueIds);
  if (error) {
    console.error("Error resolving comment author names:", error);
    return names;
  }
  (data || []).forEach((profile) => {
    names.set(profile.id, profile.name || profile.email || "Utilisateur");
  });
  return names;
}

// Batch-fetch mentions for a set of comment IDs
async function resolveMentions(commentIds: string[]): Promise<Map<string, string[]>> {
  const mentionsByComment = new Map<string, string[]>();
  if (commentIds.length === 0) return mentionsByComment;

  const { data, error } = await supabase
    .from("comment_mentions")
    .select("comment_id, user_id")
    .in("comment_id", commentIds);
  if (error) {
    console.error("Error fetching comment mentions:", error);
    return mentionsByComment;
  }
  (data || []).forEach((row) => {
    const list = mentionsByComment.get(row.comment_id) || [];
    list.push(row.user_id);
    mentionsByComment.set(row.comment_id, list);
  });
  return mentionsByComment;
}

async function getCommentsForTarget(
  column: "issue_id" | "visit_id" | "photo_id",
  id: string,
): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq(column, id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`Error fetching comments (${column}):`, error);
    return [];
  }
  const rows = data || [];
  if (rows.length === 0) return [];

  const [authorNames, mentionsByComment] = await Promise.all([
    resolveAuthorNames(rows.map((r) => r.user_id)),
    resolveMentions(rows.map((r) => r.id)),
  ]);

  return rows.map((row) =>
    rowToComment(row, authorNames.get(row.user_id) || "Utilisateur", mentionsByComment.get(row.id) || []),
  );
}

// Get comments for a specific issue
export async function getCommentsForIssue(issueId: string): Promise<Comment[]> {
  return getCommentsForTarget("issue_id", issueId);
}

// Get comments for a specific visit
export async function getCommentsForVisit(visitId: string): Promise<Comment[]> {
  return getCommentsForTarget("visit_id", visitId);
}

// Get comments for a specific photo
export async function getCommentsForPhoto(photoId: string): Promise<Comment[]> {
  return getCommentsForTarget("photo_id", photoId);
}

async function createComment(
  target: Target,
  text: string,
  author: string,
  authorId: string,
  parentCommentId?: string,
  mentions?: string[],
): Promise<Comment> {
  const { data, error } = await supabase
    .from("comments")
    .insert([
      {
        user_id: authorId,
        content: text,
        parent_comment_id: parentCommentId || null,
        ...targetColumns(target),
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating comment:", error);
    throw error;
  }

  if (mentions && mentions.length > 0) {
    const { error: mentionsError } = await supabase
      .from("comment_mentions")
      .insert(mentions.map((userId) => ({ comment_id: data.id, user_id: userId })));
    if (mentionsError) {
      console.error("Error recording comment mentions:", mentionsError);
    }
  }

  return rowToComment(data, author, mentions || []);
}

// Add a new comment for an issue
export async function addComment(
  issueId: string,
  text: string,
  author: string,
  authorId: string,
  parentCommentId?: string,
  mentions?: string[],
): Promise<Comment> {
  return createComment({ issueId }, text, author, authorId, parentCommentId, mentions);
}

// Add a new comment for a visit
export async function addVisitComment(
  visitId: string,
  text: string,
  author: string,
  authorId: string,
  parentCommentId?: string,
  mentions?: string[],
): Promise<Comment> {
  return createComment({ visitId }, text, author, authorId, parentCommentId, mentions);
}

// Add a new comment for a photo
export async function addPhotoComment(
  photoId: string,
  text: string,
  author: string,
  authorId: string,
  parentCommentId?: string,
  mentions?: string[],
): Promise<Comment> {
  return createComment({ photoId }, text, author, authorId, parentCommentId, mentions);
}

// Update a comment's text
export async function updateComment(commentId: string, text: string): Promise<boolean> {
  const { error } = await supabase.from("comments").update({ content: text }).eq("id", commentId);
  if (error) {
    console.error("Error updating comment:", error);
    return false;
  }
  return true;
}

// Delete a comment (cascades to its mentions and replies)
export async function deleteComment(commentId: string): Promise<boolean> {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) {
    console.error("Error deleting comment:", error);
    return false;
  }
  return true;
}

// Real project roster for @-mention suggestions and author lookups.
// Replaces the legacy localStorage-backed projectMembersApi.getMembersByProject
// for this purpose (that module is a separate, unrelated team-invites feature
// with its own disconnected data model).
export async function getProjectTeammates(projectId: string): Promise<Teammate[]> {
  const { data: members, error: membersError } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);

  if (membersError) {
    console.error("Error fetching project roster:", membersError);
    return [];
  }

  const userIds = (members || []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", userIds);

  if (profilesError) {
    console.error("Error fetching teammate profiles:", profilesError);
    return [];
  }

  return (profiles || []).map((p) => ({ id: p.id, name: p.name || p.email, email: p.email }));
}
