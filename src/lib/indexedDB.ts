// IndexedDB utility for storing photos and user accounts
const DB_NAME = "redmark_photos";
const DB_VERSION = 2; // ✅ Increased version to add users store
const PHOTOS_STORE = "photos";
const USERS_STORE = "users"; // ✅ New store for user accounts

let db: IDBDatabase | null = null;

// Initialize IndexedDB
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("❌ IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log("✅ IndexedDB initialized");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create photos object store if it doesn't exist
      if (!database.objectStoreNames.contains(PHOTOS_STORE)) {
        const objectStore = database.createObjectStore(PHOTOS_STORE, { keyPath: "id" });
        objectStore.createIndex("userId", "userId", { unique: false });
        objectStore.createIndex("visitId", "visitId", { unique: false });
        console.log("✅ IndexedDB photos store created");
      }

      // ✅ Create users object store if it doesn't exist
      if (!database.objectStoreNames.contains(USERS_STORE)) {
        const usersStore = database.createObjectStore(USERS_STORE, { keyPath: "email" });
        usersStore.createIndex("id", "id", { unique: true });
        console.log("✅ IndexedDB users store created");
      }
    };
  });
};

// Save photo to IndexedDB
export const savePhotoToDB = async (photo: {
  id: string;
  userId: string;
  visitId: string;
  fileUrl: string;
  tags: string[];
  location?: string;
  createdAt: string;
}): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], "readwrite");
    const store = transaction.objectStore(PHOTOS_STORE);
    const request = store.put(photo);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error("❌ Error saving photo to IndexedDB:", request.error);
      reject(request.error);
    };
  });
};

// Get all photos for a visit
export const getPhotosFromDB = async (userId: string, visitId: string): Promise<any[]> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], "readonly");
    const store = transaction.objectStore(PHOTOS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const allPhotos = request.result;
      // Filter by userId and visitId
      const filteredPhotos = allPhotos.filter(
        (photo) => photo.userId === userId && photo.visitId === visitId,
      );
      resolve(filteredPhotos);
    };

    request.onerror = () => {
      console.error("❌ Error getting photos from IndexedDB:", request.error);
      reject(request.error);
    };
  });
};

// Get a single photo by ID
export const getPhotoFromDB = async (photoId: string): Promise<any | null> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], "readonly");
    const store = transaction.objectStore(PHOTOS_STORE);
    const request = store.get(photoId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      console.error("❌ Error getting photo from IndexedDB:", request.error);
      reject(request.error);
    };
  });
};

// Delete a photo
export const deletePhotoFromDB = async (photoId: string): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], "readwrite");
    const store = transaction.objectStore(PHOTOS_STORE);
    const request = store.delete(photoId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error("❌ Error deleting photo from IndexedDB:", request.error);
      reject(request.error);
    };
  });
};

// Update photo tags
export const updatePhotoTagsInDB = async (photoId: string, tags: string[]): Promise<void> => {
  const database = await initDB();

  return new Promise(async (resolve, reject) => {
    try {
      // First get the photo
      const photo = await getPhotoFromDB(photoId);
      if (!photo) {
        reject(new Error(`Photo ${photoId} not found`));
        return;
      }

      // Update the tags
      const updatedPhoto = { ...photo, tags };

      // Save back to DB
      const transaction = database.transaction([PHOTOS_STORE], "readwrite");
      const store = transaction.objectStore(PHOTOS_STORE);
      const request = store.put(updatedPhoto);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error("❌ Error updating photo tags in IndexedDB:", request.error);
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
};

// Get all photos for a user (useful for cleanup or migration)
export const getAllPhotosForUser = async (userId: string): Promise<any[]> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PHOTOS_STORE], "readonly");
    const store = transaction.objectStore(PHOTOS_STORE);
    const index = store.index("userId");
    const request = index.getAll(userId);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("❌ Error getting all photos for user:", request.error);
      reject(request.error);
    };
  });
};

// ✅ ========== USER ACCOUNT MANAGEMENT (IndexedDB) ==========

// Save user account to IndexedDB
export const saveUserToDB = async (user: {
  id: string;
  email: string;
  password: string;
  user_metadata?: {
    name?: string;
    firm?: string;
    role?: string;
  };
}): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([USERS_STORE], "readwrite");
    const store = transaction.objectStore(USERS_STORE);
    const request = store.put(user);

    request.onsuccess = () => {
      console.log("✅ User saved to IndexedDB:", user.email);
      resolve();
    };

    request.onerror = () => {
      console.error("❌ Error saving user to IndexedDB:", request.error);
      reject(request.error);
    };
  });
};

// Get user by email from IndexedDB
export const getUserFromDB = async (email: string): Promise<any | null> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([USERS_STORE], "readonly");
    const store = transaction.objectStore(USERS_STORE);
    const request = store.get(email);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      console.error("❌ Error getting user from IndexedDB:", request.error);
      reject(request.error);
    };
  });
};

// Get all users from IndexedDB
export const getAllUsersFromDB = async (): Promise<any[]> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([USERS_STORE], "readonly");
    const store = transaction.objectStore(USERS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("❌ Error getting all users from IndexedDB:", request.error);
      reject(request.error);
    };
  });
};

// Migrate users from localStorage to IndexedDB
export const migrateUsersToIndexedDB = async (): Promise<void> => {
  try {
    const usersInLocalStorage = JSON.parse(localStorage.getItem("redmark_users") || "[]");

    if (usersInLocalStorage.length > 0) {
      console.log(`🔄 Migrating ${usersInLocalStorage.length} users to IndexedDB...`);

      for (const user of usersInLocalStorage) {
        await saveUserToDB(user);
      }

      console.log("✅ User migration complete!");
    }
  } catch (error) {
    console.error("❌ Error migrating users:", error);
  }
};
