// Client-side API for managing notifications.
// Backed by Supabase (table `notifications`). The rich client-facing fields
// that have no dedicated column (commentId, issueId, projectId, visitId,
// photoId, fromUserId, fromUserName) are packed into the `data` JSONB column
// so we don't need a schema migration.

import { supabase } from "./supabase";
import { RlsWriteError } from "./rlsErrors";

export interface Notification {
  id: string;
  userId: string; // User who receives the notification
  type:
    | "mention"
    | "reply"
    | "issue_comment"
    | "visit_comment"
    | "visit_created"
    | "issue_created"
    | "photo_created";
  message: string;
  commentId?: string;
  issueId?: string;
  projectId: string;
  visitId?: string;
  photoId?: string;
  fromUserId: string;
  fromUserName: string;
  createdAt: string;
  read: boolean;
}

interface NotificationData {
  commentId?: string;
  issueId?: string;
  projectId?: string;
  visitId?: string;
  photoId?: string;
  fromUserId?: string;
  fromUserName?: string;
}

const TITLES: Record<Notification["type"], string> = {
  mention: "Mention",
  reply: "Réponse",
  issue_comment: "Commentaire",
  visit_comment: "Commentaire",
  visit_created: "Nouvelle visite",
  issue_created: "Nouvelle déficience",
  photo_created: "Nouvelles photos",
};

function rowToNotification(row: any): Notification {
  const data: NotificationData = row.data || {};
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    message: row.message || "",
    commentId: data.commentId || undefined,
    issueId: data.issueId || undefined,
    projectId: data.projectId || "",
    visitId: data.visitId || undefined,
    photoId: data.photoId || undefined,
    fromUserId: data.fromUserId || "",
    fromUserName: data.fromUserName || "",
    createdAt: row.created_at,
    read: row.read ?? false,
  };
}

// Get notifications for a specific user
export async function getUserNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading notifications:", error);
    return [];
  }
  return (data || []).map(rowToNotification);
}

// Get unread count for a user
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) {
    console.error("Error counting unread notifications:", error);
    return 0;
  }
  return count ?? 0;
}

export interface CreateNotificationParams {
  userId: string; // Recipient
  type: Notification["type"];
  message: string;
  fromUserId: string;
  fromUserName: string;
  projectId: string;
  issueId?: string;
  visitId?: string;
  photoId?: string;
  commentId?: string;
}

// Create a notification. Deliberately doesn't .select() the inserted row
// back: the recipient is usually someone other than the caller, and the
// "view your own notifications" SELECT policy blocks the caller from
// reading a row that isn't theirs — chaining .select().single() onto the
// insert made PostgREST require that (failing) read as part of the same
// request, so the insert itself was rejected even though it was valid.
export async function createNotification(params: CreateNotificationParams): Promise<boolean> {
  const data: NotificationData = {
    commentId: params.commentId,
    issueId: params.issueId,
    projectId: params.projectId,
    visitId: params.visitId,
    photoId: params.photoId,
    fromUserId: params.fromUserId,
    fromUserName: params.fromUserName,
  };

  const { error } = await supabase.from("notifications").insert([
    {
      user_id: params.userId,
      type: params.type,
      title: TITLES[params.type],
      message: params.message,
      data,
    },
  ]);

  if (error) {
    console.error("Error creating notification:", error);
    return false;
  }
  return true;
}

// The current owner of a project (project_members.role = 'owner'). Every
// project has exactly one, set once at creation and never reassignable via
// the UI, so a single row is always the right answer.
export async function getProjectOwnerId(projectId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("role", "owner")
    .maybeSingle();

  if (error) {
    console.error("Error resolving project owner:", error);
    return null;
  }
  return data?.user_id || null;
}

export interface NotifyProjectOwnerParams {
  projectId: string;
  actorId: string; // Person who performed the action - never notified about their own action
  actorName: string;
  type: "visit_created" | "issue_created" | "photo_created";
  message: string;
  issueId?: string;
  visitId?: string;
  photoId?: string;
}

// Notify the project owner of a new visit/issue/photo, unless they're the
// one who created it.
export async function notifyProjectOwner(params: NotifyProjectOwnerParams): Promise<void> {
  const ownerId = await getProjectOwnerId(params.projectId);
  if (!ownerId || ownerId === params.actorId) return;

  await createNotification({
    userId: ownerId,
    type: params.type,
    message: params.message,
    fromUserId: params.actorId,
    fromUserName: params.actorName,
    projectId: params.projectId,
    issueId: params.issueId,
    visitId: params.visitId,
    photoId: params.photoId,
  });
}

// Mark notification as read
export async function markAsRead(notificationId: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) {
    console.error("Error marking notification as read:", error);
    return false;
  }
  return true;
}

// Mark all notifications as read for a user
export async function markAllAsRead(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) {
    console.error("Error marking all notifications as read:", error);
    return false;
  }
  return true;
}

// Delete a notification. Throws on failure, including an RLS-blocked
// delete (e.g. trying to delete someone else's notification) — see
// rlsErrors.ts.
export async function deleteNotification(notificationId: string): Promise<void> {
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .select();

  if (error) {
    console.error("Error deleting notification:", error);
    throw new RlsWriteError(error.message, error.code);
  }
  if (!data || data.length === 0) {
    throw new RlsWriteError("No rows deleted", "PGRST116");
  }
}
