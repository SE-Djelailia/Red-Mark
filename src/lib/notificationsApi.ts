export interface Notification {
  id: string;
  userId: string; // User who receives the notification
  type: 'mention' | 'reply';
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

const STORAGE_KEY = 'redmark_notifications';

// Get all notifications from localStorage
function getAllNotifications(): Notification[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading notifications:', error);
    return [];
  }
}

// Save all notifications to localStorage
function saveAllNotifications(notifications: Notification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch (error) {
    console.error('Error saving notifications:', error);
  }
}

// Get notifications for a specific user
export function getUserNotifications(userId: string): Notification[] {
  const allNotifications = getAllNotifications();
  return allNotifications
    .filter(notif => notif.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Get unread count for a user
export function getUnreadCount(userId: string): number {
  const notifications = getUserNotifications(userId);
  return notifications.filter(n => !n.read).length;
}

// Create a notification
export function createNotification(
  userId: string,
  type: Notification['type'],
  message: string,
  commentId: string,
  issueId: string,
  projectId: string,
  fromUserId: string,
  fromUserName: string,
  visitId?: string
): Notification {
  console.log('🔔 Creating notification:', { userId, type, fromUserName, message });
  
  const notification: Notification = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    userId,
    type,
    message,
    commentId,
    issueId,
    projectId,
    visitId,
    fromUserId,
    fromUserName,
    createdAt: new Date().toISOString(),
    read: false,
  };

  const allNotifications = getAllNotifications();
  allNotifications.push(notification);
  saveAllNotifications(allNotifications);
  
  console.log('✅ Notification saved to localStorage:', notification);
  console.log('📊 Total notifications in storage:', allNotifications.length);

  return notification;
}

// Mark notification as read
export function markAsRead(notificationId: string): boolean {
  const allNotifications = getAllNotifications();
  const index = allNotifications.findIndex(n => n.id === notificationId);
  
  if (index === -1) return false;

  allNotifications[index].read = true;
  saveAllNotifications(allNotifications);
  return true;
}

// Mark all notifications as read for a user
export function markAllAsRead(userId: string): boolean {
  const allNotifications = getAllNotifications();
  let updated = false;

  allNotifications.forEach(notif => {
    if (notif.userId === userId && !notif.read) {
      notif.read = true;
      updated = true;
    }
  });

  if (updated) {
    saveAllNotifications(allNotifications);
  }

  return updated;
}

// Delete a notification
export function deleteNotification(notificationId: string): boolean {
  const allNotifications = getAllNotifications();
  const filtered = allNotifications.filter(n => n.id !== notificationId);
  
  if (filtered.length === allNotifications.length) return false;

  saveAllNotifications(filtered);
  return true;
}

// Get all users (for mention suggestions)
export function getAllUsers(): Array<{ id: string; name: string; email: string }> {
  try {
    const users = JSON.parse(localStorage.getItem('redmark_users') || '[]');
    return users.map((u: any) => ({
      id: u.id,
      name: u.user_metadata?.name || u.email,
      email: u.email,
    }));
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}