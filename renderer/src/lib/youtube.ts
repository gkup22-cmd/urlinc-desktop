// ── YouTube ──────────────────────────────────────────────────────────────────

export function getYoutubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export function getYoutubeThumbnailUrl(url: string, fallbackUrl?: string | null): string {
  if (fallbackUrl) return fallbackUrl;
  const videoId = getYoutubeVideoId(url);
  if (videoId) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
  return "";
}

// ── Facebook ─────────────────────────────────────────────────────────────────

export function isFacebookUrl(url: string): boolean {
  return /facebook\.com|fb\.watch/i.test(url);
}

// Patterns that are known NOT to work with the Facebook video embed plugin.
// Reels, short-share links, and story URLs all reject the plugin embed.
const FB_NON_EMBEDDABLE = [
  /facebook\.com\/reel\//i,
  /facebook\.com\/share\/reel\//i,
  /facebook\.com\/share\/r\//i,
  /facebook\.com\/stories\//i,
];

export function isFacebookEmbeddable(url: string): boolean {
  if (!isFacebookUrl(url)) return false;
  return !FB_NON_EMBEDDABLE.some((re) => re.test(url));
}

export function getFacebookEmbedUrl(url: string): string | null {
  if (!isFacebookEmbeddable(url)) return null;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=false`;
}

// ── Dailymotion ───────────────────────────────────────────────────────────────

export function getDailymotionVideoId(url: string): string | null {
  const match = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function getDailymotionEmbedUrl(url: string): string | null {
  const id = getDailymotionVideoId(url);
  return id ? `https://www.dailymotion.com/embed/video/${id}?autoplay=0&queue-autoplay-next=0` : null;
}

export function getDailymotionThumbnailUrl(url: string): string {
  const id = getDailymotionVideoId(url);
  return id ? `https://www.dailymotion.com/thumbnail/video/${id}` : "";
}

// ── Vimeo ─────────────────────────────────────────────────────────────────────

export function getVimeoVideoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)/);
  return match ? match[1] : null;
}

export function getVimeoEmbedUrl(url: string): string | null {
  const id = getVimeoVideoId(url);
  return id ? `https://player.vimeo.com/video/${id}?dnt=1&title=0&byline=0&portrait=0` : null;
}

export function getVimeoThumbnailUrl(url: string): string {
  const id = getVimeoVideoId(url);
  return id ? `https://vumbnail.com/${id}.jpg` : "";
}

// ── Generic helpers ───────────────────────────────────────────────────────────

// ── Plex ─────────────────────────────────────────────────────────────────────

export function isPlexUrl(url: string): boolean {
  // 1. app.plex.tv cloud web app  (/web or /desktop path)
  if (/app\.plex\.tv\/(web|desktop)/i.test(url)) return true;
  // 2. plex.direct – Plex's relay/direct-connect proxy hostnames
  if (/\.plex\.direct(:\d+)?/i.test(url)) return true;
  // 3. Anything on the default Plex port
  if (/[:/]32400\b/.test(url)) return true;
  // 4. Direct library API path
  if (/\/library\/metadata\/\d+/.test(url)) return true;
  // 5. Hash fragment patterns in local or remote web app
  if (/com\.plexapp\.plugins/i.test(url)) return true;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".plex.direct")) return true;
    if (u.port === "32400") return true;
    if (u.pathname.includes("/library/metadata/")) return true;
    const hash = u.hash;
    if (hash.includes("/library/metadata/")) return true;
    if (hash.includes("com.plexapp")) return true;
    if (hash.includes("/server/") && (hash.includes("/details") || hash.includes("/media/"))) return true;
  } catch { /* ignore */ }
  return false;
}

// ── Generic helpers ───────────────────────────────────────────────────────────

export type VideoPlatform =
  | "youtube"
  | "facebook"
  | "dailymotion"
  | "vimeo"
  | "plex"
  | "unknown";

export function detectPlatform(url: string): VideoPlatform {
  if (getYoutubeVideoId(url)) return "youtube";
  if (isFacebookUrl(url)) return "facebook";
  if (getDailymotionVideoId(url)) return "dailymotion";
  if (getVimeoVideoId(url)) return "vimeo";
  if (isPlexUrl(url)) return "plex";
  return "unknown";
}

