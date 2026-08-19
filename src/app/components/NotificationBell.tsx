import { useState, useEffect } from "react";
import { AtSign, Bell, MessageSquare, Reply, X } from "lucide-react";
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
import { IconPhoto, IconVisit, MarkX } from "./ui-kit/RedMarkIcons";

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

  // These were emoji — 👤 for a mention, 💬/🗨️ for comments, and so on.
  // That is why no colour grep ever found them: the purple and lavender came
  // from the platform's emoji font, not from a class or a hex value. Emoji
  // also carry their own weight, corner radius and palette, none of which
  // this system controls, so they can never sit right beside drawn icons.
  //
  // Now: system icons, ink, inheriting stroke weight and butt caps from the
  // `.lucide` rule. `issue_created` takes the RedMark X — a notification
  // ABOUT a déficience is the one case the mark genuinely applies. It is
  // still ink here, not red: the alert is the unread rule on the row, and
  // colouring the glyph too would put two reds on one row.
  const NotificationIcon = ({ type }: { type: Notification["type"] }) => {
    const props = { size: 16, className: "text-muted" } as const;
    switch (type) {
      case "mention":
        return <AtSign {...props} />;
      case "reply":
        return <Reply {...props} />;
      case "issue_comment":
      case "visit_comment":
        return <MessageSquare {...props} />;
      case "visit_created":
        return <IconVisit {...props} />;
      case "issue_created":
        return <MarkX {...props} />;
      case "photo_created":
        return <IconPhoto {...props} />;
      default:
        return <Bell {...props} />;
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
        className="relative w-9 h-9 flex items-center justify-center text-body hover:bg-subtle rounded-[4px] transition-colors"
        title="Notifications"
        aria-label={
          unreadCount > 0 ? `Notifications (${unreadCount} non lues)` : "Notifications"
        }
      >
        <Bell size={20} />
        {/* The design system marks unread state with a small dot rather than
            a count bubble. The exact number is still announced to screen
            readers via aria-label, and shown in the panel's filter tabs. */}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-brand-600 border-[1.5px] border-surface rounded-[1px]" />
        )}
      </button>

      {/* Notification Panel */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />

          {/* Panel */}
          <div className="rm-enter absolute right-0 top-12 w-80 md:w-96 bg-surface rounded-[4px] shadow-[0_8px_24px_rgb(20_20_20/0.12)] border border-line z-50 max-h-[500px] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-line">
              <div className="flex items-center justify-between mb-3">
                <h3 className="rm-label">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-body hover:text-ink transition-colors duration-(--duration-fast) ease-out"
                  >
                    Tout marquer comme lu
                  </button>
                )}
              </div>

              {/* Filter Tabs — the system's segmented control: one bordered
                  row, hairline dividers, ink fill on the active segment. The
                  previous treatment was the iOS idiom (a tinted tray holding a
                  white pill with a shadow), which reads as a raised object; a
                  drawing has no raised objects, and the 4px radius ceiling and
                  shadow-free surfaces both rule it out. */}
              <div className="flex rounded-[4px] border border-line-strong overflow-hidden divide-x divide-line-strong">
                <button
                  onClick={() => setFilter("all")}
                  className={`flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-(--duration-fast) ease-out ${
                    filter === "all"
                      ? "bg-ink text-white"
                      : "bg-surface text-muted hover:text-ink"
                  }`}
                >
                  Toutes ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter("unread")}
                  className={`flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-(--duration-fast) ease-out ${
                    filter === "unread"
                      ? "bg-ink text-white"
                      : "bg-surface text-muted hover:text-ink"
                  }`}
                >
                  Non lues ({unreadCount})
                </button>
                <button
                  onClick={() => setFilter("read")}
                  className={`flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-(--duration-fast) ease-out ${
                    filter === "read"
                      ? "bg-ink text-white"
                      : "bg-surface text-muted hover:text-ink"
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
                  <Bell size={48} className="mx-auto mb-3 text-faint lucide-display" />
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
                      // Unread carried a red tint AND a red dot — two reds per
                      // row, times every unread row. Now one 2px leading rule,
                      // always present so marking a row cannot reflow the list.
                      className={`border-l-2 p-4 cursor-pointer hover:bg-subtle transition-colors duration-(--duration-base) ease-out ${
                        !notification.read ? "border-l-brand-600" : "border-l-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* A fixed 20px box so every row's text starts on the
                            same left edge regardless of glyph width — emoji
                            were variable-width and the column ragged. */}
                        <div className="w-5 flex justify-center flex-shrink-0 mt-0.5">
                          <NotificationIcon type={notification.type} />
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
                          className="w-7 h-7 -m-0.5 flex items-center justify-center text-faint hover:text-ink rounded-[2px] transition-colors duration-(--duration-fast) ease-out flex-shrink-0"
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
