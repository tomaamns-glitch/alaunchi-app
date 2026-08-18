export interface HSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

const cache = new Map<string, Promise<HSL | null>>();

/**
 * Downsamples an image onto a small canvas and averages its pixels into an
 * HSL color, clamped to a range that still reads as a usable UI accent
 * (never near-black, near-white, or fully desaturated).
 */
export function extractDominantColor(imageUrl: string | undefined | null): Promise<HSL | null> {
  if (!imageUrl) return Promise.resolve(null);
  const cached = cache.get(imageUrl);
  if (cached) return cached;

  const promise = new Promise<HSL | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        if (count === 0) return resolve(null);
        const hsl = rgbToHsl(r / count, g / count, b / count);
        hsl.s = Math.min(95, Math.max(45, hsl.s));
        hsl.l = Math.min(65, Math.max(40, hsl.l));
        resolve(hsl);
      } catch {
        // Canvas got tainted (image served without permissive CORS headers) — fall back.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });

  cache.set(imageUrl, promise);
  return promise;
}