// Map of URL hostname fragments → display name for free/paid streaming services.
const STREAMING_HOSTS: [string, string][] = [
  ["pluto.tv",        "Pluto TV"],
  ["tubitv.com",      "Tubi"],
  ["peacocktv.com",   "Peacock"],
  ["hulu.com",        "Hulu"],
  ["netflix.com",     "Netflix"],
  ["primevideo.com",  "Prime Video"],
  ["amazon.com/prime","Prime Video"],
  ["max.com",         "Max"],
  ["hbomax.com",      "Max"],
  ["disneyplus.com",  "Disney+"],
  ["paramountplus.com","Paramount+"],
  ["shudder.com",     "Shudder"],
  ["crackle.com",     "Crackle"],
  ["freevee.com",     "Freevee"],
  ["appletv.apple.com","Apple TV+"],
  ["plex.tv",         "Plex"],
  ["vudu.com",        "Vudu"],
  ["kanopy.com",      "Kanopy"],
  ["curiositystream.com","CuriosityStream"],
  ["mubi.com",        "Mubi"],
  ["amc.com",         "AMC+"],
  ["criterionchannel.com","Criterion"],
  ["britbox.com",     "BritBox"],
  ["acornmediatv.com","Acorn TV"],
  ["retrocrush.tv",   "RetroCrush"],
  ["pureflix.com",    "Pure Flix"],
];

// Known service names to scan for inside description / page-title text.
const STREAMING_NAMES: [RegExp, string][] = [
  [/\bPluto\s*TV\b/i,      "Pluto TV"],
  [/\bTubi\b/i,            "Tubi"],
  [/\bPeacock\b/i,         "Peacock"],
  [/\bHulu\b/i,            "Hulu"],
  [/\bNetflix\b/i,         "Netflix"],
  [/\bPrime\s*Video\b/i,   "Prime Video"],
  [/\bHBO\s*Max\b|\bMax\b/i,"Max"],
  [/\bDisney\+|\bDisney\s*Plus\b/i, "Disney+"],
  [/\bParamount\+|\bParamount\s*Plus\b/i, "Paramount+"],
  [/\bShudder\b/i,         "Shudder"],
  [/\bCrackle\b/i,         "Crackle"],
  [/\bFreevee\b/i,         "Freevee"],
  [/\bApple\s*TV\+|\bApple\s*TV\s*Plus\b/i, "Apple TV+"],
  [/\bVudu\b/i,            "Vudu"],
  [/\bKanopy\b/i,          "Kanopy"],
  [/\bBritBox\b/i,         "BritBox"],
  [/\bAcorn\s*TV\b/i,      "Acorn TV"],
  [/\bCriterion\b/i,       "Criterion"],
];

/**
 * Returns the streaming service display name for a saved link, or null if
 * it cannot be determined. Checks the URL hostname first, then scans the
 * description / page-title text (which typically ends in "| Service Name").
 */
export function detectStreamingService(url: string, description?: string | null): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [fragment, name] of STREAMING_HOSTS) {
      if (host.includes(fragment.replace(/^www\./, ""))) return name;
    }
  } catch { /* ignore invalid URLs */ }

  if (description) {
    // Page titles saved as descriptions often end with "| Service Name"
    const afterPipe = description.split("|").pop()?.trim() ?? "";
    for (const [re, name] of STREAMING_NAMES) {
      if (re.test(afterPipe) || re.test(description)) return name;
    }
  }
  return null;
}

/** Returns the embed URL for any supported platform, or null if unsupported. */
export function getEmbedUrl(url: string): string | null {
  const platform = detectPlatform(url);
  if (platform === "youtube") {
    const id = getYoutubeVideoId(url);
    return id ? `https://www.youtube.com/embed/${id}?autoplay=0&rel=0&modestbranding=1` : null;
  }
  if (platform === "facebook") return getFacebookEmbedUrl(url);
  if (platform === "dailymotion") return getDailymotionEmbedUrl(url);
  if (platform === "vimeo") return getVimeoEmbedUrl(url);
  return null;
}

/** Returns a thumbnail URL if one can be derived automatically. */
export function getVideoThumbnail(url: string, customThumbnail?: string | null): string {
  if (customThumbnail) return customThumbnail;
  const platform = detectPlatform(url);
  if (platform === "dailymotion") return getDailymotionThumbnailUrl(url);
  if (platform === "vimeo") return getVimeoThumbnailUrl(url);
  return getYoutubeThumbnailUrl(url);
}
