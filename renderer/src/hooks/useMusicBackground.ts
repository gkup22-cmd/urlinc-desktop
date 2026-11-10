import { useState, useCallback } from "react";
 
// Track list opacity: 0 = fully transparent, 100 = fully opaque. Default 80.
const TRACK_OPACITY_KEY = "music-track-opacity";
export function useMusicListOpacity() {
  const [opacity, setOpacityState] = useState<number>(() => {
    try {
      const v = localStorage.getItem(TRACK_OPACITY_KEY);
      return v !== null ? Math.min(100, Math.max(0, Number(v))) : 80;
    } catch { return 80; }
  });
  const setListOpacity = useCallback((val: number) => { setOpacityState(val); }, []);
  const persistListOpacity = useCallback((val: number) => {
    setOpacityState(val);
    try { localStorage.setItem(TRACK_OPACITY_KEY, String(val)); } catch {}
  }, []);
  return { listOpacity: opacity, setListOpacity, persistListOpacity };
}
 
// Background image brightness: 0 = dim, 100 = bright. Default 40.
const BG_BRIGHTNESS_KEY = "music-bg-brightness";
export function useMusicBgBrightness() {
  const [brightness, setBrightnessState] = useState<number>(() => {
    try {
      const v = localStorage.getItem(BG_BRIGHTNESS_KEY);
      return v !== null ? Math.min(100, Math.max(0, Number(v))) : 40;
    } catch { return 40; }
  });
  const setBgBrightness = useCallback((val: number) => { setBrightnessState(val); }, []);
  const persistBgBrightness = useCallback((val: number) => {
    setBrightnessState(val);
    try { localStorage.setItem(BG_BRIGHTNESS_KEY, String(val)); } catch {}
  }, []);
  return { bgBrightness: brightness, setBgBrightness, persistBgBrightness };
}
 
// ── Background keys ──────────────────────────────────────────────────────────
export type MusicBgKey = "jukebox" | "radio" | "podcast" | "theater" | "audiobooks" | "records";
 
const BG_ENABLED_KEY = "scene-bg-enabled";
export function useSceneBgEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(BG_ENABLED_KEY);
      return v === null ? false : v === "true";
    } catch { return false; }
  });
  const setBgEnabled = useCallback((val: boolean) => {
    setEnabled(val);
    try { localStorage.setItem(BG_ENABLED_KEY, String(val)); } catch {}
  }, []);
  return { enabled, setBgEnabled };
}

// ── Per-tab content/card opacity (used when scene images are off) ─────────────
export function useTabCardOpacity(tab: TabName) {
  const key = `tab-card-opacity-${tab}`;
  const [cardOpacity, setCardOpacityState] = useState<number>(() => {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? Math.min(100, Math.max(0, Number(v))) : 100;
    } catch { return 100; }
  });
  const setCardOpacity = useCallback((val: number) => {
    setCardOpacityState(val);
    try { localStorage.setItem(key, String(val)); } catch {}
  }, [key]);
  return { cardOpacity, setCardOpacity };
}

// ── Library colored text ──────────────────────────────────────────────────────
const COLORED_TEXT_KEY = "library-colored-text";
export function useLibraryColoredText() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(COLORED_TEXT_KEY);
      return v === null ? true : v === "true";
    } catch { return true; }
  });
  const setColoredText = useCallback((val: boolean) => {
    setEnabled(val);
    try { localStorage.setItem(COLORED_TEXT_KEY, String(val)); } catch {}
  }, []);
  return { coloredText: enabled, setColoredText };
}

export const LIBRARY_TRACK_COLORS = [
  "#f97316", // orange
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#22c55e", // green
  "#ec4899", // pink
  "#eab308", // yellow
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#10b981", // emerald
];

export const MUSIC_BACKGROUNDS: Record<MusicBgKey, { label: string; src: string }> = {
  jukebox:    { label: "Jukebox",    src: "/music-bg-jukebox.png"  },
  radio:      { label: "Radio",      src: "/music-bg-radio.png"    },
  podcast:    { label: "Podcast",    src: "/music-bg-podcast.png"  },
  theater:    { label: "Theater",    src: "/music-bg-theater.png"  },
  audiobooks: { label: "Audiobooks", src: "/Desk-Book.png"         },
 records: { label: "Records", src: "/Taylermade_Records.png" },
};
 
