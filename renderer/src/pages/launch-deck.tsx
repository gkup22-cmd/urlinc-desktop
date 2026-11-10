import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Star, ExternalLink, X, Rocket, Download, Monitor, FolderOpen, Globe, Search, ImageIcon, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type LaunchItem = {
  id: number;
  name: string;
  url: string;
  emoji: string;
  category: string | null;
  sortOrder: number;
  isFavorite: boolean;
};

type FormState = {
  name: string;
  url: string;
  emoji: string;
  category: string;
  isFavorite: boolean;
};

const BLANK: FormState = { name: "", url: "", emoji: "🚀", category: "", isFavorite: false };

// Consistent color from item name (matches the colored dot style in the screenshot)
const DOT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f59e0b",
];
function dotColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}

function LaunchRow({
  item,
  onEdit,
  onDelete,
  onToggleFav,
  onToast,
  onMoveToPhotos,
  onShare,
}: {
  item: LaunchItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFav: () => void;
  onToast: (msg: string) => void;
  onMoveToPhotos: () => void;
  onShare: () => void;
}) {
  const isLocalApp = item.url.startsWith("urlinc-launch://");
  const [launching, setLaunching] = useState(false);

  const queueLaunch = async () => {
    const filePath = item.url.slice("urlinc-launch://".length).replace(/\//g, "\\");
    setLaunching(true);
    try {
      const res = await fetch("/api/launch-deck/queue-launch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      if (!res.ok) { onToast("Could not queue launch — are you signed in?"); return; }
      const { id } = await res.json();

      // After 3s check if the helper picked it up; only nag if it didn't
      setTimeout(async () => {
        try {
          const check = await fetch(`/api/launch-deck/check-launch/${id}`, {
            credentials: "include",
          });
          const { pending } = await check.json();
          if (pending) onToast("URLinc Helper doesn't appear to be running — check your system tray");
        } catch { /* ignore */ }
      }, 3000);
    } catch {
      onToast("Could not reach server");
    } finally {
      setTimeout(() => setLaunching(false), 1200);
    }
  };

  const handleRowClick = () => {
    if (isLocalApp) {
      void queueLaunch();
    } else {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };

  const stopAction = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <div
      onClick={handleRowClick}
      className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl bg-card border transition-all duration-100 cursor-pointer select-none ${
        launching
          ? "border-violet-500/60 bg-violet-500/10"
          : "border-border hover:border-border/80 hover:bg-accent/30"
      }`}
    >
      {/* Hover tooltip — full name + URL */}
      <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 max-w-xs">
          <p className="text-xs font-semibold leading-snug text-primary">{item.emoji} {item.name}</p>
          {item.url && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[260px]">{item.url}</p>
          )}
        </div>
      </div>

      {/* Colored dot — purple tint for local apps */}
      <span
        className="shrink-0 w-2.5 h-2.5 rounded-full"
        style={{ background: isLocalApp ? "#8b5cf6" : dotColor(item.name) }}
      />

      {/* Name */}
      <span
        className="flex-1 text-sm font-medium text-foreground truncate hover:text-primary transition-colors"
      >
        <span className="mr-1.5">{item.emoji}</span>
        {launching ? <span className="text-violet-400">Launching…</span> : item.name}
        {isLocalApp && !launching && (
          <Monitor className="inline w-3 h-3 ml-1.5 text-muted-foreground/50" />
        )}
      </span>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={(e) => stopAction(e, onShare)}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-green-400"
          title="Share with Friend"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => stopAction(e, onMoveToPhotos)}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-blue-400"
          title="Move to Photos"
        >
          <ImageIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => stopAction(e, onEdit)}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => stopAction(e, onToggleFav)}
          className={`p-1.5 rounded-lg hover:bg-muted transition-all ${
            item.isFavorite
              ? "text-yellow-400 opacity-100"
              : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-yellow-400"
          }`}
          title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={`w-3.5 h-3.5 ${item.isFavorite ? "fill-current" : ""}`} />
        </button>
        <button
          onClick={(e) => stopAction(e, onDelete)}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all text-muted-foreground hover:text-destructive"
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SortableRow(props: React.ComponentProps<typeof LaunchRow> & { id: number }) {
  const { id, ...rowProps } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : undefined,
        position: "relative",
      }}
      {...attributes}
      {...listeners}
    >
      <LaunchRow {...rowProps} />
    </div>
  );
}

export function LaunchDeckContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [shareItem, setShareItem] = useState<LaunchItem | null>(null);
  const [shareMsg, setShareMsg] = useState("");
  const [sharing, setSharing] = useState(false);
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<LaunchItem | null>(null);

  const { data: items = [], isLoading } = useQuery<LaunchItem[]>({
    queryKey: ["launch-deck"],
    queryFn: () =>
      fetch("/api/launch-deck", { credentials: "include" }).then((r) => r.json()),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 8_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["launch-deck"] });

  // Shows a toast with a "Don't show again" button; skips entirely if already dismissed.
  const onceToast = (key: string, title: string) => {
    if (localStorage.getItem(`launch-deck-toast-${key}`)) return;
    toast({
      title,
      duration: 7000,
      action: (
        <ToastAction
          altText="Don't show again"
          onClick={() => localStorage.setItem(`launch-deck-toast-${key}`, "1")}
        >
          Don't show again
        </ToastAction>
      ),
    });
  };

  const openExplorer = async () => {
    setDialogOpen(false);
    try {
      await fetch("/api/launch-deck/queue-launch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "C:\\Windows\\explorer.exe" }),
      });
      onceToast("browse-files", "Explorer opening — right-click any file → Add to URLinc Launch Deck");
    } catch {
      toast({ title: "Could not open Explorer", variant: "destructive" });
    }
  };

  const openAdd = () => {
    setEditId(null);
    setForm(BLANK);
    setDialogOpen(true);
  };

  const openEdit = (item: LaunchItem) => {
    setEditId(item.id);
    setForm({
      name: item.name,
      url: item.url,
      emoji: item.emoji,
      category: item.category ?? "",
      isFavorite: item.isFavorite,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast({ title: "Name and URL are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        url: form.url.trim(),
        emoji: form.emoji.trim() || "🚀",
        category: form.category.trim() || null,
        isFavorite: form.isFavorite,
      };
      const res = await fetch(
        editId !== null ? `/api/launch-deck/${editId}` : "/api/launch-deck",
        {
          method: editId !== null ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error("Save failed");
      toast({ title: editId !== null ? "Shortcut updated" : "Shortcut added" });
      setDialogOpen(false);
      void invalidate();
    } catch {
      toast({ title: "Could not save shortcut", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleMoveToPhotos = async (item: LaunchItem) => {
    const isImageUrl = (url: string) =>
      /^https?:\/\//i.test(url) && /\.(jpe?g|png|gif|webp|svg|bmp|avif)(\?|$)/i.test(url);
    const isLocalLaunch = (url: string) => url.startsWith("urlinc-launch://") || url.startsWith("file://");
    const imageUrl = isLocalLaunch(item.url) || !isImageUrl(item.url) ? undefined : item.url;
    const sourceUrl = /^https?:\/\//i.test(item.url) && !isLocalLaunch(item.url) ? item.url : undefined;
    try {
      const res = await fetch("/api/photos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.name,
          category: item.category || "Imported",
          ...(imageUrl ? { imageUrl } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
        }),
      });
      if (!res.ok) { toast({ title: "Failed to move to Photos", variant: "destructive" }); return; }
      await fetch(`/api/launch-deck/${item.id}`, { method: "DELETE", credentials: "include" });
      void invalidate();
      const note = imageUrl ? "" : " (upload the image on its detail page)";
      toast({ title: `"${item.name}" moved to Photos${note}` });
    } catch {
      toast({ title: "Failed to move to Photos", variant: "destructive" });
    }
  };

  const handleDelete = (id: number) => {
    const item = items.find((i) => i.id === id);
    if (item) setDeleteConfirmItem(item);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmItem) return;
    const id = deleteConfirmItem.id;
    setDeleteConfirmItem(null);
    try {
      await fetch(`/api/launch-deck/${id}`, { method: "DELETE", credentials: "include" });
      void invalidate();
    } catch {
      toast({ title: "Could not delete shortcut", variant: "destructive" });
    }
  };

  const handleToggleFav = async (item: LaunchItem) => {
    try {
      await fetch(`/api/launch-deck/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !item.isFavorite }),
      });
      void invalidate();
    } catch {
      toast({ title: "Could not update favorite", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!shareItem || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setFriends(data as typeof friends); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [shareItem, friendsLoaded]);

  const handleShare = async (friendId: string) => {
    if (!shareItem) return;
    setSharing(true);
    try {
      const res = await fetch("/api/launch-deck-shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: friendId, name: shareItem.name, url: shareItem.url, emoji: shareItem.emoji, message: shareMsg || undefined }),
      });
      if (!res.ok) { toast({ title: "Could not share — make sure you're friends", variant: "destructive" }); return; }
      toast({ title: `"${shareItem.name}" shared!` });
      setShareItem(null);
      setShareMsg("");
    } catch {
      toast({ title: "Could not share", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  // All unique categories (for filter chips and dialog autocomplete)
  const allCategories = useMemo(
    () => [...new Set(items.filter((i) => i.category).map((i) => i.category!))].sort(),
    [items],
  );

  // Apply search + category filter, then group
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q)) &&
        (!filterCat || i.category === filterCat),
    );
  }, [items, search, filterCat]);

  const favorites = filtered.filter((i) => i.isFavorite);
  const rest = filtered.filter((i) => !i.isFavorite);
  const categories = [...new Set(rest.filter((i) => i.category).map((i) => i.category!))].sort();
  const uncategorized = rest.filter((i) => !i.category);

  const handleDragEnd = async (event: DragEndEvent, group: LaunchItem[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = Number(active.id);
    const overId = Number(over.id);
    const oldIndex = group.findIndex((i) => i.id === activeId);
    const newIndex = group.findIndex((i) => i.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(group, oldIndex, newIndex);
    const groupIds = new Set(group.map((i) => i.id));
    queryClient.setQueryData(["launch-deck"], (old: LaunchItem[] = []) => [
      ...old.filter((i) => !groupIds.has(i.id)),
      ...reordered,
    ]);
    try {
      await fetch("/api/launch-deck/reorder", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((i) => i.id) }),
      });
    } catch {
      void invalidate();
    }
  };

  // 3-column grid of rows
  const cols = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2";

  const SectionLabel = ({ label }: { label: string }) => (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 mt-6 first:mt-0">
      {label}
    </p>
  );

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Rocket className="w-6 h-6 text-primary" />
            Launch Deck
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            One-click shortcuts to your apps, tools, and sites
          </p>

          {/* Search + category dropdown */}
          {!isLoading && items.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search shortcuts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              {allCategories.length > 0 && (
                <select
                  value={filterCat ?? ""}
                  onChange={(e) => setFilterCat(e.target.value || null)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All categories</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-20 text-muted-foreground text-sm">Loading…</div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="text-6xl">🚀</div>
            <p className="text-lg font-semibold">Your Launch Deck is empty</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Add shortcuts to apps, websites, or Windows tools — anything that opens with a URL or protocol.
            </p>
            <div className="mt-3 rounded-xl border border-border bg-muted/40 px-5 py-4 text-left text-xs text-muted-foreground max-w-xs space-y-1">
              <p className="font-semibold text-foreground mb-2">Quick start examples</p>
              <p><code className="bg-muted px-1 rounded">ms-calculator:</code> — Windows Calculator</p>
              <p><code className="bg-muted px-1 rounded">ms-settings:</code> — Windows Settings</p>
              <p><code className="bg-muted px-1 rounded">spotify:</code> — Spotify</p>
              <p><code className="bg-muted px-1 rounded">steam://open/games</code> — Steam library</p>
              <p><code className="bg-muted px-1 rounded">https://…</code> — any web page</p>
            </div>
          </div>
        )}

        {/* No results from search/filter */}
        {!isLoading && items.length > 0 && filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No shortcuts match — <button className="underline hover:text-foreground" onClick={() => { setSearch(""); setFilterCat(null); }}>clear filters</button>
          </div>
        )}

        {/* Content */}
        {!isLoading && items.length > 0 && filtered.length > 0 && (
          <div>
            {/* Favorites pinned at top when showing all items */}
            {favorites.length > 0 && !filterCat && (
              <>
                <SectionLabel label="Favorites" />
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { void handleDragEnd(e, favorites); const block = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener("click", block, { capture: true, once: true }); setTimeout(() => document.removeEventListener("click", block, { capture: true }), 200); }}>
                  <SortableContext items={favorites.map((i) => i.id)} strategy={rectSortingStrategy}>
                    <div className={cols}>
                      {favorites.map((item) => (
                        <SortableRow
                          key={item.id}
                          id={item.id}
                          item={item}
                          onEdit={() => openEdit(item)}
                          onDelete={() => void handleDelete(item.id)}
                          onToggleFav={() => void handleToggleFav(item)}
                          onToast={(msg) => toast({ title: msg })}
                          onMoveToPhotos={() => void handleMoveToPhotos(item)}
                          onShare={() => setShareItem(item)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}

            {/* Flat list — all non-favorite items (or all items when category-filtered) */}
            <div className={favorites.length > 0 && !filterCat ? "mt-2" : undefined}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { void handleDragEnd(e, filterCat ? filtered : rest); const block = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener("click", block, { capture: true, once: true }); setTimeout(() => document.removeEventListener("click", block, { capture: true }), 200); }}>
              <SortableContext items={(filterCat ? filtered : rest).map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className={cols}>
                  {(filterCat ? filtered : rest).map((item) => (
                    <SortableRow
                      key={item.id}
                      id={item.id}
                      item={item}
                      onEdit={() => openEdit(item)}
                      onDelete={() => void handleDelete(item.id)}
                      onToggleFav={() => void handleToggleFav(item)}
                      onToast={(msg) => toast({ title: msg })}
                      onMoveToPhotos={() => void handleMoveToPhotos(item)}
                      onShare={() => setShareItem(item)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            </div>
          </div>
        )}

        {/* Add Shortcut — bottom row */}
        {!isLoading && (
          <button
            onClick={openAdd}
            className="mt-3 flex items-center gap-2 w-full md:w-auto px-4 py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/20 transition-all duration-150"
          >
            <Plus className="w-4 h-4" /> Add Shortcut
          </button>
        )}

        {/* Desktop Helper callout */}
        {!isLoading && (
          <div className="mt-8 rounded-2xl border border-border bg-card/50 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Monitor className="w-4 h-4 text-violet-400" />
                Add Windows apps with one right-click
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Install the URLinc Desktop Helper to add any file directly from Windows Explorer — apps, documents, music, photos, spreadsheets — right-click → "Add to URLinc Launch Deck". Clicking a local tile launches it automatically.
              </p>
            </div>
            <span className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted/40 border border-border text-muted-foreground text-sm font-medium cursor-default select-none">
              <Download className="w-4 h-4" /> Coming Soon
            </span>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId !== null ? "Edit Shortcut" : "Add Shortcut"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Emoji + Name */}
            <div className="flex gap-3">
              <div className="space-y-1.5 w-20 shrink-0">
                <label className="text-xs font-medium text-muted-foreground">Icon</label>
                <input
                  type="text"
                  value={form.emoji}
                  onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                  className="w-full h-10 rounded-md border border-input bg-background px-2 text-2xl text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  maxLength={6}
                  placeholder="🚀"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Calculator"
                  maxLength={60}
                  autoFocus
                />
              </div>
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> URL or Protocol
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="https://example.com  or  ms-calculator:"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 gap-1.5 shrink-0"
                  title="Open a browser tab to find the URL you want, then copy it from the address bar"
                  onClick={() => {
                    window.open("about:blank", "_blank", "noopener");
                    onceToast("browse-web", "Navigate to the site you want, then copy the URL from the address bar and paste it here");
                  }}
                >
                  <Globe className="w-4 h-4" />
                  Browse
                </Button>
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Category <span className="text-muted-foreground/50">(optional)</span>
              </label>
              {/* Existing category chips — click to select */}
              {allCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: f.category === cat ? "" : cat }))}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${
                        form.category === cat
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={allCategories.length > 0 ? "Or type a new category…" : "e.g. Windows, Work, Entertainment"}
                maxLength={60}
              />
            </div>

          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editId === null && (
              <Button
                variant="outline"
                onClick={() => void openExplorer()}
                disabled={saving}
                className="sm:mr-auto gap-2"
                title="Open File Explorer to browse and right-click a file"
              >
                <FolderOpen className="w-4 h-4" /> Browse Files
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : editId !== null ? "Save Changes" : "Add Shortcut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmItem} onOpenChange={(o) => { if (!o) setDeleteConfirmItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove shortcut?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            {deleteConfirmItem && (
              <><span className="font-medium text-foreground">{deleteConfirmItem.emoji} {deleteConfirmItem.name}</span> will be removed from your Launch Deck.</>
            )}
          </p>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share with Friend Dialog */}
      <Dialog open={!!shareItem} onOpenChange={(o) => { if (!o) { setShareItem(null); setShareMsg(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share with a Friend</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {shareItem && (
              <p className="text-sm text-muted-foreground truncate">
                Sharing: <span className="font-medium text-foreground">{shareItem.emoji} {shareItem.name}</span>
              </p>
            )}
            <Input
              placeholder="Add a message (optional)"
              value={shareMsg}
              onChange={(e) => setShareMsg(e.target.value)}
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
                      disabled={sharing}
                      onClick={() => void handleShare(f.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors text-sm text-left disabled:opacity-50"
                    >
                      <span>{name}</span>
                      {sharing ? <span className="text-xs text-muted-foreground">Sending…</span> : <Share2 className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShareItem(null); setShareMsg(""); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function LaunchDeckPage() {
  return (
    <Layout>
      <LaunchDeckContent />
    </Layout>
  );
}
