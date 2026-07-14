import { useState, useEffect } from "react";
import { getPhotoSignedUrl } from "../lib/supabaseApi";

/**
 * Custom hook to automatically fetch and manage signed URLs for photos
 * Handles loading states and caching
 *
 * @param storagePath - The storage path from the photo record
 * @returns Object with { url, loading, error }
 */
export function usePhotoUrl(storagePath: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setUrl(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchSignedUrl() {
      try {
        setLoading(true);
        setError(null);

        const signedUrl = await getPhotoSignedUrl(storagePath);

        if (mounted) {
          setUrl(signedUrl);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          console.error("Error fetching signed URL:", err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchSignedUrl();

    // Cleanup function
    return () => {
      mounted = false;
    };
  }, [storagePath]);

  return { url, loading, error };
}

/**
 * Hook to fetch signed URLs for multiple photos
 * More efficient than calling usePhotoUrl multiple times
 *
 * @param storagePaths - Array of storage paths
 * @returns Object with { urls, loading, error }
 */
export function usePhotoUrls(storagePaths: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const validPaths = storagePaths.filter((path): path is string => !!path);

    if (validPaths.length === 0) {
      setUrls([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchSignedUrls() {
      try {
        setLoading(true);
        setError(null);

        const signedUrls = await Promise.all(
          storagePaths.map(async (path) => {
            if (!path) return null;
            try {
              return await getPhotoSignedUrl(path);
            } catch (err) {
              console.error("Error fetching signed URL for path:", path, err);
              return null;
            }
          }),
        );

        if (mounted) {
          setUrls(signedUrls);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchSignedUrls();

    return () => {
      mounted = false;
    };
  }, [JSON.stringify(storagePaths)]); // Using JSON.stringify for array dependency

  return { urls, loading, error };
}
