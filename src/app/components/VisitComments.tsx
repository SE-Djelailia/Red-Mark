import { useState, useEffect } from "react";
import { MessageSquare, Send, Reply, AtSign, X, Edit2, Trash2 } from "lucide-react";
import { getCommentsForVisit, addVisitComment, updateComment, deleteComment, type Comment } from "../../lib/commentsApi";
import { getMembersByProject, type ProjectMember } from "../../lib/projectMembersApi";
import { useAuth } from "../../contexts/useAuth";

interface VisitCommentsProps {
  visitId: string;
  projectId: string;
}

export default function VisitComments({ visitId, projectId }: VisitCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSearchQuery, setMentionSearchQuery] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  // Mock team members for mentions - In production, this would come from the project's team
  const [teamMembers, setTeamMembers] = useState<ProjectMember[]>([]);

  useEffect(() => {
    loadComments();
    loadTeamMembers();
  }, [visitId, projectId]);

  const loadComments = () => {
    const visitComments = getCommentsForVisit(visitId);
    setComments(visitComments);
  };

  const loadTeamMembers = () => {
    const members = getMembersByProject(projectId);
    setTeamMembers(members);
  };

  const handleSubmitComment = () => {
    if (!newCommentText.trim() || !user) return;

    // Extract mentions from text (e.g., @Marie-Claude Bouchard)
    const mentionPattern = /@([\w\s-]+)/g;
    const mentionedNames = [...newCommentText.matchAll(mentionPattern)].map(m => m[1]);
    const mentions = teamMembers
      .filter(member => mentionedNames.some(name => member.name.includes(name)))
      .map(member => member.id);

    // Get author name from user metadata or email
    const authorName = user.user_metadata?.name || user.email?.split('@')[0] || 'Utilisateur';

    const newComment = addVisitComment(
      visitId,
      newCommentText,
      authorName,
      user.id,
      replyingTo || undefined,
      mentions.length > 0 ? mentions : undefined
    );

    setComments([...comments, newComment]);
    setNewCommentText("");
    setReplyingTo(null);
  };

  const handleMention = (memberName: string) => {
    const lastAtIndex = newCommentText.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const beforeAt = newCommentText.substring(0, lastAtIndex);
      setNewCommentText(`${beforeAt}@${memberName} `);
    } else {
      setNewCommentText(`${newCommentText}@${memberName} `);
    }
    setShowMentionSuggestions(false);
    setMentionSearchQuery("");
  };

  const handleTextChange = (text: string) => {
    setNewCommentText(text);

    // Check if user is typing a mention
    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = text.substring(lastAtIndex + 1);
      // Only show suggestions if there's no space after @
      if (!afterAt.includes(" ")) {
        setMentionSearchQuery(afterAt);
        setShowMentionSuggestions(true);
      } else {
        setShowMentionSuggestions(false);
      }
    } else {
      setShowMentionSuggestions(false);
    }
  };

  const handleEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };

  const handleSaveEdit = () => {
    if (!editingCommentId || !editingCommentText.trim()) return;

    const updatedComment = updateComment(editingCommentId, editingCommentText);
    if (updatedComment) {
      setComments(comments.map(c => c.id === editingCommentId ? updatedComment : c));
      setEditingCommentId(null);
      setEditingCommentText("");
    }
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  const handleDeleteComment = (commentId: string) => {
    if (window.confirm("Supprimer ce commentaire ?")) {
      const success = deleteComment(commentId);
      if (success) {
        setComments(comments.filter(c => c.id !== commentId));
      }
    }
  };

  const filteredTeamMembers = teamMembers.filter(member =>
    member.name.toLowerCase().includes(mentionSearchQuery.toLowerCase())
  );

  // Organize comments into threads
  const topLevelComments = comments.filter(c => !c.parentCommentId);
  const getReplies = (commentId: string) => 
    comments.filter(c => c.parentCommentId === commentId);

  const CommentCard = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => {
    const replies = getReplies(comment.id);
    const isOwner = user && comment.authorId === user.id;
    const isEditing = editingCommentId === comment.id;

    return (
      <div className={`${isReply ? 'ml-12 mt-3' : 'mb-4'}`}>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#E10600] text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              {comment.author ? comment.author.split(' ').map(n => n[0]).join('') : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#1A1A1A]">{comment.author || 'Anonyme'}</span>
                  <span className="text-xs text-gray-500">
                    {(() => {
                      const date = new Date(comment.date);
                      const now = new Date();
                      const diffMs = now.getTime() - date.getTime();
                      const diffMins = Math.floor(diffMs / 60000);
                      const diffHours = Math.floor(diffMins / 60);
                      const diffDays = Math.floor(diffHours / 24);

                      if (diffMins < 1) return "À l'instant";
                      if (diffMins < 60) return `Il y a ${diffMins} min`;
                      if (diffHours < 24) return `Il y a ${diffHours}h`;
                      if (diffDays < 7) return `Il y a ${diffDays}j`;

                      return date.toLocaleDateString('fr-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
                      }) + ' à ' + date.toLocaleTimeString('fr-CA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    })()}
                  </span>
                </div>
                {isOwner && !isEditing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditComment(comment)}
                      className="p-1 text-gray-400 hover:text-[#E10600] transition-colors"
                      title="Modifier"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editingCommentText}
                    onChange={(e) => setEditingCommentText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent text-sm"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-1.5 bg-[#E10600] text-white rounded-lg text-xs hover:bg-[#C00500] transition-colors"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300 transition-colors"
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
                  <button
                    onClick={() => setReplyingTo(comment.id)}
                    className="mt-2 text-xs text-[#E10600] hover:text-[#C00500] flex items-center gap-1"
                  >
                    <Reply size={12} />
                    <span>Répondre</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Nested replies */}
        {replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {replies.map(reply => (
              <CommentCard key={reply.id} comment={reply} isReply={true} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Comments List */}
      <div className="space-y-4">
        {topLevelComments.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">Aucun commentaire pour cette visite</p>
            <p className="text-gray-400 text-xs mt-1">Soyez le premier à commenter!</p>
          </div>
        ) : (
          topLevelComments.map(comment => (
            <CommentCard key={comment.id} comment={comment} />
          ))
        )}
      </div>

      {/* New Comment Input */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {replyingTo && (
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-600 bg-blue-50 px-3 py-2 rounded">
            <Reply size={14} />
            <span>
              Répondre à {comments.find(c => c.id === replyingTo)?.author}
            </span>
            <button
              onClick={() => setReplyingTo(null)}
              className="ml-auto text-gray-500 hover:text-[#E10600]"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="relative">
          <textarea
            value={newCommentText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Ajouter un commentaire... (Utilisez @ pour mentionner)"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-transparent"
            rows={3}
          />

          {/* Mention Suggestions */}
          {showMentionSuggestions && filteredTeamMembers.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
              {filteredTeamMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => handleMention(member.name)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-[#E10600] text-white flex items-center justify-center text-xs font-medium">
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A]">{member.name}</div>
                    <div className="text-xs text-gray-500">{member.email}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setShowMentionSuggestions(!showMentionSuggestions)}
            className="text-sm text-gray-600 hover:text-[#E10600] flex items-center gap-1"
          >
            <AtSign size={16} />
            <span>Mentionner</span>
          </button>

          <button
            onClick={handleSubmitComment}
            disabled={!newCommentText.trim()}
            className="px-4 py-2 bg-[#E10600] text-white rounded-lg hover:bg-[#C00500] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-h-[40px]"
          >
            <Send size={16} />
            <span>Publier</span>
          </button>
        </div>
      </div>
    </div>
  );
}