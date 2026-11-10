import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Layout } from "@/components/layout";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CREATE_NEW = "__create_new__";

function CategorySelect({
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

  const allCategories = [
    ...categories,
    ...localCategories.filter((c) => !categories.includes(c)),
  ];

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
      onValueChange={(val) => { if (val === CREATE_NEW) setCreating(true); else onChange(val); }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a category…" />
      </SelectTrigger>
      <SelectContent>
        {allCategories.map((cat) => (
          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
        ))}
        {allCategories.length > 0 && <SelectSeparator />}
        <SelectItem value={CREATE_NEW} className="text-primary font-medium">
          + Create New Category
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
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
  useInfiniteListVideos,
  useGetVideoStats,
  useGetVideoCount,
  getGetVideoCountQueryKey,
  useBulkDeleteVideos,
  useBulkRestoreVideos,
  useBulkUpdateCategory,
  useListPlaylists,
  useCreatePlaylist,
  useAddVideoToPlaylist,
  getGetVideoStatsQueryKey,
  getGetRecentVideosQueryKey,
  getListPlaylistsQueryKey,
  type Video,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { getYoutubeThumbnailUrl } from "@/lib/youtube";
import { AdaptiveThumbnail } from "@/components/AdaptiveThumbnail";
import { Trash2, FolderOpen, ExternalLink, Settings2, Edit, Filter, ListVideo, Plus, ArrowUpDown, Check, Search, X, Loader2 } from "lucide-react";

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

type SortKey = "alpha-asc" | "alpha-desc" | "date-desc" | "date-asc";
const SORT_LABELS: Record<SortKey, string> = {
  "alpha-asc": "A → Z",
  "alpha-desc": "Z → A",
  "date-desc": "Newest First",
  "date-asc": "Oldest First",
};
function sortVideos<T extends { title: string; createdAt: string }>(arr: T[], key: SortKey): T[] {
  return [...arr].sort((a, b) => {
    if (key === "alpha-asc") return a.title.localeCompare(b.title);
    if (key === "alpha-desc") return b.title.localeCompare(a.title);
    if (key === "date-asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const VIDEO_COL_TEMPLATE = "48px minmax(0,1fr) 160px 130px 110px";

export function Manage() {
  const player = useMusicPlayer();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const lastClickedIndex = useRef<number | null>(null);

  const {
    data: videosData,
    isLoading,
    fetchNextPage: fetchNextVideoPage,
    hasNextPage: hasNextVideoPage,
    isFetchingNextPage: isFetchingNextVideoPage,
  } = useInfiniteListVideos(
    activePlaylistId === null
      ? {
          ...(activeCategory !== "All" ? { category: activeCategory } : {}),
          ...(searchQuery ? { search: searchQuery } : {}),
        }
      : undefined,
  );
  const videos = videosData?.pages.flatMap((p) => p.items) ?? [];
  const { data: videoStats } = useGetVideoStats();
  const videoCountParams = searchQuery
    ? {
        search: searchQuery,
        ...(activeCategory !== "All" ? { category: activeCategory } : {}),
      }
    : undefined;
  const { data: videoCount } = useGetVideoCount(videoCountParams, {
    query: { queryKey: getGetVideoCountQueryKey(videoCountParams), enabled: !!searchQuery },
  });


  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [isPlaylistMenuOpen, setIsPlaylistMenuOpen] = useState(false);
  const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false);
  const [isCreatingNewPlaylist, setIsCreatingNewPlaylist] = useState(false);
  const [newPlaylistDraft, setNewPlaylistDraft] = useState("");
  const playlistMenuRef = useRef<HTMLDivElement>(null);
  const [playlistVideos, setPlaylistVideos] = useState<Video[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [isEmptyCategoryDialogOpen, setIsEmptyCategoryDialogOpen] = useState(false);
  const [emptyCategoryName, setEmptyCategoryName] = useState("");
  const [pinnedCategories, setPinnedCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("vvm_pinned_video_cats") ?? "[]") as string[]; }
    catch { return []; }
  });

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const bulkDelete = useBulkDeleteVideos();
  const bulkRestore = useBulkRestoreVideos();
  const bulkUpdateCategory = useBulkUpdateCategory();
  const createPlaylist = useCreatePlaylist();
  const addToPlaylist = useAddVideoToPlaylist();
  // TV shows live exclusively on the TV Shows tab -- excluded here so they
  // don't show up mixed in with regular playlists in "Add to Playlist".
  const { data: allPlaylists = [] } = useListPlaylists({ query: { queryKey: getListPlaylistsQueryKey() } });
  const playlists = allPlaylists.filter((p) => !p.isShow);

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
    if (!sortMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortMenuOpen]);

  useEffect(() => {
    setSelectAllMode(false);
  }, [activeCategory, searchQuery, activePlaylistId]);

  const fetchPlaylistVideos = async (playlistId: number) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, { credentials: "include" });
      const data = await res.json() as { videos: Video[] };
      setPlaylistVideos(data.videos);
    } catch {
      setPlaylistVideos([]);
    }
  };

  const statCategories = videoStats?.byCategory.map((b) => b.category) ?? [];
  const categories = ["All", ...Array.from(new Set([...statCategories, ...pinnedCategories])).sort()];

  const filteredVideos = activePlaylistId !== null
    ? playlistVideos
    : (videos ?? []);

  const displayVideos = sortVideos(filteredVideos, sortKey);

  const selectAllTotal: number | undefined = searchQuery
    ? videoCount?.total
    : activeCategory === "All"
      ? videoStats?.total
      : videoStats?.byCategory.find((b) => b.category === activeCategory)?.count;

  const selectionCount = selectAllMode ? (selectAllTotal ?? selectedIds.size) : selectedIds.size;

  const rowVirtualizer = useVirtualizer({
    count: displayVideos.length,
    getScrollElement: () => document.getElementById("main-scroll"),
    estimateSize: () => 72,
    overscan: 10,
  });

  // Eagerly load every page as soon as the previous one finishes — no scrolling required.
  useEffect(() => {
    if (hasNextVideoPage && !isFetchingNextVideoPage) {
      void fetchNextVideoPage();
    }
  }, [hasNextVideoPage, isFetchingNextVideoPage, fetchNextVideoPage]);

  const toggleSelectAll = () => {
    if (selectAllMode) {
      setSelectAllMode(false);
      setSelectedIds(new Set());
    } else if (selectedIds.size === displayVideos.length && displayVideos.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayVideos.map(v => v.id)));
    }
  };

  const toggleSelect = (id: number, index: number, shiftKey: boolean) => {
    const newSet = new Set(selectedIds);
    if (shiftKey && lastClickedIndex.current !== null) {
      const lo = Math.min(lastClickedIndex.current, index);
      const hi = Math.max(lastClickedIndex.current, index);
      const adding = !newSet.has(id);
      for (let i = lo; i <= hi; i++) {
        const vid = displayVideos[i];
        if (vid) adding ? newSet.add(vid.id) : newSet.delete(vid.id);
      }
    } else {
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
    }
    lastClickedIndex.current = index;
    setSelectedIds(newSet);
  };

  const handleBulkDelete = () => {
    if (!selectAllMode && selectedIds.size === 0) return;

    const body = selectAllMode
      ? {
          selectAll: true as const,
          filter: {
            ...(activeCategory !== "All" ? { category: activeCategory } : {}),
            ...(searchQuery ? { search: searchQuery } : {}),
          },
        }
      : { ids: Array.from(selectedIds) };

    const deletedCount = selectionCount;
    
    bulkDelete.mutate(
      { data: body },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
          queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["discover-films"] });

          if (!selectAllMode) {
            const catCount = videoStats?.byCategory.find((b) => b.category === activeCategory)?.count ?? 0;
            if (activeCategory !== "All" && catCount <= selectedIds.size) {
              setEmptyCategoryName(activeCategory);
              setIsEmptyCategoryDialogOpen(true);
            }
          } else if (activeCategory !== "All") {
            setEmptyCategoryName(activeCategory);
            setIsEmptyCategoryDialogOpen(true);
          }

          setSelectedIds(new Set());
          setSelectAllMode(false);
          setIsDeleteDialogOpen(false);

          const softDeletedIds = data.ids;

          const handleUndo = () => {
            bulkRestore.mutate(
              { data: { ids: softDeletedIds } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
                  queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() });
                  queryClient.invalidateQueries({ queryKey: ["discover-films"] });
                  toast({ title: `Restored ${deletedCount} video${deletedCount !== 1 ? "s" : ""}` });
                },
                onError: () => {
                  toast({ title: "Failed to restore videos", variant: "destructive" });
                },
              }
            );
          };

          // Deleted videos now land in a real Trash page (Manage → Trash)
          // with a 30-day grace period, restorable or permanently
          // deletable there at any time -- this toast is just a quick
          // "oops, undo that" convenience, not the only chance to recover.
          // It used to auto-purge for real after this timeout, which
          // depended on the tab staying open; anything that missed that
          // window was stuck soft-deleted forever with no page to find it.
          toast({
            title: `Deleted ${deletedCount} video${deletedCount !== 1 ? "s" : ""}`,
            description: "Moved to Trash — recoverable there for 30 days.",
            duration: (UNDO_TIMEOUT_S + 1) * 1000,
            action: <UndoToastAction onUndo={handleUndo} />,
          });
        },
        onError: () => {
          toast({ title: "Failed to delete videos", variant: "destructive" });
        }
      }
    );
  };

  const handleBulkCategory = () => {
    if (!selectAllMode && selectedIds.size === 0) return;
    if (!newCategory.trim()) return;
    const oldCategory = activeCategory;
    const movedCount = selectionCount;

    const body = selectAllMode
      ? {
          selectAll: true as const,
          category: newCategory.trim(),
          filter: {
            ...(activeCategory !== "All" ? { category: activeCategory } : {}),
            ...(searchQuery ? { search: searchQuery } : {}),
          },
        }
      : { ids: Array.from(selectedIds), category: newCategory.trim() };

    bulkUpdateCategory.mutate(
      { data: body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
          queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });

          toast({ title: `Updated category for ${movedCount} video${movedCount !== 1 ? "s" : ""}` });
          setActiveCategory(newCategory.trim());
          setSelectedIds(new Set());
          setSelectAllMode(false);
          setIsCategoryDialogOpen(false);
          setNewCategory("");

          if (oldCategory !== "All" && oldCategory !== newCategory.trim()) {
            if (selectAllMode) {
              setEmptyCategoryName(oldCategory);
              setIsEmptyCategoryDialogOpen(true);
            } else {
              const oldCatCount = videoStats?.byCategory.find((b) => b.category === oldCategory)?.count ?? 0;
              if (oldCatCount <= selectedIds.size) {
                setEmptyCategoryName(oldCategory);
                setIsEmptyCategoryDialogOpen(true);
              }
            }
          }
        },
        onError: () => {
          toast({ title: "Failed to update categories", variant: "destructive" });
        }
      }
    );
  };

  const handleAddToPlaylist = async (playlistId: number, playlistName: string) => {
    if (isAddingToPlaylist) return;
    setIsAddingToPlaylist(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((videoId) =>
          addToPlaylist.mutateAsync({ id: playlistId, data: { videoId } })
        )
      );
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      toast({ title: `Added ${selectedIds.size} video${selectedIds.size !== 1 ? "s" : ""} to "${playlistName}"` });
      setSelectedIds(new Set());
      setIsPlaylistMenuOpen(false);
    } catch {
      toast({ title: "Failed to add to playlist", variant: "destructive" });
    } finally {
      setIsAddingToPlaylist(false);
    }
  };

  const handleCreateAndAddToPlaylist = async () => {
    const name = newPlaylistDraft.trim();
    if (!name || isAddingToPlaylist) return;
    setIsAddingToPlaylist(true);
    try {
      const newPlaylist = await createPlaylist.mutateAsync({ data: { name } });
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      await Promise.all(
        Array.from(selectedIds).map((videoId) =>
          addToPlaylist.mutateAsync({ id: newPlaylist.id, data: { videoId } })
        )
      );
      queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
      toast({ title: `Created "${name}" and added ${selectedIds.size} video${selectedIds.size !== 1 ? "s" : ""}` });
      setSelectedIds(new Set());
      setIsPlaylistMenuOpen(false);
      setIsCreatingNewPlaylist(false);
      setNewPlaylistDraft("");
    } catch {
      toast({ title: "Failed to create playlist", variant: "destructive" });
    } finally {
      setIsAddingToPlaylist(false);
    }
  };

  const hasSelection = selectAllMode || selectedIds.size > 0;
  const allSelected = selectAllMode || (displayVideos.length > 0 && selectedIds.size === displayVideos.length);
  const showSelectAllBanner = !selectAllMode && selectedIds.size === displayVideos.length && displayVideos.length > 0 && !!hasNextVideoPage && activePlaylistId === null;

  useEffect(() => {
    if (hasSelection) player.minimize();
    else player.restore();
  }, [hasSelection]);

  return (
    <Layout>
      <div className="relative z-10 max-w-7xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" />
            Manage Library
          </h1>
          <p className="text-muted-foreground mt-2">Organize, categorize, and clean up your video collection.</p>
        </div>

        {/* Toolbar: search | sort | add — sticky so it stays visible while the list scrolls */}
        <div className="flex items-center gap-2 sticky top-0 z-20 -mx-8 px-8 py-3 border-b border-border/40 mb-0 bg-background">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 bg-card border-border focus-visible:ring-primary"
              placeholder=""
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery && (
            <>
              {videoCount !== undefined && (
                <span className="shrink-0 text-sm text-muted-foreground whitespace-nowrap">
                  {videoCount.total} result{videoCount.total !== 1 ? "s" : ""}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </Button>
            </>
          )}

          {/* Playlist / Category dropdown */}
          <Select
            value={activePlaylistId !== null ? `playlist:${activePlaylistId}` : activeCategory}
            onValueChange={(val) => {
              setSelectedIds(new Set());
              lastClickedIndex.current = null;
              if (val.startsWith("playlist:")) {
                const id = parseInt(val.slice("playlist:".length));
                setActivePlaylistId(id);
                setPlaylistVideos([]);
                void fetchPlaylistVideos(id);
              } else {
                setActivePlaylistId(null);
                setPlaylistVideos([]);
                setActiveCategory(val);
              }
            }}
          >
            <SelectTrigger className="h-9 w-48 text-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              {playlists.length > 0 && (
                <>
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-1.5 text-xs">
                      <ListVideo className="w-3 h-3" />
                      Playlists
                    </SelectLabel>
                    {playlists.map((pl) => (
                      <SelectItem key={`playlist:${pl.id}`} value={`playlist:${pl.id}`}>
                        {pl.name} ({pl.videoCount})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                </>
              )}
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5 text-xs">
                  <Filter className="w-3 h-3" />
                  Categories
                </SelectLabel>
                <SelectItem value="All">All ({videoStats?.total ?? (videos ?? []).length})</SelectItem>
                {categories
                  .filter((c) => c !== "All")
                  .map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat} ({videoStats?.byCategory.find((b) => b.category === cat)?.count ?? 0})
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Sort dropdown */}
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

          <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
            <Link href="/manage/trash">
              <Trash2 className="w-4 h-4" />
              Trash
            </Link>
          </Button>

          <Button asChild size="sm" className="shrink-0 gap-1.5">
            <Link href="/add">
              <Plus className="w-4 h-4" />
              Add Video
            </Link>
          </Button>
        </div>


        <div className="bg-card rounded-xl border border-border shadow-sm mt-4">
          {/* Loading skeleton */}
          {isLoading && (
            <table style={{ display: "grid", width: "100%" }}>
              <thead className="bg-muted border-b border-border" style={{ display: "grid" }}>
                <tr style={{ display: "grid", gridTemplateColumns: VIDEO_COL_TEMPLATE, width: "100%", alignItems: "center" }}>
                  <th className="h-12 px-4 flex items-center justify-center"><Checkbox disabled aria-label="Select all" /></th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Video</th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
                  <th className="h-12 px-4 flex items-center justify-end text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody style={{ display: "grid" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ display: "grid", gridTemplateColumns: VIDEO_COL_TEMPLATE, width: "100%", alignItems: "center" }} className="border-b border-border/50">
                    <td className="px-4 py-3 flex justify-center"><div className="w-4 h-4 rounded bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3 flex items-center gap-3"><div className="w-24 h-14 bg-muted rounded animate-pulse" /><div className="h-4 w-48 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3 flex justify-end"><div className="h-8 w-16 bg-muted rounded animate-pulse" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Empty state */}
          {!isLoading && displayVideos.length === 0 && (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              {activeCategory === "All" ? "No videos found." : `No videos in "${activeCategory}".`}
            </div>
          )}

          {/* Virtual table */}
          {!isLoading && displayVideos.length > 0 && (
            <div>
              <table style={{ display: "grid", width: "100%" }}>
                <thead
                  className="bg-muted border-b border-border"
                  style={{ display: "grid", position: "sticky", top: 60, zIndex: 1 }}
                >
                  <tr style={{ display: "grid", gridTemplateColumns: VIDEO_COL_TEMPLATE, width: "100%", alignItems: "center" }}>
                    <th className="h-12 px-4 flex items-center justify-center">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                    </th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Video</th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
                    <th className="h-12 px-4 flex items-center justify-end text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                  {showSelectAllBanner && (
                    <tr style={{ display: "grid", gridTemplateColumns: "1fr", width: "100%" }}>
                      <td className="px-4 py-2 bg-primary/10 text-center text-sm border-t border-primary/20">
                        All {displayVideos.length} videos on this page are selected.{" "}
                        <button
                          className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                          onClick={() => setSelectAllMode(true)}
                        >
                          {selectAllTotal !== undefined
                            ? `Select all ${selectAllTotal} videos`
                            : "Select all matching videos"}
                        </button>
                      </td>
                    </tr>
                  )}
                  {selectAllMode && (
                    <tr style={{ display: "grid", gridTemplateColumns: "1fr", width: "100%" }}>
                      <td className="px-4 py-2 bg-primary/10 text-center text-sm border-t border-primary/20">
                        {selectAllTotal !== undefined
                          ? `All ${selectAllTotal} videos are selected.`
                          : "All matching videos are selected."}{" "}
                        <button
                          className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                          onClick={() => { setSelectAllMode(false); setSelectedIds(new Set()); }}
                        >
                          Clear selection
                        </button>
                      </td>
                    </tr>
                  )}
                </thead>
                <tbody
                  style={{
                    display: "grid",
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const video = displayVideos[virtualRow.index]!;
                    const thumbnail = getYoutubeThumbnailUrl(video.youtubeUrl, video.thumbnailUrl);
                    const isSelected = selectedIds.has(video.id);
                    return (
                      <tr
                        key={video.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className={`border-b border-border/50 cursor-pointer select-none ${isSelected ? "bg-primary/5" : "hover:bg-muted/40"}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: VIDEO_COL_TEMPLATE,
                          position: "absolute",
                          transform: `translateY(${virtualRow.start}px)`,
                          width: "100%",
                          alignItems: "center",
                        }}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("a") || target.closest("button")) return;
                          toggleSelect(video.id, virtualRow.index, e.shiftKey);
                        }}
                      >
                        <td className="px-4 flex items-center justify-center">
                          <Checkbox
                            checked={isSelected}
                            onClick={(e) => { e.stopPropagation(); toggleSelect(video.id, virtualRow.index, e.shiftKey); }}
                            aria-label={`Select ${video.title}`}
                          />
                        </td>
                        <td className="px-4 py-3 flex items-center gap-4 min-w-0">
                          <div className="relative w-28 aspect-video rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border/50">
                            <AdaptiveThumbnail src={thumbnail} alt="" className="w-full h-full" />
                          </div>
                          <div className="min-w-0">
                            <Link href={`/video/${video.id}`} className="font-medium line-clamp-2 hover:text-primary transition-colors text-sm" onClick={(e) => e.stopPropagation()}>
                              {video.title}
                            </Link>
                            {showDescriptions && video.description && (
                              <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-1 italic">{video.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-accent text-accent-foreground">
                            {video.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(video.createdAt), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 flex items-center justify-end gap-2">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                            <Link href={`/video/${video.id}?edit=true`}><Edit className="h-4 w-4" /></Link>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                            <a href={video.youtubeUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {isFetchingNextVideoPage && (
                <div className="flex items-center justify-center py-3 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading more…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delete Confirmation */}
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

        {/* Bulk Category Change */}
        <Dialog open={isCategoryDialogOpen} onOpenChange={(open) => { setIsCategoryDialogOpen(open); if (!open) setNewCategory(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move {selectionCount} video{selectionCount !== 1 ? "s" : ""}</DialogTitle>
              <DialogDescription>
                Pick an existing category or type a new name.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <CategorySelect
                value={newCategory}
                onChange={setNewCategory}
                categories={categories.filter((c) => c !== "All")}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkCategory} disabled={!newCategory.trim() || bulkUpdateCategory.isPending}>
                Save Category
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>

      {/* Sticky selection bar */}
      {hasSelection && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
            <span className="text-sm font-semibold pl-1 pr-2">
              {selectAllMode
                ? selectAllTotal !== undefined
                  ? `All ${selectAllTotal} selected`
                  : "All matching selected"
                : `${selectedIds.size} selected`}
            </span>
            <div className="h-5 w-px bg-primary-foreground/30" />
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
                      <button
                        onClick={handleCreateAndAddToPlaylist}
                        disabled={!newPlaylistDraft.trim() || isAddingToPlaylist}
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
                      Add New Playlist
                    </button>
                  )}
                </div>
              )}
            </div>
            <Button size="sm" variant="destructive" className="rounded-full" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <button
              onClick={() => { setSelectedIds(new Set()); setSelectAllMode(false); lastClickedIndex.current = null; }}
              className="text-xs opacity-70 hover:opacity-100 transition-opacity px-1"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
              const updated = [...pinnedCategories.filter(c => c !== emptyCategoryName), emptyCategoryName];
              setPinnedCategories(updated);
              localStorage.setItem("vvm_pinned_video_cats", JSON.stringify(updated));
            }}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const updated = pinnedCategories.filter(c => c !== emptyCategoryName);
              setPinnedCategories(updated);
              localStorage.setItem("vvm_pinned_video_cats", JSON.stringify(updated));
              setActiveCategory("All");
            }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

export default Manage;