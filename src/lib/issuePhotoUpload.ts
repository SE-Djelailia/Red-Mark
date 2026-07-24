// Shared capture -> compress -> upload -> offline-queue flow for attaching
// newly captured photos to an issue. Originally written inline in
// LocationPinPanel.tsx, then duplicated into IssueForm.tsx during the issue
// consolidation — extracted here so the two surfaces can no longer diverge
// in how photos actually get stored; only their surrounding form UI
// differs (LocationPinPanel stays a deliberately lighter "lite" variant).
//
// Doesn't call updateIssue/createIssue itself — callers differ in what
// else they're merging into the issue's photos (e.g. IssueForm's edit mode
// also has to account for existing photos being kept/removed), so they own
// that final write.
import { toast } from "sonner";
import { uploadPhoto } from "./supabaseApi";
import { addToQueue } from "./uploadQueue";
import { compressImage } from "./imageCompression";
import type { Issue } from "./issuesApi";

// Network failures surface as TypeError (fetch's own error type) rather than the
// PostgrestError/StorageError objects Supabase throws for validation/permission
// failures — same check used by PhotoUploadPage.tsx.
function isNetworkError(error: unknown): boolean {
  return !navigator.onLine || error instanceof TypeError;
}

// Marks a photo as weather evidence (e.g. a sky photo or a weather-app
// screenshot) rather than adding a dedicated column/table for it — it's a
// regular visit photo, just tagged, so it shows up wherever tagged photos
// already do (VisitDetail's grid + tag filter) with no new surface.
export const WEATHER_EVIDENCE_TAG = "Météo";

export interface UploadIssuePhotosContext {
  userId: string;
  projectId: string;
  visitId: string;
  locationId?: string | null;
  // Applied to every photo in this call (e.g. ["Météo"] for weather
  // evidence). Defaults to no tags, same as before this field existed.
  tags?: string[];
}

export interface UploadIssuePhotosResult {
  uploaded: Issue["photos"];
  queuedCount: number;
}

export async function uploadIssuePhotos(
  files: File[],
  context: UploadIssuePhotosContext,
): Promise<UploadIssuePhotosResult> {
  let queuedCount = 0;
  const uploaded: Issue["photos"] = [];
  const tags = context.tags || [];

  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      try {
        const photo = await uploadPhoto(
          compressed,
          context.userId,
          context.projectId,
          context.visitId,
          { locationId: context.locationId || undefined, tags },
        );
        uploaded.push({ id: photo.id, url: photo.file_url, storagePath: photo.storage_path });
      } catch (uploadError) {
        if (!isNetworkError(uploadError)) throw uploadError;
        await addToQueue({
          file: compressed,
          userId: context.userId,
          projectId: context.projectId,
          visitId: context.visitId,
          tags,
          locationId: context.locationId || undefined,
        });
        queuedCount++;
      }
    } catch (e: any) {
      toast.error(`Échec de l'envoi d'une photo : ${e.message || e}`);
    }
  }

  return { uploaded, queuedCount };
}
