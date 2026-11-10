import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Layout } from "@/components/layout";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useListMusicDirectories,
  useListMusicPlaylists,
  useCreateMusicPlaylist,
  useAddTrackToMusicPlaylist,
  getListMusicQueryKey,
  getInfiniteListMusicQueryKey,
  useInfiniteListMusic,
  type MusicTrack,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2,
  FolderOpen,
  Settings2,
  Music2,
  Search,
  X,
  ArrowUpDown,
  Check,
  Plus,
  Share2,
  ListMusic,
  Loader2,
  Play,
  Pause,
  Download,
  ChevronDown,
  Radio,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type ManageSection = "tracks" | "stations";
type SortKey = "alpha-asc" | "alpha-desc" | "date-desc" | "date-asc";
const SORT_LABELS: Record<SortKey, string> = {
  "alpha-asc": "A → Z",
  "alpha-desc": "Z → A",
  "date-desc": "Newest First",
  "date-asc": "Oldest First",
};

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "--:--";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function sortTracks(arr: MusicTrack[], key: SortKey): MusicTrack[] {
  return [...arr].sort((a, b) => {
    if (key === "alpha-asc") return a.title.localeCompare(b.title);
    if (key === "alpha-desc") return b.title.localeCompare(a.title);
    if (key === "date-asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTracksAsJson(tracks: MusicTrack[], filename: string) {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tracks: tracks.map((t) => ({
      title: t.title,
      artist: t.artist ?? null,
      audioUrl: t.audioUrl,
      coverImageUrl: t.coverImageUrl ?? null,
      durationSeconds: t.durationSeconds ?? null,
    })),
    playlists: [],
  };
  triggerDownload(JSON.stringify(data, null, 2), filename, "application/json");
}

function exportTracksAsM3U(tracks: MusicTrack[], filename: string) {
  const lines = ["#EXTM3U"];
  for (const t of tracks) {
    const dur = t.durationSeconds ?? -1;
    const display = t.artist ? `${t.artist} - ${t.title}` : t.title;
    lines.push(`#EXTINF:${dur},${display}`);
    lines.push(t.audioUrl);
  }
  triggerDownload(lines.join("\n"), filename, "audio/x-mpegurl");
}

const MUSIC_COL_TEMPLATE = "48px 56px minmax(0,1fr) 80px 130px 90px";

