import { useState, useCallback, useRef, useEffect } from "react";
import { openUrl } from "@/lib/openUrl";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useGetPlaylist,
  useRemoveVideoFromPlaylist,
  useReorderPlaylist,
  useDeletePlaylist,
  useUpdatePlaylist,
  useDeleteVideo,
  getListPlaylistsQueryKey,
  getGetPlaylistQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, ListVideo, Trash2, ExternalLink, GripVertical, Play, Download, Share2, Send, X, Pencil, Check, Tv, Loader2 } from "lucide-react";
import { fetchLibraryExport, triggerJsonDownload } from "./settings";
import { getVideoThumbnail } from "@/lib/youtube";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { compressAndUploadPhoto } from "@/lib/upload";

interface PlaylistVideo {
  id: number;
  title: string;
  youtubeUrl: string;
  thumbnailUrl: string | null;
  category: string;
}

function SortableVideoRow({
  video,
  onRemove,
  onNavigate,
  removing,
}: {
  video: PlaylistVideo;
  onRemove: (id: number, title: string) => void;
  onNavigate: (id: number) => void;
  removing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const thumb = video.thumbnailUrl ?? getVideoThumbnail(video.youtubeUrl);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors group bg-card"
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
        className="w-28 h-16 rounded-lg overflow-hidden bg-muted shrink-0 cursor-pointer"
        onClick={() => onNavigate(video.id)}
      >
        {thumb ? (
          // object-contain, not object-cover -- episode thumbnails saved
          // from streaming sites (Tubi, etc.) don't always share this box's
          // aspect ratio, and cropping to fill risks cutting into whatever
          // part of the image actually matters. Padding bars beat that.
          <img src={thumb} alt={video.title} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            No thumb
          </div>
        )}
      </div>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onNavigate(video.id)}
      >
        <p className="font-medium text-sm truncate leading-snug">{video.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{video.category}</p>
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button type="button" onClick={() => openUrl(video.youtubeUrl)} title="Open from Source">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          title="Remove from playlist"
          onClick={() => onRemove(video.id, video.title)}
          disabled={removing}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

type TmdbResult = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  overview: string;
  posterUrl: string | null;
  year: string;
};

async function searchTmdbShows(q: string): Promise<TmdbResult[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q.trim())}`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json() as { results?: TmdbResult[] };
  return (data.results ?? []).filter((r) => r.mediaType === "tv");
}

function ShowPosterPicker({ playlistId, name, posterUrl }: { playlistId: number; name: string; posterUrl: string | null | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updatePlaylist = useUpdatePlaylist();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPosterUrl, setLocalPosterUrl] = useState<string | null | undefined>(posterUrl);

  const runSearch = async () => {
    setSearching(true);
    try { setResults(await searchTmdbShows(query)); }
    finally { setSearching(false); }
  };

  useEffect(() => {
    if (open && results.length === 0 && !searching) void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyPoster = (url: string | null) => {
    setLocalPosterUrl(url);
    setOpen(false);
    updatePlaylist.mutate(
      { id: playlistId, data: { posterUrl: url } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetPlaylistQueryKey(playlistId), updated);
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          toast({ title: url ? "Poster updated" : "Poster removed" });
        },
        onError: () => {
          setLocalPosterUrl(posterUrl);
          toast({ title: "Failed to update poster", variant: "destructive" });
        },
      },
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPoster(true);
    try {
      const { imageUrl } = await compressAndUploadPhoto(file);
      applyPoster(imageUrl);
    } catch {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploadingPoster(false);
      e.target.value = "";
    }
  };

  const handlePasteClick = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          setUploadingPoster(true);
          try {
            const { imageUrl } = await compressAndUploadPhoto(new File([blob], "pasted.jpg", { type: imageType }));
            applyPoster(imageUrl);
          } finally {
            setUploadingPoster(false);
          }
          return;
        }
      }
      toast({ title: "No image found in clipboard", variant: "destructive" });
    } catch (err) {
      setUploadingPoster(false);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast({ title: "Press Ctrl+V to paste your image", description: "Click anywhere on this page (not in a text field), then press Ctrl+V." });
      } else {
        toast({ title: "No image found in clipboard", variant: "destructive" });
      }
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        {localPosterUrl ? (
          <img src={localPosterUrl} alt="" className="w-16 h-24 object-cover rounded-lg border border-border shrink-0" />
        ) : (
          <div className="w-16 h-24 rounded-lg bg-muted flex items-center justify-center border border-border shrink-0">
            <Tv className="w-6 h-6 text-muted-foreground/40" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {localPosterUrl ? "Change poster" : "Set poster"}
          </Button>
          {localPosterUrl && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => applyPoster(null)} disabled={updatePlaylist.isPending || uploadingPoster}>
              Remove poster
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingPoster || updatePlaylist.isPending}>
            {uploadingPoster ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Upload file
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handlePasteClick()} disabled={uploadingPoster || updatePlaylist.isPending}>
            Paste image
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFileChange(e)} />
        </div>
      </div>

      {open && (
        <div className="mt-3 bg-card rounded-xl border border-primary/20 shadow-sm overflow-hidden max-w-md">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <input
              className="flex-1 text-sm bg-transparent outline-none"
              placeholder="Search TMDB…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
            />
            <Button size="sm" onClick={() => void runSearch()} disabled={searching}>
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
            {results.length === 0 && !searching && (
              <p className="px-3 py-3 text-xs text-muted-foreground">No results</p>
            )}
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => applyPoster(result.posterUrl)}
                disabled={!result.posterUrl || updatePlaylist.isPending}
                className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
              >
                {result.posterUrl ? (
                  <img src={result.posterUrl} alt="" className="w-10 h-14 object-cover rounded shrink-0 border border-border/50" />
                ) : (
                  <div className="w-10 h-14 rounded bg-muted flex items-center justify-center shrink-0">
                    <Tv className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {result.title}
                    {result.year && <span className="text-muted-foreground font-normal ml-1">({result.year})</span>}
                  </p>
                  {result.overview && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{result.overview}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaylistDetail() {
  const [, params] = useRoute("/playlists/:id");
  const id = params ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  const { data: playlist, isLoading } = useGetPlaylist(id, {
    // refetchOnWindowFocus is off app-wide, but this page's currentEpisode
    // can change server-side while the user is off on Tubi in another tab
    // -- refetch when they switch back instead of requiring a manual
    // reload. "always" (not just `true`) since the global 5-minute
    // staleTime would otherwise skip the refetch for anyone back within
    // that window, which is the common case.
    query: { queryKey: getGetPlaylistQueryKey(id), enabled: !!id, refetchOnWindowFocus: "always" },
  });

  const [localVideos, setLocalVideos] = useState<PlaylistVideo[] | null>(null);
  const videos: PlaylistVideo[] = localVideos ?? (playlist?.videos as PlaylistVideo[] | undefined) ?? [];

  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
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

  const toggleShareFriend = (friendId: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId); else next.add(friendId);
      return next;
    });
  };

  const handleShareSend = async () => {
    if (!playlist || selectedFriendIds.size === 0) return;
    setSharing(true);
    try {
      const results = await Promise.all(
        Array.from(selectedFriendIds).map(async (friendId) => {
          const res = await fetch("/api/playlist-shares", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipientId: friendId, playlistId: id, message: shareMessage || undefined }),
          });
          const data = await res.json().catch(() => ({})) as { error?: string };
          return { ok: res.ok, error: data.error };
        }),
      );
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (okCount > 0) {
        toast({ title: `Shared with ${okCount} friend${okCount !== 1 ? "s" : ""}${failCount > 0 ? ` (${failCount} failed)` : ""}` });
      }
      if (okCount === 0) {
        toast({ title: results.find((r) => !r.ok)?.error ?? "Failed to share", variant: "destructive" });
      }
      if (failCount === 0) {
        setShareMenuOpen(false);
        setShareMessage("");
        setSelectedFriendIds(new Set());
      }
    } catch (err) {
      toast({ title: "Failed to share", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (!playlist) return;
    setIsExporting(true);
    try {
      const data = await fetchLibraryExport();
      const filteredPlaylist = data.playlists.find((p) => p.name === playlist.name);
      if (!filteredPlaylist) { toast({ title: "No export data found", variant: "destructive" }); return; }
      const referencedUrls = new Set(filteredPlaylist.videoUrls);
      const filteredVideos = data.videos.filter((v) => referencedUrls.has(v.youtubeUrl));
      const slug = playlist.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      triggerJsonDownload(
        { version: 1, exportedAt: data.exportedAt, videos: filteredVideos, playlists: [filteredPlaylist] },
        `web-vault-${slug}-${new Date().toISOString().slice(0, 10)}.json`
      );
      toast({ title: `Exported "${playlist.name}" with ${filteredVideos.length} video${filteredVideos.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const removeVideo = useRemoveVideoFromPlaylist();
  const deleteVideo = useDeleteVideo();
  const reorder = useReorderPlaylist();
  const deletePlaylist = useDeletePlaylist();
  const updatePlaylist = useUpdatePlaylist();

  // Only ever used for regular (non-show) playlists now -- shows don't
  // render an episode list at all, since resuming a show is driven by the
  // browser extension reporting Tubi navigation (see track-episode),
  // not by clicking through episodes here.
  const handleEpisodeOpen = useCallback((videoId: number) => {
    setLocation(`/video/${videoId}?playlist=${id}`);
  }, [id, setLocation]);

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
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetPlaylistQueryKey(id), updated);
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          toast({ title: "Playlist renamed" });
        },
        onError: () => toast({ title: "Failed to rename playlist", variant: "destructive" }),
        onSettled: () => setIsEditingName(false),
      }
    );
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAlphabetizeDialog, setShowAlphabetizeDialog] = useState(false);

  const handleAlphabetize = () => {
    const sorted = [...videos].sort((a, b) => a.title.localeCompare(b.title));
    setLocalVideos(sorted);
    reorder.mutate(
      { id, data: { videoIds: sorted.map((v) => v.id) } },
      {
        onSuccess: (data) => {
          setLocalVideos(null);
          queryClient.setQueryData(getGetPlaylistQueryKey(id), data);
          toast({ title: "Playlist alphabetized" });
        },
        onError: () => {
          setLocalVideos(null);
          toast({ title: "Failed to alphabetize playlist", variant: "destructive" });
        },
      }
    );
  };

  const confirmDeletePlaylist = () => {
    if (!playlist) return;
    deletePlaylist.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          toast({ title: `Deleted "${playlist.name}"` });
          setLocation("/settings");
        },
        onError: () => toast({ title: "Failed to delete playlist", variant: "destructive" }),
      }
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleRemove = (videoId: number, title: string) => {
    // Episodes aren't meant to exist outside their show -- merely unlinking
    // one (like a regular playlist) would leave an orphaned video that
    // still blocks re-adding the same URL ("already in your library") and
    // reappears in the main Library grid, exactly what shows are meant to
    // stay out of. So for a show, "remove" means delete the video outright.
    if (playlist?.isShow) {
      deleteVideo.mutate(
        { id: videoId },
        {
          onSuccess: () => {
            setLocalVideos(null);
            queryClient.invalidateQueries({ queryKey: getGetPlaylistQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
            toast({ title: `Deleted "${title}"` });
          },
          onError: () => toast({ title: "Failed to delete video", variant: "destructive" }),
        }
      );
      return;
    }

    removeVideo.mutate(
      { id, videoId },
      {
        onSuccess: () => {
          setLocalVideos(null);
          queryClient.invalidateQueries({ queryKey: getGetPlaylistQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          toast({ title: `Removed "${title}" from playlist` });
        },
        onError: () => toast({ title: "Failed to remove video", variant: "destructive" }),
      }
    );
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = videos.findIndex((v) => v.id === active.id);
      const newIndex = videos.findIndex((v) => v.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(videos, oldIndex, newIndex);
      setLocalVideos(reordered);

      reorder.mutate(
        { id, data: { videoIds: reordered.map((v) => v.id) } },
        {
          onSuccess: (data) => {
            setLocalVideos(null);
            queryClient.setQueryData(getGetPlaylistQueryKey(id), data);
          },
          onError: () => {
            setLocalVideos(null);
            toast({ title: "Failed to save new order", variant: "destructive" });
          },
        }
      );
    },
    [videos, id, reorder, queryClient, toast]
  );

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
                <ListVideo className="w-8 h-8 text-primary shrink-0" />
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
                    {playlist.isShow && <Tv className="w-6 h-6 text-primary shrink-0" />}
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
              {playlist.description && (
                <p className="text-muted-foreground mt-2">{playlist.description}</p>
              )}
              {playlist.isShow && (
                <div className="mt-4">
                  <ShowPosterPicker playlistId={id} name={playlist.name} posterUrl={playlist.posterUrl} />
                  {playlist.currentEpisode?.title && (
                    <p className="text-sm text-muted-foreground mt-3">
                      Currently on: <span className="text-foreground">{playlist.currentEpisode.title}</span>
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {videos.length} {playlist.isShow ? "episode" : "video"}{videos.length !== 1 ? "s" : ""}
                  {!playlist.isShow && videos.length > 1 && (
                    <span className="ml-2 text-muted-foreground/60">· drag to reorder</span>
                  )}
                </p>
                {!playlist.isShow && videos.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setLocation(`/video/${videos[0].id}?playlist=${id}&autoplay=1`);
                    }}
                  >
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    Play All
                  </Button>
                )}
                {!playlist.isShow && videos.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAlphabetizeDialog(true)}
                    disabled={reorder.isPending}
                    title="Sort videos alphabetically"
                  >
                    A→Z
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting}
                  title="Export this playlist as a shareable JSON file"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? "Exporting…" : "Export"}
                </Button>

                <div className="relative" ref={shareMenuRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShareMenuOpen((o) => !o)}
                    title="Share playlist with a friend"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>

                  {shareMenuOpen && (
                    <div className="absolute left-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                      <div className="px-4 pt-3 pb-2 border-b border-border">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Share with Friends</p>
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
                            const checked = selectedFriendIds.has(f.id);
                            return (
                              <label
                                key={f.id}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors cursor-pointer"
                              >
                                <Checkbox checked={checked} onCheckedChange={() => toggleShareFriend(f.id)} disabled={sharing} />
                                <span className="text-sm truncate">{name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="px-4 py-2 border-t border-border flex items-center justify-between gap-2">
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
                          disabled={sharing}
                          onClick={() => { setShareMenuOpen(false); setSelectedFriendIds(new Set()); }}
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={sharing || selectedFriendIds.size === 0}
                          onClick={() => void handleShareSend()}
                        >
                          <Send className="w-3.5 h-3.5" />
                          {sharing ? "Sending…" : `Send${selectedFriendIds.size > 0 ? ` to ${selectedFriendIds.size}` : ""}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {playlist.isShow && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deletePlaylist.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Show
                  </Button>
                )}
              </div>
            </div>

            {playlist.isShow ? (
              videos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Tv className="w-12 h-12 text-muted-foreground/40" />
                  <p className="font-medium">No episodes yet</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Episodes are added automatically by the URLinc browser extension when you save them from Tubi.
                  </p>
                </div>
              )
            ) : videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <ListVideo className="w-12 h-12 text-muted-foreground/40" />
                <p className="font-medium">This playlist is empty</p>
                <p className="text-sm text-muted-foreground">
                  Open any video and add it to this playlist from there.
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <Button variant="outline" onClick={() => setLocation("/")}>
                    Browse Library
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
                    items={videos.map((v) => v.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-border">
                      {videos.map((video) => (
                        <SortableVideoRow
                          key={video.id}
                          video={video}
                          onRemove={handleRemove}
                          onNavigate={handleEpisodeOpen}
                          removing={removeVideo.isPending}
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
              This will sort all videos A → Z by title. Your current Playlist order will be permanently lost and cannot be undone.
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
              This will permanently delete the playlist. Your videos will not be removed from the library. This action cannot be undone.
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
    </Layout>
  );
}
