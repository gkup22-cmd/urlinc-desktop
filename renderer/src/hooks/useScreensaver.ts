import { useState, useEffect, useCallback, useRef } from "react";
 
const LS_KEY = "screensaver-settings";
 
export interface ScreensaverSettings {
  enabled: boolean;
  inactivityMinutes: number;
  albumId: number | null;
  albumName: string | null;
  playlistId: number | null;
  playlistName: string | null;
  slideDurationSeconds: number;
  transition: "fade" | "slide" | "zoom";
  shuffle: boolean;
 fullscreen: boolean;
}
 
export const DEFAULT_SCREENSAVER: ScreensaverSettings = {
  enabled: false,
  inactivityMinutes: 5,
  albumId: null,
  albumName: null,
  playlistId: null,
  playlistName: null,
  slideDurationSeconds: 5,
  transition: "fade",
  shuffle: false,
 fullscreen: false,
};
 
function loadSettings(): ScreensaverSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_SCREENSAVER };
    return { ...DEFAULT_SCREENSAVER, ...JSON.parse(raw) as Partial<ScreensaverSettings> };
  } catch {
    return { ...DEFAULT_SCREENSAVER };
  }
}
 
function saveSettings(s: ScreensaverSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}
 
export function useScreensaverSettings() {
  const [settings, setSettings] = useState<ScreensaverSettings>(loadSettings);
 
  const update = useCallback(<K extends keyof ScreensaverSettings>(key: K, value: ScreensaverSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);
 
  return { settings, update };
}
 
// Hook that tracks inactivity and fires onActivate / onDismiss
export function useScreensaverTimer(
  enabled: boolean,
  inactivityMinutes: number,
  onActivate: () => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false); // is screensaver currently showing?
 
  const reset = useCallback(() => {
    if (activeRef.current) return; // don't reset while screensaver is showing
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled) return;
    timerRef.current = setTimeout(() => {
      activeRef.current = true;
      onActivate();
    }, inactivityMinutes * 60 * 1000);
  }, [enabled, inactivityMinutes, onActivate]);
 
  const dismiss = useCallback(() => {
    activeRef.current = false;
    reset();
  }, [reset]);
 
  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
 
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    const handler = () => reset();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    reset();
 
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, reset]);
 
  return { dismiss };
}
