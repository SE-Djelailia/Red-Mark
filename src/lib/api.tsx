/**
 * API Layer for RedMark
 * This file provides functions to interact with Supabase backend
 */

import {
  getSiteVisits as getVisitsFromStorage,
  getProject as getProjectFromStorage,
  getPhotos as getPhotosFromStorage,
  getProjects as getProjectsFromStorage,
  getSiteVisits as getSiteVisitsFromStorage,
  saveSiteVisit as saveSiteVisitToStorage,
  savePhoto,
  saveProject as saveProjectToStorage,
  getComments as getCommentsFromStorage,
  saveComment as saveCommentToStorage,
  type SiteVisit,
  type Project,
  type Photo,
  type Comment,
} from "./storage";
import {
  savePhotoToDB,
  getPhotosFromDB,
  deletePhotoFromDB,
  updatePhotoTagsInDB,
} from "./indexedDB";
import { supabase } from "./supabase";

// Get the current user ID from Supabase session
async function getCurrentUserId(): Promise<string | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session) {
      return null;
    }
    return session.user.id;
  } catch (error) {
    console.error("Error getting user ID:", error);
    return null;
  }
}

/**
 * Get all site visits for a project
 */
export async function getSiteVisits(projectId: string): Promise<SiteVisit[]> {
  console.log("📡 API: Fetching site visits for project:", projectId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      return [];
    }

    // Get from localStorage
    const visits = getVisitsFromStorage(userId, projectId);
    console.log("✅ Found", visits.length, "visits");
    return visits;
  } catch (error) {
    console.error("❌ Error fetching site visits:", error);
    return [];
  }
}

/**
 * Get a single site visit by ID
 */
export async function getSiteVisit(visitId: string): Promise<SiteVisit | null> {
  console.log("📡 API: Fetching site visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      return null;
    }

    // Get all visits from localStorage and find the one we want
    // We need to check all projects since we don't know which project this visit belongs to
    const allProjects = getProjectsFromStorage(userId);

    for (const project of allProjects) {
      const visits = getVisitsFromStorage(userId, project.id);
      const visit = visits.find((v) => v.id === visitId);
      if (visit) {
        console.log("✅ Visit found:", visit.id);
        return visit;
      }
    }

    console.warn("⚠️ Visit not found:", visitId);
    return null;
  } catch (error) {
    console.error("❌ Error fetching site visit:", error);
    return null;
  }
}

/**
 * Get project details
 */
export async function getProject(projectId: string): Promise<Project | null> {
  console.log("📡 API: Fetching project:", projectId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      return null;
    }

    const project = getProjectFromStorage(userId, projectId);

    if (!project) {
      console.warn("⚠️ Project not found:", projectId);
      return null;
    }

    console.log("✅ Project found:", project.name);
    return project;
  } catch (error) {
    console.error("❌ Error fetching project:", error);
    return null;
  }
}

/**
 * Get all photos for a site visit
 */
export async function getPhotos(visitId: string): Promise<
  Array<{
    id: string;
    file_url: string;
    tags: string[];
    location?: string;
    uploaded_at: string;
  }>
> {
  console.log("📡 API: Fetching photos for visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      return [];
    }

    // Get photos from IndexedDB
    const photosFromDB = await getPhotosFromDB(userId, visitId);

    // Transform to match the expected format
    const transformedPhotos = photosFromDB.map((photo) => ({
      id: photo.id,
      file_url: photo.fileUrl,
      tags: photo.tags || [],
      location: photo.location, // ✅ Include location from IndexedDB
      uploaded_at: photo.createdAt,
    }));

    console.log("✅ Found", transformedPhotos.length, "photos from IndexedDB");
    return transformedPhotos;
  } catch (error) {
    console.error("❌ Error fetching photos:", error);
    return [];
  }
}

/**
 * Save photos for a site visit
 */
export async function savePhotos(
  visitId: string,
  photos: Array<{
    id: string;
    file_url: string;
    tags: string[];
    uploaded_at: string;
  }>,
) {
  console.log("💾 API: Saving", photos.length, "photos for visit:", visitId);

  try {
    const photosKey = `redmark_visit_${visitId}_photos`;
    localStorage.setItem(photosKey, JSON.stringify(photos));
    console.log("✅ Photos saved successfully");
  } catch (error) {
    console.error("❌ Error saving photos:", error);
    throw error;
  }
}

