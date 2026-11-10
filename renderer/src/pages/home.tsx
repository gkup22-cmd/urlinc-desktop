import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearch, useLocation, Link } from "wouter";
import { openUrl } from "@/lib/openUrl";
import { useAuth } from "@workspace/replit-auth-web";
import { Layout } from "@/components/layout";
import { VideoCard, VideoCardSkeleton } from "@/components/video-card";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useInfiniteListVideos, useGetVideoStats, useGetVideoCount, useListPlaylists,
  useBulkDeleteVideos, useBulkRestoreVideos, useBulkUpdateCategory, useCreatePlaylist, useBulkAddVideosToPlaylist,
  getListCategoriesQueryKey, getGetVideoStatsQueryKey, getGetVideoCountQueryKey, getListPlaylistsQueryKey,
  getInfiniteListVideosQueryKey,
} from "@workspace/api-client-react";
import type { Playlist } from "@workspace/api-client-react";
import { Film, Search, X, ArrowUpDown, Check, Pencil, Share2, Send, Trash2, Plus, ListVideo, Loader2, FolderOpen, ExternalLink, Tv, Star, Radio, ShoppingBag, Trophy } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { openInPlexPlayer, openInJellyfinPlayer } from "@/lib/external-player";
import { WatchTogetherButton, useWatchSession, type WatchSession } from "@/components/watch-session";
import { TabHeader } from "@/components/tab-header";
import { scrollMainToTop } from "@/lib/scroll";
import { useTabHeaders } from "@/hooks/use-tab-headers";
import { useVideoFavorites } from "@/hooks/use-video-favorites";
import { useShowFavorites } from "@/hooks/use-show-favorites";
import { useVaultSourceFavorites } from "@/hooks/use-vault-source-favorites";
import { Checkbox } from "@/components/ui/checkbox";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const VIDEO_TABS = [
  { id: "tab1" as const, label: "Library" },
  { id: "tab9" as const, label: "✦ Fresh Finds" },
  { id: "tab3" as const, label: "TV Shows" },
  { id: "tab4" as const, label: "Streaming Services" },
  { id: "tab8" as const, label: "Jellyfin Library" },
  { id: "tab2" as const, label: "Plex Library" },
];
type VideoTab = "tab1" | "tab2" | "tab3" | "tab4" | "tab8" | "tab9";
const VIDEO_TAB_BY_PARAM: Record<string, VideoTab> = {
  library: "tab1", "tv-shows": "tab3", streaming: "tab4", jellyfin: "tab8", plex: "tab2", discover: "tab9",
};
const VIDEO_TAB_TO_PARAM: Record<VideoTab, string> = {
  tab1: "library", tab3: "tv-shows", tab4: "streaming", tab8: "jellyfin", tab2: "plex", tab9: "discover",
};

type SortKey = "alpha-asc" | "alpha-desc" | "date-desc" | "date-asc" | "random";
const SORT_LABELS: Record<SortKey, string> = {
  "alpha-asc": "A → Z",
  "alpha-desc": "Z → A",
  "date-desc": "Newest First",
  "date-asc": "Oldest First",
  "random": "Shuffle",
};

