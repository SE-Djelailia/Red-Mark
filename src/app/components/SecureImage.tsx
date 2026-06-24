import { usePhotoUrl } from "../../hooks/usePhotoUrl";
import { Camera } from "lucide-react";

interface SecureImageProps {
  storagePath: string | null | undefined;
  alt: string;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * Secure image component that automatically fetches signed URLs
 * Shows loading state and error handling
 */
export default function SecureImage({
  storagePath,
  alt,
  className = "",
  onClick,
  onLoad,
}: SecureImageProps) {
  const { url, loading, error } = usePhotoUrl(storagePath);

  if (loading) {
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        role="status"
        aria-label="Chargement de l'image"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-3 border-gray-400 border-t-gray-600 rounded-full animate-spin" />
          <span className="text-xs text-gray-500">Chargement...</span>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center ${className}`}
        role="alert"
        aria-label="Erreur de chargement"
      >
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <Camera size={32} />
          <span className="text-xs">Image indisponible</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onClick={onClick}
      onLoad={onLoad}
      loading="lazy" // Lazy load for better performance
    />
  );
}