export function ManageMusic() {
  const player = useMusicPlayer();
  const [section, setSection] = useState<ManageSection>("tracks");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeDirectoryId, setActiveDirectoryId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const lastClickedIndex = useRef<number | null>(null);
  const pointerDownPos = useRef({ x: 0, y: 0 });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDirectoryDialogOpen, setIsDirectoryDialogOpen] = useState(false);
  const [newDirectoryId, setNewDirectoryId] = useState<string>("none");
  const [isPlaylistMenuOpen, setIsPlaylistMenuOpen] = useState(false);
  const [isCreatingNewPlaylist, setIsCreatingNewPlaylist] = useState(false);
  const [newPlaylistDraft, setNewPlaylistDraft] = useState("");
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const playlistMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const apiDirectoryId = activeDirectoryId !== "all" && activeDirectoryId !== "none-dir"
    ? parseInt(activeDirectoryId, 10)
    : undefined;

  const {
    data: musicData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteListMusic({
    directoryId: apiDirectoryId,
    search: searchQuery || undefined,
  });
  const rawTracks = musicData?.pages.flatMap((p) => p.items) ?? [];
  const tracks = activeDirectoryId === "none-dir"
    ? rawTracks.filter((t) => t.directoryId == null)
    : rawTracks;

  const { data: directories = [] } = useListMusicDirectories();
  const { data: playlists = [] } = useListMusicPlaylists();
  const createPlaylist = useCreateMusicPlaylist();
  const addToPlaylist = useAddTrackToMusicPlaylist();

  const filtered = useMemo(() => sortTracks(tracks, sortKey), [tracks, sortKey]);

  // Separate unfiltered load for the stations view (no directory/search restrictions)
  const {
    data: allMusicData,
    fetchNextPage: fetchAllNextPage,
    hasNextPage: hasAllNextPage,
    isFetchingNextPage: isFetchingAllNextPage,
  } = useInfiniteListMusic({});
  const stationTracks = useMemo(
    () => sortTracks(
      (allMusicData?.pages.flatMap((p) => p.items) ?? [])
        .filter((t) => t.audioUrl.startsWith("https://archive.org/")),
      sortKey,
    ),
    [allMusicData, sortKey],
  );
  const stationGroups = useMemo(() => {
    const groups = new Map<string, MusicTrack[]>();
    for (const t of stationTracks) {
      const key = t.artist || "Unknown Station";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [stationTracks]);

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  useEffect(() => {
    if (hasAllNextPage && !isFetchingAllNextPage) void fetchAllNextPage();
  }, [hasAllNextPage, isFetchingAllNextPage, fetchAllNextPage]);

  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIndex.current = null;
  }, [activeDirectoryId, searchQuery]);

  // Clear selection when switching between tracks and stations
  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIndex.current = null;
  }, [section]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!isPlaylistMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setIsPlaylistMenuOpen(false);
        setIsCreatingNewPlaylist(false);
        setNewPlaylistDraft("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isPlaylistMenuOpen]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => document.getElementById("main-scroll"),
    estimateSize: () => 64,
    overscan: 4,
  });

  // In stations mode, "all" means all station tracks; in tracks mode, all filtered tracks
  const activeList = section === "stations" ? stationTracks : filtered;
  const allSelected = activeList.length > 0 && selectedIds.size === activeList.length;

  const toggleSelectAll = () => {
    if (selectedIds.size === activeList.length && activeList.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeList.map((t) => t.id)));
    }
  };

  const toggleSelect = (id: number, index: number, shiftKey: boolean) => {
    const newSet = new Set(selectedIds);
    if (shiftKey && lastClickedIndex.current !== null) {
      const lo = Math.min(lastClickedIndex.current, index);
      const hi = Math.max(lastClickedIndex.current, index);
      const adding = !newSet.has(id);
      for (let i = lo; i <= hi; i++) {
        const t = filtered[i];
        if (t) adding ? newSet.add(t.id) : newSet.delete(t.id);
      }
    } else {
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    }
    lastClickedIndex.current = index;
    setSelectedIds(newSet);
  };

  const hasSelection = selectedIds.size > 0;

  useEffect(() => {
    if (hasSelection) player.minimize();
    else player.restore();
    return () => player.restore(); // always restore when navigating away
  }, [hasSelection, player]);

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const res = await fetch("/api/music/bulk-delete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) { toast({ title: "Failed to delete tracks", variant: "destructive" }); return; }
    const data = await res.json() as { deleted: number };
    toast({ title: `Deleted ${data.deleted} track${data.deleted !== 1 ? "s" : ""}` });
    setSelectedIds(new Set());
    setIsDeleteDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: getListMusicQueryKey() });
    queryClient.invalidateQueries({ queryKey: getInfiniteListMusicQueryKey() });
  };

  const handleBulkDirectory = async () => {
    const ids = Array.from(selectedIds);
    const directoryId = newDirectoryId === "none" ? null : parseInt(newDirectoryId, 10);
    const res = await fetch("/api/music/bulk-directory", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, directoryId }),
    });
    if (!res.ok) { toast({ title: "Failed to move tracks", variant: "destructive" }); return; }
    const data = await res.json() as { updated: number };
    toast({ title: `Moved ${data.updated} track${data.updated !== 1 ? "s" : ""}` });
    setSelectedIds(new Set());
    setIsDirectoryDialogOpen(false);
    setNewDirectoryId("none");
    queryClient.invalidateQueries({ queryKey: getListMusicQueryKey() });
    queryClient.invalidateQueries({ queryKey: getInfiniteListMusicQueryKey() });
  };

  const handleAddToPlaylist = async (playlistId: number, playlistName: string) => {
    if (addingToPlaylist) return;
    const ids = Array.from(selectedIds);
    setAddingToPlaylist(true);
    let added = 0;
    let skipped = 0;
    for (const musicId of ids) {
      const res = await addToPlaylist.mutateAsync({ id: playlistId, data: { musicId } }).catch(() => null);
      if (res) added++; else skipped++;
    }
    setAddingToPlaylist(false);
    toast({ title: `Added ${added} track${added !== 1 ? "s" : ""} to "${playlistName}"${skipped > 0 ? ` (${skipped} skipped)` : ""}` });
    setSelectedIds(new Set());
    setIsPlaylistMenuOpen(false);
  };

  const handleCreateAndAddToPlaylist = async () => {
    const name = newPlaylistDraft.trim();
    if (!name || addingToPlaylist) return;
    const ids = Array.from(selectedIds);
    setAddingToPlaylist(true);
    try {
      const newPl = await createPlaylist.mutateAsync({ data: { name } });
      let added = 0;
      for (const musicId of ids) {
        const r = await addToPlaylist.mutateAsync({ id: newPl.id, data: { musicId } }).catch(() => null);
        if (r) added++;
      }
      toast({ title: `Created "${name}" and added ${added} track${added !== 1 ? "s" : ""}` });
      setSelectedIds(new Set());
      setIsPlaylistMenuOpen(false);
      setIsCreatingNewPlaylist(false);
      setNewPlaylistDraft("");
    } catch {
      toast({ title: "Failed to create playlist", variant: "destructive" });
    } finally {
      setAddingToPlaylist(false);
    }
  };

  const handleShare = async () => {
    const ids = Array.from(selectedIds);
    const selectedTracks = filtered.filter((t) => ids.includes(t.id));
    const lines = selectedTracks.map((t) => {
      const artist = t.artist ? `${t.artist} — ` : "";
      return `${artist}${t.title}\n${t.audioUrl}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n\n"));
      toast({ title: `Copied ${selectedTracks.length} track link${selectedTracks.length !== 1 ? "s" : ""} to clipboard` });
    } catch {
      toast({ title: "Failed to copy to clipboard", variant: "destructive" });
    }
  };

  const handleExportJSON = () => {
    const ids = Array.from(selectedIds);
    const selectedTracks = filtered.filter((t) => ids.includes(t.id));
    const date = new Date().toISOString().slice(0, 10);
    exportTracksAsJson(selectedTracks, `music-export-${date}.json`);
    setExportMenuOpen(false);
  };

  const handleExportM3U = () => {
    const ids = Array.from(selectedIds);
    const selectedTracks = filtered.filter((t) => ids.includes(t.id));
    const date = new Date().toISOString().slice(0, 10);
    exportTracksAsM3U(selectedTracks, `music-export-${date}.m3u`);
    setExportMenuOpen(false);
  };

  const currentTrack = player.queue[player.currentIndex];
  const isTrackPlaying = (t: MusicTrack) => currentTrack?.id === t.id && player.isPlaying;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Settings2 className="w-8 h-8 text-primary" />
              Manage Music
            </h1>
            <p className="text-muted-foreground mt-2">
              Organize and manage your music collection.
            </p>
          </div>
          <Select value={section} onValueChange={(v) => setSection(v as ManageSection)}>
            <SelectTrigger className="w-52 mt-1 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tracks">
                <span className="flex items-center gap-2"><Music2 className="w-4 h-4" /> Music Tracks</span>
              </SelectItem>
              <SelectItem value="stations">
                <span className="flex items-center gap-2"><Radio className="w-4 h-4" /> Radio Stations</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Radio Stations section ── */}
        {section === "stations" && <>
          {/* Sticky toolbar — same structure as Music Tracks so header and
              column positions match exactly when scrolling */}
          <div className="flex items-center gap-2 sticky top-0 z-20 bg-background -mx-8 px-8 py-3 border-b border-border/40 mb-0">
            <span className="text-sm text-muted-foreground shrink-0">
              {stationTracks.length} episode{stationTracks.length !== 1 ? "s" : ""}
              {selectedIds.size > 0 && (
                <span className="ml-2 text-primary font-medium">· {selectedIds.size} selected</span>
              )}
            </span>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <div className="relative" ref={sortMenuRef}>
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
                    {(["alpha-asc", "alpha-desc", "date-desc", "date-asc"] as SortKey[]).map((key) => (
                      <button
                        key={key}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                        onClick={() => { setSortKey(key); setSortMenuOpen(false); }}
                      >
                        <Check className={`w-4 h-4 shrink-0 ${sortKey === key ? "text-primary" : "opacity-0"}`} />
                        {SORT_LABELS[key]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-sm mt-4">
            {stationTracks.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Radio className="w-10 h-10 opacity-20" />
                <p className="text-sm">No Archive.org radio episodes imported yet.</p>
                <p className="text-xs opacity-70">Go to Music → Radio → Archive.org tab to import stations.</p>
              </div>
            ) : (
              <>
                {/* Header row */}
                <div
                  className="bg-muted border-b border-border sticky top-[60px] z-10 grid text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  style={{ gridTemplateColumns: MUSIC_COL_TEMPLATE }}
                >
                  <div className="h-12 px-4 flex items-center justify-center">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </div>
                  <div className="h-12" />
                  <div className="h-12 px-4 flex items-center">Episode</div>
                  <div className="h-12 px-4 flex items-center">Duration</div>
                  <div className="h-12 px-4 flex items-center">Station</div>
                  <div className="h-12 px-4 flex items-center justify-end">Added</div>
                </div>

                {/* Groups */}
                {stationGroups.map(([station, groupTracks]) => (
                  <div key={station}>
                    {/* Station header */}
                    <div className="px-4 py-1.5 border-b border-border/50 bg-muted/30 flex items-center gap-2">
                      <Radio className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-semibold text-muted-foreground">{station}</span>
                      <span className="text-xs text-muted-foreground/50">
                        — {groupTracks.length} episode{groupTracks.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Track rows */}
                    {groupTracks.map((track) => {
                      const isSelected = selectedIds.has(track.id);
                      const playing = isTrackPlaying(track);
                      return (
                        <div
                          key={track.id}
                          className={`grid border-b border-border/50 cursor-pointer select-none ${isSelected ? "bg-primary/5" : "hover:bg-muted/40"}`}
                          style={{ gridTemplateColumns: MUSIC_COL_TEMPLATE, alignItems: "center" }}
                          onPointerDown={(e) => { pointerDownPos.current = { x: e.clientX, y: e.clientY }; }}
                          onClick={(e) => {
                            // Ignore if the pointer moved more than 5px — user was scrolling
                            if (Math.abs(e.clientX - pointerDownPos.current.x) > 5 ||
                                Math.abs(e.clientY - pointerDownPos.current.y) > 5) return;
                            const target = e.target as HTMLElement;
                            if (target.closest("a") || target.closest("button")) return;
                            const next = new Set(selectedIds);
                            next.has(track.id) ? next.delete(track.id) : next.add(track.id);
                            setSelectedIds(next);
                          }}
                        >
                          <div className="px-4 flex items-center justify-center">
                            <Checkbox
                              checked={isSelected}
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = new Set(selectedIds);
                                next.has(track.id) ? next.delete(track.id) : next.add(track.id);
                                setSelectedIds(next);
                              }}
                              aria-label={`Select ${track.title}`}
                            />
                          </div>
                          <div className="px-2 py-2">
                            <button
                              className="w-9 h-9 rounded bg-muted flex items-center justify-center group/play flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (playing) player.togglePlay();
                                else player.playSingleFromQueue(
                                  stationTracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist ?? null, audioUrl: t.audioUrl, coverImageUrl: t.coverImageUrl ?? null, durationSeconds: t.durationSeconds ?? null })),
                                  stationTracks.findIndex((t) => t.id === track.id),
                                );
                              }}
                            >
                              {playing
                                ? <Pause className="w-4 h-4 text-primary" />
                                : <Play className="w-4 h-4 text-muted-foreground group-hover/play:text-foreground" />}
                            </button>
                          </div>
                          <div className="px-4 py-2 min-w-0">
                            <p className={`font-medium truncate text-sm ${playing ? "text-primary" : ""}`}>{track.title}</p>
                          </div>
                          <div className="px-4 py-2 text-sm text-muted-foreground tabular-nums">
                            {fmtDuration(track.durationSeconds)}
                          </div>
                          <div className="px-4 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent text-accent-foreground max-w-[110px] truncate">
                              {station}
                            </span>
                          </div>
                          <div className="px-4 py-2 text-sm text-muted-foreground whitespace-nowrap text-right">
                            {format(new Date(track.createdAt), "M/d/yy")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </>}

        {section === "tracks" && <>
        {/* Toolbar */}
        <div className="flex items-center gap-2 sticky top-0 z-20 bg-background -mx-8 px-8 py-3 border-b border-border/40 mb-0">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 bg-card border-border focus-visible:ring-primary"
              placeholder="Search tracks…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          )}

          {/* Directory filter */}
          <Select
            value={activeDirectoryId}
            onValueChange={(val) => {
              setSelectedIds(new Set());
              lastClickedIndex.current = null;
              setActiveDirectoryId(val);
            }}
          >
            <SelectTrigger className="h-9 w-44 text-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks ({tracks.length})</SelectItem>
              <SelectItem value="none-dir">No Directory</SelectItem>
              {directories.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <div className="relative ml-auto shrink-0" ref={sortMenuRef}>
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
                {(["alpha-asc", "alpha-desc", "date-desc", "date-asc"] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                    onClick={() => { setSortKey(key); setSortMenuOpen(false); }}
                  >
                    <Check className={`w-4 h-4 shrink-0 ${sortKey === key ? "text-primary" : "opacity-0"}`} />
                    {SORT_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button asChild size="sm" className="shrink-0 gap-1.5">
            <Link href="/add-music">
              <Plus className="w-4 h-4" />
              Add Track
            </Link>
          </Button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border shadow-sm mt-4">

          {/* Loading skeleton */}
          {isLoading && (
            <table style={{ display: "grid", width: "100%" }}>
              <thead className="bg-muted border-b border-border" style={{ display: "grid" }}>
                <tr style={{ display: "grid", gridTemplateColumns: MUSIC_COL_TEMPLATE, width: "100%", alignItems: "center" }}>
                  <th className="h-12 px-4 flex items-center justify-center"><Checkbox disabled /></th>
                  <th className="h-12" />
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Track</th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Directory</th>
                  <th className="h-12 px-4 flex items-center justify-end text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
                </tr>
              </thead>
              <tbody style={{ display: "grid" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ display: "grid", gridTemplateColumns: MUSIC_COL_TEMPLATE, width: "100%", alignItems: "center" }} className="border-b border-border/50">
                    <td className="px-4 py-3 flex justify-center"><div className="w-4 h-4 rounded bg-muted animate-pulse" /></td>
                    <td className="px-2 py-3"><div className="w-9 h-9 rounded bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3 flex flex-col gap-1"><div className="h-4 w-48 bg-muted rounded animate-pulse" /><div className="h-3 w-24 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-12 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3 flex justify-end"><div className="h-4 w-20 bg-muted rounded animate-pulse" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Music2 className="w-10 h-10 opacity-20" />
              <p className="text-sm">
                {searchQuery ? `No tracks matching "${searchQuery}".` : "No tracks yet."}
              </p>
            </div>
          )}

          {/* Virtual table */}
          {!isLoading && filtered.length > 0 && (
            <div>
              <table style={{ display: "grid", width: "100%" }}>
                <thead
                  className="bg-muted border-b border-border"
                  style={{ display: "grid", position: "sticky", top: 60, zIndex: 1 }}
                >
                  <tr style={{ display: "grid", gridTemplateColumns: MUSIC_COL_TEMPLATE, width: "100%", alignItems: "center" }}>
                    <th className="h-12 px-4 flex items-center justify-center">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                    </th>
                    <th className="h-12" />
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Track</th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Directory</th>
                    <th className="h-12 px-4 flex items-center justify-end text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
                  </tr>
                </thead>
                <tbody
                  onPointerDown={(e) => { pointerDownPos.current = { x: e.clientX, y: e.clientY }; }}
                  style={{
                    display: "grid",
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const track = filtered[virtualRow.index]!;
                    const isSelected = selectedIds.has(track.id);
                    const playing = isTrackPlaying(track);
                    const dir = directories.find((d) => d.id === track.directoryId);
                    return (
                      <tr
                        key={track.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className={`border-b border-border/50 cursor-pointer select-none ${isSelected ? "bg-primary/5" : "hover:bg-muted/40"}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: MUSIC_COL_TEMPLATE,
                          position: "absolute",
                          transform: `translateY(${virtualRow.start}px)`,
                          width: "100%",
                          alignItems: "center",
                        }}
                        onClick={(e) => {
                          if (Math.abs(e.clientX - pointerDownPos.current.x) > 5 ||
                              Math.abs(e.clientY - pointerDownPos.current.y) > 5) return;
                          const target = e.target as HTMLElement;
                          if (target.closest("a") || target.closest("button")) return;
                          toggleSelect(track.id, virtualRow.index, e.shiftKey);
                        }}
                      >
                        <td className="px-4 flex items-center justify-center">
                          <Checkbox
                            checked={isSelected}
                            onClick={(e) => { e.stopPropagation(); toggleSelect(track.id, virtualRow.index, (e as React.MouseEvent).shiftKey); }}
                            aria-label={`Select ${track.title}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            className="w-9 h-9 rounded bg-muted flex items-center justify-center group/play overflow-hidden relative flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (playing) player.togglePlay();
                              else player.playSingleFromQueue(
                                filtered.map((t) => ({ id: t.id, title: t.title, artist: t.artist ?? null, audioUrl: t.audioUrl, coverImageUrl: t.coverImageUrl ?? null, durationSeconds: t.durationSeconds ?? null })),
                                virtualRow.index,
                              );
                            }}
                          >
                            {track.coverImageUrl ? (
                              <img src={track.coverImageUrl} alt="" className="w-full h-full object-cover absolute inset-0" />
                            ) : null}
                            <span className={`relative z-10 transition-opacity ${track.coverImageUrl ? "opacity-0 group-hover/play:opacity-100" : ""}`}>
                              {playing
                                ? <Pause className="w-4 h-4 text-primary" />
                                : <Play className="w-4 h-4 text-muted-foreground group-hover/play:text-foreground" />}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-2 min-w-0">
                          <p className={`font-medium truncate text-sm ${playing ? "text-primary" : ""}`}>{track.title}</p>
                          {track.artist && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{track.artist}</p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-muted-foreground tabular-nums">
                          {fmtDuration(track.durationSeconds)}
                        </td>
                        <td className="px-4 py-2">
                          {dir ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-accent text-accent-foreground truncate max-w-[110px]">
                              {dir.name}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-muted-foreground whitespace-nowrap text-right">
                          {format(new Date(track.createdAt), "M/d/yy")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-3 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading more…
                </div>
              )}
            </div>
          )}
        </div>
        </>}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} track{selectedIds.size !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected tracks and remove them from all playlists. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleBulkDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move to directory */}
      <Dialog open={isDirectoryDialogOpen} onOpenChange={(open) => { setIsDirectoryDialogOpen(open); if (!open) setNewDirectoryId("none"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedIds.size} track{selectedIds.size !== 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              Select a directory to move the selected tracks into.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newDirectoryId} onValueChange={setNewDirectoryId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a directory…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Directory (remove from current)</SelectItem>
                {directories.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDirectoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleBulkDirectory()}>Move Tracks</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating selection bar */}
      {hasSelection && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
            <span className="text-sm font-semibold pl-1 pr-2">
              {selectedIds.size} selected
            </span>
            <div className="h-5 w-px bg-primary-foreground/30" />

            {/* Move to directory */}
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsDirectoryDialogOpen(true)}>
              <FolderOpen className="w-4 h-4 mr-1.5" />
              Move
            </Button>

            {/* Add to playlist */}
            <div className="relative" ref={playlistMenuRef}>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => setIsPlaylistMenuOpen((o) => !o)}
                disabled={addingToPlaylist}
              >
                <ListMusic className="w-4 h-4 mr-1.5" />
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
                          onClick={() => void handleAddToPlaylist(pl.id, pl.name)}
                          disabled={addingToPlaylist}
                        >
                          <ListMusic className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{pl.name}</span>
                          <span className="text-xs text-muted-foreground">{pl.trackCount} track{pl.trackCount !== 1 ? "s" : ""}</span>
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
                          if (e.key === "Enter") void handleCreateAndAddToPlaylist();
                          if (e.key === "Escape") { setIsCreatingNewPlaylist(false); setNewPlaylistDraft(""); }
                        }}
                        className="flex-1 bg-transparent text-sm outline-none border border-border rounded-md px-2 py-1 placeholder:text-muted-foreground"
                        disabled={addingToPlaylist}
                      />
                      <button
                        onClick={() => void handleCreateAndAddToPlaylist()}
                        disabled={!newPlaylistDraft.trim() || addingToPlaylist}
                        className="text-xs font-medium text-primary disabled:opacity-40 px-1"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setIsCreatingNewPlaylist(false); setNewPlaylistDraft(""); }}
                        className="text-xs text-muted-foreground px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left text-primary font-medium"
                      onClick={() => setIsCreatingNewPlaylist(true)}
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      New Playlist
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Share (copy links) */}
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => void handleShare()}>
              <Share2 className="w-4 h-4 mr-1.5" />
              Share
            </Button>

            {/* Export dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full gap-1"
                onClick={() => setExportMenuOpen((o) => !o)}
              >
                <Download className="w-4 h-4 mr-0.5" />
                Export
                <ChevronDown className="w-3 h-3 opacity-70" />
              </Button>
              {exportMenuOpen && (
                <div className="absolute bottom-full mb-2 right-0 w-48 bg-popover text-popover-foreground border rounded-xl shadow-xl py-1 z-50">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                    onClick={handleExportJSON}
                  >
                    <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                    Export as JSON
                  </button>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                    onClick={handleExportM3U}
                  >
                    <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                    Export as M3U
                  </button>
                </div>
              )}
            </div>

            {/* Delete */}
            <Button size="sm" variant="destructive" className="rounded-full" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>

            <div className="h-5 w-px bg-primary-foreground/30" />
            <button
              onClick={() => { setSelectedIds(new Set()); lastClickedIndex.current = null; }}
              className="text-xs opacity-70 hover:opacity-100 transition-opacity px-1"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default ManageMusic;
