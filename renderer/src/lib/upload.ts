async function compressImage(file: File, maxPx: number, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const name = file.name.replace(/\.[^.]+$/, ".jpg");
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

// Upload a file directly to the local Express server
export async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/storage/upload", { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { error?: string }).error ?? ""; } catch { /* ignore */ }
    throw new Error(detail || `Upload failed (${res.status})`);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

export async function compressAndUploadPhoto(
  file: File,
): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  const [full, thumb] = await Promise.all([
    compressImage(file, 1920, 0.85),
    compressImage(file, 256, 0.80),
  ]);
  const [imageUrl, thumbnailUrl] = await Promise.all([
    uploadFile(full),
    uploadFile(thumb),
  ]);
  return { imageUrl, thumbnailUrl };
}

export async function uploadEpub(file: File): Promise<string> {
  const MAX_EPUB_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_EPUB_BYTES) throw new Error("EPUB file must be 50 MB or smaller");
  return uploadFile(file);
}

export async function uploadAudio(file: File): Promise<string> {
  const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
  if (file.size > MAX_AUDIO_BYTES) throw new Error("Audio file must be 200 MB or smaller");
  return uploadFile(file);
}

export function isStorageUrl(url: string): boolean {
  return url.startsWith("/api/storage/");
}
