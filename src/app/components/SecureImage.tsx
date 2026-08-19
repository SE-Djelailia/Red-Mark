import { usePhotoUrl } from "../../hooks/usePhotoUrl";

import { IconPhoto } from "./ui-kit/RedMarkIcons";
import XSpinner from "./ui-kit/XSpinner";

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
        className={`bg-subtle flex items-center justify-center ${className}`}
        role="status"
        aria-label="Chargement de l'image"
      >
        <div className="flex flex-col items-center gap-2">
          <XSpinner size={24} tone="current" label={null} className="text-faint" />
          <span className="text-xs text-muted">Chargement...</span>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        className={`bg-subtle flex items-center justify-center ${className}`}
        role="alert"
        aria-label="Erreur de chargement"
      >
        <div className="flex flex-col items-center gap-2 text-faint">
          <IconPhoto size={32} className="lucide-display" />
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
