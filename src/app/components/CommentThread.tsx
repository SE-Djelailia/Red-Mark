import { useState, useRef, useEffect } from "react";
import { Edit, Trash2, Reply, AtSign, Send, MoreVertical } from "lucide-react";
import { getMembersByProject } from "../../lib/projectMembersApi";
import { formatRelativeDate } from "../../lib/dateUtils";
import { addComment, updateComment, deleteComment } from "../../lib/commentsApi";
import { createNotification } from "../../lib/notificationsApi";
import { useAuth } from "../../contexts/useAuth";
import type { Comment } from "../../lib/commentsApi";

interface CommentThreadProps {
  comments: Comment[];
  issueId: string;
  projectId: string;
  visitId?: string;
  onCommentsUpdate: (comments: Comment[]) => void;
  highlightCommentId?: string | null;
}

export default function CommentThread({
  comments,
  issueId,
  projectId,
  visitId,
  onCommentsUpdate,
  highlightCommentId,
}: CommentThreadProps) {
  const { user } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Get current user from Supabase auth (single source of truth)
  const getCurrentUser = () => ({
    id: user?.id || "anonymous",
    name: user?.user_metadata?.name || user?.email || "Utilisateur",
  });

  // Scroll to highlighted comment
  useEffect(() => {
    if (highlightCommentId && commentRefs.current[highlightCommentId]) {
      setTimeout(() => {
        commentRefs.current[highlightCommentId]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 500);
    }
  }, [highlightCommentId]);

  // Detect @mentions in text
  const detectMentions = (text: string) => {
    // Match @UserName or @"User Name" (with quotes for names with spaces)
    const allUsers = getMembersByProject(projectId);
    const mentionedUserIds: string[] = [];

    // Try to find all users mentioned in the text
    allUsers.forEach((user) => {
      // Check if user name appears after @
      const patterns = [
        new RegExp(`@${user.name.replace(/\s+/g, "\\s+")}(?=\\s|$)`, "gi"),
        new RegExp(`@${user.name.split(" ")[0]}(?=\\s|$)`, "gi"), // First name only
      ];

      patterns.forEach((pattern) => {
        if (pattern.test(text)) {
          if (!mentionedUserIds.includes(user.id)) {
            mentionedUserIds.push(user.id);
          }
        }
      });
    });

    return mentionedUserIds;
  };

  // Handle text input and detect @ for mention autocomplete
  const handleTextChange = (text: string) => {
    setCommentText(text);

    // Check if user just typed @
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1 && cursorPos - lastAtIndex <= 20) {
      const searchQuery = textBeforeCursor.substring(lastAtIndex + 1);
      if (!searchQuery.includes(" ")) {
        // Show mention suggestions
        const users = getMembersByProject(projectId);
        const filtered = users.filter((u) =>
          u.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );
        setMentionSuggestions(filtered.slice(0, 5));
        setShowMentionSuggestions(filtered.length > 0);
        setCursorPosition(lastAtIndex);
      } else {
        setShowMentionSuggestions(false);
      }
    } else {
      setShowMentionSuggestions(false);
    }
  };

  // Insert mention into text
  const insertMention = (userName: string, userId: string) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = commentText.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = commentText.substring(cursorPos);

    const newText = commentText.substring(0, lastAtIndex) + `@${userName} ` + textAfterCursor;
    setCommentText(newText);
    setShowMentionSuggestions(false);

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = lastAtIndex + userName.length + 2;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Add comment with mentions and replies
  const handleAddComment = () => {
    if (!commentText.trim()) return;

    const currentUser = getCurrentUser();
    console.log("🔵 Current user:", currentUser);

    const mentionedUserIds = detectMentions(commentText);
    console.log("🔵 Detected mentions:", mentionedUserIds);
    console.log("🔵 Comment text:", commentText);

    // Create comment
    const newComment = addComment(
      issueId,
      commentText,
      currentUser.name,
      currentUser.id,
      replyingToId || undefined,
      mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
    );

    if (newComment) {
      console.log("✅ Comment created:", newComment);

      // Create notifications for mentioned users
      mentionedUserIds.forEach((userId) => {
        if (userId !== currentUser.id) {
          console.log("📧 Creating notification for user:", userId);
          createNotification(
            userId,
            "mention",
            `vous a mentionné dans un commentaire`,
            newComment.id,
            issueId,
            projectId,
            currentUser.id,
            currentUser.name,
            visitId,
          );
          console.log("✅ Notification created for:", userId);
        }
      });

      // Create notification for parent comment author (if replying)
      if (replyingToId) {
        const parentComment = comments.find((c) => c.id === replyingToId);
        if (parentComment && parentComment.authorId !== currentUser.id) {
          console.log("📧 Creating reply notification for:", parentComment.authorId);
          createNotification(
            parentComment.authorId,
            "reply",
            `a répondu à votre commentaire`,
            newComment.id,
            issueId,
            projectId,
            currentUser.id,
            currentUser.name,
            visitId,
          );
          console.log("✅ Reply notification created");
        }
      }

      // Update comments list
      onCommentsUpdate([...comments, newComment]);
      setCommentText("");
      setReplyingToId(null);
    }
  };

  const handleEditComment = (commentId: string) => {
    setEditingCommentId(commentId);
    const commentToEdit = comments.find((c) => c.id === commentId);
    if (commentToEdit) {
      setEditingCommentText(commentToEdit.text);
    }
  };

  const handleSaveComment = () => {
    if (editingCommentId && editingCommentText.trim()) {
      const updatedComment = updateComment(editingCommentId, editingCommentText);
      if (updatedComment) {
        onCommentsUpdate(comments.map((c) => (c.id === editingCommentId ? updatedComment : c)));
        setEditingCommentId(null);
        setEditingCommentText("");
      }
    }
  };

  const handleDeleteComment = (commentId: string) => {
    if (confirm("Supprimer ce commentaire?")) {
      const success = deleteComment(commentId);
      if (success) {
        onCommentsUpdate(comments.filter((c) => c.id !== commentId));
      }
    }
  };

  const handleReply = (commentId: string, authorName: string) => {
    setReplyingToId(commentId);
    setCommentText(`@${authorName} `);
    textareaRef.current?.focus();
  };

  // Render comment with replies threaded
  const renderComment = (comment: Comment, isReply: boolean = false) => {
    const currentUser = getCurrentUser();
    const isHighlighted = comment.id === highlightCommentId;
    const replies = comments.filter((c) => c.parentCommentId === comment.id);

    return (
      <div
        key={comment.id}
        ref={(el) => (commentRefs.current[comment.id] = el)}
        className={`${isReply ? "ml-8 mt-2" : ""}`}
      >
        <div
          className={`bg-gray-50 rounded-lg p-4 transition-all ${
            isHighlighted ? "ring-2 ring-[#E10600] shadow-lg" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#E10600] text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              {comment.author
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-[#1A1A1A]">{comment.author}</span>
                <span className="text-xs text-gray-500">{formatRelativeDate(comment.date)}</span>
                {comment.parentCommentId && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Reply size={12} />
                    réponse
                  </span>
                )}
              </div>

              {editingCommentId === comment.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editingCommentText}
                    onChange={(e) => setEditingCommentText(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveComment}
                      className="px-4 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium text-sm"
                    >
                      Sauvegarder
                    </button>
                    <button
                      onClick={() => {
                        setEditingCommentId(null);
                        setEditingCommentText("");
                      }}
                      className="px-4 py-2 bg-gray-200 text-[#1A1A1A] rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {comment.text}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => handleReply(comment.id, comment.author)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-[#E10600] transition-colors"
                      title="Répondre"
                    >
                      <Reply size={14} />
                      <span>Répondre</span>
                    </button>
                    {comment.authorId === currentUser.id && (
                      <>
                        <button
                          onClick={() => handleEditComment(comment.id)}
                          className="p-1.5 text-gray-400 hover:text-[#E10600] transition-colors"
                          title="Modifier"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="p-1.5 text-gray-400 hover:text-[#E10600] transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Render replies */}
        {replies.map((reply) => renderComment(reply, true))}
      </div>
    );
  };

  // Get top-level comments (no parent)
  const topLevelComments = comments.filter((c) => !c.parentCommentId);

  return (
    <div className="space-y-4">
      {/* Comment List */}
      {topLevelComments.map((comment) => renderComment(comment))}

      {/* Add Comment Form */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        {replyingToId && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Reply size={16} />
            <span>Répondre au commentaire</span>
            <button
              onClick={() => {
                setReplyingToId(null);
                setCommentText("");
              }}
              className="ml-auto text-[#E10600] hover:underline"
            >
              Annuler
            </button>
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Écrivez un commentaire... (utilisez @ pour mentionner quelqu'un)"
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent resize-none"
          />

          {/* Mention Autocomplete */}
          {showMentionSuggestions && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
              {mentionSuggestions.map((user) => (
                <button
                  key={user.id}
                  onClick={() => insertMention(user.name, user.id)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <AtSign size={16} className="text-gray-400" />
                  <span className="text-sm text-[#1A1A1A]">{user.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAddComment}
            disabled={!commentText.trim()}
            className="flex-1 py-2.5 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {replyingToId ? "Répondre" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}
