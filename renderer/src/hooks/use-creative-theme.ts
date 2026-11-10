import { useState, useEffect } from "react";

export interface CreativeTheme {
  id: string;
  name: string;
  tagline: string;
  // Mini preview swatch: [sidebar, background, card, primary, text]
  swatch: string[];
  vars: Record<string, string>;
}

export const CREATIVE_THEMES: CreativeTheme[] = [
  // ── Midnight Gold ─────────────────────────────────────────────────────────
  {
    id: "midnight-gold",
    name: "Midnight Gold",
    tagline: "Luxury dark with rich gold",
    swatch: ["#050505", "#0d0d0d", "#161616", "#c9a227", "#f0e0b0"],
    vars: {
      "--background":                   "0 0% 5%",
      "--foreground":                   "45 25% 91%",
      "--card":                         "0 0% 8%",
      "--card-foreground":              "45 25% 91%",
      "--card-border":                  "45 30% 16%",
      "--popover":                      "0 0% 11%",
      "--popover-foreground":           "45 25% 91%",
      "--popover-border":               "45 25% 24%",
      "--primary":                      "43 90% 48%",
      "--primary-foreground":           "0 0% 5%",
      "--secondary":                    "0 0% 11%",
      "--secondary-foreground":         "45 25% 91%",
      "--muted":                        "0 0% 11%",
      "--muted-foreground":             "45 12% 54%",
      "--accent":                       "0 0% 14%",
      "--accent-foreground":            "45 25% 91%",
      "--destructive":                  "0 60% 34%",
      "--destructive-foreground":       "45 25% 91%",
      "--border":                       "45 22% 15%",
      "--input":                        "45 15% 20%",
      "--ring":                         "43 90% 48%",
      "--sidebar":                      "0 0% 3%",
      "--sidebar-foreground":           "45 25% 91%",
      "--sidebar-border":               "45 22% 12%",
      "--sidebar-primary":              "43 90% 48%",
      "--sidebar-primary-foreground":   "0 0% 5%",
      "--sidebar-accent":               "0 0% 8%",
      "--sidebar-accent-foreground":    "45 25% 91%",
      "--sidebar-ring":                 "43 90% 48%",
      "--radius":                       "0.2rem",
      "--app-font-sans":                "'Inter', sans-serif",
      "--app-font-display":             "Georgia, 'Times New Roman', serif",
      "--button-outline":               "rgba(201,162,39,0.30)",
      "--badge-outline":                "rgba(201,162,39,0.15)",
      "--elevate-1":                    "rgba(255,255,255,0.025)",
      "--elevate-2":                    "rgba(255,255,255,0.055)",
      "--opaque-button-border-intensity": "18",
    },
  },

  // ── Arctic ────────────────────────────────────────────────────────────────
  {
    id: "arctic",
    name: "Arctic",
    tagline: "Crisp white, ice blue, ultra-minimal",
    swatch: ["#e8f0f8", "#f4f8fc", "#ffffff", "#1a7fe8", "#0d1f35"],
    vars: {
      "--background":                   "210 28% 97%",
      "--foreground":                   "210 42% 10%",
      "--card":                         "0 0% 100%",
      "--card-foreground":              "210 42% 10%",
      "--card-border":                  "210 22% 86%",
      "--popover":                      "0 0% 100%",
      "--popover-foreground":           "210 42% 10%",
      "--popover-border":               "210 22% 80%",
      "--primary":                      "211 88% 52%",
      "--primary-foreground":           "0 0% 100%",
      "--secondary":                    "210 22% 92%",
      "--secondary-foreground":         "210 42% 10%",
      "--muted":                        "210 20% 94%",
      "--muted-foreground":             "210 22% 45%",
      "--accent":                       "210 24% 90%",
      "--accent-foreground":            "210 42% 10%",
      "--destructive":                  "0 72% 45%",
      "--destructive-foreground":       "0 0% 100%",
      "--border":                       "210 22% 86%",
      "--input":                        "210 18% 84%",
      "--ring":                         "211 88% 52%",
      "--sidebar":                      "210 24% 95%",
      "--sidebar-foreground":           "210 42% 10%",
      "--sidebar-border":               "210 22% 86%",
      "--sidebar-primary":              "211 88% 52%",
      "--sidebar-primary-foreground":   "0 0% 100%",
      "--sidebar-accent":               "210 22% 90%",
      "--sidebar-accent-foreground":    "210 42% 10%",
      "--sidebar-ring":                 "211 88% 52%",
      "--radius":                       "0rem",
      "--app-font-sans":                "'Inter', sans-serif",
      "--app-font-display":             "'Inter', sans-serif",
      "--button-outline":               "rgba(0,0,0,0.14)",
      "--badge-outline":                "rgba(0,0,0,0.08)",
      "--elevate-1":                    "rgba(0,0,0,0.025)",
      "--elevate-2":                    "rgba(0,0,0,0.055)",
      "--opaque-button-border-intensity": "0",
    },
  },

  // ── Ember ─────────────────────────────────────────────────────────────────
  {
    id: "ember",
    name: "Ember",
    tagline: "Warm burgundy, burnt orange, jazz-club glow",
    swatch: ["#0e050a", "#180a11", "#241019", "#d94c1a", "#f2d8b8"],
    vars: {
      "--background":                   "345 40% 7%",
      "--foreground":                   "28 30% 90%",
      "--card":                         "345 35% 10%",
      "--card-foreground":              "28 30% 90%",
      "--card-border":                  "345 28% 19%",
      "--popover":                      "345 32% 14%",
      "--popover-foreground":           "28 30% 90%",
      "--popover-border":               "345 28% 26%",
      "--primary":                      "16 86% 52%",
      "--primary-foreground":           "28 10% 6%",
      "--secondary":                    "345 28% 13%",
      "--secondary-foreground":         "28 30% 90%",
      "--muted":                        "345 28% 13%",
      "--muted-foreground":             "28 16% 52%",
      "--accent":                       "345 28% 17%",
      "--accent-foreground":            "28 30% 90%",
      "--destructive":                  "0 65% 35%",
      "--destructive-foreground":       "28 30% 90%",
      "--border":                       "345 28% 19%",
      "--input":                        "345 22% 25%",
      "--ring":                         "16 86% 52%",
      "--sidebar":                      "345 42% 5%",
      "--sidebar-foreground":           "28 30% 90%",
      "--sidebar-border":               "345 28% 15%",
      "--sidebar-primary":              "16 86% 52%",
      "--sidebar-primary-foreground":   "28 10% 6%",
      "--sidebar-accent":               "345 28% 11%",
      "--sidebar-accent-foreground":    "28 30% 90%",
      "--sidebar-ring":                 "16 86% 52%",
      "--radius":                       "0.5rem",
      "--app-font-sans":                "'Inter', sans-serif",
      "--app-font-display":             "Georgia, 'Times New Roman', serif",
      "--button-outline":               "rgba(217,76,26,0.28)",
      "--badge-outline":                "rgba(217,76,26,0.14)",
      "--elevate-1":                    "rgba(255,180,100,0.04)",
      "--elevate-2":                    "rgba(255,180,100,0.08)",
      "--opaque-button-border-intensity": "18",
    },
  },

  // ── Neon Noir ─────────────────────────────────────────────────────────────
  {
    id: "neon-noir",
    name: "Neon Noir",
    tagline: "Dark charcoal, glowing cyan and purple",
    swatch: ["#08080f", "#0e0e1a", "#151524", "#00e5ff", "#cc44ff"],
    vars: {
      "--background":                   "248 22% 6%",
      "--foreground":                   "0 0% 96%",
      "--card":                         "248 20% 9%",
      "--card-foreground":              "0 0% 96%",
      "--card-border":                  "265 32% 19%",
      "--popover":                      "248 20% 13%",
      "--popover-foreground":           "0 0% 96%",
      "--popover-border":               "265 32% 27%",
      "--primary":                      "186 100% 50%",
      "--primary-foreground":           "248 22% 6%",
      "--secondary":                    "248 20% 12%",
      "--secondary-foreground":         "0 0% 96%",
      "--muted":                        "248 20% 12%",
      "--muted-foreground":             "265 16% 56%",
      "--accent":                       "265 32% 17%",
      "--accent-foreground":            "0 0% 96%",
      "--destructive":                  "0 72% 40%",
      "--destructive-foreground":       "0 0% 96%",
      "--border":                       "265 28% 17%",
      "--input":                        "265 22% 22%",
      "--ring":                         "186 100% 50%",
      "--sidebar":                      "248 24% 4%",
      "--sidebar-foreground":           "0 0% 96%",
      "--sidebar-border":               "265 28% 13%",
      "--sidebar-primary":              "186 100% 50%",
      "--sidebar-primary-foreground":   "248 22% 6%",
      "--sidebar-accent":               "265 28% 11%",
      "--sidebar-accent-foreground":    "0 0% 96%",
      "--sidebar-ring":                 "186 100% 50%",
      "--radius":                       "0.15rem",
      "--app-font-sans":                "'Outfit', sans-serif",
      "--app-font-display":             "'Outfit', sans-serif",
      "--button-outline":               "rgba(0,229,255,0.24)",
      "--badge-outline":                "rgba(0,229,255,0.12)",
      "--elevate-1":                    "rgba(0,229,255,0.04)",
      "--elevate-2":                    "rgba(186,100,255,0.07)",
      "--opaque-button-border-intensity": "18",
    },
  },

  // ── Deep Ocean ────────────────────────────────────────────────────────────
  {
    id: "deep-ocean",
    name: "Deep Ocean",
    tagline: "Navy depths, glowing aqua currents",
    swatch: ["#030711", "#060f1e", "#0b1830", "#00d4cc", "#c0eef0"],
    vars: {
      "--background":                   "212 72% 5%",
      "--foreground":                   "190 22% 92%",
      "--card":                         "212 68% 7%",
      "--card-foreground":              "190 22% 92%",
      "--card-border":                  "210 52% 14%",
      "--popover":                      "212 65% 11%",
      "--popover-foreground":           "190 22% 92%",
      "--popover-border":               "210 48% 22%",
      "--primary":                      "184 92% 44%",
      "--primary-foreground":           "212 72% 5%",
      "--secondary":                    "212 62% 10%",
      "--secondary-foreground":         "190 22% 92%",
      "--muted":                        "212 62% 10%",
      "--muted-foreground":             "190 16% 52%",
      "--accent":                       "212 55% 13%",
      "--accent-foreground":            "190 22% 92%",
      "--destructive":                  "0 62% 34%",
      "--destructive-foreground":       "190 22% 92%",
      "--border":                       "210 50% 14%",
      "--input":                        "210 42% 18%",
      "--ring":                         "184 92% 44%",
      "--sidebar":                      "212 75% 3%",
      "--sidebar-foreground":           "190 22% 92%",
      "--sidebar-border":               "210 52% 10%",
      "--sidebar-primary":              "184 92% 44%",
      "--sidebar-primary-foreground":   "212 72% 5%",
      "--sidebar-accent":               "212 62% 8%",
      "--sidebar-accent-foreground":    "190 22% 92%",
      "--sidebar-ring":                 "184 92% 44%",
      "--radius":                       "0.5rem",
      "--app-font-sans":                "'Inter', sans-serif",
      "--app-font-display":             "'Inter', sans-serif",
      "--button-outline":               "rgba(0,212,204,0.26)",
      "--badge-outline":                "rgba(0,212,204,0.13)",
      "--elevate-1":                    "rgba(0,180,220,0.05)",
      "--elevate-2":                    "rgba(0,180,220,0.10)",
      "--opaque-button-border-intensity": "18",
    },
  },

  // ── Forest ────────────────────────────────────────────────────────────────
  {
    id: "forest",
    name: "Forest",
    tagline: "Deep greens, earthy warmth, cabin glow",
    swatch: ["#060c04", "#0e1a09", "#182810", "#78c840", "#e8e0c0"],
    vars: {
      "--background":                   "106 34% 4%",
      "--foreground":                   "62 22% 90%",
      "--card":                         "106 30% 7%",
      "--card-foreground":              "62 22% 90%",
      "--card-border":                  "100 26% 14%",
      "--popover":                      "106 28% 11%",
      "--popover-foreground":           "62 22% 90%",
      "--popover-border":               "100 24% 22%",
      "--primary":                      "88 68% 42%",
      "--primary-foreground":           "106 34% 4%",
      "--secondary":                    "106 26% 10%",
      "--secondary-foreground":         "62 22% 90%",
      "--muted":                        "106 26% 10%",
      "--muted-foreground":             "80 12% 50%",
      "--accent":                       "100 24% 13%",
      "--accent-foreground":            "62 22% 90%",
      "--destructive":                  "0 58% 34%",
      "--destructive-foreground":       "62 22% 90%",
      "--border":                       "100 24% 14%",
      "--input":                        "100 20% 18%",
      "--ring":                         "88 68% 42%",
      "--sidebar":                      "106 36% 2%",
      "--sidebar-foreground":           "62 22% 90%",
      "--sidebar-border":               "100 26% 10%",
      "--sidebar-primary":              "88 68% 42%",
      "--sidebar-primary-foreground":   "106 34% 4%",
      "--sidebar-accent":               "106 26% 8%",
      "--sidebar-accent-foreground":    "62 22% 90%",
      "--sidebar-ring":                 "88 68% 42%",
      "--radius":                       "0.65rem",
      "--app-font-sans":                "'Inter', sans-serif",
      "--app-font-display":             "Georgia, 'Times New Roman', serif",
      "--button-outline":               "rgba(120,200,64,0.28)",
      "--badge-outline":                "rgba(120,200,64,0.14)",
      "--elevate-1":                    "rgba(140,220,80,0.04)",
      "--elevate-2":                    "rgba(140,220,80,0.08)",
      "--opaque-button-border-intensity": "18",
    },
  },

  // ── Rose Gold ─────────────────────────────────────────────────────────────
  {
    id: "rose-gold",
    name: "Rose Gold",
    tagline: "Soft pinks, metallic rose, elegant luxury",
    swatch: ["#0f0608", "#1e0d14", "#2e1520", "#e86090", "#f8d8e8"],
    vars: {
      "--background":                   "340 34% 5%",
      "--foreground":                   "340 16% 94%",
      "--card":                         "340 30% 8%",
      "--card-foreground":              "340 16% 94%",
      "--card-border":                  "340 24% 15%",
      "--popover":                      "340 28% 12%",
      "--popover-foreground":           "340 16% 94%",
      "--popover-border":               "340 22% 23%",
      "--primary":                      "340 65% 62%",
      "--primary-foreground":           "340 34% 5%",
      "--secondary":                    "340 26% 11%",
      "--secondary-foreground":         "340 16% 94%",
      "--muted":                        "340 26% 11%",
      "--muted-foreground":             "340 10% 54%",
      "--accent":                       "340 22% 14%",
      "--accent-foreground":            "340 16% 94%",
      "--destructive":                  "0 60% 35%",
      "--destructive-foreground":       "340 16% 94%",
      "--border":                       "340 22% 15%",
      "--input":                        "340 18% 20%",
      "--ring":                         "340 65% 62%",
      "--sidebar":                      "340 36% 3%",
      "--sidebar-foreground":           "340 16% 94%",
      "--sidebar-border":               "340 22% 11%",
      "--sidebar-primary":              "340 65% 62%",
      "--sidebar-primary-foreground":   "340 34% 5%",
      "--sidebar-accent":               "340 24% 9%",
      "--sidebar-accent-foreground":    "340 16% 94%",
      "--sidebar-ring":                 "340 65% 62%",
      "--radius":                       "1rem",
      "--app-font-sans":                "'Inter', sans-serif",
      "--app-font-display":             "Georgia, 'Times New Roman', serif",
      "--button-outline":               "rgba(232,96,144,0.30)",
      "--badge-outline":                "rgba(232,96,144,0.15)",
      "--elevate-1":                    "rgba(232,96,144,0.04)",
      "--elevate-2":                    "rgba(232,96,144,0.08)",
      "--opaque-button-border-intensity": "18",
    },
  },

  // ── Slate ─────────────────────────────────────────────────────────────────
  {
    id: "slate",
    name: "Slate",
    tagline: "Cool grays, silver precision, polished",
    swatch: ["#060809", "#0e1116", "#161c24", "#5b8fd4", "#dce6f4"],
    vars: {
      "--background":                   "215 18% 5%",
      "--foreground":                   "215 14% 94%",
      "--card":                         "215 15% 8%",
      "--card-foreground":              "215 14% 94%",
      "--card-border":                  "215 12% 15%",
      "--popover":                      "215 14% 12%",
      "--popover-foreground":           "215 14% 94%",
      "--popover-border":               "215 12% 22%",
      "--primary":                      "215 58% 55%",
      "--primary-foreground":           "0 0% 100%",
      "--secondary":                    "215 12% 11%",
      "--secondary-foreground":         "215 14% 94%",
      "--muted":                        "215 12% 11%",
      "--muted-foreground":             "215 8% 52%",
      "--accent":                       "215 10% 14%",
      "--accent-foreground":            "215 14% 94%",
      "--destructive":                  "0 60% 36%",
      "--destructive-foreground":       "215 14% 94%",
      "--border":                       "215 12% 15%",
      "--input":                        "215 10% 20%",
      "--ring":                         "215 58% 55%",
      "--sidebar":                      "215 20% 3%",
      "--sidebar-foreground":           "215 14% 94%",
      "--sidebar-border":               "215 12% 11%",
      "--sidebar-primary":              "215 58% 55%",
      "--sidebar-primary-foreground":   "0 0% 100%",
      "--sidebar-accent":               "215 12% 9%",
      "--sidebar-accent-foreground":    "215 14% 94%",
      "--sidebar-ring":                 "215 58% 55%",
      "--radius":                       "0.3rem",
      "--app-font-sans":                "'Inter', sans-serif",
      "--app-font-display":             "'Inter', sans-serif",
      "--button-outline":               "rgba(91,143,212,0.24)",
      "--badge-outline":                "rgba(91,143,212,0.12)",
      "--elevate-1":                    "rgba(91,143,212,0.03)",
      "--elevate-2":                    "rgba(91,143,212,0.07)",
      "--opaque-button-border-intensity": "18",
    },
  },
];

