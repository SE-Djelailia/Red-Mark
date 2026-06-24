export interface Comment {
  id: string;
  issueId?: string; // Optional - for issue comments
  visitId?: string; // Optional - for visit comments
  author: string;
  authorId: string;
  date: string;
  text: string;
  parentCommentId?: string; // For threaded replies
  mentions?: string[]; // User IDs mentioned in the comment
}

const STORAGE_KEY = 'redmark_comments';

// Get all comments from localStorage
function getAllComments(): Comment[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading comments:', error);
    return [];
  }
}

// Save all comments to localStorage
function saveAllComments(comments: Comment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
  } catch (error) {
    console.error('Error saving comments:', error);
  }
}

// Get comments for a specific issue
export function getCommentsForIssue(issueId: string): Comment[] {
  const allComments = getAllComments();
  return allComments.filter(comment => comment.issueId === issueId);
}

// Get comments for a specific visit
export function getCommentsForVisit(visitId: string): Comment[] {
  const allComments = getAllComments();
  return allComments.filter(comment => comment.visitId === visitId);
}

// Add a new comment for an issue
export function addComment(
  issueId: string,
  text: string,
  author: string,
  authorId: string,
  parentCommentId?: string,
  mentions?: string[]
): Comment {
  const newComment: Comment = {
    id: Date.now().toString(),
    issueId,
    author,
    authorId,
    date: new Date().toISOString(), // Store full ISO string with time
    text,
    parentCommentId,
    mentions
  };

  const allComments = getAllComments();
  allComments.push(newComment);
  saveAllComments(allComments);

  return newComment;
}

// Add a new comment for a visit
export function addVisitComment(
  visitId: string,
  text: string,
  author: string,
  authorId: string,
  parentCommentId?: string,
  mentions?: string[]
): Comment {
  const newComment: Comment = {
    id: Date.now().toString(),
    visitId,
    author,
    authorId,
    date: new Date().toISOString(), // Store full ISO string with time
    text,
    parentCommentId,
    mentions
  };

  const allComments = getAllComments();
  allComments.push(newComment);
  saveAllComments(allComments);

  return newComment;
}

// Update a comment
export function updateComment(commentId: string, text: string): Comment | null {
  const allComments = getAllComments();
  const index = allComments.findIndex(c => c.id === commentId);
  
  if (index === -1) return null;

  allComments[index] = {
    ...allComments[index],
    text
  };

  saveAllComments(allComments);
  return allComments[index];
}

// Delete a comment
export function deleteComment(commentId: string): boolean {
  const allComments = getAllComments();
  const filtered = allComments.filter(c => c.id !== commentId);
  
  if (filtered.length === allComments.length) return false;

  saveAllComments(filtered);
  return true;
}