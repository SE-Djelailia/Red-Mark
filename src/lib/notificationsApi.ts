// Client-side API for managing notifications.
// Backed by Supabase (table `notifications`). The rich client-facing fields
// that have no dedicated column (commentId, issueId, projectId, visitId,
// fromUserId, fromUserName) are packed into the `data` JSONB column so we
// don't need a schema migration.

import { supabase } from "./supabase";

export interface Notification {
  id: string;
  userId: string; // User who receives the notification
  type: "mention" | "reply";
  message: string;
  commentId: string;
  issueId: string;
  projectId: string;
  visitId?: string;
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
  fromUserId?: string;
  fromUserName?: string;
}

const TITLES: Record<Notification["type"], string> = {
  mention: "Mention",
  reply: "Réponse",
};

function rowToNotification(row: any): Notification {
  const data: NotificationData = row.data || {};
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    message: row.message || "",
    commentId: data.commentId || "",
    issueId: data.issueId || "",
    projectId: data.projectId || "",
    visitId: data.visitId || undefined,
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

// Create a notification
export async function createNotification(
  userId: string,
  type: Notification["type"],
  message: string,
  commentId: string,
  issueId: string,
  projectId: string,
  fromUserId: string,
  fromUserName: string,
  visitId?: string,
): Promise<Notification | null> {
  const data: NotificationData = { commentId, issueId, projectId, visitId, fromUserId, fromUserName };

  const { data: row, error } = await supabase
    .from("notifications")
    .insert([{ user_id: userId, type, title: TITLES[type], message, data }])
    .select()
    .single();

  if (error) {
    console.error("Error creating notification:", error);
    return null;
  }
  return rowToNotification(row);
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

// Delete a notification
export async function deleteNotification(notificationId: string): Promise<boolean> {
  const { error } = await supabase.from("notifications").delete().eq("id", notificationId);

  if (error) {
    console.error("Error deleting notification:", error);
    return false;
  }
  return true;
}
