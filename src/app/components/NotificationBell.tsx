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

  const loadNotifications = async () => {
    const [userNotifications, unread] = await Promise.all([
      getUserNotifications(userId),
      getUnreadCount(userId),
    ]);
    setNotifications(userNotifications);
    setUnreadCount(unread);
  };

  useEffect(() => {
    loadNotifications();

    // Poll for new notifications every 5 seconds
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, [userId]);

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
    loadNotifications();

    navigate(getNotificationPath(notification));
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(userId);
    loadNotifications();
  };

  const handleDeleteNotification = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(notificationId);
      loadNotifications();
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
        className="relative p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#E10600] text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-12 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[500px] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-[#1A1A1A]">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-[#E10600] hover:underline"
                  >
                    Tout marquer comme lu
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setFilter("all")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === "all"
                      ? "bg-white text-[#1A1A1A] shadow-sm"
                      : "text-gray-600 hover:text-[#1A1A1A]"
                  }`}
                >
                  Toutes ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter("unread")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === "unread"
                      ? "bg-white text-[#1A1A1A] shadow-sm"
                      : "text-gray-600 hover:text-[#1A1A1A]"
                  }`}
                >
                  Non lues ({unreadCount})
                </button>
                <button
                  onClick={() => setFilter("read")}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === "read"
                      ? "bg-white text-[#1A1A1A] shadow-sm"
                      : "text-gray-600 hover:text-[#1A1A1A]"
                  }`}
                >
                  Lues ({notifications.length - unreadCount})
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto flex-1">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-medium mb-2">
                    {filter === "all" && "Aucune notification"}
                    {filter === "unread" && "Aucune notification non lue"}
                    {filter === "read" && "Aucune notification lue"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {filter === "all" && "Les mentions et réponses apparaîtront ici"}
                    {filter === "unread" && "Toutes vos notifications sont lues"}
                    {filter === "read" && "Aucune notification marquée comme lue"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors relative ${
                        !notification.read ? "bg-blue-50/50" : ""
                      }`}
                    >
                      {!notification.read && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#E10600] rounded-full" />
                      )}

                      <div className="flex items-start gap-3 ml-3">
                        <div className="text-2xl flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#1A1A1A] mb-1">
                            <span className="font-medium">{notification.fromUserName}</span>{" "}
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500">
                            {getRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteNotification(e, notification.id)}
                          className="p-1 text-gray-400 hover:text-[#E10600] transition-colors flex-shrink-0"
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