/**
 * Delete a photo
 */
export async function deletePhoto(visitId: string, photoId: string) {
  console.log("🗑️ API: Deleting photo:", photoId, "from visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    // Delete from IndexedDB
    await deletePhotoFromDB(photoId);
    console.log("✅ Photo deleted successfully from IndexedDB");
  } catch (error) {
    console.error("❌ Error deleting photo:", error);
    throw error;
  }
}

/**
 * Update photo tags
 */
export async function updatePhotoTags(visitId: string, photoId: string, tags: string[]) {
  console.log("🏷️ API: Updating tags for photo:", photoId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    // Update tags in IndexedDB
    await updatePhotoTagsInDB(photoId, tags);
    console.log("✅ Photo tags updated successfully in IndexedDB");
  } catch (error) {
    console.error("❌ Error updating photo tags:", error);
    throw error;
  }
}

/**
 * Get all projects for a user
 */
export async function getProjects(): Promise<Project[]> {
  console.log("📡 API: Fetching all projects");

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      return [];
    }

    // Get from localStorage
    const projects = getProjectsFromStorage(userId);
    console.log("✅ Found", projects.length, "projects");
    return projects;
  } catch (error) {
    console.error("❌ Error fetching projects:", error);
    return [];
  }
}

/**
 * Save a site visit
 */
export async function saveSiteVisit(projectId: string, visit: SiteVisit) {
  console.log("💾 API: Saving site visit for project:", projectId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    await saveSiteVisitToStorage(userId, visit);
    console.log("✅ Site visit saved successfully");
  } catch (error) {
    console.error("❌ Error saving site visit:", error);
    throw error;
  }
}

/**
 * Create a new site visit
 */
export async function createSiteVisit(visitData: {
  project_id: string;
  visit_date: string;
  phase: string;
  weather: string;
  temperature?: string;
  attendees: string[];
  notes: string;
}): Promise<SiteVisit> {
  console.log("🆕 API: Creating site visit for project:", visitData.project_id);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("Not authenticated. Please log in.");
    }

    // Create new visit with generated ID
    const newVisit: SiteVisit = {
      id: `visit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      project_id: visitData.project_id,
      visit_date: visitData.visit_date,
      phase: visitData.phase,
      weather: visitData.weather,
      temperature: visitData.temperature,
      attendees: visitData.attendees,
      notes: visitData.notes,
      created_by: userId,
      created_at: new Date().toISOString(),
    };

    // Save to storage
    saveSiteVisitToStorage(userId, newVisit);
    console.log("✅ Site visit created successfully:", newVisit.id);

    return newVisit;
  } catch (error) {
    console.error("❌ Error creating site visit:", error);
    throw error;
  }
}

/**
 * Update a site visit
 */
export async function updateSiteVisit(visitId: string, updates: Partial<SiteVisit>): Promise<void> {
  console.log("🔄 API: Updating site visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    // First get the existing visit
    const existingVisit = await getSiteVisit(visitId);
    if (!existingVisit) {
      throw new Error(`Visit ${visitId} not found`);
    }

    // Merge updates with existing visit
    const updatedVisit: SiteVisit = {
      ...existingVisit,
      ...updates,
      id: existingVisit.id, // Ensure ID doesn't change
      project_id: existingVisit.project_id, // Ensure project_id doesn't change
    };

    // Save to storage
    await saveSiteVisitToStorage(userId, updatedVisit);
    console.log("✅ Site visit updated successfully");
  } catch (error) {
    console.error("❌ Error updating site visit:", error);
    throw error;
  }
}

/**
 * Save a photo
 */
export async function saveSinglePhoto(visitId: string, photo: Photo) {
  console.log("💾 API: Saving photo for visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    // Make sure photo has the correct visit_id
    const photoWithVisit = { ...photo, site_visit_id: visitId };
    await savePhoto(userId, photoWithVisit);
    console.log("✅ Photo saved successfully");
  } catch (error) {
    console.error("❌ Error saving photo:", error);
    throw error;
  }
}

/**
 * Upload a photo for a site visit
 */
export async function uploadPhoto(
  file: File,
  metadata: {
    site_visit_id: string;
    project_id: string;
    tags: string[];
    caption?: string;
    location?: string;
  },
): Promise<Photo> {
  console.log("📤 API: Uploading photo:", file.name);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    // Convert file to base64 data URL
    const fileUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Create photo object
    const newPhoto: Photo = {
      id: `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      site_visit_id: metadata.site_visit_id,
      project_id: metadata.project_id,
      file_url: fileUrl,
      caption: metadata.caption || "",
      tags: metadata.tags || [],
      location: metadata.location,
      taken_at: new Date().toISOString(),
      uploaded_by: userId,
      created_at: new Date().toISOString(),
    };

    // Save to IndexedDB instead of localStorage to avoid quota issues
    await savePhotoToDB({
      id: newPhoto.id,
      userId: userId,
      visitId: metadata.site_visit_id,
      fileUrl: fileUrl,
      tags: metadata.tags || [],
      location: metadata.location,
      createdAt: new Date().toISOString(),
    });

    console.log("✅ Photo uploaded successfully to IndexedDB:", newPhoto.id);

    return newPhoto;
  } catch (error) {
    console.error("❌ Error uploading photo:", error);
    throw error;
  }
}

