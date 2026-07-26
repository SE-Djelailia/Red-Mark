import { useCallback, useEffect, useRef, useState } from "react";

export interface CropRect {
  /** All values are fractions (0–1) of the current image, so the rect stays
   *  meaningful regardless of how the image is displayed. */
  x: number;
  y: number;
  width: number;
  height: number;
}

const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * "Préparer" step: crop + 90° rotation, applied BEFORE annotating.
 *
 * Why a separate step rather than tools alongside the pen: cropping or
 * rotating changes the image's pixel geometry, which would invalidate the
 * coordinates of every annotation already placed. Restricting these to a
 * pre-annotation mode means transforms are baked into the working image
 * while there is nothing to reproject — the caller enforces this by
 * disabling prepare mode once annotations exist.
 *
 * Everything here works at NATURAL resolution. The prepared result is a
 * full-size canvas, never a display-scaled one.
 */
export function usePrepareImage(sourceUrl: string | null) {
  // The image the annotator actually draws on — the source until a
  // prepare step is applied, then the transformed result.
  const [preparedUrl, setPreparedUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  // Object URLs we minted and must revoke; the source URL is the caller's.
  const ownedUrls = useRef<string[]>([]);

  useEffect(() => {
    setPreparedUrl(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    const urls = ownedUrls;
    return () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, []);

  const loadImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de charger l'image."));
      img.src = url;
    });

  /**
   * Bake a crop and/or rotation into a new full-resolution image.
   *
   * @param crop     fractional rect of the current image to keep
   * @param rotation clockwise degrees, a multiple of 90
   */
  const applyPrepare = useCallback(
    async (crop: CropRect, rotation: number): Promise<void> => {
      if (!preparedUrl) return;
      setIsApplying(true);
      try {
        const img = await loadImage(preparedUrl);

        // Crop in natural pixels.
        const sx = Math.round(crop.x * img.naturalWidth);
        const sy = Math.round(crop.y * img.naturalHeight);
        const sw = Math.max(1, Math.round(crop.width * img.naturalWidth));
        const sh = Math.max(1, Math.round(crop.height * img.naturalHeight));

        const quarterTurns = (((rotation / 90) % 4) + 4) % 4;
        const swapsAxes = quarterTurns % 2 === 1;

        const canvas = document.createElement("canvas");
        canvas.width = swapsAxes ? sh : sw;
        canvas.height = swapsAxes ? sw : sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas indisponible.");

        // Rotate about the output centre, then draw the cropped region
        // centred on the origin.
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((quarterTurns * Math.PI) / 2);
        ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

        const blob = await new Promise<Blob | null>((resolve) =>
          // PNG: this is an intermediate, and re-encoding JPEG at every
          // prepare step would stack generational loss before a single
          // annotation is drawn.
          canvas.toBlob((b) => resolve(b), "image/png"),
        );
        if (!blob) throw new Error("Échec de la préparation de l'image.");

        const url = URL.createObjectURL(blob);
        ownedUrls.current.push(url);
        setPreparedUrl(url);
        setNaturalSize({ width: canvas.width, height: canvas.height });
      } finally {
        setIsApplying(false);
      }
    },
    [preparedUrl],
  );

  const reset = useCallback(() => {
    setPreparedUrl(sourceUrl);
    setNaturalSize(null);
  }, [sourceUrl]);

  return { preparedUrl, naturalSize, isApplying, applyPrepare, reset, FULL_CROP };
}

export { FULL_CROP };
