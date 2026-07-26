import { useMemo, useState } from "react";
import type { CropRect } from "../../hooks/usePrepareImage";

interface Props {
  crop: CropRect;
  onChange: (next: CropRect) => void;
}

// Crop rectangle with two draggable corners, drawn over the image during
// the "Préparer" step. Values are fractions of the image, so the overlay is
// resolution-independent — the actual pixel crop happens in usePrepareImage
// against the natural-size image.
export default function CropOverlay({ crop, onChange }: Props) {
  const [dragCorner, setDragCorner] = useState<"tl" | "br" | null>(null);

  const style = useMemo(
    () => ({
      left: `${crop.x * 100}%`,
      top: `${crop.y * 100}%`,
      width: `${crop.width * 100}%`,
      height: `${crop.height * 100}%`,
    }),
    [crop],
  );

  // A minimum extent keeps the rect from collapsing to nothing (and from
  // producing a zero-width crop canvas downstream).
  const MIN = 0.05;

  return (
    <div className="absolute inset-0">
      <div
        className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
        style={style}
      >
        {(["tl", "br"] as const).map((corner) => (
          <button
            key={corner}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragCorner(corner);
            }}
            aria-label={corner === "tl" ? "Coin supérieur gauche" : "Coin inférieur droit"}
            className={`absolute w-7 h-7 bg-surface border-2 border-brand-600 rounded-full touch-none ${
              corner === "tl" ? "-top-3.5 -left-3.5" : "-bottom-3.5 -right-3.5"
            }`}
          />
        ))}
      </div>

      {/* Drag surface — only capturing while a handle is held, so taps
          elsewhere fall through rather than being swallowed. */}
      <div
        className="absolute inset-0 touch-none"
        style={{ pointerEvents: dragCorner ? "auto" : "none" }}
        onPointerMove={(e) => {
          if (!dragCorner) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          const fy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

          if (dragCorner === "tl") {
            const x = Math.min(fx, crop.x + crop.width - MIN);
            const y = Math.min(fy, crop.y + crop.height - MIN);
            onChange({
              x,
              y,
              width: crop.x + crop.width - x,
              height: crop.y + crop.height - y,
            });
          } else {
            onChange({
              ...crop,
              width: Math.max(MIN, fx - crop.x),
              height: Math.max(MIN, fy - crop.y),
            });
          }
        }}
        onPointerUp={() => setDragCorner(null)}
        onPointerCancel={() => setDragCorner(null)}
      />
    </div>
  );
}
