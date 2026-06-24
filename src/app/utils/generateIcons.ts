/**
 * Generates PWA icons dynamically and stores them in the cache
 */

export async function generateAndCacheIcons() {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  
  // Check if icons are already cached
  const cache = await caches.open('redmark-icons-v1');
  const cachedIcon = await cache.match('/icons/icon-192x192.png');
  
  if (cachedIcon) {
    console.log('✅ PWA icons already cached');
    return true;
  }
  
  console.log('🎨 Generating PWA icons...');
  
  try {
    for (const size of sizes) {
      const blob = await generateIcon(size);
      const response = new Response(blob, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
      
      await cache.put(`/icons/icon-${size}x${size}.png`, response);
    }
    
    console.log('✅ All PWA icons generated and cached!');
    return true;
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    return false;
  }
}

function generateIcon(size: number): Promise<Blob> {
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
}