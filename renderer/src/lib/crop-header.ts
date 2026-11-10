// Preparing an uploaded image to serve as a tab banner.
//
// Banners display as a 4:1 window, but the file is stored at its original
// shape and the window is applied at render time via object-position. Keeping
// the whole image is what lets a banner expand to show the full picture, and
// what makes repositioning a saved number rather than a re-upload.
//
// An earlier version cropped here and threw the rest away, which meant
// reframing cost a re-upload and there was nothing left to expand into.

export const BANNER_RATIO = 4;

// Enough for a 4:1 banner at 2x on a wide screen, and enough that expanding to
// the full image still looks sharp. Past this the extra pixels only cost bytes.
const MAX_WIDTH = 2000;

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

/**
 * Re-encodes as WebP at its original aspect ratio, downscaling only if wider
 * than MAX_WIDTH. No cropping: the banner window is applied at render time.
 */
export async function encodeBannerSource(img: HTMLImageElement): Promise<Blob> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // Never upscale -- a bigger canvas on a small source is interpolation
  // dressed up as resolution.
  const outW = Math.min(w, MAX_WIDTH);
  const outH = Math.round((outW / w) * h);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the image");
  ctx.drawImage(img, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not encode the image")),
      "image/webp",
      0.82,
    );
  });
}