function sortVideos<T extends { title: string; createdAt: string }>(arr: T[], key: SortKey): T[] {
  // "random" order comes from the server (a stable per-seed shuffle spanning
  // the whole library) -- re-shuffling client-side here would only reorder
  // whatever page happens to be loaded so far, and would re-scramble it
  // every time a new page loads.
  if (key === "random") return arr;
  return [...arr].sort((a, b) => {
    if (key === "alpha-asc") return a.title.localeCompare(b.title);
    if (key === "alpha-desc") return b.title.localeCompare(a.title);
    if (key === "date-asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const UNDO_TIMEOUT_S = 15;

function UndoToastAction({ onUndo }: { onUndo: () => void }) {
  const [remaining, setRemaining] = useState(UNDO_TIMEOUT_S);
  useEffect(() => {
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <ToastAction altText="Undo delete" onClick={onUndo}>
      Undo ({remaining}s)
    </ToastAction>
  );
}

const POPULAR_STREAMING_SERVICES = [
  { name: "Netflix",     url: "https://www.netflix.com",       dot: "bg-red-600",    text: "text-red-500" },
  { name: "Prime Video", url: "https://www.primevideo.com",    dot: "bg-sky-500",    text: "text-sky-400" },
  { name: "Disney+",     url: "https://www.disneyplus.com",    dot: "bg-blue-600",   text: "text-blue-400" },
  { name: "HBO Max",     url: "https://www.max.com",           dot: "bg-purple-600", text: "text-purple-400" },
  { name: "Hulu",        url: "https://www.hulu.com",          dot: "bg-green-500",  text: "text-green-400" },
  { name: "Paramount+",  url: "https://www.paramountplus.com", dot: "bg-blue-500",   text: "text-blue-400" },
  { name: "Peacock",     url: "https://www.peacocktv.com",     dot: "bg-amber-500",  text: "text-amber-400" },
  { name: "Apple TV+",   url: "https://tv.apple.com",          dot: "bg-neutral-400",text: "text-neutral-300" },
  { name: "Tubi",        url: "https://tubitv.com",            dot: "bg-purple-500", text: "text-purple-400" },
  { name: "Shudder",     url: "https://www.shudder.com",       dot: "bg-red-700",    text: "text-red-500" },
  { name: "JustWatch",   url: "https://www.justwatch.com",     dot: "bg-teal-500",   text: "text-teal-400" },
];

// Cycled through for user-added services so each gets a distinct-looking
// dot color instead of one flat color for all of them, matching how the
// built-in list already looks.
const CUSTOM_SERVICE_COLORS = [
  { dot: "bg-rose-500",    text: "text-rose-400" },
  { dot: "bg-indigo-500",  text: "text-indigo-400" },
  { dot: "bg-lime-500",    text: "text-lime-400" },
  { dot: "bg-cyan-500",    text: "text-cyan-400" },
  { dot: "bg-fuchsia-500", text: "text-fuchsia-400" },
  { dot: "bg-orange-500",  text: "text-orange-400" },
];

type CustomStreamingService = { id: number; name: string; url: string };

function SortableCardWrapper({ id, enabled, children }: { id: string | number; enabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = enabled ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : undefined,
    position: "relative" as const,
  } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...(enabled ? attributes : {})} {...(enabled ? listeners : {})}>
      {children}
    </div>
  );
}

// ── Free Content Channels Guide ───────────────────────────────────────────

type ChannelEntry = { name: string; url: string; tier: string; desc: string };
type ChannelSection = { label: string; emoji: string; channels: ChannelEntry[] };

const FREE_CONTENT_SECTIONS: ChannelSection[] = [
  {
    label: "Films",
    emoji: "🎬",
    channels: [
      { name: "V Movies", url: "https://www.youtube.com/@V_Movies", tier: "Licensed Free", desc: "2.5M+ subscriber channel — full-length feature films across all genres, new titles added regularly." },
      { name: "Watch Movies Now!", url: "https://www.youtube.com/@WatchMoviesNow", tier: "Licensed Free", desc: "1.9M subscribers — horror, sci-fi, and thriller movies. New movies posted every day." },
      { name: "Sci-Fi Central", url: "https://www.youtube.com/@Sci-FiCentral", tier: "Licensed Free", desc: "1.4M subscribers — the best free full-length sci-fi movies, series, and documentaries on YouTube." },
      { name: "WATCH NOW - Sci-Fi & Fantasy", url: "https://www.youtube.com/@WatchScienceFictionNow", tier: "Licensed Free", desc: "735K subscribers — handpicked sci-fi, fantasy, and action films. Exclusive world premieres included." },
      { name: "V Horror", url: "https://www.youtube.com/@VHorror", tier: "Licensed Free", desc: "809K subscribers — dedicated horror movie channel from V Channels Media. Full HD horror films." },
      { name: "Retrospective - Classic Movies", url: "https://www.youtube.com/@RetrospectiveMovies", tier: "Licensed Free", desc: "456K subscribers — classic films from the golden age of Hollywood, fully licensed for free viewing." },
      { name: "Stream City", url: "https://www.youtube.com/@OfficialStreamCity", tier: "Licensed Free", desc: "409K subscribers — curated full-length movies for the true film lover across all genres." },
      { name: "Classics 4 You", url: "https://www.youtube.com/@Classics4-You", tier: "Licensed Free", desc: "184K subscribers — HD classic movie sanctuary. John Wayne, Sherlock Holmes, Randolph Scott and more." },
      { name: "Scream City", url: "https://www.youtube.com/@ScreamCityOfficialChannel", tier: "Licensed Free", desc: "47K subscribers — horror and thriller movies in their dark corner of YouTube." },
      { name: "Stash - Thrills and Chills", url: "https://www.youtube.com/@Stash_thrillsandchills", tier: "Licensed Free", desc: "89K subscribers — curated horror, thriller, and genre playlists from the Stash streaming service." },
    ],
  },
  {
    label: "Audiobooks",
    emoji: "📚",
    channels: [
      { name: "LibriVox Audiobooks", url: "https://www.youtube.com/@LibriVoxAudiobooks", tier: "Public Domain", desc: "The gold standard for free audiobooks — volunteers read thousands of public domain classics. Jane Austen, Dickens, Twain, H.G. Wells and hundreds more." },
      { name: "Greatest AudioBooks", url: "https://www.youtube.com/@GreatestAudioBooks", tier: "Public Domain", desc: "One of YouTube's largest audiobook channels. High-quality recordings of classic literature, philosophy, and self-help titles all in the public domain." },
      { name: "My Listening Library", url: "https://www.youtube.com/@MyListeningLibrary", tier: "Licensed Free", desc: "Free full-length audiobooks including psychological thrillers, sci-fi adventures, and classic fiction — new titles added regularly." },
    ],
  },
  {
    label: "Radio Shows",
    emoji: "📻",
    channels: [
      { name: "Golden Radio Hour", url: "https://www.youtube.com/@GoldenRadioHour", tier: "Public Domain", desc: "One of the largest independent OTR archives on YouTube — 136K subscribers, 5.8K videos. Sherlock Holmes, Twilight Zone Radio, Johnny Dollar and more." },
      { name: "An Evening of Old Time Radio", url: "https://www.youtube.com/@aneveningofoldtimeradio", tier: "Public Domain", desc: "56K subscribers — all-night OTR marathon compilations perfect for sleeping or background listening. Haunted Houses, Mystery Theater, and more." },
      { name: "Great Detectives of Old Time Radio", url: "https://www.youtube.com/@GreatDetectivesOfOldTimeRadio", tier: "Public Domain", desc: "19K subscribers, 6.9K videos — deep archive of detective radio dramas. Dragnet, Bulldog Drummond, Sam Spade and many more." },
      { name: "OTR Halloween Holidaze", url: "https://www.youtube.com/@OTRHALLOWEENHOLIDAZE", tier: "Public Domain", desc: "23K subscribers — horror OTR, classic horror movies, and Halloween radio shows. Great for spooky season listening." },
      { name: "Old Time Radio Detective", url: "https://www.youtube.com/@oldtimeradiodetective", tier: "Public Domain", desc: "Restored vintage detective radio recordings — drama, mystery, and suspense. Runs a 24/7 ad-free live radio stream." },
      { name: "Mel's Vintage Radio", url: "https://www.youtube.com/@MelsVintageRadio", tier: "Public Domain", desc: "6K subscribers — 8-hour marathon compilations of vintage radio. Noir detective, Barrie Craig, and classic OTR episodes." },
      { name: "Escape Stories", url: "https://www.youtube.com/@EscapeStoriesMix", tier: "Public Domain", desc: "Live late-night OTR radio station — detective mysteries, Johnny Dollar, and classic radio theater. Often streaming live." },
      { name: "Relic Radio", url: "https://www.youtube.com/@RelicRadio", tier: "Public Domain", desc: "Classic Old Time Radio dramas from the golden age of radio — The Lone Ranger, Jack Benny, Suspense, Inner Sanctum, and many more." },
    ],
  },
];

const TIER_COLORS: Record<string, string> = {
  "Public Domain": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "Licensed Free": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "Studio Official": "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

function FreeChannelsGuide() {
  const [open, setOpen] = useState(false);
  const totalChannels = FREE_CONTENT_SECTIONS.reduce((n, s) => n + s.channels.length, 0);
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors text-left"
      >
        <span className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" />
          Free Content Channels on YouTube
        </span>
        <span className="text-muted-foreground text-xs font-normal">
          {open ? "▲ Hide" : "▼ Show"} {totalChannels} channels
        </span>
      </button>
      {open && (
        <div className="border-t border-border/50 px-4 py-4 space-y-5">
          <p className="text-xs text-muted-foreground">
            Verified free channels on YouTube — films, audiobooks, and radio shows that are safe to link in URLinc. All authorized or public domain.
          </p>
          {FREE_CONTENT_SECTIONS.map((section) => (
            <div key={section.label}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {section.emoji} {section.label}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {section.channels.map((ch) => (
                  <div key={ch.name} className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{ch.name}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${TIER_COLORS[ch.tier] ?? ""}`}>
                        {ch.tier}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{ch.desc}</p>
                    <a
                      href={ch.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Visit Channel
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Discover Tab ──────────────────────────────────────────────────────────

type TriviaQuestion = { topic: string; question: string; answer: string; choices?: string[] };
type TriviaData = { title: string; question_count: number; estimated_minutes: number; questions: TriviaQuestion[] };

type DiscoverFilm = {
  id: number;
  title: string;
  youtubeUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  category: string;
  featuredMonth: string;
  alreadySaved: boolean;
  triviaData: TriviaData | null;
};

function DiscoverTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = !!(user as { isAdmin?: boolean } | null)?.isAdmin;
  const [month, setMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [triviaFilm, setTriviaFilm] = useState<DiscoverFilm | null>(null);
  const [triviaIdx, setTriviaIdx] = useState(0);
  const [triviaRevealed, setTriviaRevealed] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ month: string; films: DiscoverFilm[] }>({
    queryKey: ["discover-films", month],
    queryFn: async () => {
      const res = await fetch(`/api/discover/films?month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<{ month: string; films: DiscoverFilm[] }>;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: monthsData } = useQuery<{ months: string[] }>({
    queryKey: ["discover-months"],
    queryFn: async () => {
      const res = await fetch("/api/discover/months", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ months: string[] }>;
    },
    staleTime: 300_000,
  });

  const handleSave = async (film: DiscoverFilm) => {
    if (savedIds.has(film.id) || film.alreadySaved) return;
    setSavingId(film.id);
    try {
      const res = await fetch(`/api/discover/films/${film.id}/save`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json() as { ok: boolean; alreadyExisted: boolean; savedTo?: string };
      setSavedIds((prev) => new Set([...prev, film.id]));
      void queryClient.invalidateQueries({ queryKey: getInfiniteListVideosQueryKey() });
      const dest = json.savedTo === "audio" ? "My Audio" : "My Videos";
      toast({
        title: json.alreadyExisted ? "Already in your library" : `Added to ${dest}`,
        description: film.title,
      });
    } catch {
      toast({ title: "Could not save film", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const [addingToGamesId, setAddingToGamesId] = useState<number | null>(null);
  const [addedToGamesIds, setAddedToGamesIds] = useState<Set<number>>(new Set());

  const handleAddToGames = async (film: DiscoverFilm) => {
    if (addedToGamesIds.has(film.id)) return;
    setAddingToGamesId(film.id);
    try {
      const res = await fetch("/api/integrations/custom-sources", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "vault-games", name: film.title, url: film.youtubeUrl }),
      });
      if (!res.ok) throw new Error("Failed");
      setAddedToGamesIds((prev) => new Set([...prev, film.id]));
      toast({ title: "Added to Games", description: film.title });
    } catch {
      toast({ title: "Could not add to Games", variant: "destructive" });
    } finally {
      setAddingToGamesId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/featured-films/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      await queryClient.invalidateQueries({ queryKey: ["discover-films", month] });
      toast({ title: "Removed from Fresh Finds" });
    } catch {
      toast({ title: "Could not remove entry", variant: "destructive" });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const films = data?.films ?? [];
  const months = monthsData?.months ?? [];

  const selectedYear = month.split("-")[0] ?? String(new Date().getFullYear());
  const years = useMemo(() => {
    const ySet = new Set(months.map((m) => m.split("-")[0] ?? ""));
    ySet.add(String(new Date().getFullYear()));
    return [...ySet].filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [months]);
  const monthsForYear = useMemo(
    () => months.filter((m) => m.startsWith(selectedYear)),
    [months, selectedYear],
  );

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const formatMonthLabel = (m: string) => {
    const [, mo] = m.split("-");
    return MONTH_NAMES[Number(mo) - 1] ?? m;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-semibold">Fresh Finds</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Curated free picks — films, games, audiobooks & more, updated each month.
          </p>
        </div>
        {years.length > 0 && (
          <div className="flex gap-2 shrink-0">
            <Select
              value={selectedYear}
              onValueChange={(y) => {
                const first = months.filter((m) => m.startsWith(y))[0];
                if (first) setMonth(first);
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {monthsForYear.length > 1 && (
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36">
                  <SelectValue>{formatMonthLabel(month)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {monthsForYear.map((m) => (
                    <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Month label */}
      <p className="text-sm font-medium text-primary">{formatMonthLabel(month)} {selectedYear}</p>

      {/* States */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-muted animate-pulse aspect-video" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Film className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Couldn't load featured films</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}

      {!isLoading && !error && films.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Star className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">No featured films yet</p>
          <p className="text-sm text-muted-foreground/70">Check back soon — new picks are added each month.</p>
        </div>
      )}

      {!isLoading && films.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {films.map((film) => {
            const isSaved = savedIds.has(film.id) || film.alreadySaved;
            const isSaving = savingId === film.id;
            const thumb = film.thumbnailUrl ||
              (film.youtubeUrl.includes("youtube.com") || film.youtubeUrl.includes("youtu.be")
                ? `https://img.youtube.com/vi/${extractYtId(film.youtubeUrl)}/hqdefault.jpg`
                : null);
            return (
              <div key={film.id} className="group relative rounded-xl overflow-hidden bg-muted border border-border/50 hover:border-primary/40 transition-colors">
                {/* Admin delete button */}
                {isAdmin && (
                  <button
                    onClick={() => setConfirmDeleteId(film.id)}
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    title="Remove from Fresh Finds"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Thumbnail */}
                <a href={film.youtubeUrl} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-black relative">
                  {thumb ? (
                    <img src={thumb} alt={film.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <svg className="w-5 h-5 text-black ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                  {/* Category badge */}
                  <span className="absolute bottom-2 left-2 text-[10px] font-semibold uppercase tracking-wide bg-black/70 text-white px-2 py-0.5 rounded-full">
                    {film.category}
                  </span>
                </a>
                {/* Info */}
                <div className="p-3">
                  <a href={film.youtubeUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-sm leading-snug hover:text-primary transition-colors line-clamp-2">
                    {film.title}
                  </a>
                  {film.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{film.description}</p>
                  )}
                  {/* Trivia button (only if trivia data exists) */}
                  {film.triviaData && (
                    <button
                      onClick={() => { setTriviaFilm(film); setTriviaIdx(0); setTriviaRevealed(false); }}
                      className="mt-2 w-full text-xs font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                    >
                      <Trophy className="w-3 h-3" /> Quiz Me · {film.triviaData.question_count} questions
                    </button>
                  )}
                  {film.category === "Game" ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <a
                        href={film.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full text-xs font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30"
                      >
                        🎮 Play Now
                      </a>
                      <button
                        onClick={() => void handleAddToGames(film)}
                        disabled={addedToGamesIds.has(film.id) || addingToGamesId === film.id}
                        className={[
                          "w-full text-xs font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5",
                          addedToGamesIds.has(film.id)
                            ? "bg-muted text-muted-foreground cursor-default"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                        ].join(" ")}
                      >
                        {addingToGamesId === film.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : addedToGamesIds.has(film.id) ? (
                          <><Check className="w-3 h-3" /> In Games</>
                        ) : (
                          <><Plus className="w-3 h-3" /> Add to Games</>
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleSave(film)}
                      disabled={isSaved || isSaving}
                      className={[
                        "mt-2 w-full text-xs font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5",
                        isSaved
                          ? "bg-muted text-muted-foreground cursor-default"
                          : "bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30",
                      ].join(" ")}
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isSaved ? (
                        <><Check className="w-3 h-3" /> In Library</>
                      ) : (
                        <><Plus className="w-3 h-3" /> Save to Library</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trivia quiz modal */}
      {triviaFilm?.triviaData && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setTriviaFilm(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-blue-400" />
                {triviaFilm.triviaData.title}
              </DialogTitle>
              <DialogDescription>
                Question {triviaIdx + 1} of {triviaFilm.triviaData.question_count}
                {triviaFilm.triviaData.estimated_minutes ? ` · ~${triviaFilm.triviaData.estimated_minutes} min read/watch` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-muted/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {triviaFilm.triviaData.questions[triviaIdx]?.topic ?? ""}
                </p>
                <p className="text-sm font-medium leading-relaxed">
                  {triviaFilm.triviaData.questions[triviaIdx]?.question}
                </p>
              </div>
              {triviaRevealed ? (
                <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-2">Answer</p>
                  <p className="text-sm leading-relaxed">{triviaFilm.triviaData.questions[triviaIdx]?.answer}</p>
                </div>
              ) : (
                <button
                  onClick={() => setTriviaRevealed(true)}
                  className="w-full py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-blue-500/40 hover:text-blue-400 transition-colors"
                >
                  Tap to reveal answer
                </button>
              )}
            </div>
            <DialogFooter className="flex gap-2 sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={triviaIdx === 0}
                onClick={() => { setTriviaIdx((i) => i - 1); setTriviaRevealed(false); }}
              >
                ← Previous
              </Button>
              {triviaIdx < triviaFilm.triviaData.question_count - 1 ? (
                <Button
                  size="sm"
                  onClick={() => { setTriviaIdx((i) => i + 1); setTriviaRevealed(false); }}
                >
                  Next →
                </Button>
              ) : (
                <Button size="sm" onClick={() => setTriviaFilm(null)}>
                  Done
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Admin: confirm delete dialog */}
      {isAdmin && (
        <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from Fresh Finds?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the entry from Fresh Finds. It won't delete it from anyone's library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingId !== null}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deletingId !== null}
                onClick={() => { if (confirmDeleteId !== null) void handleDelete(confirmDeleteId); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingId !== null ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {!isLoading && <FreeChannelsGuide />}
    </div>
  );
}

function extractYtId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    return u.searchParams.get("v") ?? "";
  } catch {
    return "";
  }
}

// ── Streaming Services Tab ─────────────────────────────────────────────────

function StreamingServicesTab() {
  const { toast } = useToast();
  const { isFavorite, toggleFavorite } = useVaultSourceFavorites("streaming");
  const [items, setItems] = useState<CustomStreamingService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/custom-sources?type=streaming");
      if (!res.ok) throw new Error();
      const data: { items: CustomStreamingService[] } = await res.json();
      setItems(data.items);
    } catch {
      // non-critical list -- fail quietly
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Admin-curated additions to the built-in list (see Admin > Vault
  // Built-in Sources) -- anyone can read these, only admins can add/remove
  // them. Rendered like the other built-ins, colors cycled the same way
  // user-added services already are since this tab doesn't use the bigger
  // color-tinted card style Vault's built-ins do.
  const [adminBuiltIns, setAdminBuiltIns] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    fetch("/api/integrations/vault-builtins?type=streaming")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: { name: string; url: string }[] }) => setAdminBuiltIns(data.items ?? []))
      .catch(() => {});
  }, []);

  const handleAdd = useCallback(async () => {
    const name = nameDraft.trim();
    const url = urlDraft.trim();
    if (!name || !url) {
      toast({ title: "Name and URL are both required", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/integrations/custom-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "streaming", name, url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to add service");
      }
      setNameDraft("");
      setUrlDraft("");
      setShowAddForm(false);
      await refresh();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to add service", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }, [nameDraft, urlDraft, toast, refresh]);

  const handleRemove = useCallback(async (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/integrations/custom-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast({ title: "Failed to remove service", variant: "destructive" });
      void refresh();
    }
  }, [toast, refresh]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    for (const id of ids) await handleRemove(id);
  }, [selectedIds, handleRemove]);

  const [isStreamShareOpen, setIsStreamShareOpen] = useState(false);
  const [streamShareFriends, setStreamShareFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [streamShareFriendsLoaded, setStreamShareFriendsLoaded] = useState(false);
  const [streamShareFriendIds, setStreamShareFriendIds] = useState<Set<string>>(new Set());
  const [streamShareMessage, setStreamShareMessage] = useState("");
  const [streamSharing, setStreamSharing] = useState(false);

  useEffect(() => {
    if (!isStreamShareOpen || streamShareFriendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setStreamShareFriends(data as typeof streamShareFriends); setStreamShareFriendsLoaded(true); })
      .catch(() => setStreamShareFriendsLoaded(true));
  }, [isStreamShareOpen, streamShareFriendsLoaded]);

  const handleStreamShare = async () => {
    if (selectedIds.size === 0 || streamShareFriendIds.size === 0) return;
    setStreamSharing(true);
    try {
      const sourceIds = Array.from(selectedIds);
      const results = await Promise.all(Array.from(streamShareFriendIds).map(async (recipientId) => {
        const res = await fetch("/api/vault-source-shares", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId, sourceIds, message: streamShareMessage || undefined }),
        });
        const data = await res.json().catch(() => ({})) as { error?: string };
        return { ok: res.ok, error: data.error };
      }));
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        toast({ title: `Shared ${selectedIds.size} service${selectedIds.size !== 1 ? "s" : ""} with ${okCount} friend${okCount !== 1 ? "s" : ""}` });
      } else {
        toast({ title: results[0]?.error ?? "Failed to share", variant: "destructive" });
      }
      if (okCount > 0) {
        setIsStreamShareOpen(false);
        setStreamShareMessage("");
        setStreamShareFriendIds(new Set());
      }
    } catch (err) {
      toast({ title: "Failed to share", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setStreamSharing(false);
    }
  };

  const streamSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const [streamFavOrder, setStreamFavOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("video-streaming-favorites-order") ?? "[]") as string[]; }
    catch { return []; }
  });

  const builtInFavId = (name: string) => `b:${name}`;
  const customFavId = (id: number) => `c:${id}`;

  const allBuiltIns = [
    ...POPULAR_STREAMING_SERVICES,
    ...adminBuiltIns.map((svc, i) => ({ ...svc, ...CUSTOM_SERVICE_COLORS[i % CUSTOM_SERVICE_COLORS.length]! })),
  ];
  type StreamingTile =
    | { kind: "built-in"; svc: (typeof allBuiltIns)[number] }
    | { kind: "custom"; svc: CustomStreamingService; color: (typeof CUSTOM_SERVICE_COLORS)[number] };
  const tiles: StreamingTile[] = [
    ...allBuiltIns.map((svc): StreamingTile => ({ kind: "built-in", svc })),
    ...(!loading
      ? items.map((svc, i): StreamingTile => ({ kind: "custom", svc, color: CUSTOM_SERVICE_COLORS[i % CUSTOM_SERVICE_COLORS.length]! }))
      : []),
  ];
  const favTileIds = new Set(tiles.map(t => t.kind === "built-in" ? builtInFavId(t.svc.name) : customFavId(t.svc.id)).filter(id => isFavorite(id)));
  const orderedFavTileIds = [
    ...streamFavOrder.filter(id => favTileIds.has(id)),
    ...[...favTileIds].filter(id => !streamFavOrder.includes(id)),
  ];
  const sortedTiles = [
    ...orderedFavTileIds.map(id => tiles.find(t => (t.kind === "built-in" ? builtInFavId(t.svc.name) : customFavId(t.svc.id)) === id)!).filter(Boolean),
    ...tiles.filter(t => !isFavorite(t.kind === "built-in" ? builtInFavId(t.svc.name) : customFavId(t.svc.id))),
  ];

  const handleStreamFavDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = [
      ...streamFavOrder.filter(id => favTileIds.has(id)),
      ...[...favTileIds].filter(id => !streamFavOrder.includes(id)),
    ];
    const oldIdx = currentOrder.indexOf(active.id as string);
    const newIdx = currentOrder.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(currentOrder, oldIdx, newIdx);
    setStreamFavOrder(next);
    try { localStorage.setItem("video-streaming-favorites-order", JSON.stringify(next)); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamFavOrder, favTileIds]);

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Open streaming services in your browser</p>

      {showAddForm && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-xl border border-border bg-card">
          <Input
            placeholder="Name (e.g. Crunchyroll)"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="sm:max-w-[220px]"
          />
          <Input
            placeholder="https://..."
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            className="flex-1"
          />
          <Button type="button" onClick={handleAdd} disabled={adding} className="gap-1.5 shrink-0">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)} className="shrink-0">
            Cancel
          </Button>
        </div>
      )}

      <DndContext sensors={streamSensors} collisionDetection={closestCenter} onDragEnd={(e) => { handleStreamFavDragEnd(e); const blockClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', blockClick, { capture: true }), 200); }}>
      <SortableContext items={orderedFavTileIds} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sortedTiles.map((tile) => {
          if (tile.kind === "built-in") {
            const { svc } = tile;
            const favId = builtInFavId(svc.name);
            const isFav = isFavorite(favId);
            return (
              <SortableCardWrapper key={favId} id={favId} enabled={isFav}>
              <div className="relative flex items-center gap-3 p-4 pr-16 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors group">
                <button type="button" onClick={() => openUrl(svc.url)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${svc.dot}`} />
                  <span className={`text-sm font-medium truncate ${svc.text}`}>{svc.name}</span>
                </button>
                {/* Go to source / Favorite -- side by side instead of
                    stacked on top of each other in one corner. */}
                <div className="absolute top-1/2 -translate-y-1/2 right-3 z-10 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openUrl(svc.url)}
                    onPointerDown={isFav ? (e) => e.stopPropagation() : undefined}
                    title="Go to source"
                    className="p-1 rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleFavorite(favId, { name: svc.name, url: svc.url }); }}
                    onPointerDown={isFav ? (e) => e.stopPropagation() : undefined}
                    title={isFav ? "Remove from favorites" : "Add to favorites"}
                    className={`p-1 rounded-full transition-all ${
                      isFav ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-accent"
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
                  </button>
                </div>
              </div>
              </SortableCardWrapper>
            );
          }

          const { svc, color } = tile;
          const favId = customFavId(svc.id);
          const isFav = isFavorite(favId);
          const isSelected = selectedIds.has(svc.id);
          return (
            <SortableCardWrapper key={favId} id={favId} enabled={isFav}>
            <div className="relative flex items-center gap-3 p-4 pr-16 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors group">
              {/* Selection checkbox -- top-left, visible on hover or when selected */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleSelect(svc.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                title={isSelected ? "Deselect" : "Select"}
                className={`absolute top-2 left-2 z-20 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? "bg-primary border-primary opacity-100"
                    : "bg-background border-muted-foreground opacity-0 group-hover:opacity-100"
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
              </button>
              <button type="button" onClick={() => openUrl(svc.url)} className="flex items-center gap-3 flex-1 min-w-0 text-left pl-4">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.dot}`} />
                <span className={`text-sm font-medium truncate ${color.text}`}>{svc.name}</span>
              </button>
              {/* Go to source / Favorite / Remove -- side by side instead of
                  stacked on top of each other in one corner. */}
              <div className="absolute top-1/2 -translate-y-1/2 right-3 z-10 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openUrl(svc.url)}
                  onPointerDown={isFav ? (e) => e.stopPropagation() : undefined}
                  title="Go to source"
                  className="p-1 rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleFavorite(favId, { name: svc.name, url: svc.url }); }}
                  onPointerDown={isFav ? (e) => e.stopPropagation() : undefined}
                  title={isFav ? "Remove from favorites" : "Add to favorites"}
                  className={`p-1 rounded-full transition-all ${
                    isFav ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-accent"
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(svc.id)}
                  onPointerDown={isFav ? (e) => e.stopPropagation() : undefined}
                  title="Remove"
                  className="p-1 rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            </SortableCardWrapper>
          );
        })}

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Add Service</span>
        </button>
      </div>
      </SortableContext>
      </DndContext>

      {loading && (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
            <span className="text-sm font-semibold pl-1 pr-2">{selectedIds.size} selected</span>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <Button size="sm" variant="secondary" className="rounded-full gap-1.5" onClick={() => setIsStreamShareOpen(true)}>
              <Share2 className="w-4 h-4" /> Share
            </Button>
            <Button size="sm" variant="destructive" className="rounded-full gap-1.5" onClick={() => void handleBulkDelete()}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <button onClick={() => setSelectedIds(new Set())} className="text-xs font-medium opacity-70 hover:opacity-100 transition-opacity px-1">
              Clear
            </button>
          </div>
        </div>
      )}

      <Dialog open={isStreamShareOpen} onOpenChange={(open) => { setIsStreamShareOpen(open); if (!open) { setStreamShareMessage(""); setStreamShareFriendIds(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {selectedIds.size} service{selectedIds.size !== 1 ? "s" : ""} with friends</DialogTitle>
            <DialogDescription>Friends can add your shared services to their own list.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Input placeholder="Add a message (optional)" value={streamShareMessage} onChange={(e) => setStreamShareMessage(e.target.value)} />
            {!streamShareFriendsLoaded ? (
              <p className="text-sm text-muted-foreground">Loading friends…</p>
            ) : streamShareFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends yet. Add friends in Settings.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                {streamShareFriends.map((f) => {
                  const name = (f.firstName || f.lastName) ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim() : f.email;
                  return (
                    <label key={f.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-sm cursor-pointer">
                      <Checkbox checked={streamShareFriendIds.has(f.id)} onCheckedChange={() => setStreamShareFriendIds((prev) => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })} disabled={streamSharing} />
                      <span>{name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStreamShareOpen(false)} disabled={streamSharing}>Cancel</Button>
            <Button onClick={() => void handleStreamShare()} disabled={streamSharing || streamShareFriendIds.size === 0} className="gap-1.5">
              {streamSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              {streamSharing ? "Sending…" : `Send${streamShareFriendIds.size > 0 ? ` to ${streamShareFriendIds.size}` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Moved to src/lib/external-player.ts so the watch-together page can reuse
// the exact same "reopen the same popup window" helpers instead of keeping
// a second, separate window reference.

type PlexSortKey = "alpha-asc" | "alpha-desc" | "date-desc" | "date-asc" | "random";
const PLEX_SORT_LABELS: Record<PlexSortKey, string> = {
  "alpha-asc": "A → Z",
  "alpha-desc": "Z → A",
  "date-desc": "Recently Added",
  "date-asc": "Oldest Added",
  "random": "Shuffle",
};

interface PlexSection { key: string; title: string; type: "movie" | "show"; }
interface PlexLibraryItem {
  ratingKey: string;
  title: string;
  year: number | null;
  type: string;
  thumbnailUrl: string | null;
  watchUrl: string;
}

function PlexLibraryTab() {
  const [, setLocation] = useLocation();
  // Only used to submit a "create + join" Watch Together session from a
  // poster's overlay button, then hand off to /watch-together/:sessionId --
  // this tab doesn't stay connected to it afterward.
  const watchTogetherHook = useWatchSession({});
  const [connected, setConnected] = useState<boolean | null>(null);
  const [sections, setSections] = useState<PlexSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<PlexSection | null>(null);
  const [liveTvUrl, setLiveTvUrl] = useState<string | null>(null);

  const [items, setItems] = useState<PlexLibraryItem[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<PlexSortKey>("date-desc");
  // Null while unknown; lastTotal null means this section has never been
  // cached before. No longer surfaced to the user (poster caching used to
  // be a manual button) -- kept only to silently decide, in the effect
  // below, whether a background cache pass is worth kicking off.
  const [prewarmStatus, setPrewarmStatus] = useState<{ lastTotal: number | null } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Guards the silent background prewarm below so it fires at most once
  // per section per visit to this tab, instead of on every re-render.
  const autoPrewarmedRef = useRef<Set<string>>(new Set());

  const PAGE_SIZE = 200;

  useEffect(() => {
    fetch("/api/integrations/plex", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { connected: boolean }) => setConnected(data.connected))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (connected !== true) { setSectionsLoading(false); return; }
    setSectionsLoading(true);
    fetch("/api/integrations/plex/sections", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load Plex libraries");
        return r.json() as Promise<{ sections: PlexSection[]; liveTvUrl?: string }>;
      })
      .then((data) => { setSections(data.sections); setLiveTvUrl(data.liveTvUrl ?? null); })
      .catch((err: Error) => setSectionsError(err.message))
      .finally(() => setSectionsLoading(false));
  }, [connected]);

  const loadItems = useCallback((section: PlexSection, offset: number, query: string, sort: PlexSortKey) => {
    setItemsLoading(true);
    setItemsError(null);
    const params = new URLSearchParams({ section: section.key, offset: String(offset), limit: String(PAGE_SIZE), sort });
    if (query) params.set("search", query);
    fetch(`/api/integrations/plex/library?${params}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load Plex items");
        return r.json() as Promise<{ items: PlexLibraryItem[]; totalSize: number }>;
      })
      .then((data) => {
        setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
        setTotalSize(data.totalSize);
      })
      .catch((err: Error) => setItemsError(err.message))
      .finally(() => setItemsLoading(false));
  }, []);

  const openSection = (section: PlexSection) => {
    setActiveSection(section);
    setItems([]);
    setSearch("");
    setPrewarmStatus(null);
    loadItems(section, 0, "", sortKey);
    fetch(`/api/integrations/plex/prewarm-status?section=${encodeURIComponent(section.key)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() as Promise<{ lastTotal: number | null }> : null))
      .then((data) => setPrewarmStatus(data))
      .catch(() => setPrewarmStatus(null));
  };

  useEffect(() => {
    if (!activeSection) return;
    const id = setTimeout(() => loadItems(activeSection, 0, search, sortKey), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sortKey]);

  // Auto-load the next page once the sentinel scrolls into view, instead of
  // requiring a manual "Load more" click each time.
  useEffect(() => {
    const el = sentinelRef.current;
    const root = document.getElementById("main-scroll");
    if (!el || !root || !activeSection) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !itemsLoading && items.length > 0 && items.length < totalSize) {
          loadItems(activeSection, items.length, search, sortKey);
        }
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeSection, items.length, totalSize, itemsLoading, search, sortKey, loadItems]);

  // Only trust prewarmStatus once totalSize reflects the currently-open
  // section (items finished loading) -- otherwise a brief window where
  // totalSize is still 0/stale from the previous section could trigger a
  // wrong decision below.
  const prewarmKnown = prewarmStatus !== null && !itemsLoading && totalSize > 0;
  const allCached = prewarmKnown && prewarmStatus!.lastTotal !== null
    && totalSize - prewarmStatus!.lastTotal <= 0;

  // Silently kicks off a poster-cache pass the first time this section
  // turns out to have new/never-cached posters, so browsing (including
  // Shuffle) feels instant. This used to be a manual "Cache all posters"
  // button; removed because clicking it wasn't adding value day-to-day,
  // but the underlying perf benefit is worth keeping automatic.
  useEffect(() => {
    if (!activeSection || !prewarmKnown || allCached) return;
    if (autoPrewarmedRef.current.has(activeSection.key)) return;
    autoPrewarmedRef.current.add(activeSection.key);
    void fetch("/api/integrations/plex/prewarm", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: activeSection.key }),
    }).catch(() => {});
  }, [activeSection, prewarmKnown, allCached]);

  if (connected === null || sectionsLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <Film className="w-16 h-16 text-muted-foreground/30" />
        <div>
          <p className="text-lg font-medium text-muted-foreground">Plex isn't connected yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
            Connect your Plex server in Settings to browse your library here — posters, titles and playback all come straight from Plex.
          </p>
          <Link href="/settings">
            <Button size="sm" className="mt-3">Go to Settings</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (sectionsError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-center">
        <p className="text-sm text-destructive">{sectionsError}</p>
        <p className="text-xs text-muted-foreground/70 max-w-sm">
          Check your Plex server URL and token in Settings. If you're a shared user on someone else's
          Plex server (not the owner), try Quick Setup again with a fresh XML URL — that can sometimes
          get you a more reliable connection.
        </p>
      </div>
    );
  }

  if (!activeSection) {
    if (sections.length === 0 && !liveTvUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-center">
          <p className="text-sm text-muted-foreground">No movie or show libraries found on this Plex server.</p>
        </div>
      );
    }
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-4">Choose a Plex library to browse</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sections.map((s, i) => {
            const color = CUSTOM_SERVICE_COLORS[i % CUSTOM_SERVICE_COLORS.length]!;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => openSection(s)}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
                {s.type === "show" ? <Tv className="w-4 h-4 text-muted-foreground shrink-0" /> : <Film className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className={`text-sm font-medium truncate ${color.text}`}>{s.title}</span>
              </button>
            );
          })}
          {liveTvUrl && (() => {
            // Live TV isn't a library at all -- it's Plex's own schedule
            // grid (channels x time), a completely different UI than a
            // poster list, so this jumps straight into Plex's own guide
            // page in the reused tab rather than us rebuilding that grid.
            const color = CUSTOM_SERVICE_COLORS[sections.length % CUSTOM_SERVICE_COLORS.length]!;
            return (
              <a
                href={liveTvUrl}
                target="urlinc-plex-player"
                rel="noreferrer"
                onClick={(e) => { e.preventDefault(); openInPlexPlayer(liveTvUrl); }}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
                <Radio className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className={`text-sm font-medium truncate ${color.text}`}>Live TV</span>
              </a>
            );
          })()}
        </div>
      </div>
    );
  }

  // Only trust prewarmStatus once totalSize reflects the currently-open
  // section (items finished loading) -- otherwise a brief window where
  // totalSize is still 0/stale from the previous section could flash
  // "All posters cached" incorrectly.
  return (
    <div>
      {/* Pinned below the page's own title+tabs sticky header (which is
          93px tall on this tab, since its search/category/sort row is
          hidden here) so the breadcrumb, search, sort and cache controls
          stay visible no matter how far down the poster grid you've
          scrolled. */}
      <div className="sticky top-[93px] z-10 bg-background -mx-8 px-8 pb-3">
        <div className="flex items-center gap-2 pt-4 mb-3">
          <Button size="sm" variant="ghost" className="gap-1.5 -ml-2" onClick={() => setActiveSection(null)}>
            ← Libraries
          </Button>
          <span className="text-sm text-muted-foreground">/ {activeSection.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search this library"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="relative">
            <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as PlexSortKey)}
              className="h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm appearance-none cursor-pointer"
            >
              {(Object.keys(PLEX_SORT_LABELS) as PlexSortKey[]).map((key) => (
                <option key={key} value={key}>{PLEX_SORT_LABELS[key]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {itemsError && <p className="text-sm text-destructive mb-4 mt-3">{itemsError}</p>}

      {items.length === 0 && !itemsLoading ? (
        <p className="text-sm text-muted-foreground">No items found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item) => (
            <div key={item.ratingKey} className="relative group">
              <a
                href={item.watchUrl}
                target="urlinc-plex-player"
                rel="noreferrer"
                onClick={(e) => { e.preventDefault(); openInPlexPlayer(item.watchUrl); }}
                className="rounded-xl border border-border bg-card hover:shadow-md transition-shadow overflow-hidden block"
              >
                {item.thumbnailUrl ? (
                  <div className="relative aspect-[2/3] bg-muted overflow-hidden">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                    />
                  </div>
                ) : (
                  <div className="relative aspect-[2/3] bg-muted flex items-center justify-center">
                    {activeSection.type === "show" ? <Tv className="w-8 h-8 text-muted-foreground/40" /> : <Film className="w-8 h-8 text-muted-foreground/40" />}
                  </div>
                )}
                <div className="p-3 text-center">
                  <p className="text-sm font-medium truncate w-full">{item.title}</p>
                  {item.year && <p className="text-xs text-muted-foreground">{item.year}</p>}
                </div>
              </a>
              <div className="absolute top-1.5 right-1.5 rounded-full bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <WatchTogetherButton
                  external={{ source: "plex", title: item.title, watchUrl: item.watchUrl, thumbnailUrl: item.thumbnailUrl }}
                  watchHook={watchTogetherHook}
                  iconOnly
                  onSessionStarted={(session: WatchSession) => setLocation(`/watch-together/${session.sessionId}`)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {itemsLoading && items.length === 0 && (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {items.length > 0 && items.length < totalSize && (
        <div ref={sentinelRef} className="flex items-center justify-center mt-4 h-8">
          {itemsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more… ({items.length} of {totalSize})
            </div>
          )}
        </div>
      )}
    </div>
  );
}


type JellyfinSortKey = "alpha-asc" | "alpha-desc" | "date-desc" | "date-asc" | "random";
const JELLYFIN_SORT_LABELS: Record<JellyfinSortKey, string> = {
  "alpha-asc": "A → Z",
  "alpha-desc": "Z → A",
  "date-desc": "Recently Added",
  "date-asc": "Oldest Added",
  "random": "Shuffle",
};

interface JellyfinLibrary { id: string; title: string; type: "movies" | "tvshows" }
interface JellyfinItem { itemId: string; title: string; year: number | null; type: string; thumbnailUrl: string | null; watchUrl: string; streamUrl: string }

// Minimal first pass at a Jellyfin library browser -- connect, pick a
// library, browse/play. Deliberately doesn't try to replicate everything
// the Plex tab has grown (poster caching, duplicate detection, etc.) --
// those were added there incrementally based on real use, and the plan is
// to do the same here once this basic version has actually been used.
function JellyfinLibraryTab() {
  const [, setLocation] = useLocation();
  // Only used to submit a "create + join" Watch Together session from a
  // poster's overlay button, then hand off to /watch-together/:sessionId --
  // this tab doesn't stay connected to it afterward.
  const watchTogetherHook = useWatchSession({});
  const [connected, setConnected] = useState<boolean | null>(null);
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [librariesLoading, setLibrariesLoading] = useState(true);
  const [librariesError, setLibrariesError] = useState<string | null>(null);
  const [activeLibrary, setActiveLibrary] = useState<JellyfinLibrary | null>(null);

  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<JellyfinSortKey>("date-desc");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 200;

  useEffect(() => {
    fetch("/api/integrations/jellyfin", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { connected: boolean }) => setConnected(data.connected))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (connected !== true) { setLibrariesLoading(false); return; }
    setLibrariesLoading(true);
    fetch("/api/integrations/jellyfin/libraries", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load Jellyfin libraries");
        return r.json() as Promise<{ libraries: JellyfinLibrary[] }>;
      })
      .then((data) => setLibraries(data.libraries))
      .catch((err: Error) => setLibrariesError(err.message))
      .finally(() => setLibrariesLoading(false));
  }, [connected]);

  const loadItems = useCallback((library: JellyfinLibrary, offset: number, query: string, sort: JellyfinSortKey) => {
    setItemsLoading(true);
    setItemsError(null);
    const params = new URLSearchParams({ id: library.id, offset: String(offset), limit: String(PAGE_SIZE), sort });
    if (query) params.set("search", query);
    fetch(`/api/integrations/jellyfin/library?${params}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load Jellyfin items");
        return r.json() as Promise<{ items: JellyfinItem[]; totalSize: number }>;
      })
      .then((data) => {
        setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
        setTotalSize(data.totalSize);
      })
      .catch((err: Error) => setItemsError(err.message))
      .finally(() => setItemsLoading(false));
  }, []);

  const openLibrary = (library: JellyfinLibrary) => {
    setActiveLibrary(library);
    setItems([]);
    setSearch("");
    loadItems(library, 0, "", sortKey);
  };

  useEffect(() => {
    if (!activeLibrary) return;
    const id = setTimeout(() => loadItems(activeLibrary, 0, search, sortKey), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sortKey]);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = document.getElementById("main-scroll");
    if (!el || !root || !activeLibrary) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !itemsLoading && items.length > 0 && items.length < totalSize) {
          loadItems(activeLibrary, items.length, search, sortKey);
        }
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeLibrary, items.length, totalSize, itemsLoading, search, sortKey, loadItems]);

  if (connected === null || librariesLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <Film className="w-16 h-16 text-muted-foreground/30" />
        <div>
          <p className="text-lg font-medium text-muted-foreground">Jellyfin isn't connected yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
            Connect your Jellyfin server in Settings to browse your library here.
          </p>
          <Link href="/settings">
            <Button size="sm" className="mt-3">Go to Settings</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (librariesError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-center">
        <p className="text-sm text-destructive">{librariesError}</p>
        <p className="text-xs text-muted-foreground/70">Check your Jellyfin server URL and API key in Settings.</p>
      </div>
    );
  }

  if (!activeLibrary) {
    if (libraries.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-center">
          <p className="text-sm text-muted-foreground">No movie or show libraries found on this Jellyfin server.</p>
        </div>
      );
    }
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-4">Choose a Jellyfin library to browse</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {libraries.map((lib, i) => {
            const color = CUSTOM_SERVICE_COLORS[i % CUSTOM_SERVICE_COLORS.length]!;
            return (
              <button
                key={lib.id}
                type="button"
                onClick={() => openLibrary(lib)}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
                {lib.type === "tvshows" ? <Tv className="w-4 h-4 text-muted-foreground shrink-0" /> : <Film className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className={`text-sm font-medium truncate ${color.text}`}>{lib.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Pinned below the page's own title+tabs sticky header (93px tall
          here too, since this tab hides that header's own search row) so
          the breadcrumb and search/sort stay visible while scrolling --
          same pattern as PlexLibraryTab above. */}
      <div className="sticky top-[93px] z-10 bg-background -mx-8 px-8 pb-3">
        <div className="flex items-center gap-2 pt-4 mb-3">
          <Button size="sm" variant="ghost" className="gap-1.5 -ml-2" onClick={() => setActiveLibrary(null)}>
            ← Libraries
          </Button>
          <span className="text-sm text-muted-foreground">/ {activeLibrary.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search this library"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="relative">
            <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as JellyfinSortKey)}
              className="h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm appearance-none cursor-pointer"
            >
              {(Object.keys(JELLYFIN_SORT_LABELS) as JellyfinSortKey[]).map((key) => (
                <option key={key} value={key}>{JELLYFIN_SORT_LABELS[key]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {itemsError && <p className="text-sm text-destructive mb-4 mt-3">{itemsError}</p>}

      {items.length === 0 && !itemsLoading ? (
        <p className="text-sm text-muted-foreground">No items found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item) => (
            <div key={item.itemId} className="relative group">
              <a
                href={item.watchUrl}
                target="urlinc-jellyfin-player"
                rel="noreferrer"
                onClick={(e) => { e.preventDefault(); openInJellyfinPlayer(item.watchUrl); }}
                className="rounded-xl border border-border bg-card hover:shadow-md transition-shadow overflow-hidden block"
              >
                {item.thumbnailUrl ? (
                  <div className="relative aspect-[2/3] bg-muted overflow-hidden">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                    />
                    {item.streamUrl && (
                      <button
                        className="absolute bottom-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600/90 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-500 leading-none z-10"
                        title="Open in 3D Player"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLocation(`/3d-player?src=${encodeURIComponent(item.streamUrl)}`); }}
                      >
                        3D
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="aspect-[2/3] bg-muted flex items-center justify-center">
                    {activeLibrary.type === "tvshows" ? <Tv className="w-8 h-8 text-muted-foreground/40" /> : <Film className="w-8 h-8 text-muted-foreground/40" />}
                  </div>
                )}
                <div className="p-3 text-center">
                  <p className="text-sm font-medium truncate w-full">{item.title}</p>
                  {item.year && <p className="text-xs text-muted-foreground">{item.year}</p>}
                </div>
              </a>
              <div className="absolute top-1.5 right-1.5 rounded-full bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <WatchTogetherButton
                  external={{ source: item.streamUrl ? "jellyfin-3d" : "jellyfin", title: item.title, watchUrl: item.streamUrl ? `jellyfin-item:${item.itemId}` : item.watchUrl, thumbnailUrl: item.thumbnailUrl }}
                  watchHook={watchTogetherHook}
                  iconOnly
                  onSessionStarted={(session: WatchSession) => setLocation(`/watch-together/${session.sessionId}`)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {itemsLoading && items.length === 0 && (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {items.length > 0 && items.length < totalSize && (
        <div ref={sentinelRef} className="flex items-center justify-center mt-4 h-8">
          {itemsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more… ({items.length} of {totalSize})
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TvShowsTab({ shows }: { shows: Playlist[] }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { isFavorite, toggleFavorite } = useShowFavorites();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const showSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const [showFavOrder, setShowFavOrder] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("video-shows-favorites-order") ?? "[]") as number[]; }
    catch { return []; }
  });
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const lastClickedIndex = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const [isDeleteShowDialogOpen, setIsDeleteShowDialogOpen] = useState(false);
  const [isDeletingShow, setIsDeletingShow] = useState(false);
  const [isMovingToLibrary, setIsMovingToLibrary] = useState(false);

  useEffect(() => {
    if (!isShareDialogOpen || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setFriends(data as typeof friends); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [isShareDialogOpen, friendsLoaded]);

  const toggleShareFriend = (friendId: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId); else next.add(friendId);
      return next;
    });
  };

  const handleShareSend = async () => {
    if (selectedIds.size === 0 || selectedFriendIds.size === 0) return;
    setSharing(true);
    try {
      const pairs: { showId: number; friendId: string }[] = [];
      for (const showId of selectedIds) for (const friendId of selectedFriendIds) pairs.push({ showId, friendId });
      const results = await Promise.all(pairs.map(async ({ showId, friendId }) => {
        const res = await fetch("/api/playlist-shares", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: friendId, playlistId: showId, message: shareMessage || undefined }),
        });
        const data = await res.json().catch(() => ({})) as { error?: string };
        return { ok: res.ok, error: data.error };
      }));
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (okCount > 0) {
        toast({ title: `Shared with ${selectedFriendIds.size} friend${selectedFriendIds.size !== 1 ? "s" : ""}${failCount > 0 ? ` (${failCount} failed)` : ""}` });
      }
      if (okCount === 0) {
        toast({ title: results.find((r) => !r.ok)?.error ?? "Failed to share", variant: "destructive" });
      }
      if (failCount === 0) {
        setIsShareDialogOpen(false);
        setShareMessage("");
        setSelectedFriendIds(new Set());
        setSelectedIds(new Set());
      }
    } catch (err) {
      toast({ title: "Failed to share", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const handleMoveToLibrary = async () => {
    const ids = [...selectedIds];
    setIsMovingToLibrary(true);
    setSelectedIds(new Set());
    lastClickedIndex.current = null;
    try {
      await Promise.all(ids.map((id) => fetch(`/api/playlists/${id}`, { method: "DELETE", credentials: "include" })));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["/api/videos", "infinite"] }),
        queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetVideoCountQueryKey() }),
      ]);
      toast({ title: `${ids.length} show${ids.length !== 1 ? "s" : ""} moved to Library` });
    } catch {
      toast({ title: "Failed to move to Library", variant: "destructive" });
    } finally {
      setIsMovingToLibrary(false);
    }
  };

  const handleDeleteShows = async () => {
    const ids = [...selectedIds];
    setIsDeletingShow(true);
    setSelectedIds(new Set());
    lastClickedIndex.current = null;
    setIsDeleteShowDialogOpen(false);
    try {
      await Promise.all(ids.map((id) => fetch(`/api/playlists/${id}?deleteVideos=true`, { method: "DELETE", credentials: "include" })));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["/api/videos", "infinite"] }),
        queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetVideoCountQueryKey() }),
      ]);
      toast({ title: `${ids.length} show${ids.length !== 1 ? "s" : ""} and their episodes deleted` });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setIsDeletingShow(false);
    }
  };

  if (shows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <Tv className="w-16 h-16 text-muted-foreground/30" />
        <div>
          <p className="text-lg font-medium text-muted-foreground">No TV shows yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
            When saving an episode with the URLinc browser extension, fill in the "Show Name" field to start grouping episodes here.
          </p>
        </div>
      </div>
    );
  }

  const favShowIds = new Set(shows.filter(s => isFavorite(s.id)).map(s => s.id));
  const orderedFavShowIds = [
    ...showFavOrder.filter(id => favShowIds.has(id)),
    ...[...favShowIds].filter(id => !showFavOrder.includes(id)),
  ];
  const sortedShows = [
    ...orderedFavShowIds.map(id => shows.find(s => s.id === id)!).filter(Boolean),
    ...shows.filter(s => !isFavorite(s.id)),
  ];

  const handleShowFavDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = [
      ...showFavOrder.filter(id => favShowIds.has(id)),
      ...[...favShowIds].filter(id => !showFavOrder.includes(id)),
    ];
    const oldIdx = currentOrder.indexOf(active.id as number);
    const newIdx = currentOrder.indexOf(over.id as number);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(currentOrder, oldIdx, newIdx);
    setShowFavOrder(next);
    try { localStorage.setItem("video-shows-favorites-order", JSON.stringify(next)); } catch {}
  };

  const toggleSelect = (id: number, index: number, shiftKey: boolean) => {
    const prevIndex = lastClickedIndex.current;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && prevIndex !== null) {
        const lo = Math.min(prevIndex, index);
        const hi = Math.max(prevIndex, index);
        const adding = !next.has(id);
        for (let i = lo; i <= hi; i++) {
          const s = sortedShows[i];
          if (s) adding ? next.add(s.id) : next.delete(s.id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClickedIndex.current = index;
  };

  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
            <span className="text-sm font-semibold pl-1 pr-2">{selectedIds.size} selected</span>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <Button size="sm" variant="secondary" className="rounded-full gap-1.5" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="w-4 h-4" /> Share
            </Button>
            <Button size="sm" variant="secondary" className="rounded-full gap-1.5" onClick={() => void handleMoveToLibrary()} disabled={isMovingToLibrary}>
              {isMovingToLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />} Move to Library
            </Button>
            <Button size="sm" variant="secondary" className="rounded-full gap-1.5 hover:bg-destructive hover:text-destructive-foreground" onClick={() => setIsDeleteShowDialogOpen(true)} disabled={isDeletingShow}>
              {isDeletingShow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
            </Button>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <button onClick={() => { setSelectedIds(new Set()); lastClickedIndex.current = null; }} className="text-xs font-medium opacity-70 hover:opacity-100 transition-opacity px-1">
              Clear
            </button>
          </div>
        </div>
      )}

      <DndContext sensors={showSensors} collisionDetection={closestCenter} onDragEnd={(e) => { handleShowFavDragEnd(e); const blockClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', blockClick, { capture: true }), 200); }}>
      <SortableContext items={orderedFavShowIds} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {sortedShows.map((show, index) => {
          const isSelected = selectedIds.has(show.id);
          const isFav = isFavorite(show.id);
          return (
            <SortableCardWrapper key={show.id} id={show.id} enabled={isFav}>
            <div className="relative rounded-xl border border-border bg-card hover:shadow-md transition-shadow overflow-hidden group">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(show.id, index, e.shiftKey); }}
                title={isSelected ? "Deselect" : "Select"}
                className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? "bg-primary border-primary opacity-100"
                    : `bg-black/40 border-white/70 ${selectedIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleFavorite(show.id, { id: show.id, name: show.name }); }}
                title={isFav ? "Remove from favorites" : "Add to favorites"}
                className={`absolute top-2 right-2 z-10 p-1 rounded-full transition-all ${
                  isFav ? "bg-black/60 text-primary opacity-100" : "bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-primary"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
              </button>
              {/* Thumbnail click -- jumps straight to the source URL for
                  whichever episode is currently tracked as "watching",
                  skipping the episode list entirely. */}
              {show.currentEpisode ? (
                <a
                  href={show.currentEpisode.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  onClick={(e) => {
                    if (selectedIds.size > 0 || e.shiftKey) {
                      e.preventDefault();
                      toggleSelect(show.id, index, e.shiftKey);
                    }
                  }}
                >
                  {show.thumbnailUrl ? (
                    <div className="relative aspect-[2/3] bg-muted overflow-hidden">
                      {/* object-contain, not object-cover -- TMDB posters are
                          portrait (~2:3) but episode-screenshot fallbacks
                          are landscape, so cropping to fill risks cutting
                          either one badly depending on which is showing.
                          Letterboxing beats that (mirrors the same call
                          made for episode-row thumbnails in
                          playlist-detail.tsx). */}
                      <img src={show.thumbnailUrl} alt={show.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200" />
                    </div>
                  ) : (
                    <div className="aspect-[2/3] bg-muted flex items-center justify-center">
                      <Tv className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                </a>
              ) : show.thumbnailUrl ? (
                <a
                  href={`/playlists/${show.id}`}
                  className="block"
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    if (selectedIds.size > 0 || e.shiftKey) {
                      toggleSelect(show.id, index, e.shiftKey);
                    } else {
                      navigate(`/playlists/${show.id}`);
                    }
                  }}
                >
                  <div className="relative aspect-[2/3] bg-muted overflow-hidden">
                    <img src={show.thumbnailUrl} alt={show.name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200" />
                  </div>
                </a>
              ) : (
                <div className="aspect-[2/3] bg-muted flex items-center justify-center">
                  <Tv className="w-8 h-8 text-muted-foreground/40" />
                </div>
              )}
              {/* Title/subtitle click -- goes to the episode list & edit page.
                  A plain <a>, not wouter's Link -- Link swallows shift-clicks
                  before our onClick ever runs (it bails out early on any
                  modifier key), which broke shift-click range-select here. */}
              <a
                href={`/playlists/${show.id}`}
                className="flex flex-col text-center"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  if (selectedIds.size > 0 || e.shiftKey) {
                    toggleSelect(show.id, index, e.shiftKey);
                  } else {
                    navigate(`/playlists/${show.id}`);
                  }
                }}
              >
                <div className="p-3">
                  <p className="text-sm font-medium truncate w-full">{show.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {show.currentEpisode?.title ?? `${show.videoCount} episode${show.videoCount !== 1 ? "s" : ""}`}
                  </p>
                </div>
              </a>
            </div>
            </SortableCardWrapper>
          );
        })}
      </div>
      </SortableContext>
      </DndContext>

      <AlertDialog open={isDeleteShowDialogOpen} onOpenChange={setIsDeleteShowDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} show{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected show{selectedIds.size !== 1 ? "s" : ""} and all their episodes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDeleteShows()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isShareDialogOpen} onOpenChange={(open) => { setIsShareDialogOpen(open); if (!open) { setShareMessage(""); setSelectedFriendIds(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {selectedIds.size} show{selectedIds.size !== 1 ? "s" : ""} with Friends</DialogTitle>
            <DialogDescription>Check one or more friends to send the selected shows to.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Input
              placeholder="Add a message (optional)"
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
            />
            {!friendsLoaded ? (
              <p className="text-sm text-muted-foreground">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends yet. Add friends in Settings.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                {friends.map((f) => {
                  const name = (f.firstName || f.lastName) ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim() : f.email;
                  const checked = selectedFriendIds.has(f.id);
                  return (
                    <label
                      key={f.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-sm cursor-pointer"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleShareFriend(f.id)} disabled={sharing} />
                      <span>{name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShareDialogOpen(false)} disabled={sharing}>Cancel</Button>
            <Button onClick={() => void handleShareSend()} disabled={sharing || selectedFriendIds.size === 0} className="gap-1.5">
              {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              {sharing ? "Sending…" : `Send${selectedFriendIds.size > 0 ? ` to ${selectedFriendIds.size}` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CREATE_NEW_CATEGORY = "__create_new__";

function BulkCategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (val: string) => void;
  categories: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [localCategories, setLocalCategories] = useState<string[]>([]);

  const allCategories = [...categories, ...localCategories.filter((c) => !categories.includes(c))];

  const confirm = () => {
    const name = draft.trim();
    if (!name) return;
    if (!allCategories.includes(name)) setLocalCategories((prev) => [...prev, name]);
    onChange(name);
    setCreating(false);
    setDraft("");
  };

  const cancel = () => { setCreating(false); setDraft(""); };

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="New category name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); confirm(); }
            if (e.key === "Escape") cancel();
          }}
        />
        <Button type="button" size="sm" onClick={confirm} disabled={!draft.trim()}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(val) => { if (val === CREATE_NEW_CATEGORY) setCreating(true); else onChange(val); }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a category…" />
      </SelectTrigger>
      <SelectContent>
        {allCategories.map((cat) => (
          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
        ))}
        {allCategories.length > 0 && <SelectSeparator />}
        <SelectItem value={CREATE_NEW_CATEGORY} className="text-primary font-medium">
          + Create New Category
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

export function Home() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(search);
  const category = searchParams.get("category") || undefined;

  const [searchInput, setSearchInput] = useState(() => sessionStorage.getItem("vvm_video_search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => sessionStorage.getItem("vvm_video_search") ?? "");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: libraryIndex } = useQuery<{ preferredPlayer: string | null }>({
    queryKey: ["library-index"],
    queryFn: () => fetch("/api/integrations/library-index", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const preferredPlayer = libraryIndex?.preferredPlayer ?? null;
  const visibleVideoTabs = VIDEO_TABS.filter((t) => {
    if (t.id === "tab2" && preferredPlayer === "jellyfin") return false; // hide Plex
    if (t.id === "tab8" && preferredPlayer === "plex") return false;     // hide Jellyfin
    return true;
  });

  // Persisted so the Back button from a TV show's episode list (which
  // navigates to a fresh "/" mount, resetting all plain useState here)
  // restores the tab you were actually on instead of always landing back
  // on Library.
  const [activeVideoTab, setActiveVideoTab] = useState<VideoTab>(() => {
    // A category-filtered URL only makes sense on the Library tab.
    if (category) return "tab1";
    const tabParam = new URLSearchParams(search).get("tab");
    if (tabParam && VIDEO_TAB_BY_PARAM[tabParam]) return VIDEO_TAB_BY_PARAM[tabParam]!;
    const stored = sessionStorage.getItem("vvm_video_tab");
    return VIDEO_TABS.some((t) => t.id === stored) ? (stored as VideoTab) : "tab1";
  });

  useEffect(() => {
    sessionStorage.setItem("vvm_video_tab", activeVideoTab);
  }, [activeVideoTab]);

  // Keep activeVideoTab in sync when the URL ?tab= param changes externally
  // (e.g. the phone remote sends a navigate command while this page is already open).
  useEffect(() => {
    const tabParam = new URLSearchParams(search).get("tab");
    if (tabParam && VIDEO_TAB_BY_PARAM[tabParam]) {
      setActiveVideoTab(VIDEO_TAB_BY_PARAM[tabParam]!);
    }
  }, [search]);

  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const saved = localStorage.getItem("vvm_video_sort_key");
    return saved && saved in SORT_LABELS ? (saved as SortKey) : "date-desc";
  });
  const [shuffleSeed, setShuffleSeed] = useState<string>(
    () => localStorage.getItem("vvm_video_shuffle_seed") ?? Math.random().toString(36).slice(2),
  );
  useEffect(() => {
    localStorage.setItem("vvm_video_sort_key", sortKey);
  }, [sortKey]);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Clicking "Plex Library" (or "Jellyfin Library") while it's already the
  // active tab is a no-op as far as activeVideoTab is concerned (same value
  // in, React skips the update) -- which left users stuck wherever they'd
  // drilled into (e.g. a "2D Movies" section) with no way back to the
  // library picker except the small in-page "Libraries" link. Bumping these
  // keys forces the tab to remount fresh on every click of its own tab,
  // section drilldown included, so the tab always acts as a "back to the
  // top" shortcut too.
  const [plexLibraryResetKey, setPlexLibraryResetKey] = useState(0);
  const [jellyfinLibraryResetKey, setJellyfinLibraryResetKey] = useState(0);
  const handleVideoTabClick = useCallback((tabId: VideoTab) => {
    if (tabId === "tab2") setPlexLibraryResetKey((k) => k + 1);
    if (tabId === "tab8") setJellyfinLibraryResetKey((k) => k + 1);
    setActiveVideoTab(tabId);
    setSelectedIds(new Set());
    setSelectAllMode(false);
    lastClickedIndex.current = null;
    scrollMainToTop();
    setLocation(`/?tab=${VIDEO_TAB_TO_PARAM[tabId]}`);
  }, [setLocation]);
  const { isFavorite, toggleFavorite } = useVideoFavorites();
  const { spansAllTabs } = useTabHeaders();
  const videosHeaderSpansAll = spansAllTabs("videos-library");
  const libSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const [libFavOrder, setLibFavOrder] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("video-library-favorites-order") ?? "[]") as number[]; }
    catch { return []; }
  });
  const saveLibFavOrder = useCallback((next: number[]) => {
    setLibFavOrder(next);
    try { localStorage.setItem("video-library-favorites-order", JSON.stringify(next)); } catch {}
  }, []);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [pinnedVideoCategories, setPinnedVideoCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("vvm_pinned_video_cats") ?? "[]") as string[]; }
    catch { return []; }
  });

  // --- Bulk selection (mirrors the Manage page's selection/action bar) ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const lastClickedIndex = useRef<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newBulkCategory, setNewBulkCategory] = useState("");
  const [isPlaylistMenuOpen, setIsPlaylistMenuOpen] = useState(false);
  const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false);
  const [isCreatingNewPlaylist, setIsCreatingNewPlaylist] = useState(false);
  const [newPlaylistDraft, setNewPlaylistDraft] = useState("");
  const playlistMenuRef = useRef<HTMLDivElement>(null);
  const [isTvShowMenuOpen, setIsTvShowMenuOpen] = useState(false);
  const [isMovingToTvShow, setIsMovingToTvShow] = useState(false);
  const [isCreatingNewShow, setIsCreatingNewShow] = useState(false);
  const [newShowDraft, setNewShowDraft] = useState("");
  const tvShowMenuRef = useRef<HTMLDivElement>(null);
  const [isEmptyCategoryDialogOpen, setIsEmptyCategoryDialogOpen] = useState(false);
  const [emptyCategoryName, setEmptyCategoryName] = useState("");
  const player = useMusicPlayer();
  const { toast } = useToast();
  const bulkDelete = useBulkDeleteVideos();
  const bulkRestore = useBulkRestoreVideos();
  const bulkUpdateCategory = useBulkUpdateCategory();
  const createPlaylist = useCreatePlaylist();
  const bulkAddToPlaylist = useBulkAddVideosToPlaylist();

  // --- Share from library pill (reuses friends/shareMessage from category-share below) ---
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedShareFriendIds, setSelectedShareFriendIds] = useState<Set<string>>(new Set());

  const toggleShareFriend = (friendId: string) => {
    setSelectedShareFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId); else next.add(friendId);
      return next;
    });
  };

  const handleShareSend = async () => {
    if (selectedIds.size === 0 || selectedShareFriendIds.size === 0) return;
    setIsSharing(true);
    try {
      const pairs: { videoId: number; recipientId: string }[] = [];
      for (const videoId of selectedIds) for (const recipientId of selectedShareFriendIds) pairs.push({ videoId, recipientId });
      const results = await Promise.all(pairs.map(async ({ videoId, recipientId }) => {
        const res = await fetch("/api/video-shares", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId, videoId, message: shareMessage || undefined }),
        });
        const data = await res.json().catch(() => ({})) as { error?: string };
        return { ok: res.ok, error: data.error };
      }));
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (okCount > 0) {
        toast({ title: `Shared ${selectedIds.size} video${selectedIds.size !== 1 ? "s" : ""} with ${selectedShareFriendIds.size} friend${selectedShareFriendIds.size !== 1 ? "s" : ""}${failCount > 0 ? ` (${failCount} failed)` : ""}` });
      }
      if (okCount === 0) {
        toast({ title: results.find((r) => !r.ok)?.error ?? "Failed to share", variant: "destructive" });
      }
      if (failCount === 0) {
        setIsShareDialogOpen(false);
        setShareMessage("");
        setSelectedShareFriendIds(new Set());
      }
    } catch (err) {
      toast({ title: "Failed to share", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setIsSharing(false);
    }
  };

  // Category rename
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editCategoryValue, setEditCategoryValue] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  const startEditCategory = () => {
    setEditCategoryValue(category ?? "");
    setIsEditingCategory(true);
    setTimeout(() => categoryInputRef.current?.select(), 0);
  };

  const [showDeleteCategoryDialog, setShowDeleteCategoryDialog] = useState(false);

  const confirmDeleteCategory = async (mode: "uncategorize" | "delete") => {
    if (!category) return;
    setIsSavingCategory(true);
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(category)}?mode=${mode}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/videos'] }),
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() }),
        ]);
        setLocation("/");
      }
    } finally {
      setIsSavingCategory(false);
      setIsEditingCategory(false);
    }
  };

  const saveEditCategory = async () => {
    const trimmed = editCategoryValue.trim();
    if (!trimmed || trimmed === category) { setIsEditingCategory(false); return; }
    setIsSavingCategory(true);
    try {
      const res = await fetch("/api/categories/rename", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: category, newName: trimmed }),
      });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
        await queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setLocation(`/?category=${encodeURIComponent(trimmed)}`);
      }
    } finally {
      setIsSavingCategory(false);
      setIsEditingCategory(false);
    }
  };

  // Category share
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const shareMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) setShareMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareMenuOpen]);

  useEffect(() => {
    if ((!shareMenuOpen && !isShareDialogOpen) || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setFriends(data as typeof friends); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [shareMenuOpen, isShareDialogOpen, friendsLoaded]);

  const handleShareCategory = async (friendId: string) => {
    setSharing(friendId);
    try {
      const res = await fetch("/api/category-shares", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryName: category, recipientId: friendId, message: shareMessage || undefined }),
      });
      const data = await res.json() as { error?: string; videoCount?: number };
      if (res.ok) {
        alert(`Shared ${data.videoCount ?? ""} videos!`);
        setShareMenuOpen(false);
        setShareMessage("");
      } else {
        alert(data.error ?? "Failed to share");
      }
    } finally {
      setSharing(null);
    }
  };

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      sessionStorage.setItem("vvm_video_search", searchInput.trim());
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortMenuOpen]);

  const isSearching = debouncedSearch.length > 0;

  const queryParams = {
    ...(category ? { category } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(sortKey === "random" ? { shuffleSeed } : {}),
  };
  const hasParams = Object.keys(queryParams).length > 0;

  const {
    data: videosData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteListVideos(hasParams ? queryParams : undefined);
  const videos = useMemo(() => videosData?.pages.flatMap((p) => p.items) ?? [], [videosData]);

  // Background validator: after each page loads, quietly check which video IDs
  // actually exist in the DB and evict any stale entries from the cache. This
  // catches deleted/purged videos that the virtualizer might still be showing.
  const lastValidatedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (videos.length === 0) return;
    const unvalidated = videos.filter((v) => !lastValidatedRef.current.has(v.id));
    if (unvalidated.length === 0) return;
    const ids = unvalidated.map((v) => v.id);
    fetch("/api/videos/validate-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids }),
    })
      .then((r) => r.ok ? r.json() as Promise<{ missing: number[] }> : Promise.resolve({ missing: [] }))
      .then(({ missing }) => {
        ids.forEach((id) => lastValidatedRef.current.add(id));
        if (missing.length === 0) return;
        const missingSet = new Set(missing);
        queryClient.setQueriesData<{ pages: { items: { id: number }[] }[]; pageParams: unknown[] }>(
          { queryKey: getInfiniteListVideosQueryKey() },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((v) => !missingSet.has(v.id)),
              })),
            };
          },
        );
        void queryClient.invalidateQueries({ queryKey: getGetVideoCountQueryKey() });
      })
      .catch(() => {/* non-critical, ignore */});
  }, [videos, queryClient]);

  const { data: stats } = useGetVideoStats();
  // refetchOnWindowFocus is off app-wide (App.tsx) to avoid refetching
  // things like the 14k-video Library grid every time the tab regains
  // focus, but this one's worth overriding: the browser extension updates
  // currentEpisode server-side while the user is off on Tubi in another
  // tab, and there's no other signal telling this already-loaded page that
  // happened -- refetching when they switch back is the natural moment to
  // pick it up, without needing a manual page reload. "always" (not just
  // `true`) because the global 5-minute staleTime would otherwise skip the
  // refetch entirely for anyone who's back within that window, which is
  // the common case here -- browsing a couple of Tubi episodes takes way
  // less than 5 minutes.
  const { data: allPlaylists = [] } = useListPlaylists({ query: { queryKey: getListPlaylistsQueryKey(), refetchOnWindowFocus: "always" } });
  // TV shows live exclusively on the TV Shows tab -- keep them out of the
  // regular playlist filter/picker/dropdown so they don't show up mixed in
  // with actual user-made playlists everywhere else in the app.
  const playlists = useMemo(() => allPlaylists.filter((p) => !p.isShow), [allPlaylists]);
  const showPlaylists = useMemo(() => allPlaylists.filter((p) => p.isShow), [allPlaylists]);

  const sectionTitle = isSearching
    ? `Results for "${debouncedSearch}"`
    : category
      ? category
      : "All Videos";

  const orderedFavVideos = useMemo(() => {
    const favVids = videos.filter(v => isFavorite(v.id));
    const favIds = new Set(favVids.map(v => v.id));
    const currentOrder = [
      ...libFavOrder.filter(id => favIds.has(id)),
      ...[...favIds].filter(id => !libFavOrder.includes(id)),
    ];
    return currentOrder.map(id => favVids.find(v => v.id === id)!).filter(Boolean);
  }, [videos, isFavorite, libFavOrder]);

  const nonFavVideos = useMemo(
    () => sortVideos(videos.filter(v => !isFavorite(v.id)), sortKey),
    [videos, sortKey, isFavorite],
  );

  // Combined list for shift-click range selection logic
  const sortedVideos = useMemo(() => [...orderedFavVideos, ...nonFavVideos], [orderedFavVideos, nonFavVideos]);

  const handleLibFavDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const favIds = new Set(videos.filter(v => isFavorite(v.id)).map(v => v.id));
    const currentOrder = [
      ...libFavOrder.filter(id => favIds.has(id)),
      ...[...favIds].filter(id => !libFavOrder.includes(id)),
    ];
    const oldIdx = currentOrder.indexOf(active.id as number);
    const newIdx = currentOrder.indexOf(over.id as number);
    if (oldIdx === -1 || newIdx === -1) return;
    saveLibFavOrder(arrayMove(currentOrder, oldIdx, newIdx));
  }, [videos, isFavorite, libFavOrder, saveLibFavOrder]);

  // --- Bulk selection: totals, toggling (with shift-click range support) ---
  const videoCountParams = debouncedSearch
    ? { search: debouncedSearch, ...(category ? { category } : {}) }
    : undefined;
  const { data: videoCount } = useGetVideoCount(videoCountParams, {
    query: { queryKey: getGetVideoCountQueryKey(videoCountParams), enabled: !!debouncedSearch },
  });
  const selectAllTotal: number | undefined = debouncedSearch
    ? videoCount?.total
    : !category
      ? stats?.total
      : stats?.byCategory.find((b) => b.category === category)?.count;
  const selectionCount = selectAllMode ? (selectAllTotal ?? selectedIds.size) : selectedIds.size;
  const hasSelection = selectAllMode || selectedIds.size > 0;
  const showSelectAllBanner = !selectAllMode && selectedIds.size === sortedVideos.length && sortedVideos.length > 0 && !!hasNextPage;

  const toggleSelect = useCallback((id: number, index: number, shiftKey: boolean) => {
    // Capture the previous index into a plain variable BEFORE the ref gets
    // overwritten below. setSelectedIds's updater doesn't run synchronously
    // -- by the time React actually calls it, `lastClickedIndex.current =
    // index` (a few lines down) has already run, so reading the ref inside
    // the updater was seeing the NEW index on both ends of the range.
    const prevIndex = lastClickedIndex.current;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && prevIndex !== null) {
        const lo = Math.min(prevIndex, index);
        const hi = Math.max(prevIndex, index);
        const adding = !next.has(id);
        for (let i = lo; i <= hi; i++) {
          const v = sortedVideos[i];
          if (v) adding ? next.add(v.id) : next.delete(v.id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClickedIndex.current = index;
  }, [sortedVideos]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAllMode(false);
    lastClickedIndex.current = null;
  }, []);

  // A changed filter invalidates whatever was selected under the old one.
  useEffect(() => { clearSelection(); }, [category, debouncedSearch, clearSelection]);

  useEffect(() => {
    if (hasSelection) player.minimize();
    else player.restore();
  }, [hasSelection, player]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setIsPlaylistMenuOpen(false);
        setIsCreatingNewPlaylist(false);
        setNewPlaylistDraft("");
      }
    };
    if (isPlaylistMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isPlaylistMenuOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tvShowMenuRef.current && !tvShowMenuRef.current.contains(e.target as Node)) {
        setIsTvShowMenuOpen(false);
      }
    };
    if (isTvShowMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isTvShowMenuOpen]);

  const handleBulkDelete = () => {
    if (!selectAllMode && selectedIds.size === 0) return;
    const body = selectAllMode
      ? { selectAll: true as const, filter: { ...(category ? { category } : {}), ...(debouncedSearch ? { search: debouncedSearch } : {}) } }
      : { ids: Array.from(selectedIds) };
    const deletedCount = selectionCount;
    const oldCategory = category;

    bulkDelete.mutate({ data: body }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
        queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["discover-films"] });

        if (oldCategory) {
          const catCount = stats?.byCategory.find((b) => b.category === oldCategory)?.count ?? 0;
          if (selectAllMode || catCount <= selectedIds.size) {
            setEmptyCategoryName(oldCategory);
            setIsEmptyCategoryDialogOpen(true);
          }
        }

        clearSelection();
        setIsDeleteDialogOpen(false);

        const softDeletedIds = data.ids;
        const handleUndo = () => {
          bulkRestore.mutate({ data: { ids: softDeletedIds } }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
              queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
              queryClient.invalidateQueries({ queryKey: ["discover-films"] });
              toast({ title: `Restored ${deletedCount} video${deletedCount !== 1 ? "s" : ""}` });
            },
            onError: () => toast({ title: "Failed to restore videos", variant: "destructive" }),
          });
        };
        toast({
          title: `Deleted ${deletedCount} video${deletedCount !== 1 ? "s" : ""}`,
          description: "Moved to Trash — recoverable there for 30 days.",
          duration: (UNDO_TIMEOUT_S + 1) * 1000,
          action: <UndoToastAction onUndo={handleUndo} />,
        });
      },
      onError: () => toast({ title: "Failed to delete videos", variant: "destructive" }),
    });
  };

  const handleBulkCategory = () => {
    if (!selectAllMode && selectedIds.size === 0) return;
    if (!newBulkCategory.trim()) return;
    const oldCategory = category;
    const movedCount = selectionCount;

    const body = selectAllMode
      ? { selectAll: true as const, category: newBulkCategory.trim(), filter: { ...(category ? { category } : {}), ...(debouncedSearch ? { search: debouncedSearch } : {}) } }
      : { ids: Array.from(selectedIds), category: newBulkCategory.trim() };

    bulkUpdateCategory.mutate({ data: body }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
        queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
        toast({ title: `Updated category for ${movedCount} video${movedCount !== 1 ? "s" : ""}` });
        clearSelection();
        setIsCategoryDialogOpen(false);
        setNewBulkCategory("");
        setLocation(`/?category=${encodeURIComponent(newBulkCategory.trim())}`);

        if (oldCategory && oldCategory !== newBulkCategory.trim()) {
          const oldCatCount = stats?.byCategory.find((b) => b.category === oldCategory)?.count ?? 0;
          if (selectAllMode || oldCatCount <= selectedIds.size) {
            setEmptyCategoryName(oldCategory);
            setIsEmptyCategoryDialogOpen(true);
          }
        }
      },
      onError: () => toast({ title: "Failed to update categories", variant: "destructive" }),
    });
  };

  // Mirrors handleBulkDelete/handleBulkCategory's selectAllMode branching --
  // "select all N matching" only ever set a flag, it never actually loaded
  // all N ids into selectedIds, so this must go server-side the same way
  // bulk-delete/bulk-category already do rather than relying on the (much
  // smaller) client-side set.
  const buildBulkAddToPlaylistBody = () => selectAllMode
    ? { selectAll: true as const, filter: { ...(category ? { category } : {}), ...(debouncedSearch ? { search: debouncedSearch } : {}) } }
    : { ids: Array.from(selectedIds) };

  const handleAddToPlaylist = async (playlistId: number, playlistName: string) => {
    if (isAddingToPlaylist) return;
    setIsAddingToPlaylist(true);
    try {
      const result = await bulkAddToPlaylist.mutateAsync({ id: playlistId, data: buildBulkAddToPlaylistBody() });
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      toast({ title: `Added ${result.affected} video${result.affected !== 1 ? "s" : ""} to "${playlistName}"` });
      clearSelection();
      setIsPlaylistMenuOpen(false);
    } catch {
      toast({ title: "Failed to add to playlist", variant: "destructive" });
    } finally {
      setIsAddingToPlaylist(false);
    }
  };

  const handleBulkAddToWishList = async () => {
    const selected = sortedVideos.filter((v) => selectedIds.has(v.id));
    if (selected.length === 0) return;
    try {
      await Promise.all(
        selected.map((v) =>
          fetch("/api/radio-favorites", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "wish-list",
              stationId: String(v.id),
              stationData: { id: v.id, title: v.title, thumbnailUrl: v.thumbnailUrl, youtubeUrl: v.youtubeUrl, type: "video" },
            }),
          })
        )
      );
      toast({ title: `Added ${selected.length} video${selected.length !== 1 ? "s" : ""} to Wish List` });
      clearSelection();
    } catch {
      toast({ title: "Failed to add to Wish List", variant: "destructive" });
    }
  };

  const handleCreateAndAddToPlaylist = async () => {
    const name = newPlaylistDraft.trim();
    if (!name || isAddingToPlaylist) return;
    setIsAddingToPlaylist(true);
    try {
      const newPlaylist = await createPlaylist.mutateAsync({ data: { name } });
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      const result = await bulkAddToPlaylist.mutateAsync({ id: newPlaylist.id, data: buildBulkAddToPlaylistBody() });
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      toast({ title: `Created "${name}" and added ${result.affected} video${result.affected !== 1 ? "s" : ""}` });
      clearSelection();
      setIsPlaylistMenuOpen(false);
      setIsCreatingNewPlaylist(false);
      setNewPlaylistDraft("");
    } catch {
      toast({ title: "Failed to create playlist", variant: "destructive" });
    } finally {
      setIsAddingToPlaylist(false);
    }
  };

  const handleMoveToShow = async (showId: number, showName: string) => {
    if (isMovingToTvShow) return;
    setIsMovingToTvShow(true);
    try {
      const result = await bulkAddToPlaylist.mutateAsync({ id: showId, data: buildBulkAddToPlaylistBody() });
      queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      toast({ title: `Moved ${result.affected} video${result.affected !== 1 ? "s" : ""} to "${showName}"` });
      clearSelection();
      setIsTvShowMenuOpen(false);
    } catch {
      toast({ title: "Failed to move to TV Shows", variant: "destructive" });
    } finally {
      setIsMovingToTvShow(false);
    }
  };

  const handleCreateAndMoveToShow = async () => {
    const name = newShowDraft.trim();
    if (!name || isMovingToTvShow) return;
    setIsMovingToTvShow(true);
    try {
      const res = await fetch("/api/playlists/find-or-create-show", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const show = await res.json() as { id: number; name: string };
      const result = await bulkAddToPlaylist.mutateAsync({ id: show.id, data: buildBulkAddToPlaylistBody() });
      queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      toast({ title: `Created "${name}" and moved ${result.affected} video${result.affected !== 1 ? "s" : ""}` });
      clearSelection();
      setIsTvShowMenuOpen(false);
      setIsCreatingNewShow(false);
      setNewShowDraft("");
    } catch {
      toast({ title: "Failed to create show", variant: "destructive" });
    } finally {
      setIsMovingToTvShow(false);
    }
  };

  // Mirror Tailwind's sm/lg/xl breakpoints exactly — both use window.innerWidth (viewport).
  const colsFromViewport = (vw: number) => (vw < 640 ? 1 : vw < 1024 ? 2 : vw < 1280 ? 4 : 5);
  const [columns, setColumns] = useState(() => colsFromViewport(window.innerWidth));
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = () => setColumns(colsFromViewport(window.innerWidth));
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Favorites are a separate grid from the rest -- they have to be, since they
  // are drag-sortable and the main list is virtualized. The seam shows when
  // favorites don't fill their last row: that row keeps empty cells, and the
  // main grid then starts a fresh row below, so the page reads as broken
  // exactly when the favorite count isn't a multiple of the column count.
  //
  // These spill videos finish that row. They're ordinary non-favorites shown
  // inside the favorites grid, not draggable, and skipped by the virtualized
  // list below so nothing renders twice.
  const spillCount = useMemo(() => {
    if (orderedFavVideos.length === 0) return 0;
    const remainder = orderedFavVideos.length % columns;
    return remainder === 0 ? 0 : Math.min(columns - remainder, nonFavVideos.length);
  }, [orderedFavVideos.length, columns, nonFavVideos.length]);

  const spillVideos = useMemo(
    () => nonFavVideos.slice(0, spillCount),
    [nonFavVideos, spillCount],
  );

  const rows = useMemo(() => {
    const chunks = [];
    for (let i = spillCount; i < nonFavVideos.length; i += columns) {
      chunks.push(nonFavVideos.slice(i, i + columns));
    }
    return chunks;
  }, [nonFavVideos, columns, spillCount]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => document.getElementById("main-scroll"),
    estimateSize: () => 260,
    overscan: 8,
  });

  // Remember which video was at the top of the viewport in this exact
  // category/search/sort combination, so opening a video and going back
  // lands where the user left off instead of at the top of the list.
  // Deliberately anchors to a specific video's id rather than a raw scrollTop
  // pixel value -- the virtualizer measures each row's real rendered height
  // (it doesn't just trust the fixed estimateSize), so a saved pixel offset
  // drifts further off the deeper into the list it was taken, while an
  // index/id-based scrollToIndex lands exactly regardless of depth.
  const scrollAnchorKey = `videos-anchor:${category ?? ""}:${debouncedSearch}:${sortKey}`;
  const restoredAnchorKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const el = document.getElementById("main-scroll");
    if (!el) return;
    const handler = () => {
      const items = rowVirtualizer.getVirtualItems();
      const top = items.find((item) => item.start + item.size > el.scrollTop) ?? items[0];
      const firstId = top ? rows[top.index]?.[0]?.id : undefined;
      if (firstId != null) sessionStorage.setItem(scrollAnchorKey, String(firstId));
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [scrollAnchorKey, rowVirtualizer, rows]);

  useEffect(() => {
    if (isLoading) return;
    if (restoredAnchorKeyRef.current === scrollAnchorKey) return;
    const savedId = sessionStorage.getItem(scrollAnchorKey);
    if (savedId) {
      const idx = rows.findIndex((row) => row.some((v) => String(v.id) === savedId));
      if (idx >= 0) rowVirtualizer.scrollToIndex(idx, { align: "start" });
    }
    restoredAnchorKeyRef.current = scrollAnchorKey;
  }, [scrollAnchorKey, isLoading, rows, rowVirtualizer]);

  // Fetch next page when the last rendered virtual row is the last loaded row.
  // More reliable than a DOM sentinel: the sentinel gets pushed down whenever
  // new rows are added, which breaks the IntersectionObserver timing.
  const lastVirtualItemIndex = rowVirtualizer.getVirtualItems().at(-1)?.index;
  useEffect(() => {
    if (lastVirtualItemIndex === undefined) return;
    if (lastVirtualItemIndex >= rows.length - 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [lastVirtualItemIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <Layout>
      <div className="px-8 pb-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        <div id="my-videos-header" className="sticky top-0 z-20 bg-background -mx-8 px-8">

          {/* Row 1: page title */}
          <div className="flex items-center gap-3 pt-4 pb-2">
            <Film className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold">My Videos</h1>
            <Link
              href="/games-vault/movie-bracket"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <Trophy className="w-3.5 h-3.5" />
              Movie Night
            </Link>
          </div>

          {/* Row 2: tab bar */}
          <div className="flex gap-0 border-b border-border">
            {visibleVideoTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleVideoTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeVideoTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Row 3: toolbar -- hidden for Plex Library and Streaming
              Services, since none of these controls (search/category/
              playlist/sort/add) do anything on either of those tabs. Also
              hidden on TV Shows while shows are selected, so the selection
              bar can move up right below the tab bar instead of sitting
              below this row. */}
          {activeVideoTab !== "tab2" && activeVideoTab !== "tab4" && activeVideoTab !== "tab8" && (
          <div className="flex items-start gap-3 py-3 border-b border-border/40">
          <div className="flex flex-col gap-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 h-8 text-sm w-full"
                placeholder=""
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <span className="text-[10px] text-muted-foreground px-0.5">Search by title</span>
          </div>
          {searchInput && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchInput("")}
              data-testid="button-clear-search"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}

          {/* Category dropdown */}
          <div className="flex flex-col gap-1">
          <Select
            value={category ?? "__all__"}
            onValueChange={(val) => {
              setLocation(val === "__all__" ? "/" : `/?category=${encodeURIComponent(val)}`);
            }}
          >
            <SelectTrigger className="h-8 w-44 text-sm shrink-0" data-testid="category-select">
              <SelectValue placeholder="All videos" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              <SelectItem value="__all__">
                All{stats ? ` (${stats.total})` : ""}
              </SelectItem>
              {stats &&
                [...stats.byCategory,
                  ...pinnedVideoCategories
                    .filter(p => !stats.byCategory.some(c => c.category === p))
                    .map(p => ({ category: p, count: 0 })),
                ]
                  .sort((a, b) => a.category.localeCompare(b.category))
                  .map((cat) => (
                    <SelectItem key={cat.category} value={cat.category} data-testid={`category-${cat.category}`}>
                      {cat.category} ({cat.count})
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground px-0.5">Category</span>
          </div>

          {/* Playlist dropdown */}
          <div className="flex flex-col gap-1">
          <Select
            value={location.startsWith("/playlists/") ? location.split("/playlists/")[1] : "__none__"}
            onValueChange={(val) => {
              if (val !== "__none__") setLocation(`/playlists/${val}`);
            }}
          >
            <SelectTrigger className="h-8 w-44 text-sm shrink-0" data-testid="playlist-select">
              <SelectValue placeholder="Playlists" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              {playlists.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">No playlists yet</div>
              ) : (
                playlists.map((pl) => (
                  <SelectItem key={pl.id} value={String(pl.id)}>
                    {pl.name} ({pl.videoCount})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground px-0.5">Playlist</span>
          </div>

          {/* Sort dropdown */}
          <div className="flex flex-col gap-1">
          <div className="relative shrink-0" ref={sortMenuRef}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setSortMenuOpen((o) => !o)}
            >
              <ArrowUpDown className="w-4 h-4" />
              {SORT_LABELS[sortKey]}
            </Button>
            {sortMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-popover border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
                {(["alpha-asc", "alpha-desc", "date-desc", "date-asc", "random"] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                    onClick={() => {
                      if (key === "random") {
                        const seed = Math.random().toString(36).slice(2);
                        setShuffleSeed(seed);
                        localStorage.setItem("vvm_video_shuffle_seed", seed);
                      }
                      setSortKey(key);
                      setSortMenuOpen(false);
                    }}
                  >
                    <Check className={`w-4 h-4 shrink-0 ${sortKey === key ? "text-primary" : "opacity-0"}`} />
                    {SORT_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground px-0.5">Sort order</span>
          </div>

          <Button asChild size="sm" className="shrink-0 gap-1.5 ml-auto">
            <Link href="/add">
              <Plus className="w-4 h-4" />
              Add Video
            </Link>
          </Button>
          </div>
          )}
        </div>

        {/* Library always carries the banner; the other My Videos tabs only
            when an admin has ticked "Show on all My Videos tabs". The artwork
            is a marquee listing the sections themselves, so spanning them is a
            reasonable thing to want -- but it's a preference, not a given.
            empty:hidden so the spacing collapses along with a hidden banner. */}
        {(activeVideoTab === "tab1" || (videosHeaderSpansAll && activeVideoTab !== "tab3" && activeVideoTab !== "tab4" && activeVideoTab !== "tab9")) && (
          <div className="mb-4 empty:hidden">
            <TabHeader tabKey="videos-library" />
          </div>
        )}

        {activeVideoTab === "tab1" && <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 group min-w-0">
              {isSearching && <Search className="w-5 h-5 text-primary shrink-0" />}
              {category && isEditingCategory ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={categoryInputRef}
                    className="text-2xl font-display font-semibold bg-transparent border-b-2 border-primary outline-none"
                    value={editCategoryValue}
                    disabled={isSavingCategory}
                    onChange={(e) => setEditCategoryValue(e.target.value)}
                    onBlur={() => void saveEditCategory()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void saveEditCategory(); }
                      if (e.key === "Escape") setIsEditingCategory(false);
                    }}
                  />
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => void saveEditCategory()} className="text-primary hover:opacity-70 shrink-0" title="Save">
                    <Check className="w-5 h-5" />
                  </button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setIsEditingCategory(false)} className="text-muted-foreground hover:text-foreground shrink-0" title="Cancel">
                    <X className="w-5 h-5" />
                  </button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setShowDeleteCategoryDialog(true)} className="text-destructive hover:opacity-70 shrink-0 ml-1" title="Delete category">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-2xl font-display font-semibold truncate">{sectionTitle}</h2>
                  {category && !isSearching && (
                    <button
                      onClick={startEditCategory}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      title="Rename category"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {(videos.length > 0 || hasNextPage) && (
                <span className="text-sm text-muted-foreground font-medium">
                  {videos.length}{hasNextPage ? "+" : ""} {videos.length === 1 && !hasNextPage ? "video" : "videos"}
                </span>
              )}
              {category && !isSearching && (
                <div className="relative" ref={shareMenuRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShareMenuOpen((o) => !o)}
                    title="Share this category with a friend"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                  {shareMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                      <div className="px-4 pt-3 pb-2 border-b border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Share with a Friend</p>
                      </div>
                      <div className="px-4 py-2">
                        <textarea
                          className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                          rows={2}
                          placeholder="Add a message (optional)"
                          value={shareMessage}
                          onChange={(e) => setShareMessage(e.target.value)}
                        />
                      </div>
                      {!friendsLoaded ? (
                        <div className="px-4 py-3 text-xs text-muted-foreground">Loading friends…</div>
                      ) : friends.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-muted-foreground">No friends yet. Add friends in Settings.</div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto divide-y divide-border">
                          {friends.map((f) => {
                            const name = (f.firstName || f.lastName) ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim() : f.email;
                            return (
                              <button
                                key={f.id}
                                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors text-left disabled:opacity-50"
                                disabled={sharing === f.id}
                                onClick={() => void handleShareCategory(f.id)}
                              >
                                <span className="text-sm truncate">{name}</span>
                                <Send className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="px-4 py-2 border-t border-border">
                        <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" onClick={() => setShareMenuOpen(false)}>
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {showSelectAllBanner && (
            <div className="px-4 py-2 mb-4 bg-primary/10 text-center text-sm rounded-lg border border-primary/20">
              All {sortedVideos.length} videos on this page are selected.{" "}
              <button
                className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                onClick={() => setSelectAllMode(true)}
              >
                {selectAllTotal !== undefined ? `Select all ${selectAllTotal} videos` : "Select all matching videos"}
              </button>
            </div>
          )}
          {selectAllMode && (
            <div className="px-4 py-2 mb-4 bg-primary/10 text-center text-sm rounded-lg border border-primary/20">
              {selectAllTotal !== undefined ? `All ${selectAllTotal} videos are selected.` : "All matching videos are selected."}{" "}
              <button
                className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                onClick={clearSelection}
              >
                Clear selection
              </button>
            </div>
          )}

          {orderedFavVideos.length > 0 && !isLoading && (
            <div className="mb-6">
              <DndContext sensors={libSensors} collisionDetection={closestCenter} onDragEnd={(e) => { handleLibFavDragEnd(e); const blockClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', blockClick, { capture: true }), 200); }}>
              <SortableContext items={orderedFavVideos.map(v => v.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {orderedFavVideos.map((video, index) => (
                  <SortableCardWrapper key={video.id} id={video.id} enabled>
                    <VideoCard
                      video={video}
                      isFavorite
                      onToggleFavorite={() => void toggleFavorite(video.id, {
                        id: video.id, title: video.title,
                        thumbnailUrl: video.thumbnailUrl ?? null,
                        youtubeUrl: video.youtubeUrl,
                        category: video.category,
                      })}
                      isSelected={selectedIds.has(video.id)}
                      hasSelection={hasSelection}
                      onToggleSelect={(e) => toggleSelect(video.id, index, e.shiftKey)}
                    />
                  </SortableCardWrapper>
                ))}
                {/* Ordinary videos completing the favorites' last row, so the
                    grid doesn't break mid-row. Deliberately not wrapped in
                    SortableCardWrapper -- they aren't favorites and mustn't be
                    draggable; they just happen to sit in this grid. */}
                {spillVideos.map((video, i) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    isFavorite={isFavorite(video.id)}
                    onToggleFavorite={() => void toggleFavorite(video.id, {
                      id: video.id, title: video.title,
                      thumbnailUrl: video.thumbnailUrl ?? null,
                      youtubeUrl: video.youtubeUrl,
                      category: video.category,
                    })}
                    isSelected={selectedIds.has(video.id)}
                    hasSelection={hasSelection}
                    onToggleSelect={(e) => toggleSelect(video.id, orderedFavVideos.length + i, e.shiftKey)}
                  />
                ))}
              </div>
              </SortableContext>
              </DndContext>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {Array.from({ length: 10 }).map((_, i) => <VideoCardSkeleton key={`all-skel-${i}`} />)}
            </div>
          ) : videos.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-3 text-muted-foreground bg-card/30 rounded-xl border border-border border-dashed">
              <Film className="w-12 h-12 opacity-20" />
              <p>
                {isSearching
                  ? `No videos match "${debouncedSearch}".`
                  : "No videos found in this view."}
              </p>
            </div>
          ) : (
            <div ref={gridRef} style={{ position: "relative", height: `${rowVirtualizer.getTotalSize()}px` }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowVideos = rows[virtualRow.index];
                if (!rowVideos) return null;
                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      gap: "24px",
                    }}
                  >
                    {rowVideos.map((video, colIdx) => {
                      // Position in the combined favorites + spill + rest list,
                      // which is what shift-click ranges are measured against.
                      const flatIndex = orderedFavVideos.length + spillCount + virtualRow.index * columns + colIdx;
                      return (
                        <VideoCard
                          key={video.id}
                          video={video}
                          isFavorite={isFavorite(video.id)}
                          onToggleFavorite={() =>
                            void toggleFavorite(video.id, {
                              id: video.id, title: video.title,
                              thumbnailUrl: video.thumbnailUrl ?? null,
                              youtubeUrl: video.youtubeUrl,
                              category: video.category,
                            })
                          }
                          isSelected={selectedIds.has(video.id)}
                          hasSelection={hasSelection}
                          onToggleSelect={(e) => toggleSelect(video.id, flatIndex, e.shiftKey)}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          <div className="h-8 flex items-center justify-center mt-2">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more…
              </div>
            )}
          </div>
        </section>}

        {activeVideoTab === "tab2" && <PlexLibraryTab key={plexLibraryResetKey} />}

        {activeVideoTab === "tab3" && (
          <div className="mb-10 empty:hidden">
            <TabHeader tabKey="tv-shows" alwaysExpanded />
          </div>
        )}

        {activeVideoTab === "tab3" && (
          <TvShowsTab shows={allPlaylists.filter((p) => p.isShow)} />
        )}

        {activeVideoTab === "tab4" && (
          <div className="mb-6 empty:hidden">
            <TabHeader tabKey="videos-streaming" />
          </div>
        )}

        {activeVideoTab === "tab4" && <StreamingServicesTab />}

        {activeVideoTab === "tab8" && <JellyfinLibraryTab key={jellyfinLibraryResetKey} />}

        {activeVideoTab === "tab9" && <DiscoverTab />}

        {activeVideoTab !== "tab1" && activeVideoTab !== "tab2" && activeVideoTab !== "tab3" && activeVideoTab !== "tab4" && activeVideoTab !== "tab8" && activeVideoTab !== "tab9" && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <Film className="w-16 h-16 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">Coming soon</p>
              <p className="text-sm text-muted-foreground/70 mt-1">This section is under construction</p>
            </div>
          </div>
        )}

      </div>

      <AlertDialog open={showDeleteCategoryDialog} onOpenChange={setShowDeleteCategoryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle>Remove category "{category}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose what happens to the videos currently in this category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => void confirmDeleteCategory("uncategorize")}
              disabled={isSavingCategory}
            >
              Move videos to Uncategorized
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteCategory("delete")}
              disabled={isSavingCategory}
            >
              Delete videos too
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectionCount} video{selectionCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              These will move to Trash, where you can restore them or delete them for good within 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk category move */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={(open) => { setIsCategoryDialogOpen(open); if (!open) setNewBulkCategory(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectionCount} video{selectionCount !== 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>Pick an existing category or type a new name.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <BulkCategorySelect
              value={newBulkCategory}
              onChange={setNewBulkCategory}
              categories={(stats?.byCategory.map((b) => b.category) ?? []).sort()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkCategory} disabled={!newBulkCategory.trim() || bulkUpdateCategory.isPending}>
              Save Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating selection bar */}
      {hasSelection && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
            <span className="text-sm font-semibold pl-1 pr-2">
              {selectAllMode
                ? selectAllTotal !== undefined ? `All ${selectAllTotal} selected` : "All matching selected"
                : `${selectedIds.size} selected`}
            </span>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <Button size="sm" variant="secondary" className="rounded-full gap-1.5" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="w-4 h-4" /> Share
            </Button>
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsCategoryDialogOpen(true)}>
              <FolderOpen className="w-4 h-4 mr-1.5" />
              Move
            </Button>
            <div className="relative" ref={playlistMenuRef}>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => setIsPlaylistMenuOpen((o) => !o)}
                disabled={isAddingToPlaylist}
              >
                <ListVideo className="w-4 h-4 mr-1.5" />
                Add to Playlist
              </Button>
              {isPlaylistMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-popover text-popover-foreground border rounded-xl shadow-xl py-1 z-50">
                  <div className="max-h-52 overflow-y-auto">
                    {playlists.length === 0 && !isCreatingNewPlaylist ? (
                      <p className="px-4 py-2.5 text-sm text-muted-foreground">No playlists yet</p>
                    ) : (
                      playlists.map((pl) => (
                        <button
                          key={pl.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left disabled:opacity-50"
                          onClick={() => handleAddToPlaylist(pl.id, pl.name)}
                          disabled={isAddingToPlaylist}
                        >
                          <ListVideo className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{pl.name}</span>
                          <span className="text-xs text-muted-foreground">{pl.videoCount} video{pl.videoCount !== 1 ? "s" : ""}</span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border mt-1" />
                  {isCreatingNewPlaylist ? (
                    <div className="px-3 py-2 flex gap-2">
                      <input
                        autoFocus
                        placeholder="Playlist name…"
                        value={newPlaylistDraft}
                        onChange={(e) => setNewPlaylistDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateAndAddToPlaylist();
                          if (e.key === "Escape") { setIsCreatingNewPlaylist(false); setNewPlaylistDraft(""); }
                        }}
                        className="flex-1 bg-transparent text-sm outline-none border border-border rounded-md px-2 py-1 placeholder:text-muted-foreground"
                        disabled={isAddingToPlaylist}
                      />
                      <button onClick={handleCreateAndAddToPlaylist} disabled={!newPlaylistDraft.trim() || isAddingToPlaylist} className="text-xs font-medium text-primary disabled:opacity-40 px-1">
                        Add
                      </button>
                      <button onClick={() => { setIsCreatingNewPlaylist(false); setNewPlaylistDraft(""); }} className="text-xs text-muted-foreground px-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left text-primary font-medium"
                      onClick={() => setIsCreatingNewPlaylist(true)}
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      Add New Playlist
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="relative" ref={tvShowMenuRef}>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => setIsTvShowMenuOpen((o) => !o)}
                disabled={isMovingToTvShow}
              >
                <Tv className="w-4 h-4 mr-1.5" />
                TV Shows
              </Button>
              {isTvShowMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-popover text-popover-foreground border rounded-xl shadow-xl py-1 z-50">
                  <div className="max-h-52 overflow-y-auto">
                    {showPlaylists.length === 0 && !isCreatingNewShow ? (
                      <p className="px-4 py-2.5 text-sm text-muted-foreground">No shows yet</p>
                    ) : (
                      showPlaylists.map((show) => (
                        <button
                          key={show.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left disabled:opacity-50"
                          onClick={() => void handleMoveToShow(show.id, show.name)}
                          disabled={isMovingToTvShow}
                        >
                          <Tv className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{show.name}</span>
                          <span className="text-xs text-muted-foreground">{show.videoCount} ep{show.videoCount !== 1 ? "s" : ""}</span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border mt-1" />
                  {isCreatingNewShow ? (
                    <div className="px-3 py-2 flex gap-2">
                      <input
                        autoFocus
                        placeholder="Show name…"
                        value={newShowDraft}
                        onChange={(e) => setNewShowDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleCreateAndMoveToShow();
                          if (e.key === "Escape") { setIsCreatingNewShow(false); setNewShowDraft(""); }
                        }}
                        className="flex-1 bg-transparent text-sm outline-none border border-border rounded-md px-2 py-1 placeholder:text-muted-foreground"
                        disabled={isMovingToTvShow}
                      />
                      <button onClick={() => void handleCreateAndMoveToShow()} disabled={!newShowDraft.trim() || isMovingToTvShow} className="text-xs font-medium text-primary disabled:opacity-40 px-1">
                        Add
                      </button>
                      <button onClick={() => { setIsCreatingNewShow(false); setNewShowDraft(""); }} className="text-xs text-muted-foreground px-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left text-primary font-medium"
                      onClick={() => setIsCreatingNewShow(true)}
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      New Show
                    </button>
                  )}
                </div>
              )}
            </div>
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => void handleBulkAddToWishList()}>
              <ShoppingBag className="w-4 h-4 mr-1.5" />
              Wish List
            </Button>
            <Button size="sm" variant="destructive" className="rounded-full" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <button onClick={clearSelection} className="text-xs font-medium opacity-70 hover:opacity-100 transition-opacity px-1">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Share dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={(open) => { setIsShareDialogOpen(open); if (!open) { setShareMessage(""); setSelectedShareFriendIds(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {selectedIds.size} video{selectedIds.size !== 1 ? "s" : ""} with friends</DialogTitle>
            <DialogDescription>Check one or more friends to send the selected videos to.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Input
              placeholder="Add a message (optional)"
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
            />
            {!friendsLoaded ? (
              <p className="text-sm text-muted-foreground">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends yet. Add friends in Settings.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                {friends.map((f) => {
                  const name = (f.firstName || f.lastName) ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim() : f.email;
                  const checked = selectedShareFriendIds.has(f.id);
                  return (
                    <label
                      key={f.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-sm cursor-pointer"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleShareFriend(f.id)} disabled={isSharing} />
                      <span>{name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShareDialogOpen(false)} disabled={isSharing}>Cancel</Button>
            <Button onClick={() => void handleShareSend()} disabled={isSharing || selectedShareFriendIds.size === 0} className="gap-1.5">
              {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              {isSharing ? "Sending…" : `Send${selectedShareFriendIds.size > 0 ? ` to ${selectedShareFriendIds.size}` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty category prompt */}
      <AlertDialog open={isEmptyCategoryDialogOpen} onOpenChange={setIsEmptyCategoryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Category is now empty</AlertDialogTitle>
            <AlertDialogDescription>
              "{emptyCategoryName}" has no more videos. Remove it from the list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              const updated = [...pinnedVideoCategories.filter((c) => c !== emptyCategoryName), emptyCategoryName];
              setPinnedVideoCategories(updated);
              localStorage.setItem("vvm_pinned_video_cats", JSON.stringify(updated));
            }}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const updated = pinnedVideoCategories.filter((c) => c !== emptyCategoryName);
              setPinnedVideoCategories(updated);
              localStorage.setItem("vvm_pinned_video_cats", JSON.stringify(updated));
              setLocation("/");
            }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

export default Home;
