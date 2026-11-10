import { useState, useEffect } from "react";

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  primaryFg: string;
  primaryFgLight: string;
  swatch: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "amber",   name: "Amber",   primary: "38 92% 50%",  primaryFg: "222 47% 11%", primaryFgLight: "222 47% 11%", swatch: "hsl(38,92%,50%)"  },
  { id: "blue",    name: "Blue",    primary: "217 91% 60%", primaryFg: "0 0% 100%",   primaryFgLight: "0 0% 100%",   swatch: "hsl(217,91%,60%)" },
  { id: "emerald", name: "Emerald", primary: "160 84% 39%", primaryFg: "160 30% 5%",  primaryFgLight: "160 30% 5%",  swatch: "hsl(160,84%,39%)" },
  { id: "violet",  name: "Violet",  primary: "270 70% 60%", primaryFg: "0 0% 100%",   primaryFgLight: "0 0% 100%",   swatch: "hsl(270,70%,60%)" },
  { id: "rose",    name: "Rose",    primary: "342 89% 60%", primaryFg: "0 0% 100%",   primaryFgLight: "0 0% 100%",   swatch: "hsl(342,89%,60%)" },
  { id: "red",     name: "Red",     primary: "0 72% 52%",   primaryFg: "0 0% 100%",   primaryFgLight: "0 0% 100%",   swatch: "hsl(0,72%,52%)"   },
  { id: "cyan",    name: "Cyan",    primary: "198 90% 50%", primaryFg: "198 30% 10%", primaryFgLight: "198 30% 10%", swatch: "hsl(198,90%,50%)" },
];

export type ColorMode = "dark" | "dim" | "light";

export interface ThemeState {
  accentId: string;
  mode: ColorMode;
  bgHue: number;
  /** false = subtle tint (default), true = vivid color wash */
  bgVivid: boolean;
  /** 0 = softest text, 100 = full contrast (default) */
  textContrast: number;
  /** when false, textContrast is ignored and full contrast is used */
  textContrastEnabled: boolean;
  /** hue (0-360) for solid text colorisation */
  textSolidHue: number;
  /** when true, foreground text is tinted with textSolidHue */
  textSolidEnabled: boolean;
}

export const DEFAULT_THEME: ThemeState = {
  accentId: "amber",
  mode: "dark",
  bgHue: 222,
  bgVivid: false,
  textContrast: 100,
  textContrastEnabled: false,
  textSolidHue: 210,
  textSolidEnabled: false,
};

const STORAGE_KEY = "vvm_theme";

export function loadTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw) as Partial<ThemeState & { lightMode?: boolean }>;
    if (parsed.mode === undefined && parsed.lightMode !== undefined) {
      parsed.mode = parsed.lightMode ? "light" : "dark";
    }
    return { ...DEFAULT_THEME, ...parsed };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

function bg(h: number, s: number, l: number) {
  return `${h} ${s}% ${l}%`;
}

/** Linearly interpolate: at t=1 returns `hi`, at t=0 returns `lo`. */
function lerp(lo: number, hi: number, t: number) {
  return Math.round(lo + (hi - lo) * t);
}

/**
 * Saturation sets for each mode.
 * tint  = subtle hue shift (original behaviour)
 * vivid = bold colour wash
 */
function sats(vivid: boolean) {
  if (vivid) {
    return {
      dark:  { bg: 100, card: 100, sfc: 100, acc: 100, inp: 100 },
      dim:   { bg: 100, card: 100, sfc: 100, acc: 100, inp: 100 },
      light: { bg: 100, card: 100, brd: 100, sfc: 100, inp: 100 },
    };
  }
  return {
    dark:  { bg: 40, card: 40, sfc: 30, acc: 30, inp: 24 },
    dim:   { bg: 28, card: 26, sfc: 20, acc: 20, inp: 18 },
    light: { bg: 12, card:  6, brd: 12, sfc: 14, inp: 12 },
  };
}

