import { supabase } from "./supabase";
import { createProject, createSiteVisit, uploadPhoto } from "./supabaseApi";
import { toast } from "sonner";

/**
 * Migrer les données de localStorage vers Supabase
 * Cette fonction devrait être appelée une seule fois par utilisateur
 */
export async function migrateLocalDataToSupabase(userId: string): Promise<void> {
  try {
    console.log("🔄 Starting migration to Supabase...");

    // Vérifier si la migration a déjà été effectuée
    const migrationKey = `migration_completed_${userId}`;
    const migrationCompleted = localStorage.getItem(migrationKey);

    if (migrationCompleted === "true") {
      console.log("✅ Migration already completed for this user");
      return;
    }

    // 1. Migrer les projets
    const localProjects = JSON.parse(localStorage.getItem("redmark_projects") || "[]");
    const userProjects = localProjects.filter((p: any) => p.userId === userId);

    console.log(`📦 Found ${userProjects.length} projects to migrate`);

    const projectIdMap = new Map<string, string>(); // old ID -> new ID

    for (const project of userProjects) {
      try {
        const newProject = await createProject({
          user_id: userId,
          name: project.name,
          address: project.address,
          client_name: project.clientName,
          status: project.status || "active",
          start_date: project.startDate,
        });

        projectIdMap.set(project.id, newProject.id);
        console.log(`✅ Project migrated: ${project.name}`);
      } catch (error) {
        console.error(`❌ Error migrating project ${project.name}:`, error);
      }
    }

    // 2. Migrer les visites de chantier
    const localVisits = JSON.parse(localStorage.getItem("redmark_site_visits") || "[]");
    const userVisits = localVisits.filter((v: any) => v.userId === userId);

    console.log(`📦 Found ${userVisits.length} visits to migrate`);

    const visitIdMap = new Map<string, string>(); // old ID -> new ID

    for (const visit of userVisits) {
      try {
        const newProjectId = projectIdMap.get(visit.projectId);
        if (!newProjectId) {
          console.warn(`⚠️ Project not found for visit ${visit.id}`);
          continue;
        }

        const newVisit = await createSiteVisit({
          user_id: userId,
          project_id: newProjectId,
          visit_date: visit.visitDate,
          phase: visit.phase,
          weather: visit.weather,
          temperature: visit.temperature,
          notes: visit.notes,
        });

        visitIdMap.set(visit.id, newVisit.id);
        console.log(`✅ Visit migrated: ${visit.visitDate}`);
      } catch (error) {
        console.error(`❌ Error migrating visit ${visit.id}:`, error);
      }
    }

    // 3. Migrer les photos depuis IndexedDB
    console.log("📸 Migrating photos from IndexedDB...");

    // Note: Les photos sont stockées comme Data URLs dans IndexedDB
    // On doit les convertir en Blob puis uploader vers Supabase Storage

    const db = await openIndexedDB();
    const photos = await getAllPhotosFromIndexedDB(db);
    const userPhotos = photos.filter((p: any) => p.userId === userId);

    console.log(`📦 Found ${userPhotos.length} photos to migrate`);

    for (const photo of userPhotos) {
      try {
        const newProjectId = projectIdMap.get(photo.projectId || "");
        const newVisitId = visitIdMap.get(photo.visitId);

        if (!newProjectId || !newVisitId) {
          console.warn(`⚠️ Project or visit not found for photo ${photo.id}`);
          continue;
        }

        // Convertir Data URL en Blob
        const blob = await dataURLtoBlob(photo.fileUrl);
        const file = new File([blob], `photo-${photo.id}.jpg`, { type: "image/jpeg" });

        // Uploader vers Supabase
        await uploadPhoto(file, userId, newProjectId, newVisitId, {
          tags: photo.tags || [],
          location: photo.location,
          description: photo.description,
        });

        console.log(`✅ Photo migrated: ${photo.id}`);
      } catch (error) {
        console.error(`❌ Error migrating photo ${photo.id}:`, error);
      }
    }

    // 4. Marquer la migration comme terminée
    localStorage.setItem(migrationKey, "true");

    console.log("✅ Migration to Supabase completed!");
    toast.success(
      `Migration terminée ! ${userProjects.length} projets, ${userVisits.length} visites, ${userPhotos.length} photos migrés.`,
    );
  } catch (error) {
    console.error("❌ Migration error:", error);
    toast.error("Erreur lors de la migration des données");
    throw error;
  }
}

// Helper: Ouvrir IndexedDB
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("redmark_photos", 2);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Helper: Récupérer toutes les photos depuis IndexedDB
function getAllPhotosFromIndexedDB(db: IDBDatabase): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["photos"], "readonly");
    const store = transaction.objectStore("photos");
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Helper: Convertir Data URL en Blob
async function dataURLtoBlob(dataURL: string): Promise<Blob> {
  const response = await fetch(dataURL);
  return response.blob();
}

/**
 * Vérifier si l'utilisateur a besoin de migrer ses données
 */
export function needsMigration(userId: string): boolean {
  const migrationKey = `migration_completed_${userId}`;
  const migrationCompleted = localStorage.getItem(migrationKey);

  if (migrationCompleted === "true") {
    return false;
  }

  // Vérifier s'il y a des données locales à migrer
  const localProjects = JSON.parse(localStorage.getItem("redmark_projects") || "[]");
  const userProjects = localProjects.filter((p: any) => p.userId === userId);

  return userProjects.length > 0;
}

/**
 * Réinitialiser le flag de migration (pour tests)
 */
export function resetMigrationFlag(userId: string): void {
  const migrationKey = `migration_completed_${userId}`;
  localStorage.removeItem(migrationKey);
  console.log("🔄 Migration flag reset");
}
