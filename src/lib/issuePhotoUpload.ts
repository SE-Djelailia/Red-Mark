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
import { isRetriableUploadError } from "./networkErrors";
import { compressImage } from "./imageCompression";
import type { Issue } from "./issuesApi";

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
  /** Photos that could be neither uploaded nor queued — genuinely lost. */
  failedCount: number;
}

export async function uploadIssuePhotos(
  files: File[],
  context: UploadIssuePhotosContext,
): Promise<UploadIssuePhotosResult> {
  let queuedCount = 0;
  let failedCount = 0;
  const uploaded: Issue["photos"] = [];
  const tags = context.tags || [];

  // Each file is independent — one rejection must not abandon the rest.
  for (const file of files) {
    let compressed = file;
    try {
      compressed = await compressImage(file);
    } catch (compressError) {
      console.error("❌ Compression failed, using original:", file.name, compressError);
    }

    try {
      const photo = await uploadPhoto(
        compressed,
        context.userId,
        context.projectId,
        context.visitId,
        { locationId: context.locationId || undefined, tags },
      );
      uploaded.push({
        id: photo.id,
        url: photo.file_url,
        storagePath: photo.storage_path,
        visitId: context.visitId,
        locationId: photo.location_id,
        description: photo.description,
        tags: photo.tags || [],
      });
    } catch (uploadError) {
      if (isRetriableUploadError(uploadError)) {
        try {
          await addToQueue({
            file: compressed,
            userId: context.userId,
            projectId: context.projectId,
            visitId: context.visitId,
            tags,
            locationId: context.locationId || undefined,
          });
          queuedCount++;
        } catch (queueError) {
          console.error("❌ Could not queue photo:", file.name, queueError);
          failedCount++;
          toast.error(`Photo non enregistrée : ${file.name}`);
        }
      } else {
        failedCount++;
        const message = (uploadError as Error)?.message || String(uploadError);
        console.error("❌ Upload rejected for", file.name, uploadError);
        toast.error(`Échec de l'envoi de ${file.name} : ${message}`);
      }
    }
  }

  return { uploaded, queuedCount, failedCount };
}
