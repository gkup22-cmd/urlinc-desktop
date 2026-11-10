import { useState, useEffect, useMemo } from "react";

const STORAGE_KEY = "vvm_tv_mode";

// User-agent patterns for common smart TV browsers
const TV_UA_PATTERNS = [
  /Tizen/i,          // Samsung Smart TV
  /Web0S/i,          // LG webOS
  /WebOS/i,
  /NetCast/i,        // LG NetCast
  /SmartTV/i,
  /SMART-TV/i,
  /HbbTV/i,          // European broadcast standard
  /AppleTV/i,
  /GoogleTV/i,
  /Android TV/i,
  /CrKey/i,          // Chromecast
  /Viera/i,          // Panasonic
  /BRAVIA/i,         // Sony
  /Philips.*TV/i,
  /Opera TV/i,
  /Kylo/i,
];

export function detectTv(): boolean {
  try {
    return TV_UA_PATTERNS.some((p) => p.test(navigator.userAgent));
  } catch {
    return false;
  }
}

export function loadTvOverride(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {}
  return null;
}

function saveTvOverride(v: boolean | null): void {
  try {
    if (v === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(v));
  } catch {}
}

export function applyTvMode(enabled: boolean): void {
  document.documentElement.dataset.tv = String(enabled);
}

// Called once on app init before React renders to avoid a flash
export function loadAndApplyTvMode(): void {
  const override = loadTvOverride();
  applyTvMode(override !== null ? override : detectTv());
}

export function useTv() {
  const autoDetected = useMemo(() => detectTv(), []);
  const [override, setOverrideRaw] = useState<boolean | null>(loadTvOverride);

  const enabled = override !== null ? override : autoDetected;

  useEffect(() => {
    applyTvMode(enabled);
  }, [enabled]);

  // Stay in sync with other useTv() instances on the same page
  useEffect(() => {
    const onchange = () => {
      setOverrideRaw(loadTvOverride());
    };
    window.addEventListener("tvmodechange", onchange);
    return () => window.removeEventListener("tvmodechange", onchange);
  }, []);

  function setOverride(v: boolean | null): void {
    saveTvOverride(v);
    setOverrideRaw(v);
    applyTvMode(v !== null ? v : autoDetected);
    window.dispatchEvent(new Event("tvmodechange"));
  }

  return { enabled, autoDetected, override, setOverride };
}
