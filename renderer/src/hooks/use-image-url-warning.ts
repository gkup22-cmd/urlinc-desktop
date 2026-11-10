import { useState, useEffect, useRef } from "react";

const DEBOUNCE_MS = 600;
const TIMEOUT_MS = 5000;

export type ImageUrlWarningState = "idle" | "checking" | "ok" | "warn";

export function useImageUrlWarning(url: string): {
  state: ImageUrlWarningState;
} {
  const [state, setState] = useState<ImageUrlWarningState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (imgRef.current) {
      imgRef.current.onload = null;
      imgRef.current.onerror = null;
      imgRef.current.src = "";
      imgRef.current = null;
    }

    if (!url || url.startsWith("/api/storage/") || url.startsWith("data:")) {
      setState("idle");
      return;
    }

    let isValid = false;
    try {
      new URL(url);
      isValid = true;
    } catch {
      isValid = false;
    }

    if (!isValid) {
      setState("idle");
      return;
    }

    setState("checking");

    timerRef.current = setTimeout(() => {
      const img = new Image();
      imgRef.current = img;

      const timeoutId = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        img.src = "";
        imgRef.current = null;
        setState("warn");
      }, TIMEOUT_MS);

      img.onload = () => {
        clearTimeout(timeoutId);
        imgRef.current = null;
        setState("ok");
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        imgRef.current = null;
        setState("warn");
      };

      img.src = url;
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (imgRef.current) {
        imgRef.current.onload = null;
        imgRef.current.onerror = null;
        imgRef.current.src = "";
        imgRef.current = null;
      }
    };
  }, [url]);

  return { state };
}