// ── Default (library) background ─────────────────────────────────────────────
const LS_KEY = "music-bg";
export function useMusicBackground() {
  const [bg, setBg] = useState<MusicBgKey>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored && stored in MUSIC_BACKGROUNDS) return stored as MusicBgKey;
    } catch {}
    return "jukebox";
  });
  const setBackground = useCallback((key: MusicBgKey) => {
    setBg(key);
    try { localStorage.setItem(LS_KEY, key); } catch {}
  }, []);
  return {
    bg,
    src: MUSIC_BACKGROUNDS[bg].src,
    label: MUSIC_BACKGROUNDS[bg].label,
    setBackground,
  };
}
 
// ── Per-tab background preferences ───────────────────────────────────────────
// Each tab stores its own background choice independently.
// Key format: "tab-bg-<tabName>"  e.g. "tab-bg-audiobooks"
export type TabName = "library" | "browse" | "stream" | "audiobooks" | "radio";

const TAB_DEFAULTS: Record<TabName, MusicBgKey> = {
  library:    "jukebox",
  browse:     "jukebox",
  stream:     "jukebox",
  audiobooks: "audiobooks",
};

function tabBgKey(tab: TabName) {
  return `tab-bg-${tab}`;
}

export function useTabBackground(tab: TabName) {
  const [bg, setBgState] = useState<MusicBgKey>(() => {
    try {
      const stored = localStorage.getItem(tabBgKey(tab));
      if (stored && stored in MUSIC_BACKGROUNDS) return stored as MusicBgKey;
    } catch {}
    return TAB_DEFAULTS[tab];
  });

  const setTabBackground = useCallback((key: MusicBgKey) => {
    setBgState(key);
    try { localStorage.setItem(tabBgKey(tab), key); } catch {}
  }, [tab]);

  return {
    bg,
    src: MUSIC_BACKGROUNDS[bg].src,
    setTabBackground,
  };
}

// ── Per-tab solid color overlay ───────────────────────────────────────────────
const TAB_SOLID_COLOR_DEFAULTS: Record<TabName, string> = {
  library:    "#1e3a5f",
  browse:     "#1a3a2a",
  stream:     "#3a1a3a",
  audiobooks: "#3a2a1a",
  radio:      "#1a2a3a",
};

export function useTabSolidColor(tab: TabName) {
  const enabledKey  = `tab-solid-enabled-${tab}`;
  const colorKey    = `tab-solid-color-${tab}`;
  const opacityKey  = `tab-solid-opacity-${tab}`;

  const [solidEnabled, setSolidEnabledState] = useState<boolean>(() => {
    try { return localStorage.getItem(enabledKey) === "true"; }
    catch { return false; }
  });
  const [solidColor, setSolidColorState] = useState<string>(() => {
    try { return localStorage.getItem(colorKey) ?? TAB_SOLID_COLOR_DEFAULTS[tab]; }
    catch { return TAB_SOLID_COLOR_DEFAULTS[tab]; }
  });
  const [solidOpacity, setSolidOpacityState] = useState<number>(() => {
    try {
      const v = localStorage.getItem(opacityKey);
      return v !== null ? Math.min(100, Math.max(0, Number(v))) : 40;
    } catch { return 40; }
  });

  const setSolidEnabled = useCallback((val: boolean) => {
    setSolidEnabledState(val);
    try { localStorage.setItem(enabledKey, String(val)); } catch {}
  }, [enabledKey]);

  const setSolidColor = useCallback((val: string) => {
    setSolidColorState(val);
    try { localStorage.setItem(colorKey, val); } catch {}
  }, [colorKey]);

  const setSolidOpacity = useCallback((val: number) => {
    setSolidOpacityState(val);
    try { localStorage.setItem(opacityKey, String(val)); } catch {}
  }, [opacityKey]);

  return { solidEnabled, solidColor, solidOpacity, setSolidEnabled, setSolidColor, setSolidOpacity };
}
 
