import { useState } from "react";
import { Logo, drawAppIcon } from "./ui-kit/Logo";

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

export default function IconGenerator() {
  const [generating, setGenerating] = useState(false);

  // Draws via the shared drawAppIcon so a generated PNG is pixel-identical
  // to the in-app <Logo variant="app" /> — same polygons, same inset, same
  // corner radius. drawAppIcon uses the literal BRAND_RED constant because
  // Canvas 2D cannot resolve CSS custom properties (a token here would
  // silently paint black).
  const generateIcon = (size: number): Promise<Blob> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;

      drawAppIcon(ctx, size);

      canvas.toBlob((blob) => {
        resolve(blob!);
      }, "image/png");
    });
  };

  const downloadAllIcons = async () => {
    setGenerating(true);

    try {
      for (const size of ICON_SIZES) {
        const blob = await generateIcon(size);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `icon-${size}x${size}.png`;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        // Delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      setGenerating(false);
      alert(
        "✅ Toutes les icônes ont été téléchargées!\n\nMaintenant, déplacez les 8 fichiers PNG de votre dossier Téléchargements vers /public/icons/ dans votre projet.",
      );
    } catch (error) {
      setGenerating(false);
      alert(
        "❌ Erreur lors de la génération. Essayez avec un autre navigateur (Chrome recommandé).",
      );
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-canvas py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-surface rounded-[4px] shadow-lg p-8">
          <h1 className="text-3xl font-bold text-ink mb-2">Générateur d'Icônes RedMark</h1>
          <p className="text-body mb-8">
            Cliquez sur le bouton ci-dessous pour télécharger toutes les icônes nécessaires pour
            l'application PWA.
          </p>

          {/* Icon Previews — the same component the PNGs are drawn from. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {ICON_SIZES.map((size) => (
              <div key={size} className="flex flex-col items-center">
                <Logo size={Math.min(size, 128)} variant="app" className="mb-2" decorative />
                <span className="text-sm text-body">
                  {size}×{size}
                </span>
              </div>
            ))}
          </div>

          {/* Download Button */}
          <button
            onClick={downloadAllIcons}
            disabled={generating}
            className="w-full bg-brand-600 text-white py-4 px-6 rounded-[4px] font-semibold text-lg hover:bg-brand-700 active:bg-brand-800 transition-colors disabled:bg-line-strong disabled:cursor-not-allowed"
          >
            {generating ? "⏳ Génération en cours..." : "📥 Télécharger Toutes les Icônes"}
          </button>

          {/* Instructions */}
          <div className="mt-8 bg-subtle border border-line-strong rounded-[4px] p-6">
            <h2 className="font-semibold text-ink mb-3">📋 Instructions:</h2>
            <ol className="space-y-2 text-ink text-sm">
              <li>1. Cliquez sur "Télécharger Toutes les Icônes"</li>
              <li>2. 8 fichiers PNG seront téléchargés dans votre dossier Téléchargements</li>
              <li>
                3. Déplacez ces 8 fichiers vers le dossier{" "}
                <code className="bg-subtle px-2 py-1 rounded">/public/icons/</code> de votre
                projet
              </li>
              <li>4. Rafraîchissez l'application RedMark</li>
              <li>5. Votre PWA est maintenant prête à être installée! 🎉</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
