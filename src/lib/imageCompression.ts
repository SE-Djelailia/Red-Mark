/**
 * Image compression utilities for reducing photo file sizes before upload
 */

interface CompressionOptions {
  /** Cap on the LONGEST side, in pixels. Aspect ratio is preserved. */
  maxDimension?: number;
  quality?: number; // 0.0 to 1.0
}

// A single longest-side cap, deliberately not a width/height pair.
//
// The previous defaults were maxWidth 1920 / maxHeight 1080 applied as
// min(both ratios), which punished portrait photos badly: a 3024×4032 phone
// photo — the natural way to shoot a wall defect — came out at 810×1080,
// only 27% scale, while the same photo in landscape kept 1440×1080. Capping
// the longest side treats both orientations identically.
//
// 2560 keeps enough detail to read a crack width or a label in a defect
// photo, which is the evidentiary point of these images.
const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxDimension: 2560,
  quality: 0.85, // 85% quality - good balance between size and quality
};

/**
 * Compress an image file before uploading to reduce storage and bandwidth
 * Reduces file size by ~70-80% while maintaining good visual quality
 *
 * @param file - The original image file
 * @param options - Compression options
 * @returns Compressed image file
 */
export async function compressImage(file: File, options: CompressionOptions = {}): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    // Skip compression for already small files (< 200KB)
    if (file.size < 200 * 1024) {
      console.log("📸 Photo already small, skipping compression:", file.name);
      resolve(file);
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // Scale by the longest side only, so portrait and landscape shots of
        // the same subject end up with the same amount of detail.
        let width = img.width;
        let height = img.height;

        const longest = Math.max(width, height);
        if (longest > opts.maxDimension) {
          const ratio = opts.maxDimension / longest;
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        // Create canvas and draw resized image
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }

            // Create new file from compressed blob
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg", // Always convert to JPEG for best compression
              lastModified: Date.now(),
            });

            const originalSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            const compressedSizeMB = (compressedFile.size / (1024 * 1024)).toFixed(2);
            const reduction = ((1 - compressedFile.size / file.size) * 100).toFixed(0);

            console.log(
              `📸 Compressed ${file.name}: ${originalSizeMB}MB → ${compressedSizeMB}MB (${reduction}% reduction)`,
            );

            resolve(compressedFile);
          },
          "image/jpeg",
          opts.quality,
        );
      };

      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Compress multiple images in parallel
 * @param files - Array of image files
 * @param options - Compression options
 * @returns Array of compressed files
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = {},
): Promise<File[]> {
  console.log(`📸 Compressing ${files.length} photos...`);
  const startTime = Date.now();

  const compressedFiles = await Promise.all(files.map((file) => compressImage(file, options)));

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Compression complete in ${totalTime}s`);

  return compressedFiles;
}
