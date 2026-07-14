// Backup and restore utilities for localStorage data

const BACKUP_KEY = "redmark_backup";
const BACKUP_INTERVAL = 30000; // 30 seconds

export interface BackupData {
  timestamp: string;
  users: any[];
  session: any;
  projects: any[];
  visits: any[];
  photos: any[];
  issues: any[];
  comments: any[];
  notifications: any[];
  projectMembers: any[];
}

// Create a backup of all RedMark data
export function createBackup(): BackupData {
  const backup: BackupData = {
    timestamp: new Date().toISOString(),
    users: JSON.parse(localStorage.getItem("redmark_users") || "[]"),
    session: JSON.parse(localStorage.getItem("redmark_session") || "null"),
    projects: JSON.parse(localStorage.getItem("redmark_projects") || "[]"),
    visits: JSON.parse(localStorage.getItem("redmark_site_visits") || "[]"),
    photos: JSON.parse(localStorage.getItem("redmark_photos") || "[]"),
    issues: JSON.parse(localStorage.getItem("redmark_issues") || "[]"),
    comments: JSON.parse(localStorage.getItem("redmark_comments") || "[]"),
    notifications: JSON.parse(localStorage.getItem("redmark_notifications") || "[]"),
    projectMembers: JSON.parse(localStorage.getItem("redmark_project_members") || "[]"),
  };

  localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  console.log("💾 Backup created at", backup.timestamp);
  return backup;
}

// Restore from backup
export function restoreFromBackup(backup: BackupData): void {
  try {
    localStorage.setItem("redmark_users", JSON.stringify(backup.users));
    localStorage.setItem("redmark_session", JSON.stringify(backup.session));
    localStorage.setItem("redmark_projects", JSON.stringify(backup.projects));
    localStorage.setItem("redmark_site_visits", JSON.stringify(backup.visits));
    localStorage.setItem("redmark_photos", JSON.stringify(backup.photos));
    localStorage.setItem("redmark_issues", JSON.stringify(backup.issues));
    localStorage.setItem("redmark_comments", JSON.stringify(backup.comments));
    localStorage.setItem("redmark_notifications", JSON.stringify(backup.notifications));
    localStorage.setItem("redmark_project_members", JSON.stringify(backup.projectMembers));

    console.log("✅ Backup restored from", backup.timestamp);
  } catch (error) {
    console.error("❌ Error restoring backup:", error);
    throw error;
  }
}

// Get latest backup
export function getLatestBackup(): BackupData | null {
  try {
    const backupData = localStorage.getItem(BACKUP_KEY);
    return backupData ? JSON.parse(backupData) : null;
  } catch (error) {
    console.error("❌ Error loading backup:", error);
    return null;
  }
}

// Auto-backup system
let backupIntervalId: number | null = null;

export function startAutoBackup(): void {
  if (backupIntervalId) {
    clearInterval(backupIntervalId);
  }

  // Create initial backup
  createBackup();

  // Set up periodic backups
  backupIntervalId = window.setInterval(() => {
    createBackup();
  }, BACKUP_INTERVAL);

  console.log("🔄 Auto-backup started (every 30s)");
}

export function stopAutoBackup(): void {
  if (backupIntervalId) {
    clearInterval(backupIntervalId);
    backupIntervalId = null;
    console.log("⏸️ Auto-backup stopped");
  }
}

// Export all data as JSON file
export function exportDataAsFile(): void {
  const backup = createBackup();
  const dataStr = JSON.stringify(backup, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `redmark-backup-${new Date().toISOString().split("T")[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
  console.log("📥 Data exported to file");
}

// Import data from file
export function importDataFromFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string);
        restoreFromBackup(backup);
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Check if session exists, if not try to restore from backup
export function ensureSessionExists(): boolean {
  const session = localStorage.getItem("redmark_session");

  if (!session || session === "null") {
    console.warn("⚠️ No session found, checking backup...");
    const backup = getLatestBackup();

    if (backup && backup.session) {
      console.log("🔄 Restoring session from backup...");
      localStorage.setItem("redmark_session", JSON.stringify(backup.session));
      return true;
    }

    return false;
  }

  return true;
}
