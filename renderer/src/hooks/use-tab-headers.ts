import { useQuery } from "@tanstack/react-query";

// The tabs that can carry banner artwork, with the image each falls back to
// when an admin hasn't uploaded one. Keys must match TAB_HEADER_KEYS in the
// API's admin routes -- the server rejects anything else.
//
// The fallbacks are the original committed images in public/. Keeping them
// means a tab always has artwork: a fresh database shows the bundled default,
// and "Remove" in Admin is a revert rather than a way to end up with a gap.
// A null fallback means the tab has no bundled artwork of its own -- it shows
// nothing until an admin uploads something, rather than borrowing another
// tab's image.
//
// defaultOffset positions the 4:1 window when no admin has set one. The
// bundled images are stored whole, so each value is the framing its baked crop
// used to have -- replacing those files with full-size originals gave them
// something to expand into without silently reframing a live banner.
//
// Audiobooks is the exception: its artwork was uploaded through Admin while
// crops were still baked, so the stored file is already 4:1, offset does
// nothing, and there's no extra height to reveal. Re-uploading it would fix
// that; until then TabHeader notices and withholds the expand affordance
// rather than offering something that can't happen.
export const TAB_HEADERS = [
  { key: "audio-library",    label: "My Audio — Library",        fallback: "/audio-library-header.webp",    defaultOffset: 0.185 },
  { key: "audio-radio",      label: "My Audio — Radio",          fallback: "/audio-radio-header.webp",      defaultOffset: 0.451 },
  { key: "audio-browse",     label: "My Audio — Browse Music",   fallback: "/audio-browse-header.webp",     defaultOffset: 0.471 },
  { key: "audio-stream",     label: "My Audio — Stream Sources", fallback: "/audio-stream-header.webp",     defaultOffset: 0.135 },
  { key: "audio-audiobooks", label: "My Audio — Audiobooks",     fallback: "/audio-audiobooks-header.webp", defaultOffset: 0.5 },
  // Bundled so this tab paints instantly. Uploaded images are served through
  // /api/storage, which redirects to cloud storage and can take seconds on a
  // cold object -- and this was the only tab with no fallback, so it showed
  // nothing at all while it waited. The bundled copy renders from the app's
  // own origin in about a fifth of a second; the uploaded version then swaps
  // in unnoticed. Its offset matches the framing Kup positioned by hand, so
  // the two are the same picture and the swap is invisible.
  { key: "videos-library",   label: "My Videos",                 fallback: "/videos-library-header.webp",   defaultOffset: 0.246,
    spanLabel: "Show on all My Videos tabs" },
  { key: "tv-shows",         label: "TV Shows",                  fallback: null,                            defaultOffset: 0.5 },
  { key: "videos-streaming", label: "My Videos — Streaming",     fallback: null,                            defaultOffset: 0.5 },
  { key: "vault",            label: "My Vault (all tabs)",       fallback: "/vault-header.webp",            defaultOffset: 0.104 },
] as const;

export type TabHeaderKey = typeof TAB_HEADERS[number]["key"];

const FALLBACKS = Object.fromEntries(
  TAB_HEADERS.map((t) => [t.key, t.fallback]),
) as Record<TabHeaderKey, string | null>;

const DEFAULT_OFFSETS = Object.fromEntries(
  TAB_HEADERS.map((t) => [t.key, t.defaultOffset]),
) as Record<TabHeaderKey, number>;

export type TabHeaderSetting = { imageUrl: string | null; cropOffset: number; visible: boolean; spanAll: boolean };

export const TAB_HEADERS_QUERY_KEY = ["tab-headers"];

async function fetchTabHeaders(): Promise<Partial<Record<TabHeaderKey, TabHeaderSetting>>> {
  const res = await fetch("/api/tab-headers", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tab headers");
  return res.json();
}

// Resolves each tab to the banner it should render, and whether to render one
// at all. Both degrade toward the existing look: a failed or in-flight request
// falls back to the bundled image and treats the banner as visible, so a blip
// shows the original artwork rather than blanking the tab.
export function useTabHeaders() {
  const { data } = useQuery({
    queryKey: TAB_HEADERS_QUERY_KEY,
    queryFn: fetchTabHeaders,
    staleTime: 5 * 60 * 1000,
  });

  const settings = data ?? {};

  return {
    settings,
    headerSrc: (key: TabHeaderKey) => settings[key]?.imageUrl ?? FALLBACKS[key],
    // Only an explicit false hides a banner, so tabs stay visible by default.
    isHeaderVisible: (key: TabHeaderKey) => settings[key]?.visible !== false,
    cropOffset: (key: TabHeaderKey) => settings[key]?.cropOffset ?? DEFAULT_OFFSETS[key],
    // Whether a tab is showing bundled artwork rather than an upload. Used to
    // retire image-specific extras (the vault keypad hotspot) automatically
    // once someone puts their own picture there.
    fallbackSrc: (key: TabHeaderKey) => FALLBACKS[key],
    isUsingFallback: (key: TabHeaderKey) => !settings[key]?.imageUrl,
    // Only consulted by sections whose config carries a spanLabel; the rest
    // render their banner on one tab regardless.
    spansAllTabs: (key: TabHeaderKey) => settings[key]?.spanAll === true,
  };
}