export function applyTheme(state: ThemeState): void {
  const preset = THEME_PRESETS.find((p) => p.id === state.accentId) ?? THEME_PRESETS[0];
  const h  = state.bgHue;
  const c  = (state.textContrastEnabled ?? false)
    ? Math.max(0, Math.min(100, state.textContrast ?? 100)) / 100
    : 1.0;
  const solidH   = (state.textSolidEnabled ?? false) ? (state.textSolidHue ?? 210) : null;
  const s  = sats(state.bgVivid ?? false);
  const r  = document.documentElement;
  const set = (k: string, v: string) => r.style.setProperty(k, v);

  set("--primary", preset.primary);
  set("--ring", preset.primary);
  set("--sidebar-primary", preset.primary);
  set("--sidebar-ring", preset.primary);
  set("--chart-1", preset.primary);

  if (state.mode === "light") {
    const fgL  = lerp(40, 12, c);
    const mfgL = lerp(62, 46, c);
    const fgH  = solidH ?? h;
    const fg   = bg(fgH, solidH != null ? 55 : 30, fgL);
    const mfg  = bg(fgH, solidH != null ? 30 : 10, mfgL);
    const ls   = s.light;

    set("--primary-foreground", preset.primaryFgLight);
    set("--sidebar-primary-foreground", preset.primaryFgLight);
    set("--button-outline", "rgba(0,0,0,0.18)");
    set("--badge-outline", "rgba(0,0,0,0.12)");
    set("--elevate-1", "rgba(0,0,0,0.03)");
    set("--elevate-2", "rgba(0,0,0,0.07)");
    set("--background",               bg(h, ls.bg,   97));
    set("--foreground",               fg);
    set("--card",                     bg(h, ls.card, 100));
    set("--card-foreground",          fg);
    set("--card-border",              bg(h, ls.brd,  88));
    set("--popover",                  bg(h, ls.card, 100));
    set("--popover-foreground",       fg);
    set("--popover-border",           bg(h, ls.brd,  80));
    set("--secondary",                bg(h, ls.sfc,  90));
    set("--secondary-foreground",     fg);
    set("--muted",                    bg(h, ls.sfc,  92));
    set("--muted-foreground",         mfg);
    set("--accent",                   bg(h, ls.sfc,  93));
    set("--accent-foreground",        fg);
    set("--destructive",              "0 72% 45%");
    set("--destructive-foreground",   "0 0% 100%");
    set("--border",                   bg(h, ls.brd,  88));
    set("--input",                    bg(h, ls.inp,  84));
    set("--sidebar",                  bg(h, ls.bg,   97));
    set("--sidebar-foreground",       fg);
    set("--sidebar-border",           bg(h, ls.brd,  88));
    set("--sidebar-accent",           bg(h, ls.sfc,  93));
    set("--sidebar-accent-foreground",fg);

  } else if (state.mode === "dim") {
    const fgL  = lerp(65, 90, c);
    const mfgL = lerp(40, 56, c);
    const fgH  = solidH ?? 210;
    const fg   = `${fgH} ${solidH != null ? 55 : 30}% ${fgL}%`;
    const mfg  = `${fgH} ${solidH != null ? 28 : 14}% ${mfgL}%`;
    const ds   = s.dim;

    set("--primary-foreground", preset.primaryFg);
    set("--sidebar-primary-foreground", preset.primaryFg);
    set("--button-outline", "rgba(255,255,255,0.20)");
    set("--badge-outline", "rgba(255,255,255,0.10)");
    set("--elevate-1", "rgba(255,255,255,0.04)");
    set("--elevate-2", "rgba(255,255,255,0.08)");
    set("--background",               bg(h, ds.bg,   18));
    set("--foreground",               fg);
    set("--card",                     bg(h, ds.card, 22));
    set("--card-foreground",          fg);
    set("--card-border",              bg(h, ds.sfc,  30));
    set("--popover",                  bg(h, ds.card, 36));
    set("--popover-foreground",       fg);
    set("--popover-border",           bg(h, ds.sfc,  46));
    set("--secondary",                bg(h, ds.sfc,  28));
    set("--secondary-foreground",     fg);
    set("--muted",                    bg(h, ds.sfc,  28));
    set("--muted-foreground",         mfg);
    set("--accent",                   bg(h, ds.acc,  32));
    set("--accent-foreground",        fg);
    set("--destructive",              "0 60% 38%");
    set("--destructive-foreground",   fg);
    set("--border",                   bg(h, ds.sfc,  28));
    set("--input",                    bg(h, ds.inp,  44));
    set("--sidebar",                  bg(h, ds.bg,   18));
    set("--sidebar-foreground",       fg);
    set("--sidebar-border",           bg(h, ds.sfc,  28));
    set("--sidebar-accent",           bg(h, ds.acc,  28));
    set("--sidebar-accent-foreground",fg);

  } else {
    // dark
    const fgL  = lerp(65, 98, c);
    const mfgL = lerp(45, 65, c);
    const fgH  = solidH ?? 210;
    const fg   = `${fgH} ${solidH != null ? 60 : 40}% ${fgL}%`;
    const mfg  = `${fgH} ${solidH != null ? 32 : 20}% ${mfgL}%`;
    const dk   = s.dark;

    set("--primary-foreground", preset.primaryFg);
    set("--sidebar-primary-foreground", preset.primaryFg);
    set("--button-outline", "rgba(255,255,255,0.28)");
    set("--badge-outline", "rgba(255,255,255,0.12)");
    set("--elevate-1", "rgba(255,255,255,0.04)");
    set("--elevate-2", "rgba(255,255,255,0.09)");
    set("--background",               bg(h, dk.bg,   11));
    set("--foreground",               fg);
    set("--card",                     bg(h, dk.card, 14));
    set("--card-foreground",          fg);
    set("--card-border",              bg(h, dk.sfc,  20));
    set("--popover",                  bg(h, dk.card, 32));
    set("--popover-foreground",       fg);
    set("--popover-border",           bg(h, dk.sfc,  42));
    set("--secondary",                bg(h, dk.sfc,  20));
    set("--secondary-foreground",     fg);
    set("--muted",                    bg(h, dk.sfc,  20));
    set("--muted-foreground",         mfg);
    set("--accent",                   bg(h, dk.acc,  25));
    set("--accent-foreground",        fg);
    set("--destructive",              "0 63% 31%");
    set("--destructive-foreground",   fg);
    set("--border",                   bg(h, dk.sfc,  20));
    set("--input",                    bg(h, dk.inp,  42));
    set("--sidebar",                  bg(h, dk.bg,   11));
    set("--sidebar-foreground",       fg);
    set("--sidebar-border",           bg(h, dk.sfc,  20));
    set("--sidebar-accent",           bg(h, dk.acc,  20));
    set("--sidebar-accent-foreground",fg);
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeState>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)); } catch {}
  }, [theme]);

  const setAccent              = (accentId: string)           => setTheme((p) => ({ ...p, accentId }));
  const setMode                = (mode: ColorMode)             => setTheme((p) => ({ ...p, mode }));
  const setBgHue               = (bgHue: number)               => setTheme((p) => ({ ...p, bgHue }));
  const setBgVivid             = (bgVivid: boolean)            => setTheme((p) => ({ ...p, bgVivid }));
  const setTextContrast        = (textContrast: number)        => setTheme((p) => ({ ...p, textContrast }));
  const setTextContrastEnabled = (textContrastEnabled: boolean) => setTheme((p) => ({ ...p, textContrastEnabled }));
  const setTextSolidHue        = (textSolidHue: number)        => setTheme((p) => ({ ...p, textSolidHue }));
  const setTextSolidEnabled    = (textSolidEnabled: boolean)   => setTheme((p) => ({ ...p, textSolidEnabled }));
  const reset                  = ()                            => setTheme({ ...DEFAULT_THEME });

  return {
    theme,
    setAccent, setMode, setBgHue, setBgVivid,
    setTextContrast, setTextContrastEnabled,
    setTextSolidHue, setTextSolidEnabled,
    reset, presets: THEME_PRESETS,
  };
}
