import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../../lib/notificationsApi";
import type { Notification } from "../../lib/notificationsApi";
import { getRlsErrorMessage } from "../../lib/rlsErrors";

interface NotificationBellProps {
  userId: string;
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const navigate = useNavigate();
  const [showPanel, setShowPanel] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  // The full (capped-50) list is only ever fetched when the panel is
  // actually open — see the effect below. The 5s poll only checks the
  // cheap unread count (a `head:true` query, no rows transferred), so a
  // closed panel no longer re-downloads the user's entire notification
  // history every 5 seconds.
  const loadUnreadCount = async () => {
    setUnreadCount(await getUnreadCount(userId));
  };

  const loadFullList = async () => {
    const [userNotifications, unread] = await Promise.all([
      getUserNotifications(userId),
      getUnreadCount(userId),
    ]);
    setNotifications(userNotifications);
    setUnreadCount(unread);
  };

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (showPanel) loadFullList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPanel]);

  // Route to the most specific place the notification refers to: the issue
  // (with the triggering comment highlighted, if any), else the visit, else
  // just the project.
  const getNotificationPath = (notification: Notification): string => {
    if (notification.issueId) {
      const base = notification.visitId
        ? `/app/projects/${notification.projectId}/visits/${notification.visitId}/issues/${notification.issueId}`
        : `/app/projects/${notification.projectId}/issues/${notification.issueId}`;
      return notification.commentId ? `${base}?commentId=${notification.commentId}` : base;
    }
    if (notification.visitId) {
      return `/app/projects/${notification.projectId}/visits/${notification.visitId}`;
    }
    return `/app/projects/${notification.projectId}`;
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    await markAsRead(notification.id);
    setShowPanel(false);
    loadFullList();

    navigate(getNotificationPath(notification));
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(userId);
    loadFullList();
  };

  const handleDeleteNotification = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(notificationId);
      loadFullList();
    } catch (err) {
      toast.error(getRlsErrorMessage(err, "Impossible de supprimer cette notification."));
    }
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "mention":
        return "👤";
      case "reply":
        return "💬";
      case "issue_comment":
      case "visit_comment":
        return "🗨️";
      case "visit_created":
        return "📅";
      case "issue_created":
        return "⚠️";
      case "photo_created":
        return "📷";
      default:
        return "🔔";
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString("fr-CA");
  };

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === "unread") return !notification.read;
    if (filter === "read") return notification.read;
    return true; // 'all'
  });

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative w-9 h-9 flex items-center justify-center text-body hover:bg-subtle rounded-lg transition-colors"
        title="Notifications"
        aria-label={
          unreadCount > 0 ? `Notifications (${unreadCount} non lues)` : "Notifications"
        }
      >
        <Bell size={19} />
        {/* The design system marks unread state with a small dot rather than
            a count bubble. The exact number is still announced to screen
            readers via aria-label, and shown in the panel's filter tabs. */}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-brand-600 border-[1.5px] border-surface rounded-full" />
        )}
      </button>

      {/* Notification Panel */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-12 w-80 md:w-96 bg-surface rounded-xl shadow-lg border border-line z-50 max-h-[500px] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-line">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-ink">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-brand-strong hover:underline"
                  >
                    Tout marquer comme lu
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-1 bg-subtle rounded-lg p-1">
                <button
                  onClick={() => setFilter("all")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === "all"
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Toutes ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter("unread")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === "unread"
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Non lues ({unreadCount})
                </button>
                <button
                  onClick={() => setFilter("read")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === "read"
                      ? "bg-surface text-ink shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  Lues ({notifications.length - unreadCount})
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto flex-1">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-muted">
                  <Bell size={48} className="mx-auto mb-3 text-faint" />
                  <p className="text-sm font-medium mb-2">
                    {filter === "all" && "Aucune notification"}
                    {filter === "unread" && "Aucune notification non lue"}
                    {filter === "read" && "Aucune notification lue"}
                  </p>
                  <p className="text-xs text-faint">
                    {filter === "all" && "Les mentions et réponses apparaîtront ici"}
                    {filter === "unread" && "Toutes vos notifications sont lues"}
                    {filter === "read" && "Aucune notification marquée comme lue"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-4 cursor-pointer hover:bg-subtle transition-colors relative ${
                        !notification.read ? "bg-brand-50/40" : ""
                      }`}
                    >
                      {!notification.read && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-brand-600 rounded-full" />
                      )}

                      <div className="flex items-start gap-3 ml-3">
                        <div className="text-2xl flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink mb-1">
                            <span className="font-medium">{notification.fromUserName}</span>{" "}
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted">
                            {getRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteNotification(e, notification.id)}
                          className="p-1 text-faint hover:text-brand-600 transition-colors flex-shrink-0"
                          title="Supprimer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