/**
 * Get all comments for a site visit
 */
export async function getComments(visitId: string): Promise<Comment[]> {
  console.log("📡 API: Fetching comments for visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      return [];
    }

    // Get comments from localStorage using the storage function
    const comments = getCommentsFromStorage(userId, visitId);

    console.log("✅ Found", comments.length, "comments");
    return comments;
  } catch (error) {
    console.error("❌ Error fetching comments:", error);
    return [];
  }
}

/**
 * Save a comment for a site visit
 */
export async function saveComment(visitId: string, comment: Comment) {
  console.log("💾 API: Saving comment for visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    await saveCommentToStorage(userId, comment);
    console.log("✅ Comment saved successfully");
  } catch (error) {
    console.error("❌ Error saving comment:", error);
    throw error;
  }
}

/**
 * Create a new comment for a site visit
 */
export async function createComment(
  visitId: string,
  commentData: {
    text: string;
  },
): Promise<Comment> {
  console.log("🆕 API: Creating comment for visit:", visitId);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("Not authenticated. Please log in.");
    }

    // Get user info from Supabase session
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userName = session?.user?.user_metadata?.name || session?.user?.email || "Utilisateur";

    // Create new comment with generated ID
    const newComment: Comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      site_visit_id: visitId,
      text: commentData.text,
      author: userName,
      author_id: userId,
      created_at: new Date().toISOString(),
    };

    // Save to storage
    saveCommentToStorage(userId, newComment);
    console.log("✅ Comment created successfully:", newComment.id);

    return newComment;
  } catch (error) {
    console.error("❌ Error creating comment:", error);
    throw error;
  }
}

/**
 * Update a comment for a site visit
 */
export async function updateComment(commentId: string, updates: Partial<Comment>): Promise<void> {
  console.log("🔄 API: Updating comment:", commentId, "with updates:", updates);

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("❌ No user logged in");
      throw new Error("No user logged in");
    }

    // Find the comment across all visits
    const allProjects = getProjectsFromStorage(userId);
    let existingComment: Comment | undefined;

    for (const project of allProjects) {
      const visits = getVisitsFromStorage(userId, project.id);

      for (const visit of visits) {
        const comments = getCommentsFromStorage(userId, visit.id);
        const comment = comments.find((c) => c.id === commentId);

        if (comment) {
          existingComment = comment;
          break;
        }
      }

      if (existingComment) break;
    }

    if (!existingComment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    // Merge updates with existing comment
    const updatedComment: Comment = {
      ...existingComment,
      ...updates,
      id: existingComment.id, // Ensure ID doesn't change
      site_visit_id: existingComment.site_visit_id, // Ensure site_visit_id doesn't change
      author_id: existingComment.author_id, // Ensure author_id doesn't change
    };

    // Save to storage using the existing saveComment function which handles updates
    saveCommentToStorage(userId, updatedComment);
    console.log("✅ Comment updated successfully:", commentId);
  } catch (error) {
    console.error("❌ Error updating comment:", error);
    throw error;
  }
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string) {
  console.log("🗑️ API: Deleting comment:", commentId);

  try {
    const comments = await getComments(commentId);
    const updatedComments = comments.filter((c) => c.id !== commentId);
    await saveCommentToStorage(userId, updatedComments);
    console.log("✅ Comment deleted successfully");
  } catch (error) {
    console.error("❌ Error deleting comment:", error);
    throw error;
  }
}
