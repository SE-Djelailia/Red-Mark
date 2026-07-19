import { supabase } from "./supabase";
import { RlsWriteError } from "./rlsErrors";
import type {
  Project,
  SiteVisit,
  Photo,
  Issue,
  Comment,
  Notification,
  ProjectMember,
} from "./supabase";
// Re-exported so callers that already import functions from this module
// (e.g. `updateProject`) can pull the matching type from the same import
// instead of a second import from "./supabase".
export type { Project, SiteVisit, Photo, Issue, Comment, Notification, ProjectMember };

// Resolves a Supabase head-count query (or `null` when the query is skipped),
// returning a plain number instead of the raw PostgREST response.
async function resolveCount(
  query: PromiseLike<{ count: number | null }> | null,
): Promise<number> {
  if (!query) return 0;
  const { count } = await query;
  return count ?? 0;
}

// ============================================
// PROJECTS API
// ============================================

export async function getProjects(userId: string): Promise<Project[]> {
  try {
    // Get projects owned by the user
    const { data: ownedProjects, error: ownedError } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (ownedError) throw ownedError;

    // Get project IDs where user is a member
    const { data: memberships, error: membershipsError } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId);

    if (membershipsError) throw membershipsError;

    // Get shared projects
    let sharedProjects: Project[] = [];
    if (memberships && memberships.length > 0) {
      const sharedProjectIds = memberships.map((m) => m.project_id);
      const { data: shared, error: sharedError } = await supabase
        .from("projects")
        .select("*")
        .in("id", sharedProjectIds)
        .order("created_at", { ascending: false });

      if (sharedError) throw sharedError;
      sharedProjects = shared || [];
    }

    // Combine and deduplicate projects
    const allProjects = [...(ownedProjects || []), ...sharedProjects];
    const uniqueProjects = Array.from(new Map(allProjects.map((p) => [p.id, p])).values());

    return uniqueProjects;
  } catch (error) {
    console.error("❌ Error fetching projects:", error);
    throw error;
  }
}

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error fetching project:", error);
    throw error;
  }
}

export async function createProject(
  project: Omit<Project, "id" | "created_at" | "updated_at">,
): Promise<Project> {
  try {
    const { data, error } = await supabase.from("projects").insert([project]).select().single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error creating project:", error);
    throw error;
  }
}

export async function updateProject(
  projectId: string,
  updates: Partial<Project>,
): Promise<Project> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error updating project:", error);
    throw error;
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  try {
    const { data, error } = await supabase.from("projects").delete().eq("id", projectId).select();

    if (error) throw error;
    if (!data || data.length === 0) {
      // No error, but nothing came back — RLS excluded the row from the
      // delete (owner/admin-only) rather than it not existing.
      throw new RlsWriteError("No rows deleted", "PGRST116");
    }
  } catch (error) {
    console.error("❌ Error deleting project:", error);
    throw error;
  }
}

// ============================================
// SITE VISITS API
// ============================================

