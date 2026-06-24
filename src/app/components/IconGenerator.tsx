import { useState } from 'react';

export default function IconGenerator() {
  const [generating, setGenerating] = useState(false);

  const generateIcon = (size: number): Promise<Blob> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Red gradient background
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#FF0000');
      gradient.addColorStop(0.5, '#E10600');
      gradient.addColorStop(1, '#C10500');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      // White checkmark
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = size * 0.12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw checkmark path
      ctx.beginPath();
      ctx.moveTo(size * 0.25, size * 0.5);
      ctx.lineTo(size * 0.42, size * 0.68);
      ctx.lineTo(size * 0.75, size * 0.32);
      ctx.stroke();

      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/png');
    });
  };

  const downloadAllIcons = async () => {
    setGenerating(true);
    const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

    try {
      for (const size of sizes) {
        const blob = await generateIcon(size);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `icon-${size}x${size}.png`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        // Delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      setGenerating(false);
      alert('✅ Toutes les icônes ont été téléchargées!\n\nMaintenant, déplacez les 8 fichiers PNG de votre dossier Téléchargements vers /public/icons/ dans votre projet.');
    } catch (error) {
      setGenerating(false);
      alert('❌ Erreur lors de la génération. Essayez avec un autre navigateur (Chrome recommandé).');
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Générateur d'Icônes RedMark
          </h1>
          <p className="text-gray-600 mb-8">
            Cliquez sur le bouton ci-dessous pour télécharger toutes les icônes nécessaires pour l'application PWA.
          </p>

          {/* Icon Previews */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {[72, 96, 128, 144, 152, 192, 384, 512].map((size) => (
              <div key={size} className="flex flex-col items-center">
                <div 
                  className="rounded-lg flex items-center justify-center mb-2 relative overflow-hidden"
                  style={{ 
                    width: Math.min(size, 128), 
                    height: Math.min(size, 128),
                    background: 'linear-gradient(135deg, #FF0000 0%, #E10600 50%, #C10500 100%)'
                  }}
                >
                  {/* SVG Checkmark */}
                  <svg 
                    width={Math.min(size, 128) * 0.6} 
                    height={Math.min(size, 128) * 0.6} 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="white" 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <span className="text-sm text-gray-600">{size}×{size}</span>
              </div>
            ))}
          </div>

          {/* Download Button */}
          <button
            onClick={downloadAllIcons}
            disabled={generating}
            className="w-full bg-[#E10600] text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-[#C10500] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {generating ? '⏳ Génération en cours...' : '📥 Télécharger Toutes les Icônes'}
          </button>

          {/* Instructions */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="font-semibold text-blue-900 mb-3">📋 Instructions:</h2>
            <ol className="space-y-2 text-blue-800 text-sm">
              <li>1. Cliquez sur "Télécharger Toutes les Icônes"</li>
              <li>2. 8 fichiers PNG seront téléchargés dans votre dossier Téléchargements</li>
              <li>3. Déplacez ces 8 fichiers vers le dossier <code className="bg-blue-100 px-2 py-1 rounded">/public/icons/</code> de votre projet</li>
              <li>4. Rafraîchissez l'application RedMark</li>
              <li>5. Votre PWA est maintenant prête à être installée! 🎉</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}