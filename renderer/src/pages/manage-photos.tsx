import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
  useInfiniteListPhotos,
  useGetPhotoStats,
  useGetPhotoCount,
  getGetPhotoCountQueryKey,
  useBulkDeletePhotos,
  useBulkRestorePhotos,
  useBulkPurgePhotos,
  useBulkUpdatePhotoCategory,
  getGetPhotoStatsQueryKey,
  type Photo,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  Trash2,
  FolderOpen,
  FolderMinus,
  ExternalLink,
  Settings2,
  Edit,
  Filter,
  ImageIcon,
  Search,
  X,
  ArrowUpDown,
  Check,
  Plus,
  Share2,
  Images,
  Loader2,
} from "lucide-react";

import { Input } from "@/components/ui/input";

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
function sortPhotos<T extends { title: string; createdAt: string }>(arr: T[], key: SortKey): T[] {
  return [...arr].sort((a, b) => {
    if (key === "alpha-asc") return a.title.localeCompare(b.title);
    if (key === "alpha-desc") return b.title.localeCompare(a.title);
    if (key === "date-asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const PHOTO_COL_TEMPLATE = "48px minmax(0,1fr) 160px 130px 110px";
const CREATE_NEW = "__create_new__";

function CategorySelect({ value, onChange, categories }: { value: string; onChange: (val: string) => void; categories: string[] }) {
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
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } if (e.key === "Escape") cancel(); }}
        />
        <Button type="button" size="sm" onClick={confirm} disabled={!draft.trim()}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(val) => { if (val === CREATE_NEW) setCreating(true); else onChange(val); }}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a category…" />
      </SelectTrigger>
      <SelectContent>
        {allCategories.map((cat) => (
          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
        ))}
        {allCategories.length > 0 && <SelectSeparator />}
        <SelectItem value={CREATE_NEW} className="text-primary font-medium">+ Add Category</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ManagePhotos() {
  const player = useMusicPlayer();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [activeAlbumId, setActiveAlbumId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const lastClickedIndex = useRef<number | null>(null);
  // Track pointer-down position so a drag-to-scroll doesn't accidentally toggle selection
  const pointerDownPos = useRef({ x: 0, y: 0 });

  const {
    data: photosData,
    isLoading,
    fetchNextPage: fetchNextPhotoPage,
    hasNextPage: hasNextPhotoPage,
    isFetchingNextPage: isFetchingNextPhotoPage,
  } = useInfiniteListPhotos(
    activeAlbumId === null
      ? {
          ...(activeCategory !== "All" ? { category: activeCategory } : {}),
          ...(searchQuery ? { search: searchQuery } : {}),
        }
      : undefined,
  );
  const photos = photosData?.pages.flatMap((p) => p.items) ?? [];
  const { data: photoStats } = useGetPhotoStats();
  const photoCountParams = searchQuery
    ? {
        search: searchQuery,
        ...(activeCategory !== "All" ? { category: activeCategory } : {}),
      }
    : undefined;
  const { data: photoCount } = useGetPhotoCount(photoCountParams, {
    query: { queryKey: getGetPhotoCountQueryKey(photoCountParams), enabled: !!searchQuery },
  });


  const [albumPhotos, setAlbumPhotos] = useState<Photo[]>([]);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");

  const [isAlbumMenuOpen, setIsAlbumMenuOpen] = useState(false);
  const [albums, setAlbums] = useState<{ id: number; name: string; photoCount: number }[]>([]);
  const [albumsLoaded, setAlbumsLoaded] = useState(false);
  const [addingToAlbum, setAddingToAlbum] = useState(false);
  const [isCreatingNewAlbum, setIsCreatingNewAlbum] = useState(false);
  const [newAlbumDraft, setNewAlbumDraft] = useState("");
  const albumMenuRef = useRef<HTMLDivElement>(null);
  const [isDeleteAlbumDialogOpen, setIsDeleteAlbumDialogOpen] = useState(false);
  const [isRemoveFromAlbumDialogOpen, setIsRemoveFromAlbumDialogOpen] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [isEmptyCategoryDialogOpen, setIsEmptyCategoryDialogOpen] = useState(false);
  const [emptyCategoryName, setEmptyCategoryName] = useState("");
  const [pinnedCategories, setPinnedCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("vvm_pinned_photo_cats") ?? "[]") as string[]; }
    catch { return []; }
  });

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
  }, [activeCategory, searchQuery, activeAlbumId]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const bulkDelete = useBulkDeletePhotos();
  const bulkRestore = useBulkRestorePhotos();
  const bulkPurge = useBulkPurgePhotos();
  const bulkUpdateCategory = useBulkUpdatePhotoCategory();

  const statCategories = photoStats?.byCategory.map((b) => b.category) ?? [];
  const categories = [
    "All",
    ...Array.from(new Set([...statCategories, ...pinnedCategories])).sort(),
  ];

  const fetchAlbumPhotos = async (albumId: number) => {
    try {
      const res = await fetch(`/api/albums/${albumId}`, { credentials: "include" });
      const data = await res.json() as { photos: Photo[] };
      setAlbumPhotos(data.photos);
    } catch {
      setAlbumPhotos([]);
    }
  };

  const filtered = useMemo(
    () => sortPhotos(activeAlbumId !== null ? albumPhotos : (photos ?? []), sortKey),
    [activeAlbumId, albumPhotos, photos, sortKey],
  );

  const selectAllTotal: number | undefined = searchQuery
    ? photoCount?.total
    : activeCategory === "All"
      ? photoStats?.total
      : photoStats?.byCategory.find((b) => b.category === activeCategory)?.count;

  const selectionCount = selectAllMode ? (selectAllTotal ?? selectedIds.size) : selectedIds.size;

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => document.getElementById("main-scroll"),
    estimateSize: () => 80,
    overscan: 4,
  });

  // Eagerly load every page as soon as the previous one finishes — no scrolling required.
  useEffect(() => {
    if (hasNextPhotoPage && !isFetchingNextPhotoPage) {
      void fetchNextPhotoPage();
    }
  }, [hasNextPhotoPage, isFetchingNextPhotoPage, fetchNextPhotoPage]);

  const toggleSelectAll = () => {
    if (selectAllMode) {
      setSelectAllMode(false);
      setSelectedIds(new Set());
    } else if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: number, index: number, shiftKey: boolean) => {
    const newSet = new Set(selectedIds);
    if (shiftKey && lastClickedIndex.current !== null) {
      const lo = Math.min(lastClickedIndex.current, index);
      const hi = Math.max(lastClickedIndex.current, index);
      const adding = !newSet.has(id);
      for (let i = lo; i <= hi; i++) {
        const p = filtered[i];
        if (p) adding ? newSet.add(p.id) : newSet.delete(p.id);
      }
    } else {
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    }
    lastClickedIndex.current = index;
    setSelectedIds(newSet);
  };

  useEffect(() => {
    if (!isAlbumMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (albumMenuRef.current && !albumMenuRef.current.contains(e.target as Node)) {
        setIsAlbumMenuOpen(false);
        setIsCreatingNewAlbum(false);
        setNewAlbumDraft("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isAlbumMenuOpen]);

  useEffect(() => {
    if (albumsLoaded) return;
    fetch("/api/albums", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setAlbums(data as typeof albums); setAlbumsLoaded(true); })
      .catch(() => setAlbumsLoaded(true));
  }, [albumsLoaded]);

  const handleAddToAlbum = async (albumId: number, albumName: string) => {
    if (addingToAlbum) return;
    const photosToAdd = Array.from(selectedIds);
    if (photosToAdd.length === 0) return;
    setAddingToAlbum(true);
    let added = 0;
    let skipped = 0;
    for (const photoId of photosToAdd) {
      const res = await fetch(`/api/albums/${albumId}/photos`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (res.ok) added++; else skipped++;
    }
    setAddingToAlbum(false);
    setAlbums((prev) => prev.map((a) => a.id === albumId ? { ...a, photoCount: a.photoCount + added } : a));
    void queryClient.invalidateQueries({ queryKey: ["albums"] });
    toast({ title: `Added ${added} photo${added !== 1 ? "s" : ""} to "${albumName}"${skipped > 0 ? ` (${skipped} already in album)` : ""}` });
    setSelectedIds(new Set());
    setIsAlbumMenuOpen(false);
  };

  const handleCreateAndAddToAlbum = async () => {
    const name = newAlbumDraft.trim();
    if (!name || addingToAlbum) return;
    const photosToAdd = Array.from(selectedIds);
    setAddingToAlbum(true);
    try {
      const res = await fetch("/api/albums", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      const newAlbum = await res.json() as { id: number; name: string };
      setAlbums((prev) => [...prev, { id: newAlbum.id, name: newAlbum.name, photoCount: 0 }]);
      setAlbumsLoaded(true);
      let added = 0;
      for (const photoId of photosToAdd) {
        const r = await fetch(`/api/albums/${newAlbum.id}/photos`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId }),
        });
        if (r.ok) added++;
      }
      setAlbums((prev) => prev.map((a) => a.id === newAlbum.id ? { ...a, photoCount: added } : a));
      void queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast({ title: `Created "${name}" and added ${added} photo${added !== 1 ? "s" : ""}` });
      setSelectedIds(new Set());
      setIsAlbumMenuOpen(false);
      setIsCreatingNewAlbum(false);
      setNewAlbumDraft("");
    } catch {
      toast({ title: "Failed to create album", variant: "destructive" });
    } finally {
      setAddingToAlbum(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (activeAlbumId === null) return;
    const albumId = activeAlbumId;
    await fetch(`/api/albums/${albumId}`, { method: "DELETE", credentials: "include" });
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    setActiveAlbumId(null);
    setAlbumPhotos([]);
    setActiveCategory("All");
    setSelectedIds(new Set());
    toast({ title: "Album deleted" });
  };

  const handleRemoveFromAlbum = async () => {
    if (activeAlbumId === null) return;
    const albumId = activeAlbumId;
    const photosToRemove = Array.from(selectedIds);
    let removed = 0;
    for (const photoId of photosToRemove) {
      const res = await fetch(`/api/albums/${albumId}/photos/${photoId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) removed++;
    }
    setAlbumPhotos((prev) => prev.filter((p) => !photosToRemove.includes(p.id)));
    const currentAlbum = albums.find((a) => a.id === albumId);
    const newCount = Math.max(0, (currentAlbum?.photoCount ?? 0) - removed);
    setAlbums((prev) => prev.map((a) => a.id === albumId ? { ...a, photoCount: newCount } : a));
    setSelectedIds(new Set());
    toast({ title: `Removed ${removed} photo${removed !== 1 ? "s" : ""} from album` });
    if (newCount === 0) {
      setIsDeleteAlbumDialogOpen(true);
    }
  };

  useEffect(() => {
    if (!isShareDialogOpen || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setFriends(data as typeof friends); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [isShareDialogOpen, friendsLoaded]);

  const handleShare = async (friendId: string) => {
    setSharing(friendId);
    try {
      const res = await fetch("/api/photo-category-shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedIds), recipientId: friendId, message: shareMessage || undefined }),
      });
      const data = await res.json() as { error?: string; photoCount?: number };
      if (res.ok) {
        toast({ title: `Shared ${data.photoCount} photo${(data.photoCount ?? 0) !== 1 ? "s" : ""} successfully` });
        setIsShareDialogOpen(false);
        setShareMessage("");
      } else {
        toast({ title: data.error ?? "Failed to share", variant: "destructive" });
      }
    } finally {
      setSharing(null);
    }
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
          queryClient.invalidateQueries({ queryKey: ['/api/photos'] });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });

          if (!selectAllMode) {
            const catCount = photoStats?.byCategory.find((b) => b.category === activeCategory)?.count ?? 0;
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
          let undone = false;

          const handleUndo = () => {
            undone = true;
            clearTimeout(purgeTimer);
            bulkRestore.mutate(
              { data: { ids: softDeletedIds } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: ['/api/photos'] });
                  queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
                  toast({ title: `Restored ${deletedCount} photo${deletedCount !== 1 ? "s" : ""}` });
                },
                onError: () => {
                  toast({ title: "Failed to restore photos", variant: "destructive" });
                },
              }
            );
          };

          const { dismiss } = toast({
            title: `Deleted ${deletedCount} photo${deletedCount !== 1 ? "s" : ""}`,
            duration: (UNDO_TIMEOUT_S + 1) * 1000,
            action: <UndoToastAction onUndo={handleUndo} />,
          });

          const purgeTimer = setTimeout(() => {
            if (!undone) {
              dismiss();
              bulkPurge.mutate({ data: { ids: softDeletedIds } });
            }
          }, UNDO_TIMEOUT_S * 1000);
        },
        onError: () => {
          toast({ title: "Failed to delete photos", variant: "destructive" });
        },
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
          queryClient.invalidateQueries({ queryKey: ['/api/photos'] });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
          toast({ title: `Updated category for ${movedCount} photo${movedCount !== 1 ? "s" : ""}` });
          setSelectedIds(new Set());
          setSelectAllMode(false);
          setIsCategoryDialogOpen(false);
          setNewCategory("");

          if (oldCategory !== "All" && oldCategory !== newCategory.trim()) {
            if (selectAllMode) {
              setEmptyCategoryName(oldCategory);
              setIsEmptyCategoryDialogOpen(true);
            } else {
              const oldCatCount = photoStats?.byCategory.find((b) => b.category === oldCategory)?.count ?? 0;
              if (oldCatCount <= selectedIds.size) {
                setEmptyCategoryName(oldCategory);
                setIsEmptyCategoryDialogOpen(true);
              }
            }
          }
        },
        onError: () => {
          toast({ title: "Failed to update categories", variant: "destructive" });
        },
      }
    );
  };

  const hasSelection = selectAllMode || selectedIds.size > 0;
  const allSelected = selectAllMode || (filtered.length > 0 && selectedIds.size === filtered.length);
  const showSelectAllBanner = !selectAllMode && selectedIds.size === filtered.length && filtered.length > 0 && !!hasNextPhotoPage && activeAlbumId === null;

  useEffect(() => {
    if (hasSelection) player.minimize();
    else player.restore();
  }, [hasSelection]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" />
            Manage Photos
          </h1>
          <p className="text-muted-foreground mt-2">
            Organize, categorize, and clean up your photo collection.
          </p>
        </div>

        {/* Toolbar: search | sort | add — sticky so it stays visible while the list scrolls */}
        <div className="flex items-center gap-2 sticky top-0 z-20 bg-background -mx-8 px-8 py-3 border-b border-border/40 mb-0">
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
              {photoCount !== undefined && (
                <span className="shrink-0 text-sm text-muted-foreground whitespace-nowrap">
                  {photoCount.total} result{photoCount.total !== 1 ? "s" : ""}
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

          {/* Album / Category dropdown */}
          <Select
            value={activeAlbumId !== null ? `album:${activeAlbumId}` : activeCategory}
            onValueChange={(val) => {
              setSelectedIds(new Set());
              lastClickedIndex.current = null;
              if (val.startsWith("album:")) {
                const id = parseInt(val.slice("album:".length));
                setActiveAlbumId(id);
                setAlbumPhotos([]);
                void fetchAlbumPhotos(id);
              } else {
                setActiveAlbumId(null);
                setAlbumPhotos([]);
                setActiveCategory(val);
              }
            }}
          >
            <SelectTrigger className="h-9 w-48 text-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              {albums.length > 0 && (
                <>
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-1.5 text-xs">
                      <Images className="w-3 h-3" />
                      Albums
                    </SelectLabel>
                    {albums.map((al) => (
                      <SelectItem key={`album:${al.id}`} value={`album:${al.id}`}>
                        {al.name} ({al.photoCount})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                </>
              )}
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5 text-xs">
                  <ImageIcon className="w-3 h-3" />
                  Categories
                </SelectLabel>
                <SelectItem value="All">All ({photoStats?.total ?? (photos ?? []).length})</SelectItem>
                {categories
                  .filter((c) => c !== "All")
                  .map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat} ({photoStats?.byCategory.find((b) => b.category === cat)?.count ?? 0})
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Delete album button — visible only when an album is active */}
          {activeAlbumId !== null && (
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setIsDeleteAlbumDialogOpen(true)}
              title="Delete this album"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}

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

          <Button asChild size="sm" className="shrink-0 gap-1.5">
            <Link href="/add-photo">
              <Plus className="w-4 h-4" />
              Add Photo
            </Link>
          </Button>
        </div>


        <div className="bg-card rounded-xl border border-border shadow-sm mt-4">
          {/* Loading skeleton */}
          {isLoading && (
            <table style={{ display: "grid", width: "100%" }}>
              <thead className="bg-muted border-b border-border" style={{ display: "grid" }}>
                <tr style={{ display: "grid", gridTemplateColumns: PHOTO_COL_TEMPLATE, width: "100%", alignItems: "center" }}>
                  <th className="h-12 px-4 flex items-center justify-center"><Checkbox disabled aria-label="Select all" /></th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Photo</th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
                  <th className="h-12 px-4 flex items-center justify-end text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody style={{ display: "grid" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ display: "grid", gridTemplateColumns: PHOTO_COL_TEMPLATE, width: "100%", alignItems: "center" }} className="border-b border-border/50">
                    <td className="px-4 py-3 flex justify-center"><div className="w-4 h-4 rounded bg-muted animate-pulse" /></td>
                    <td className="px-4 py-3 flex items-center gap-3"><div className="w-16 h-16 bg-muted rounded animate-pulse" /><div className="h-4 w-48 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
                    <td className="px-4 py-3 flex justify-end"><div className="h-8 w-16 bg-muted rounded animate-pulse" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <ImageIcon className="w-10 h-10 opacity-20" />
              <p className="text-sm">
                {activeCategory === "All" ? "No photos found." : `No photos in "${activeCategory}".`}
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
                  <tr style={{ display: "grid", gridTemplateColumns: PHOTO_COL_TEMPLATE, width: "100%", alignItems: "center" }}>
                    <th className="h-12 px-4 flex items-center justify-center">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                    </th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Photo</th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</th>
                    <th className="h-12 px-4 flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</th>
                    <th className="h-12 px-4 flex items-center justify-end text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                  {showSelectAllBanner && (
                    <tr style={{ display: "grid", gridTemplateColumns: "1fr", width: "100%" }}>
                      <td className="px-4 py-2 bg-primary/10 text-center text-sm border-t border-primary/20">
                        All {filtered.length} photos on this page are selected.{" "}
                        <button
                          className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                          onClick={() => setSelectAllMode(true)}
                        >
                          {selectAllTotal !== undefined
                            ? `Select all ${selectAllTotal} photos`
                            : "Select all matching photos"}
                        </button>
                      </td>
                    </tr>
                  )}
                  {selectAllMode && (
                    <tr style={{ display: "grid", gridTemplateColumns: "1fr", width: "100%" }}>
                      <td className="px-4 py-2 bg-primary/10 text-center text-sm border-t border-primary/20">
                        {selectAllTotal !== undefined
                          ? `All ${selectAllTotal} photos are selected.`
                          : "All matching photos are selected."}{" "}
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
                  onPointerDown={(e) => { pointerDownPos.current = { x: e.clientX, y: e.clientY }; }}
                  style={{
                    display: "grid",
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const photo = filtered[virtualRow.index]!;
                    const isSelected = selectedIds.has(photo.id);
                    return (
                      <tr
                        key={photo.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className={`border-b border-border/50 cursor-pointer select-none ${isSelected ? "bg-primary/5" : "hover:bg-muted/40"}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: PHOTO_COL_TEMPLATE,
                          position: "absolute",
                          transform: `translateY(${virtualRow.start}px)`,
                          width: "100%",
                          alignItems: "center",
                        }}
                        onClick={(e) => {
                          // Ignore if pointer moved >5px (user was dragging/scrolling, not clicking)
                          if (Math.abs(e.clientX - pointerDownPos.current.x) > 5 ||
                              Math.abs(e.clientY - pointerDownPos.current.y) > 5) return;
                          const target = e.target as HTMLElement;
                          if (target.closest("a") || target.closest("button")) return;
                          toggleSelect(photo.id, virtualRow.index, e.shiftKey);
                        }}
                      >
                        <td className="px-4 flex items-center justify-center">
                          <Checkbox
                            checked={isSelected}
                            onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id, virtualRow.index, (e as React.MouseEvent).shiftKey); }}
                            aria-label={`Select ${photo.title}`}
                          />
                        </td>
                        <td className="px-4 py-3 flex items-center gap-4 min-w-0">
                          <div className="relative w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border/50">
                            <img
                              src={photo.thumbnailUrl
                                ?? (photo.imageUrl?.startsWith("/api/storage/objects/")
                                  ? photo.imageUrl.replace("/api/storage/objects/", "/api/storage/thumbnails/") + "?s=128"
                                  : photo.imageUrl)}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/photo/${photo.id}`}
                              className="font-medium line-clamp-2 hover:text-primary transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {photo.title}
                            </Link>
                            {photo.sourceUrl && (
                              <p className="text-xs text-muted-foreground/60 mt-0.5 truncate max-w-[260px]">
                                {(() => { try { return new URL(photo.sourceUrl).hostname.replace("www.", ""); } catch { return photo.sourceUrl; } })()}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-accent text-accent-foreground">
                            {photo.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(photo.createdAt), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 flex items-center justify-end gap-2">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                            <Link href={`/photo/${photo.id}`}><Edit className="h-4 w-4" /></Link>
                          </Button>
                          {photo.sourceUrl && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                              <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {isFetchingNextPhotoPage && (
                <div className="flex items-center justify-center py-3 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading more…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {selectionCount} photo{selectionCount !== 1 ? "s" : ""}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The selected photos will be permanently removed from your library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete album confirmation */}
        <AlertDialog open={isDeleteAlbumDialogOpen} onOpenChange={setIsDeleteAlbumDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete album?</AlertDialogTitle>
              <AlertDialogDescription>
                The album will be permanently deleted. Your photos will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDeleteAlbum()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Album
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Remove from album confirmation */}
        <AlertDialog open={isRemoveFromAlbumDialogOpen} onOpenChange={setIsRemoveFromAlbumDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove {selectedIds.size} photo{selectedIds.size !== 1 ? "s" : ""} from album?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The photo{selectedIds.size !== 1 ? "s" : ""} will be removed from this album but will remain in your library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleRemoveFromAlbum()}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk category change */}
        <Dialog open={isCategoryDialogOpen} onOpenChange={(open) => { setIsCategoryDialogOpen(open); if (!open) setNewCategory(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move {selectionCount} photo{selectionCount !== 1 ? "s" : ""}</DialogTitle>
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
              <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkCategory}
                disabled={!newCategory.trim() || bulkUpdateCategory.isPending}
              >
                Save Category
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
                "{emptyCategoryName}" has no more photos. Remove it from the list?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                const updated = [...pinnedCategories.filter(c => c !== emptyCategoryName), emptyCategoryName];
                setPinnedCategories(updated);
                localStorage.setItem("vvm_pinned_photo_cats", JSON.stringify(updated));
              }}>Keep</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                const updated = pinnedCategories.filter(c => c !== emptyCategoryName);
                setPinnedCategories(updated);
                localStorage.setItem("vvm_pinned_photo_cats", JSON.stringify(updated));
                setActiveCategory("All");
              }}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>


        {/* Share selected photos */}
        <Dialog open={isShareDialogOpen} onOpenChange={(open) => { setIsShareDialogOpen(open); if (!open) setShareMessage(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share {selectionCount} photo{selectionCount !== 1 ? "s" : ""} with a Friend</DialogTitle>
              <DialogDescription>
                Choose a friend to send a snapshot of the selected photos.
              </DialogDescription>
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
                    return (
                      <button
                        key={f.id}
                        disabled={sharing !== null}
                        onClick={() => handleShare(f.id)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors text-sm text-left disabled:opacity-50"
                      >
                        <span>{name}</span>
                        {sharing === f.id ? (
                          <span className="text-xs text-muted-foreground">Sending…</span>
                        ) : (
                          <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
            <div className="relative" ref={albumMenuRef}>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => setIsAlbumMenuOpen((o) => !o)}
                disabled={addingToAlbum}
              >
                <Images className="w-4 h-4 mr-1.5" />
                Add to Album
              </Button>
              {isAlbumMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-popover text-popover-foreground border rounded-xl shadow-xl py-1 z-50">
                  <div className="max-h-52 overflow-y-auto">
                    {albums.length === 0 && !isCreatingNewAlbum ? (
                      <p className="px-4 py-2.5 text-sm text-muted-foreground">No albums yet</p>
                    ) : (
                      albums.map((a) => (
                        <button
                          key={a.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left disabled:opacity-50"
                          onClick={() => void handleAddToAlbum(a.id, a.name)}
                          disabled={addingToAlbum}
                        >
                          <Images className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="text-xs text-muted-foreground">{a.photoCount} photo{a.photoCount !== 1 ? "s" : ""}</span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border mt-1" />
                  {isCreatingNewAlbum ? (
                    <div className="px-3 py-2 flex gap-2">
                      <input
                        autoFocus
                        placeholder="Album name…"
                        value={newAlbumDraft}
                        onChange={(e) => setNewAlbumDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleCreateAndAddToAlbum();
                          if (e.key === "Escape") { setIsCreatingNewAlbum(false); setNewAlbumDraft(""); }
                        }}
                        className="flex-1 bg-transparent text-sm outline-none border border-border rounded-md px-2 py-1 placeholder:text-muted-foreground"
                        disabled={addingToAlbum}
                      />
                      <button
                        onClick={() => void handleCreateAndAddToAlbum()}
                        disabled={!newAlbumDraft.trim() || addingToAlbum}
                        className="text-xs font-medium text-primary disabled:opacity-40 px-1"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setIsCreatingNewAlbum(false); setNewAlbumDraft(""); }}
                        className="text-xs text-muted-foreground px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left text-primary font-medium"
                      onClick={() => setIsCreatingNewAlbum(true)}
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      Add New Album
                    </button>
                  )}
                </div>
              )}
            </div>
            {activeAlbumId !== null && (
              <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsRemoveFromAlbumDialogOpen(true)}>
                <FolderMinus className="w-4 h-4 mr-1.5" />
                Remove from Album
              </Button>
            )}
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="w-4 h-4 mr-1.5" />
              Share
            </Button>
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
    </Layout>
  );
}

export default ManagePhotos;