export async function getSiteVisits(projectId: string): Promise<SiteVisit[]> {
  try {
    const { data, error } = await supabase
      .from("site_visits")
      .select("*")
      .eq("project_id", projectId)
      .order("visit_date", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching visits:", error);
    throw error;
  }
}

export async function getSiteVisit(visitId: string): Promise<SiteVisit | null> {
  try {
    const { data, error } = await supabase
      .from("site_visits")
      .select("*")
      .eq("id", visitId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error fetching visit:", error);
    throw error;
  }
}

export async function createSiteVisit(
  visit: Omit<SiteVisit, "id" | "created_at" | "updated_at">,
): Promise<SiteVisit> {
  try {
    const { data, error } = await supabase.from("site_visits").insert([visit]).select().single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error creating visit:", error);
    throw error;
  }
}

export async function updateSiteVisit(
  visitId: string,
  updates: Partial<SiteVisit>,
): Promise<SiteVisit> {
  try {
    const { data, error } = await supabase
      .from("site_visits")
      .update(updates)
      .eq("id", visitId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error updating visit:", error);
    throw error;
  }
}

export async function deleteSiteVisit(visitId: string): Promise<void> {
  try {
    const { data, error } = await supabase.from("site_visits").delete().eq("id", visitId).select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new RlsWriteError("No rows deleted", "PGRST116");
    }
  } catch (error) {
    console.error("❌ Error deleting visit:", error);
    throw error;
  }
}

// ============================================
// PHOTOS API
// ============================================

export async function getPhotos(visitId: string): Promise<Photo[]> {
  try {
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("visit_id", visitId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching photos:", error);
    throw error;
  }
}

export async function getPhoto(photoId: string): Promise<Photo | null> {
  try {
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("id", photoId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error fetching photo:", error);
    return null;
  }
}

export async function uploadPhoto(
  file: File,
  userId: string,
  projectId: string,
  visitId: string,
  metadata: {
    tags?: string[];
    location?: { floor?: string; room?: string };
    description?: string;
    locationId?: string;
  },
): Promise<Photo> {
  try {
    // 1. Sanitize filename to remove special characters
    const sanitizedFileName = file.name
      .normalize("NFD") // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-zA-Z0-9._-]/g, "_"); // Replace special chars with underscore

    // 2. Upload file to Supabase Storage
    const fileName = `${userId}/${projectId}/${visitId}/${Date.now()}-${sanitizedFileName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    // 2. Get public URL (required for DB constraint, but won't work if bucket is private)
    const { data: urlData } = supabase.storage.from("project-photos").getPublicUrl(fileName);

    // 3. Create photo record in database
    const { data: photoData, error: photoError } = await supabase
      .from("photos")
      .insert([
        {
          user_id: userId,
          project_id: projectId,
          visit_id: visitId,
          file_url: urlData.publicUrl, // Store URL (required by DB), but use signed URLs for display
          storage_path: fileName,
          tags: metadata.tags || [],
          location: metadata.location || null,
          description: metadata.description || null,
          location_id: metadata.locationId || null,
        },
      ])
      .select()
      .single();

    if (photoError) throw photoError;

    return photoData;
  } catch (error) {
    console.error("❌ Error uploading photo:", error);
    throw error;
  }
}

export async function updatePhoto(photoId: string, updates: Partial<Photo>): Promise<Photo> {
  try {
    const { data, error } = await supabase
      .from("photos")
      .update(updates)
      .eq("id", photoId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error updating photo:", error);
    throw error;
  }
}

export async function deletePhoto(photoId: string): Promise<void> {
  try {
    // 1. Get photo to find storage path
    const photo = await getPhoto(photoId);

    // If photo exists, delete from storage
    if (photo && photo.storage_path) {
      const { error: storageError } = await supabase.storage
        .from("project-photos")
        .remove([photo.storage_path]);

      if (storageError) console.error("⚠️ Error deleting from storage:", storageError);
    }

    // 2. Delete from database (even if not found in storage)
    const { data, error } = await supabase.from("photos").delete().eq("id", photoId).select();

    if (error) throw error;
    if (!data || data.length === 0) {
      // Unambiguous when `photo` above was found (SELECT RLS already
      // confirmed it exists and is visible, so a 0-row delete here can only
      // mean the DELETE policy blocked it) — but if `photo` was already
      // null, this is the same "blocked vs. already gone" ambiguity as
      // elsewhere in this pass, since we never confirmed the row existed.
      throw new RlsWriteError("No rows deleted", "PGRST116");
    }
  } catch (error) {
    console.error("❌ Error deleting photo:", error);
    throw error;
  }
}

// ============================================
// SECURE PHOTO ACCESS (Signed URLs)
// ============================================

/**
 * Generate a secure signed URL for a photo that expires after 24 hours
 * @param storagePath - The storage path from the photo record
 * @returns Signed URL valid for 24 hours
 */
export async function getPhotoSignedUrl(storagePath: string): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from("project-photos")
      .createSignedUrl(storagePath, 86400); // 86400 seconds = 24 hours

    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error("❌ Error generating signed URL:", error);
    throw error;
  }
}

/**
 * Get signed URLs for multiple photos at once (more efficient)
 * @param storagePaths - Array of storage paths
 * @returns Array of signed URLs
 */
export async function getPhotosSignedUrls(storagePaths: string[]): Promise<string[]> {
  try {
    const signedUrls = await Promise.all(storagePaths.map((path) => getPhotoSignedUrl(path)));
    return signedUrls;
  } catch (error) {
    console.error("❌ Error generating signed URLs:", error);
    throw error;
  }
}

// ============================================
// DASHBOARD API
// ============================================

export interface DashboardStats {
  totalProjects: number;
  totalVisits: number;
  photosThisWeek: number;
  openIssues: number;
  inProgressIssues: number;
  resolvedIssues: number;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  try {
    // Date 7 jours en arrière (photos de la semaine)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Récupère tous les projets (possédés + partagés) pour avoir le bon décompte
    const projects = await getProjects(userId);
    const projectIds = projects.map((p) => p.id);

    // Décomptes en parallèle via `head: true` (ne transfère pas les lignes, juste le count)
    const [totalVisits, photosThisWeek, openIssues, inProgressIssues, resolvedIssues] =
      await Promise.all([
        resolveCount(
          projectIds.length
            ? supabase
                .from("site_visits")
                .select("id", { count: "exact", head: true })
                .in("project_id", projectIds)
            : null,
        ),
        resolveCount(
          projectIds.length
            ? supabase
                .from("photos")
                .select("id", { count: "exact", head: true })
                .in("project_id", projectIds)
                .gte("created_at", weekAgo.toISOString())
            : null,
        ),
        resolveCount(
          projectIds.length
            ? supabase
                .from("issues")
                .select("id", { count: "exact", head: true })
                .in("project_id", projectIds)
                .eq("status", "open")
            : null,
        ),
        resolveCount(
          projectIds.length
            ? supabase
                .from("issues")
                .select("id", { count: "exact", head: true })
                .in("project_id", projectIds)
                .eq("status", "in_progress")
            : null,
        ),
        resolveCount(
          projectIds.length
            ? supabase
                .from("issues")
                .select("id", { count: "exact", head: true })
                .in("project_id", projectIds)
                .eq("status", "resolved")
            : null,
        ),
      ]);

    return {
      totalProjects: projects.length,
      totalVisits,
      photosThisWeek,
      openIssues,
      inProgressIssues,
      resolvedIssues,
    };
  } catch (error) {
    console.error("❌ Error fetching dashboard stats:", error);
    throw error;
  }
}

export interface ProfileStats {
  projectCount: number;
  totalVisits: number;
  totalPhotos: number;
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  try {
    const projects = await getProjects(userId);
    const projectIds = projects.map((p) => p.id);

    const [totalVisits, totalPhotos] = await Promise.all([
      resolveCount(
        projectIds.length
          ? supabase
              .from("site_visits")
              .select("id", { count: "exact", head: true })
              .in("project_id", projectIds)
          : null,
      ),
      resolveCount(
        projectIds.length
          ? supabase
              .from("photos")
              .select("id", { count: "exact", head: true })
              .in("project_id", projectIds)
          : null,
      ),
    ]);

    return {
      projectCount: projects.length,
      totalVisits,
      totalPhotos,
    };
  } catch (error) {
    console.error("❌ Error fetching profile stats:", error);
    throw error;
  }
}

// ============================================
// ISSUES API
// ============================================

type IssueRowWithProject = Issue & { projects: { name: string } | null };

export async function getAllUserIssues(
  userId: string,
): Promise<(Issue & { projectName: string })[]> {
  try {
    const { data, error } = await supabase
      .from("issues")
      .select("*, projects(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return ((data as IssueRowWithProject[] | null) || []).map(({ projects, ...row }) => ({
      ...row,
      projectName: projects?.name ?? "Projet inconnu",
    }));
  } catch (error) {
    console.error("❌ Error fetching all user issues:", error);
    throw error;
  }
}

export async function getIssues(projectId: string): Promise<Issue[]> {
  try {
    const { data, error } = await supabase
      .from("issues")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching issues:", error);
    throw error;
  }
}

export async function createIssue(
  issue: Omit<Issue, "id" | "created_at" | "updated_at">,
): Promise<Issue> {
  try {
    const { data, error } = await supabase.from("issues").insert([issue]).select().single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error creating issue:", error);
    throw error;
  }
}

export async function updateIssue(issueId: string, updates: Partial<Issue>): Promise<Issue> {
  try {
    const { data, error } = await supabase
      .from("issues")
      .update(updates)
      .eq("id", issueId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error updating issue:", error);
    throw error;
  }
}

// ============================================
// COMMENTS API
// ============================================

export async function getComments(photoId: string): Promise<Comment[]> {
  try {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("photo_id", photoId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching comments:", error);
    throw error;
  }
}

export async function createComment(comment: Omit<Comment, "id" | "created_at">): Promise<Comment> {
  try {
    const { data, error } = await supabase.from("comments").insert([comment]).select().single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error creating comment:", error);
    throw error;
  }
}

// ============================================
// NOTIFICATIONS API
// ============================================

export async function getNotifications(userId: string): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    if (error) throw error;
  } catch (error) {
    console.error("❌ Error marking notification as read:", error);
    throw error;
  }
}

// ============================================
// PROJECT MEMBERS API (Collaboration)
// ============================================

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  try {
    const { data, error } = await supabase
      .from("project_members")
      .select("*")
      .eq("project_id", projectId);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Error fetching project members:", error);
    throw error;
  }
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: "owner" | "editor" | "viewer",
  invitedBy: string,
): Promise<ProjectMember> {
  try {
    const { data, error } = await supabase
      .from("project_members")
      .insert([
        {
          project_id: projectId,
          user_id: userId,
          role,
          invited_by: invitedBy,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Error adding project member:", error);
    throw error;
  }
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) throw error;
  } catch (error) {
    console.error("❌ Error removing project member:", error);
    throw error;
  }
}