const LS_KEY = "creative-theme-id";

export function loadCreativeThemeId(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

export function applyCreativeVars(theme: CreativeTheme): void {
  const r = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => r.style.setProperty(k, v));
}

export function clearCreativeVars(): void {
  const r = document.documentElement;
  [
    "--background","--foreground","--card","--card-foreground","--card-border",
    "--popover","--popover-foreground","--popover-border",
    "--primary","--primary-foreground","--secondary","--secondary-foreground",
    "--muted","--muted-foreground","--accent","--accent-foreground",
    "--destructive","--destructive-foreground","--border","--input","--ring",
    "--sidebar","--sidebar-foreground","--sidebar-border",
    "--sidebar-primary","--sidebar-primary-foreground",
    "--sidebar-accent","--sidebar-accent-foreground","--sidebar-ring",
    "--radius","--app-font-sans","--app-font-display",
    "--button-outline","--badge-outline","--elevate-1","--elevate-2",
    "--opaque-button-border-intensity",
  ].forEach(k => r.style.removeProperty(k));
}

export function useCreativeTheme() {
  const [activeId, setActiveId] = useState<string | null>(loadCreativeThemeId);

  // On mount: re-apply creative theme so it persists even after regular applyTheme runs
  useEffect(() => {
    if (!activeId) return;
    const theme = CREATIVE_THEMES.find(t => t.id === activeId);
    if (!theme) return;
    applyCreativeVars(theme);

    // Keep the creative theme on top: watch :root style changes
    // (regular applyTheme writes inline styles; we re-stamp ours after)
    const r = document.documentElement;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Only re-apply if our theme is still the active one
        if (loadCreativeThemeId() === activeId) applyCreativeVars(theme);
      }, 0);
    });
    observer.observe(r, { attributes: true, attributeFilter: ["style"] });
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [activeId]);

  const activate = (id: string) => {
    const theme = CREATIVE_THEMES.find(t => t.id === id);
    if (!theme) return;
    applyCreativeVars(theme);
    try { localStorage.setItem(LS_KEY, id); } catch {}
    setActiveId(id);
  };

  const reset = () => {
    clearCreativeVars();
    try { localStorage.removeItem(LS_KEY); } catch {}
    setActiveId(null);
  };

  return { activeId, activate, reset, themes: CREATIVE_THEMES };
}
