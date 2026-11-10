import { useState, useCallback, useRef, useEffect } from "react";
import { openUrl } from "@/lib/openUrl";
import { useRoute, useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useGetMusicPlaylist,
  useRemoveTrackFromMusicPlaylist,
  useReorderMusicPlaylist,
  useDeleteMusicPlaylist,
  useUpdateMusicPlaylist,
  getListMusicPlaylistsQueryKey,
  getGetMusicPlaylistQueryKey,
} from "@workspace/api-client-react";
import type { MusicTrack, MusicPlaylistDetail } from "@workspace/api-client-react";
import { ArrowLeft, ListMusic, Trash2, ExternalLink, GripVertical, Play, Download, Share2, Send, X, Pencil, Check, Music2 } from "lucide-react";
import { triggerJsonDownload } from "./settings";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import type { MusicTrack as PlayerTrack } from "@/contexts/MusicPlayerContext";

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return "--:--";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function toPlayerTrack(t: MusicTrack): PlayerTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist ?? null,
    audioUrl: t.audioUrl,
    coverImageUrl: t.coverImageUrl ?? null,
    durationSeconds: t.durationSeconds ?? null,
  };
}

function SortableTrackRow({
  track,
  onRemove,
  onPlay,
  removing,
  isActive,
  isHighlighted,
}: {
  track: MusicTrack;
  onRemove: (id: number, title: string) => void;
  onPlay: (id: number) => void;
  removing: boolean;
  isActive: boolean;
  isHighlighted?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      id={`track-${track.id}`}
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors group bg-card ${
        isHighlighted ? "ring-1 ring-inset ring-primary/40 bg-primary/10" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div
        className="w-28 h-16 rounded-lg overflow-hidden bg-muted shrink-0 cursor-pointer flex items-center justify-center"
        onClick={() => onPlay(track.id)}
      >
        {track.coverImageUrl ? (
          <img src={track.coverImageUrl} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <Music2 className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onPlay(track.id)}
      >
        <p className={`font-medium text-sm truncate leading-snug ${isActive ? "text-primary" : ""}`}>
          {track.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{track.artist ?? "—"}</p>
      </div>

      <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:block">
        {fmtDuration(track.durationSeconds)}
      </span>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button type="button" onClick={() => openUrl(track.audioUrl)} title="Open source">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          title="Remove from playlist"
          onClick={() => onRemove(track.id, track.title)}
          disabled={removing}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function MusicPlaylistDetailPage() {
  const [, params] = useRoute("/music/playlists/:id");
  const id = params ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const player = useMusicPlayer();

  const [highlightId, setHighlightId] = useState<number | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const hid = params.get("highlight");
    if (!hid) return;
    const numId = parseInt(hid, 10);
    if (isNaN(numId)) return;
    setHighlightId(numId);
    const scrollTimer = setTimeout(() => {
      document.getElementById(`track-${numId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(scrollTimer);
  }, [searchParams]);

  const { data: playlist, isLoading } = useGetMusicPlaylist(id, {
    query: { queryKey: getGetMusicPlaylistQueryKey(id), enabled: !!id },
  });

  const [localTracks, setLocalTracks] = useState<MusicTrack[] | null>(null);
  const tracks: MusicTrack[] = localTracks ?? (playlist?.tracks ?? []);

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
    if (!shareMenuOpen || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setFriends(data as typeof friends); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [shareMenuOpen, friendsLoaded]);

  const handleShare = async (friendId: string) => {
    if (!playlist) return;
    setSharing(friendId);
    try {
      const msg = [
        `${playlist.name}`,
        shareMessage ? `\n${shareMessage}` : "",
        "\n",
        ...tracks.map((t) => `${t.artist ? `${t.artist} — ` : ""}${t.title}\n${t.audioUrl}`),
      ].join("\n").trim();
      await navigator.clipboard.writeText(msg);
      toast({ title: "Playlist copied to clipboard" });
      setShareMenuOpen(false);
      setShareMessage("");
    } catch {
      toast({ title: "Failed to copy to clipboard", variant: "destructive" });
    } finally {
      setSharing(null);
    }
  };

  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (!playlist) return;
    setIsExporting(true);
    try {
      const res = await fetch("/api/music/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json() as { version: number; exportedAt: string; tracks: Array<{ title: string; artist?: string | null; audioUrl: string; coverImageUrl?: string | null; durationSeconds?: number | null }>; playlists: Array<{ name: string; description?: string | null; trackUrls: string[] }> };
      const filteredPlaylist = data.playlists.find((p) => p.name === playlist.name);
      if (!filteredPlaylist) { toast({ title: "No export data found", variant: "destructive" }); return; }
      const referencedUrls = new Set(filteredPlaylist.trackUrls);
      const filteredTracks = data.tracks.filter((t) => referencedUrls.has(t.audioUrl));
      const slug = playlist.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      triggerJsonDownload(
        { version: 1, exportedAt: data.exportedAt, tracks: filteredTracks, playlists: [filteredPlaylist] },
        `music-${slug}-${new Date().toISOString().slice(0, 10)}.json`,
      );
      toast({ title: `Exported "${playlist.name}" with ${filteredTracks.length} track${filteredTracks.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const removeTrack = useRemoveTrackFromMusicPlaylist();
  const reorder = useReorderMusicPlaylist();
  const deletePlaylist = useDeleteMusicPlaylist();
  const updatePlaylist = useUpdateMusicPlaylist();

  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startEditName = () => {
    setEditNameValue(playlist?.name ?? "");
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const saveEditName = () => {
    const trimmed = editNameValue.trim();
    if (!trimmed || !playlist || trimmed === playlist.name) { setIsEditingName(false); return; }
    updatePlaylist.mutate(
      { id, data: { name: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMusicPlaylistQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListMusicPlaylistsQueryKey() });
          toast({ title: "Playlist renamed" });
        },
        onError: () => toast({ title: "Failed to rename playlist", variant: "destructive" }),
        onSettled: () => setIsEditingName(false),
      },
    );
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAlphabetizeDialog, setShowAlphabetizeDialog] = useState(false);

  const handleAlphabetize = () => {
    const sorted = [...tracks].sort((a, b) => a.title.localeCompare(b.title));
    setLocalTracks(sorted);
    reorder.mutate(
      { id, data: { musicIds: sorted.map((t) => t.id) } },
      {
        onSuccess: (data: MusicPlaylistDetail) => {
          setLocalTracks(null);
          queryClient.setQueryData(getGetMusicPlaylistQueryKey(id), data);
          toast({ title: "Playlist alphabetized" });
        },
        onError: () => {
          setLocalTracks(null);
          toast({ title: "Failed to alphabetize playlist", variant: "destructive" });
        },
      },
    );
  };

  const confirmDeletePlaylist = () => {
    if (!playlist) return;
    deletePlaylist.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMusicPlaylistsQueryKey() });
          toast({ title: `Deleted "${playlist.name}"` });
          setLocation("/music");
        },
        onError: () => toast({ title: "Failed to delete playlist", variant: "destructive" }),
      },
    );
  };

  const [showDeleteShowDialog, setShowDeleteShowDialog] = useState(false);
  const [isDeletingShow, setIsDeletingShow] = useState(false);

  // For an imported show (playlist.sourceUrl set), the plain playlist delete
  // above only removes the grouping and leaves the episode files sitting
  // orphaned in the library -- re-importing later would then see them as
  // "already have this" and come back empty. This deletes the episodes too
  // (skipping any that happen to also be in another playlist), so the show
  // goes back to looking brand new in Old Radio World's catalog.
  const confirmDeleteShow = async () => {
    if (!playlist) return;
    setIsDeletingShow(true);
    try {
      const res = await fetch("/api/music-playlists/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getListMusicPlaylistsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ["listMusic"] });
      toast({ title: `Deleted "${playlist.name}" and its episodes` });
      setLocation("/music?tab=radio");
    } catch {
      toast({ title: "Failed to delete show", variant: "destructive" });
    } finally {
      setIsDeletingShow(false);
      setShowDeleteShowDialog(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleRemove = (musicId: number, title: string) => {
    removeTrack.mutate(
      { id, musicId },
      {
        onSuccess: () => {
          setLocalTracks(null);
          queryClient.invalidateQueries({ queryKey: getGetMusicPlaylistQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListMusicPlaylistsQueryKey() });
          toast({ title: `Removed "${title}" from playlist` });
        },
        onError: () => toast({ title: "Failed to remove track", variant: "destructive" }),
      },
    );
  };

  const handlePlay = useCallback((trackId: number) => {
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    // Load full playlist so next/prev navigate the playlist; singlePlayRef
    // stops auto-advance when the track ends naturally.
    player.playSingleFromQueue(tracks.map(toPlayerTrack), idx, `/music/playlists/${id}`);
  }, [tracks, player, id]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = tracks.findIndex((t) => t.id === active.id);
      const newIndex = tracks.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(tracks, oldIndex, newIndex);
      setLocalTracks(reordered);

      reorder.mutate(
        { id, data: { musicIds: reordered.map((t) => t.id) } },
        {
          onSuccess: (data: MusicPlaylistDetail) => {
            setLocalTracks(null);
            queryClient.setQueryData(getGetMusicPlaylistQueryKey(id), data);
          },
          onError: () => {
            setLocalTracks(null);
            toast({ title: "Failed to save new order", variant: "destructive" });
          },
        },
      );
    },
    [tracks, id, reorder, queryClient, toast],
  );

  const currentTrackId = player.queue[player.currentIndex]?.id;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            Loading…
          </div>
        )}

        {!isLoading && playlist && (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-3 group">
                <ListMusic className="w-8 h-8 text-primary shrink-0" />
                {isEditingName ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      ref={nameInputRef}
                      className="text-3xl font-display font-bold bg-transparent border-b-2 border-primary outline-none flex-1 min-w-0"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onBlur={saveEditName}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveEditName(); }
                        if (e.key === "Escape") setIsEditingName(false);
                      }}
                    />
                    <button onMouseDown={(e) => e.preventDefault()} onClick={saveEditName} className="text-primary hover:opacity-70 shrink-0" title="Save">
                      <Check className="w-5 h-5" />
                    </button>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => setIsEditingName(false)} className="text-muted-foreground hover:text-foreground shrink-0" title="Cancel">
                      <X className="w-5 h-5" />
                    </button>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => setShowDeleteDialog(true)} disabled={deletePlaylist.isPending} className="text-destructive hover:opacity-70 shrink-0 ml-1 disabled:opacity-40" title="Delete playlist">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-3xl font-display font-bold truncate">{playlist.name}</h1>
                    <button
                      onClick={startEditName}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      title="Rename playlist"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {playlist.description && (() => {
                const isLong = playlist.description.split("\n").length > 3 || playlist.description.length > 240;
                return (
                  <div className="mt-2">
                    <p className={`text-muted-foreground text-sm whitespace-pre-line ${!isDescExpanded && isLong ? "line-clamp-3" : ""}`}>
                      {playlist.description}
                    </p>
                    {isLong && (
                      <button
                        onClick={() => setIsDescExpanded((v) => !v)}
                        className="text-xs text-primary hover:opacity-70 mt-1 transition-opacity"
                      >
                        {isDescExpanded ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {tracks.length} track{tracks.length !== 1 ? "s" : ""}
                  {tracks.length > 1 && (
                    <span className="ml-2 text-muted-foreground/60">· drag to reorder</span>
                  )}
                </p>
                {tracks.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => player.playQueue(tracks.map(toPlayerTrack), 0, `/music/playlists/${id}`)}
                  >
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    Play All
                  </Button>
                )}
                {playlist.sourceUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteShowDialog(true)}
                    disabled={isDeletingShow}
                    title="Delete this whole show and its episodes"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Show
                  </Button>
                )}
                {/* Export/Share/sort don't add anything for an imported show
                    playlist -- everyone already has the same access to the
                    source catalog it came from -- so they're hidden there
                    and only shown for playlists you actually built yourself. */}
                {!playlist.sourceUrl && tracks.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAlphabetizeDialog(true)}
                    disabled={reorder.isPending}
                    title="Sort tracks alphabetically"
                  >
                    A→Z
                  </Button>
                )}
                {!playlist.sourceUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting}
                  title="Export this playlist as JSON"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? "Exporting…" : "Export"}
                </Button>
                )}

                {!playlist.sourceUrl && (
                <div className="relative" ref={shareMenuRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShareMenuOpen((o) => !o)}
                    title="Share playlist"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>

                  {shareMenuOpen && (
                    <div className="absolute left-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                      <div className="px-4 pt-3 pb-2 border-b border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Share Playlist</p>
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
                                onClick={() => void handleShare(f.id)}
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

            {tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <ListMusic className="w-12 h-12 text-muted-foreground/40" />
                <p className="font-medium">This playlist is empty</p>
                <p className="text-sm text-muted-foreground">
                  Open any track in Manage Music and add it to this playlist from there.
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <Button variant="outline" onClick={() => setLocation("/music")}>
                    Browse Music
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deletePlaylist.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Playlist
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={tracks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-border">
                      {tracks.map((track) => (
                        <SortableTrackRow
                          key={track.id}
                          track={track}
                          onRemove={handleRemove}
                          onPlay={handlePlay}
                          removing={removeTrack.isPending}
                          isActive={currentTrackId === track.id}
                          isHighlighted={highlightId === track.id}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={showAlphabetizeDialog} onOpenChange={setShowAlphabetizeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle>Alphabetize this playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sort all tracks A → Z by title. Your current playlist order will be permanently lost and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowAlphabetizeDialog(false); handleAlphabetize(); }}
            >
              Alphabetize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle>Delete playlist "{playlist?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the playlist. Your tracks will not be removed from the library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeletePlaylist}
              disabled={deletePlaylist.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteShowDialog} onOpenChange={setShowDeleteShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle>Delete "{playlist?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the show and its {tracks.length} episode{tracks.length !== 1 ? "s" : ""} from your library
              (any episode also saved in another playlist is left alone). You can re-import it from Old Radio World
              any time. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteShow()}
              disabled={isDeletingShow}
            >
              Delete Show
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
