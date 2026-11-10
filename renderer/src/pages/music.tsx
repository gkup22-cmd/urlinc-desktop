import React, { useState, useCallback, useEffect, useRef } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { openUrl } from "@/lib/openUrl";
import {
  useTabSolidColor,
  useTabCardOpacity,
  useLibraryColoredText,
  LIBRARY_TRACK_COLORS,
} from "@/hooks/useMusicBackground";
import { MusicPageSolidBg } from "@/components/music-bg-picker";
import {
  useListMusic,
  useDeleteMusic,
  useUpdateMusic,
  getGetMusicCountQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMusicPlayer, type MusicTrack } from "@/contexts/MusicPlayerContext";
import {
  Play, Pause, Search, Plus, Trash2, Music2, Pencil,
  ExternalLink, Star, Headphones, Check, Share2, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import RadioTabContent from "@/components/RadioTabContent";
import { VaultSourceGrid, type VaultSource } from "@/components/vault-source-grid";
import { TabHeader } from "@/components/tab-header";
import { scrollMainToTop } from "@/lib/scroll";

function fmtDuration(secs: number | null): string {
  if (!secs) return "--:--";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STREAMING_SERVICE_HOSTS = [
  "youtube.com", "youtu.be", "music.youtube.com",
  "soundcloud.com", "mixcloud.com", "bandcamp.com",
  "spotify.com", "open.spotify.com", "tidal.com",
  "deezer.com", "music.apple.com", "radio-browser.info",
];

function isStreamingServiceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return STREAMING_SERVICE_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

const BROWSE_MUSIC_SITES: VaultSource[] = [
  { name: "Internet Archive",   description: "Thousands of free, legal music recordings streamable in your browser.",            url: "https://archive.org/details/audio",  color: "bg-sky-500/10 border-sky-500/30 text-sky-400" },
  { name: "Free Music Archive", description: "A library of high-quality, legal audio downloads curated by radio stations.",       url: "https://freemusicarchive.org",       color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  { name: "Jamendo",            description: "Free and open-licensed music from independent artists worldwide.",                  url: "https://www.jamendo.com",            color: "bg-orange-500/10 border-orange-500/30 text-orange-400" },
  { name: "ccMixter",           description: "Community music site featuring remixes and samples under Creative Commons.",        url: "https://ccmixter.org",               color: "bg-violet-500/10 border-violet-500/30 text-violet-400" },
  { name: "Musopen",            description: "Free public domain classical music recordings and sheet music.",                    url: "https://musopen.org",                color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  { name: "SoundClick",         description: "Independent artists share original music free to stream.",                          url: "https://www.soundclick.com",         color: "bg-pink-500/10 border-pink-500/30 text-pink-400" },
];

const STREAMING_SERVICES: VaultSource[] = [
  { name: "YouTube Music",  description: "Stream nearly any song or album through YouTube's own music service.", url: "https://music.youtube.com",      color: "bg-red-500/10 border-red-500/30 text-red-400" },
  { name: "SoundCloud",     description: "Stream music and podcasts from independent artists and labels.",       url: "https://soundcloud.com",          color: "bg-orange-500/10 border-orange-500/30 text-orange-400" },
  { name: "Mixcloud",       description: "Stream DJ mixes, radio shows and podcasts on demand.",                 url: "https://www.mixcloud.com",        color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { name: "Bandcamp",       description: "Buy and stream music directly from independent artists.",              url: "https://bandcamp.com",            color: "bg-teal-500/10 border-teal-500/30 text-teal-400" },
  { name: "Spotify",        description: "Stream millions of songs, albums and playlists in your browser.",      url: "https://open.spotify.com",        color: "bg-green-500/10 border-green-500/30 text-green-400" },
  { name: "Radio Browser",  description: "Browse thousands of internet radio stations from around the world.",  url: "https://www.radio-browser.info", color: "bg-purple-500/10 border-purple-500/30 text-purple-400" },
];

const AUDIOBOOK_SOURCES: VaultSource[] = [
  { name: "LibriVox",              description: "Free public domain audiobooks read by volunteers. Thousands of titles.",               url: "https://librivox.org",                           color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { name: "Loyal Books",            description: "Free public domain audiobooks and ebooks in multiple languages.",                      url: "https://www.loyalbooks.com",                     color: "bg-green-500/10 border-green-500/30 text-green-400" },
  { name: "Internet Archive Audio", description: "Millions of free audio recordings including audiobooks and spoken word.",              url: "https://archive.org/details/audio_bookspoetry",  color: "bg-sky-500/10 border-sky-500/30 text-sky-400" },
  { name: "Open Library",           description: "Borrow digital audiobooks free from the Internet Archive lending library.",            url: "https://openlibrary.org",                        color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  { name: "Spotify Audiobooks",     description: "Stream audiobooks legally via Spotify — free and premium titles available.",           url: "https://open.spotify.com/genre/audiobooks-page", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  { name: "Audible",                description: "The largest audiobook store — purchase or subscribe for unlimited listening.",         url: "https://www.audible.com",                        color: "bg-orange-500/10 border-orange-500/30 text-orange-400" },
];

type ActiveTab = "library" | "radio" | "browse" | "stream" | "audiobooks";

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "library",    label: "Library" },
  { id: "radio",      label: "Radio" },
  { id: "browse",     label: "Browse Music" },
  { id: "stream",     label: "Stream Sources" },
  { id: "audiobooks", label: "Audiobooks" },
];

function SortableLibraryRow({
  track, idx, rowIndex, isFav, isSelected, isPlaying, isHighlighted, isServiceLink,
  coloredText, hasSelection,
  onRowClick, onCheckboxClick, onPlayClick, onFavClick, onEditClick, onOpenUrlClick, onDeleteClick,
}: {
  track: MusicTrack; idx: number; rowIndex: number;
  isFav: boolean; isSelected: boolean; isPlaying: boolean; isHighlighted: boolean;
  isServiceLink: boolean; coloredText: boolean; hasSelection: boolean;
  onRowClick: (e: React.MouseEvent) => void;
  onCheckboxClick: (e: React.MouseEvent) => void;
  onPlayClick: (e: React.MouseEvent) => void;
  onFavClick: (e: React.MouseEvent) => void;
  onEditClick: (e: React.MouseEvent) => void;
  onOpenUrlClick: (e: React.MouseEvent) => void;
  onDeleteClick: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`track-${track.id}`}
      className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl border bg-card transition-colors cursor-pointer ${
        isHighlighted
          ? "border-primary/60 bg-primary/10 ring-1 ring-primary/30"
          : isPlaying
            ? "border-primary/30 bg-primary/5"
            : isSelected
              ? "border-primary/40 bg-primary/10"
              : "border-border hover:bg-accent/30"
      }`}
      onClick={onRowClick}
      {...(isFav ? attributes : {})}
      {...(isFav ? listeners : {})}
    >
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onCheckboxClick}
        title={isSelected ? "Deselect" : "Select"}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          isSelected
            ? "bg-primary border-primary opacity-100"
            : `bg-black/30 border-white/50 ${hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
      </button>
      {track.coverImageUrl ? (
        <img
          src={track.coverImageUrl}
          alt=""
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = "none";
            const fallback = el.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      ) : null}
      <div
        className="w-10 h-10 rounded-lg bg-muted items-center justify-center flex-shrink-0"
        style={{ display: track.coverImageUrl ? "none" : "flex" }}
      >
        {isPlaying ? <span className="text-primary text-base">♪</span> : <Music2 className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${isPlaying ? "text-primary" : ""}`}
          style={coloredText && !isPlaying ? { color: LIBRARY_TRACK_COLORS[idx % LIBRARY_TRACK_COLORS.length] } : undefined}
        >
          {track.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {track.artist ?? <span className="italic opacity-60">Unknown artist</span>}
        </p>
      </div>
      <span className="text-xs text-muted-foreground/50 group-hover:hidden flex-shrink-0 w-5 text-right">
        {isPlaying ? <span className="text-primary">♪</span> : isServiceLink ? <ExternalLink className="w-3 h-3 inline" /> : <span>{idx + 1}</span>}
      </span>
      <button
        className="hidden group-hover:flex items-center justify-center flex-shrink-0 w-5"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onPlayClick}
        title={isServiceLink ? "Open in service" : isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause className="w-4 h-4 text-primary" /> : isServiceLink ? <ExternalLink className="w-4 h-4 text-muted-foreground" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex items-center gap-0.5">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onEditClick} className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onOpenUrlClick} className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title="Go to source">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onFavClick}
          className={`p-1 rounded transition-colors hover:bg-accent ${isFav ? "text-primary opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary"}`}
          title={isFav ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
        </button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={onDeleteClick} className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function MusicPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearch();
  const [, setLocation] = useLocation();

  const activeTab: ActiveTab = (() => {
    const params = new URLSearchParams(searchParams);
    const t = params.get("tab");
    if (t === "radio" || t === "browse" || t === "stream" || t === "audiobooks") return t;
    return "library";
  })();

  const [highlightId, setHighlightId] = useState<number | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const lastClickedTrackIndex = useRef<number | null>(null);
  const hasTrackSelection = selectedTrackIds.size > 0;
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [isMusicShareOpen, setIsMusicShareOpen] = useState(false);
  const [musicShareFriends, setMusicShareFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [musicShareFriendsLoaded, setMusicShareFriendsLoaded] = useState(false);
  const [musicShareFriendIds, setMusicShareFriendIds] = useState<Set<string>>(new Set());
  const [musicShareMessage, setMusicShareMessage] = useState("");
  const [musicSharing, setMusicSharing] = useState(false);

  useEffect(() => {
    if (!isMusicShareOpen || musicShareFriendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setMusicShareFriends(data as typeof musicShareFriends); setMusicShareFriendsLoaded(true); })
      .catch(() => setMusicShareFriendsLoaded(true));
  }, [isMusicShareOpen, musicShareFriendsLoaded]);

  const handleMusicShare = async () => {
    if (selectedTrackIds.size === 0 || musicShareFriendIds.size === 0) return;
    setMusicSharing(true);
    try {
      const trackIds = Array.from(selectedTrackIds);
      const results = await Promise.all(Array.from(musicShareFriendIds).map(async (recipientId) => {
        const res = await fetch("/api/music-track-shares", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId, trackIds, message: musicShareMessage || undefined }),
        });
        const data = await res.json().catch(() => ({})) as { error?: string };
        return { ok: res.ok, error: data.error };
      }));
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        toast({ title: `Shared ${selectedTrackIds.size} track${selectedTrackIds.size !== 1 ? "s" : ""} with ${okCount} friend${okCount !== 1 ? "s" : ""}` });
        setIsMusicShareOpen(false);
        setMusicShareMessage("");
        setMusicShareFriendIds(new Set());
        setSelectedTrackIds(new Set());
      } else {
        toast({ title: results[0]?.error ?? "Failed to share", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Failed to share", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setMusicSharing(false);
    }
  };

  // null = the Live Radio / Old Radio World picker screen -- same
  // pick-a-section-first pattern as the Plex/Jellyfin Library tabs, and
  // resets to the picker on every tab (re)click the same way those do.
  const [radioSource, setRadioSource] = useState<"liveradio" | "oldradioworld" | null>(null);

  interface LibraryFavoriteRow {
    id: number; source: "library"; stationId: string;
    stationData: Record<string, unknown>; createdAt: string;
  }
  const [libraryFavorites, setLibraryFavorites] = useState<Map<string, LibraryFavoriteRow>>(new Map());
  const librarySensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));

  const [favoritesOrder, setFavoritesOrder] = useState<number[]>(() => {
    try {
      const v = localStorage.getItem("library-favorites-order");
      return v ? (JSON.parse(v) as number[]) : [];
    } catch { return []; }
  });
  const saveFavoritesOrder = useCallback((order: number[]) => {
    setFavoritesOrder(order);
    try { localStorage.setItem("library-favorites-order", JSON.stringify(order)); } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/radio-favorites?source=library", { credentials: "include" })
      .then((r) => r.ok ? r.json() as Promise<LibraryFavoriteRow[]> : Promise.resolve([]))
      .then((rows) => setLibraryFavorites(new Map(rows.map((r) => [`library:${r.stationId}`, r]))))
      .catch(() => {});
  }, []);

  const toggleLibraryFavorite = useCallback(async (trackId: number, trackData: Record<string, unknown>) => {
    const key = `library:${trackId}`;
    const wasFav = libraryFavorites.has(key);
    setLibraryFavorites((prev) => {
      const next = new Map(prev);
      if (wasFav) next.delete(key);
      else next.set(key, { id: 0, source: "library", stationId: String(trackId), stationData: trackData, createdAt: new Date().toISOString() });
      return next;
    });
    setFavoritesOrder((prev) => {
      const next = wasFav ? prev.filter((id) => id !== trackId) : [...prev, trackId];
      try { localStorage.setItem("library-favorites-order", JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      if (wasFav) {
        await fetch(`/api/radio-favorites/${encodeURIComponent(String(trackId))}?source=library`, { method: "DELETE", credentials: "include" });
      } else {
        await fetch("/api/radio-favorites", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "library", stationId: String(trackId), stationData: trackData }),
        });
      }
    } catch {
      setLibraryFavorites((prev) => {
        const next = new Map(prev);
        if (wasFav) next.set(key, { id: 0, source: "library", stationId: String(trackId), stationData: trackData, createdAt: new Date().toISOString() });
        else next.delete(key);
        return next;
      });
      setFavoritesOrder((prev) => {
        const next = wasFav ? [...prev, trackId] : prev.filter((id) => id !== trackId);
        try { localStorage.setItem("library-favorites-order", JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [libraryFavorites]);

  const handleFavDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const favIds = new Set([...libraryFavorites.keys()].map((k) => parseInt(k.replace("library:", ""))));
    // Build the full visual order: saved order first, then any favorites not yet saved
    const currentOrder = [
      ...favoritesOrder.filter(id => favIds.has(id)),
      ...[...favIds].filter(id => !favoritesOrder.includes(id)),
    ];
    const oldIdx = currentOrder.indexOf(active.id as number);
    const newIdx = currentOrder.indexOf(over.id as number);
    if (oldIdx === -1 || newIdx === -1) return;
    saveFavoritesOrder(arrayMove(currentOrder, oldIdx, newIdx));
  }, [libraryFavorites, favoritesOrder, saveFavoritesOrder]);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { toast } = useToast();
  const player = useMusicPlayer();
  const { coloredText } = useLibraryColoredText();

  // Per-tab solid color overlays
  const { cardOpacity: libraryCardOpacity    } = useTabCardOpacity("library");
  const { cardOpacity: radioCardOpacity      } = useTabCardOpacity("radio");
  const { cardOpacity: browseCardOpacity     } = useTabCardOpacity("browse");
  const { cardOpacity: streamCardOpacity     } = useTabCardOpacity("stream");
  const { cardOpacity: audiobooksCardOpacity } = useTabCardOpacity("audiobooks");

  const { solidEnabled: librarySolid,    solidColor: libraryColor,    solidOpacity: libraryOpacity    } = useTabSolidColor("library");
  const { solidEnabled: browseSolid,     solidColor: browseColor,     solidOpacity: browseOpacity     } = useTabSolidColor("browse");
  const { solidEnabled: streamSolid,     solidColor: streamColor,     solidOpacity: streamOpacity     } = useTabSolidColor("stream");
  const { solidEnabled: audiobooksSolid, solidColor: audiobooksColor, solidOpacity: audiobooksOpacity } = useTabSolidColor("audiobooks");
  const { solidEnabled: radioSolid,      solidColor: radioColor,      solidOpacity: radioOpacity      } = useTabSolidColor("radio");

  const prevTabRef = useRef<ActiveTab>(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      setSearch("");
      setSelectedTrackIds(new Set());
      setRadioSource(null);
      prevTabRef.current = activeTab;
    }
  }, [activeTab]);

  // Sync radioSource from ?source= URL param (e.g. when Show Radio button navigates here)
  useEffect(() => {
    if (activeTab !== "radio") return;
    const src = new URLSearchParams(searchParams).get("source");
    if (src === "liveradio" || src === "oldradioworld") setRadioSource(src);
  }, [searchParams, activeTab]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const id = params.get("highlight");
    if (!id) return;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return;
    setHighlightId(numId);
    const scrollTimer = setTimeout(() => {
      document.getElementById(`track-${numId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(scrollTimer);
  }, [searchParams]);

  const { data: musicPage, refetch: refetchTracks } = useListMusic({
    search: debouncedSearch || undefined,
    limit: 200,
  });
  const tracks = musicPage?.items ?? [];
  const deleteTrack = useDeleteMusic();
  const updateTrack = useUpdateMusic();

  interface EditDraft { id: number; title: string; artist: string; audioUrl: string; coverImageUrl: string; }
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const startEdit = (t: typeof tracks[0]) => {
    setEditDraft({ id: t.id, title: t.title, artist: t.artist ?? "", audioUrl: t.audioUrl, coverImageUrl: t.coverImageUrl ?? "" });
  };

  const handleSaveEdit = async () => {
    if (!editDraft) return;
    try {
      await updateTrack.mutateAsync({
        id: editDraft.id,
        data: {
          title: editDraft.title.trim() || undefined,
          artist: editDraft.artist.trim() || undefined,
          audioUrl: editDraft.audioUrl.trim() || undefined,
          coverImageUrl: editDraft.coverImageUrl.trim() || undefined,
        },
      });
      void refetchTracks();
      setEditDraft(null);
      toast({ title: "Track updated" });
    } catch {
      toast({ title: "Failed to update track", variant: "destructive" });
    }
  };

  const handleDeleteTrack = async (id: number) => {
    if (!confirm("Delete this track?")) return;
    try {
      await deleteTrack.mutateAsync({ id });
      void refetchTracks();
      void queryClient.invalidateQueries({ queryKey: getGetMusicCountQueryKey() });
    } catch {
      toast({ title: "Failed to delete track", variant: "destructive" });
    }
  };

  const handleBulkDeleteTracks = async () => {
    const ids = Array.from(selectedTrackIds);
    setConfirmBulkDeleteOpen(false);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteTrack.mutateAsync({ id })));
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelectedTrackIds(new Set());
      void refetchTracks();
      void queryClient.invalidateQueries({ queryKey: getGetMusicCountQueryKey() });
      if (failed > 0) toast({ title: `${failed} track${failed !== 1 ? "s" : ""} failed to delete`, variant: "destructive" });
    } catch {
      toast({ title: "Failed to delete tracks", variant: "destructive" });
    }
  };

  const toPlayerTrack = useCallback((t: typeof tracks[0]): MusicTrack => ({
    id: t.id,
    title: t.title,
    artist: t.artist ?? null,
    audioUrl: t.audioUrl,
    coverImageUrl: t.coverImageUrl ?? null,
    durationSeconds: t.durationSeconds ?? null,
  }), [tracks]);

  const handlePlayTrack = (idx: number) => {
    const track = tracks[idx];
    if (!track) return;
    if (isStreamingServiceUrl(track.audioUrl)) {
      openUrl(track.audioUrl);
    } else {
      player.playSingleFromQueue(tracks.map(toPlayerTrack), idx, "/music");
    }
  };

  const handlePlayAll = () => {
    const playable = tracks.filter((t) => !isStreamingServiceUrl(t.audioUrl));
    if (playable.length === 0) return;
    player.playQueue(playable.map(toPlayerTrack), 0, "/music");
  };

  const currentTrack = player.queue[player.currentIndex];
  const isTrackPlaying = (t: typeof tracks[0]) => currentTrack?.id === t.id && player.isPlaying;
  const isServiceLink  = (t: typeof tracks[0]) => isStreamingServiceUrl(t.audioUrl);

  // Active tab's solid color overlay
  const activeSolid = (() => {
    if (activeTab === "radio")      return { enabled: radioSolid,      color: radioColor,      opacity: radioOpacity };
    if (activeTab === "browse")     return { enabled: browseSolid,     color: browseColor,     opacity: browseOpacity };
    if (activeTab === "stream")     return { enabled: streamSolid,     color: streamColor,     opacity: streamOpacity };
    if (activeTab === "audiobooks") return { enabled: audiobooksSolid, color: audiobooksColor, opacity: audiobooksOpacity };
    return { enabled: librarySolid, color: libraryColor, opacity: libraryOpacity };
  })();

  const handleTabChange = (tab: ActiveTab) => {
    // Re-clicking the already-active Radio tab resets it back to the
    // Live Radio / Old Radio World picker, same as Plex/Jellyfin Library.
    if (tab === "radio" && activeTab === "radio") setRadioSource(null);
    setLocation("/music" + (tab !== "library" ? "?tab=" + tab : ""));
    scrollMainToTop();
  };

  const showSearch = activeTab === "library" || (activeTab === "radio" && radioSource !== null);

  return (
    <Layout>
      <div className="relative flex flex-col h-full">
        {activeSolid.enabled && <MusicPageSolidBg color={activeSolid.color} opacity={activeSolid.opacity} />}
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">

          {/* STICKY HEADER */}
          <div className="sticky top-0 z-20 bg-background/95 backdrop-blur flex-shrink-0">
            <div className="flex items-center gap-3 px-6 pt-4 pb-2">
              <Headphones className="w-7 h-7 text-primary" />
              <h1 className="text-2xl font-bold">My Audio</h1>
            </div>
            <div className="flex gap-0 px-6 border-b border-border">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {/* Hidden on Library while tracks are selected, so the
                selection bar (which lives in its own scroll container just
                below this header) doesn't have to fight this row for
                space -- same fix already applied to My Videos' TV Shows
                tab. */}
            {!(activeTab === "library" && selectedTrackIds.size > 0) && (
            <div className="flex items-center gap-3 px-6 py-2 border-b border-border/40">
              {showSearch && (
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder={activeTab === "library" ? "Search tracks…" : "Search stations / shows…"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-8 text-sm w-full"
                  />
                </div>
              )}
              {activeTab === "library" && tracks.length > 0 && (
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={handlePlayAll}>
                  <Play className="w-3.5 h-3.5 fill-current" /> Play All
                </Button>
              )}
              {activeTab === "radio" && radioSource !== null && (
                <Button size="sm" variant="ghost" className="gap-1.5 shrink-0 -ml-1" onClick={() => setRadioSource(null)}>
                  ← Radio
                </Button>
              )}
              {activeTab === "library" && (
                <Link href="/add-music" className="ml-auto">
                  <Button size="sm" className="gap-1.5 shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Add Track
                  </Button>
                </Link>
              )}
            </div>
            )}
          </div>

          {/* Library tab */}
          {activeTab === "library" && (
            <div className="flex-1 overflow-y-auto" style={{ opacity: libraryCardOpacity / 100 }}>
              <TabHeader tabKey="audio-library" />
              {(() => {
                // Favorites float to the top in user-defined drag order.
                const displayedTracks = (() => {
                  const favIds = new Set([...libraryFavorites.keys()].map((k) => parseInt(k.replace("library:", ""))));
                  const trackById = new Map(tracks.map((t) => [t.id, t]));
                  const orderedFavIds = [
                    ...favoritesOrder.filter((id) => favIds.has(id) && trackById.has(id)),
                    ...tracks.filter((t) => favIds.has(t.id) && !favoritesOrder.includes(t.id)).map((t) => t.id),
                  ];
                  return [
                    ...orderedFavIds.map((id) => trackById.get(id)!),
                    ...tracks.filter((t) => !favIds.has(t.id)),
                  ];
                })();
                const toggleTrackSelect = (id: number, rowIndex: number, shiftKey: boolean) => {
                  const prevIndex = lastClickedTrackIndex.current;
                  setSelectedTrackIds((prev) => {
                    const next = new Set(prev);
                    if (shiftKey && prevIndex !== null) {
                      const lo = Math.min(prevIndex, rowIndex);
                      const hi = Math.max(prevIndex, rowIndex);
                      const adding = !next.has(id);
                      for (let i = lo; i <= hi; i++) {
                        const t = displayedTracks[i];
                        if (t) adding ? next.add(t.id) : next.delete(t.id);
                      }
                    } else if (next.has(id)) {
                      next.delete(id);
                    } else {
                      next.add(id);
                    }
                    return next;
                  });
                  lastClickedTrackIndex.current = rowIndex;
                };
                if (tracks.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                      <Music2 className="w-12 h-12 opacity-30" />
                      <p className="text-sm">No tracks yet.</p>
                      <Link href="/add-music">
                        <Button size="sm" variant="outline">Add your first track</Button>
                      </Link>
                    </div>
                  );
                }
                return (
                  <>
                  {selectedTrackIds.size > 0 && (
                    <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
                      <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
                        <span className="text-sm font-semibold pl-1 pr-2">{selectedTrackIds.size} selected</span>
                        <div className="h-5 w-px bg-primary-foreground/30" />
                        <Button size="sm" variant="secondary" className="rounded-full gap-1.5" onClick={() => setIsMusicShareOpen(true)}>
                          <Share2 className="w-4 h-4" /> Share
                        </Button>
                        <Button size="sm" variant="destructive" className="rounded-full gap-1.5" onClick={() => setConfirmBulkDeleteOpen(true)}>
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                        <div className="h-5 w-px bg-primary-foreground/30" />
                        <button onClick={() => { setSelectedTrackIds(new Set()); lastClickedTrackIndex.current = null; }} className="text-xs font-medium opacity-70 hover:opacity-100 transition-opacity px-1">
                          Clear
                        </button>
                      </div>
                    </div>
                  )}

                  <Dialog open={isMusicShareOpen} onOpenChange={(open) => { setIsMusicShareOpen(open); if (!open) { setMusicShareMessage(""); setMusicShareFriendIds(new Set()); } }}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Share {selectedTrackIds.size} track{selectedTrackIds.size !== 1 ? "s" : ""} with friends</DialogTitle>
                        <DialogDescription>Friends will receive the tracks and can add them to their music library.</DialogDescription>
                      </DialogHeader>
                      <div className="py-2 space-y-3">
                        <Input placeholder="Add a message (optional)" value={musicShareMessage} onChange={(e) => setMusicShareMessage(e.target.value)} />
                        {!musicShareFriendsLoaded ? (
                          <p className="text-sm text-muted-foreground">Loading friends…</p>
                        ) : musicShareFriends.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No friends yet. Add friends in Settings.</p>
                        ) : (
                          <div className="divide-y divide-border border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                            {musicShareFriends.map((f) => {
                              const name = (f.firstName || f.lastName) ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim() : f.email;
                              return (
                                <label key={f.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-sm cursor-pointer">
                                  <Checkbox checked={musicShareFriendIds.has(f.id)} onCheckedChange={() => setMusicShareFriendIds((prev) => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })} disabled={musicSharing} />
                                  <span>{name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMusicShareOpen(false)} disabled={musicSharing}>Cancel</Button>
                        <Button onClick={() => void handleMusicShare()} disabled={musicSharing || musicShareFriendIds.size === 0} className="gap-1.5">
                          {musicSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                          {musicSharing ? "Sending…" : `Send${musicShareFriendIds.size > 0 ? ` to ${musicShareFriendIds.size}` : ""}`}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <DndContext sensors={librarySensors} collisionDetection={closestCenter} onDragEnd={handleFavDragEnd}>
                    <SortableContext
                      items={displayedTracks.filter((t) => libraryFavorites.has(`library:${t.id}`)).map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-col gap-2 px-4 py-3">
                        {displayedTracks.map((track, rowIndex) => {
                          const idx = tracks.findIndex((t) => t.id === track.id);
                          const playing = isTrackPlaying(track);
                          const isFav = libraryFavorites.has(`library:${track.id}`);
                          const isSelected = selectedTrackIds.has(track.id);
                          return (
                            <SortableLibraryRow
                              key={track.id}
                              track={track}
                              idx={idx}
                              rowIndex={rowIndex}
                              isFav={isFav}
                              isSelected={isSelected}
                              isPlaying={playing}
                              isHighlighted={highlightId === track.id}
                              isServiceLink={isServiceLink(track)}
                              coloredText={coloredText}
                              hasSelection={selectedTrackIds.size > 0}
                              onRowClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.closest("button") || target.closest("a")) return;
                                if (selectedTrackIds.size > 0 || e.shiftKey) {
                                  toggleTrackSelect(track.id, rowIndex, e.shiftKey);
                                } else if (playing) {
                                  player.togglePlay();
                                } else {
                                  handlePlayTrack(idx);
                                }
                              }}
                              onCheckboxClick={(e) => { e.stopPropagation(); toggleTrackSelect(track.id, rowIndex, e.shiftKey); }}
                              onPlayClick={(e) => { e.stopPropagation(); playing ? player.togglePlay() : handlePlayTrack(idx); }}
                              onFavClick={(e) => {
                                e.stopPropagation();
                                void toggleLibraryFavorite(track.id, {
                                  id: track.id, title: track.title,
                                  artist: track.artist ?? null,
                                  audioUrl: track.audioUrl,
                                  coverImageUrl: track.coverImageUrl ?? null,
                                  durationSeconds: track.durationSeconds ?? null,
                                });
                              }}
                              onEditClick={(e) => { e.stopPropagation(); startEdit(track); }}
                              onOpenUrlClick={(e) => { e.stopPropagation(); openUrl(track.audioUrl); }}
                              onDeleteClick={(e) => { e.stopPropagation(); void handleDeleteTrack(track.id); }}
                            />
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                  </>
                );
              })()}
            </div>
          )}

          <AlertDialog open={confirmBulkDeleteOpen} onOpenChange={setConfirmBulkDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedTrackIds.size} track{selectedTrackIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleBulkDeleteTracks()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={editDraft !== null} onOpenChange={(open) => !open && setEditDraft(null)}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Edit Track</AlertDialogTitle>
              </AlertDialogHeader>
              {editDraft && (
                <div className="flex flex-col gap-3 py-1">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-title">Title</Label>
                    <Input id="edit-title" value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-artist">Artist</Label>
                    <Input id="edit-artist" value={editDraft.artist} onChange={(e) => setEditDraft({ ...editDraft, artist: e.target.value })} placeholder="Optional" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-url">Audio URL</Label>
                    <Input id="edit-url" value={editDraft.audioUrl} onChange={(e) => setEditDraft({ ...editDraft, audioUrl: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-cover">Cover Image URL</Label>
                    <Input id="edit-cover" value={editDraft.coverImageUrl} onChange={(e) => setEditDraft({ ...editDraft, coverImageUrl: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleSaveEdit()}>Save</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Radio tab */}
          {activeTab === "radio" && (
            <div className="flex-1 flex flex-col overflow-hidden" style={{ opacity: radioCardOpacity / 100 }}>
              <RadioTabContent
                search={search}
                source={radioSource}
                onSourceChange={setRadioSource}
              />
            </div>
          )}

          {/* Browse Music tab */}
          {activeTab === "browse" && (
            <div className="flex-1 overflow-y-auto" style={{ opacity: browseCardOpacity / 100 }}>
              <TabHeader tabKey="audio-browse" />
              <div className="p-6">
                <VaultSourceGrid listType="music-browse" intro="Discover free and open-licensed music" builtIns={BROWSE_MUSIC_SITES} />
              </div>
            </div>
          )}

          {/* Stream Sources tab */}
          {activeTab === "stream" && (
            <div className="flex-1 overflow-y-auto" style={{ opacity: streamCardOpacity / 100 }}>
              <TabHeader tabKey="audio-stream" />
              <div className="p-6">
                <VaultSourceGrid listType="music-stream" intro="Open streaming services in your browser" builtIns={STREAMING_SERVICES} />
              </div>
            </div>
          )}

          {/* Audiobooks tab */}
          {activeTab === "audiobooks" && (
            <div className="flex-1 overflow-y-auto" style={{ opacity: audiobooksCardOpacity / 100 }}>
              <TabHeader tabKey="audio-audiobooks" />
              <div className="p-6">
                <VaultSourceGrid listType="music-audiobooks" intro="Free and legal audiobook sources." builtIns={AUDIOBOOK_SOURCES} />
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
