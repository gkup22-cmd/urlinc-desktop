import { useState, useEffect, useRef, useCallback, Fragment, type CSSProperties, type ReactNode } from "react";
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { openUrl } from "@/lib/openUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Star, Plus, Loader2, Upload, Check, Share2, Trash2, Pencil, ImageDown } from "lucide-react";
import { uploadFile, compressAndUploadPhoto } from "@/lib/upload";
import { useVaultSourceFavorites } from "@/hooks/use-vault-source-favorites";
import { useToast } from "@/hooks/use-toast";

// A built-in card is either a plain external link (url) or a custom
// in-app action (onClick, e.g. the Radio tab's "Live Radio" card switching
// to that section instead of navigating anywhere) -- exactly one is set.
// `pinned` permanently sorts a card ahead of everything else (including
// user favorites) and shows its star as a fixed, non-togglable indicator --
// for cards like Live Radio/Old Radio World that should always be the
// first thing you see rather than something you can favorite away.
export type VaultSource = { name: string; description: string; color: string; emoji?: string; iconUrl?: string; pinned?: boolean } &
  ({ url: string; onClick?: undefined } | { url?: undefined; onClick: () => void });
type CustomVaultSource = { id: number; name: string; url: string; description?: string | null; iconUrl?: string | null };

// Cycled through for user-added sources so each gets a distinct-looking
// color instead of one flat color for all of them, matching how the
// built-in list already looks. Mirrors My Videos' Streaming Services tab.
const CUSTOM_VAULT_SOURCE_COLORS = [
  "bg-rose-500/10 border-rose-500/30 text-rose-400",
  "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
  "bg-lime-500/10 border-lime-500/30 text-lime-400",
  "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
  "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400",
  "bg-orange-500/10 border-orange-500/30 text-orange-400",
];

function SortableTile({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

// Reusable grid for any "pick a source" tab across the app (My Vault's
// Games/Reading/Stories, My Videos' Streaming Services, My Audio's Browse
// Music/Stream Sources/Audiobooks, …): a curated built-in list plus each
// user's own added bookmarks in the same styled cards, a favorite star on
// every card, and a dashed "Add Source" tile at the end. `listType` keys
// the backend's custom-sources/favorites/vault-builtins rows so every tab
// only ever sees its own entries.
export function VaultSourceGrid({ listType, intro, builtIns, onBuiltInClick }: {
  listType: string;
  intro: string;
  builtIns: VaultSource[];
  /** When provided, called instead of openUrl for built-in URL sources. */
  onBuiltInClick?: (source: VaultSource & { url: string }) => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<CustomVaultSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<"link" | "upload">("link");
  const [nameDraft, setNameDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [iconUrlDraft, setIconUrlDraft] = useState("");
  const [grabbingIcon, setGrabbingIcon] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  const [fileDraft, setFileDraft] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  // Set while the add form is repurposed to rename/re-link an existing
  // custom source instead of creating a new one -- same form, same fields,
  // just PATCHes that id on submit rather than POSTing a new row.
  const [editingId, setEditingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isFavorite, toggleFavorite } = useVaultSourceFavorites(listType);

  const [favoritesOrder, setFavoritesOrder] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem(`vault-favorites-order:${listType}`);
      return v ? (JSON.parse(v) as string[]) : [];
    } catch { return []; }
  });
  const orderedFavIdsRef = useRef<string[]>([]);
  const vaultSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const handleVaultFavDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = orderedFavIdsRef.current;
    const oldIdx = currentOrder.indexOf(active.id as string);
    const newIdx = currentOrder.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove([...currentOrder], oldIdx, newIdx);
    setFavoritesOrder(next);
    try { localStorage.setItem(`vault-favorites-order:${listType}`, JSON.stringify(next)); } catch {}
  }, [listType]);
  const handleToggleFavorite = useCallback(async (favId: string, data: { name: string; url: string }, currentlyFav: boolean) => {
    setFavoritesOrder(prev => {
      const next = currentlyFav ? prev.filter(id => id !== favId) : [...prev, favId];
      try { localStorage.setItem(`vault-favorites-order:${listType}`, JSON.stringify(next)); } catch {}
      return next;
    });
    await toggleFavorite(favId, data);
  }, [toggleFavorite, listType]);

  // Selection only ever applies to your own added sources -- built-ins are
  // curated and permanent, so there's nothing to select them for.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastClickedIndex = useRef<number | null>(null);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/custom-sources?type=${encodeURIComponent(listType)}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data: { items: CustomVaultSource[] } = await res.json();
      setItems(data.items);
    } catch {
      // non-critical list -- fail quietly
    } finally {
      setLoading(false);
    }
  }, [listType]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Admin-curated additions to the built-in list (see Admin > Vault Built-in
  // Sources) -- anyone can read these, only admins can add/remove them.
  const [adminBuiltIns, setAdminBuiltIns] = useState<VaultSource[]>([]);
  useEffect(() => {
    fetch(`/api/integrations/vault-builtins?type=${encodeURIComponent(listType)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: { name: string; url: string; description: string; emoji: string | null; iconUrl?: string | null; color: string; pinned?: boolean }[] }) => {
        setAdminBuiltIns((data.items ?? []).map((i) => ({
          name: i.name, url: i.url, description: i.description, color: i.color,
          emoji: i.emoji ?? undefined, iconUrl: i.iconUrl ?? undefined, pinned: i.pinned ?? false,
        })));
      })
      .catch(() => {});
  }, [listType]);

  const handleAdd = useCallback(async () => {
    const name = nameDraft.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (addMode === "link" && !urlDraft.trim()) {
      toast({ title: "Name and URL are both required", variant: "destructive" });
      return;
    }
    if (addMode === "upload" && !fileDraft) {
      toast({ title: "Choose a file to upload", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const url = addMode === "upload" && fileDraft
        ? await uploadFile(fileDraft)
        : urlDraft.trim();
      const description = descriptionDraft.trim();
      // Always round-trip the current icon URL (even unchanged) -- the PATCH
      // endpoint treats a missing iconUrl as "clear it", so if this form
      // didn't carry the existing value forward, every edit would silently
      // wipe out the logo.
      const iconUrl = iconUrlDraft.trim();
      const res = await fetch(
        editingId ? `/api/integrations/custom-sources/${editingId}` : "/api/integrations/custom-sources",
        {
          method: editingId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingId ? { name, url, description, iconUrl } : { type: listType, name, url, description, iconUrl }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to ${editingId ? "save" : "add"} source`);
      }
      setNameDraft("");
      setUrlDraft("");
      setDescriptionDraft("");
      setIconUrlDraft("");
      setFileDraft(null);
      setShowAddForm(false);
      setEditingId(null);
      await refresh();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : `Failed to ${editingId ? "save" : "add"} source`, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }, [nameDraft, urlDraft, descriptionDraft, iconUrlDraft, fileDraft, addMode, listType, editingId, toast, refresh]);

  const startEdit = useCallback((source: CustomVaultSource) => {
    setEditingId(source.id);
    setAddMode("link");
    setNameDraft(source.name);
    setUrlDraft(source.url);
    setDescriptionDraft(source.description ?? "");
    setIconUrlDraft(source.iconUrl ?? "");
    setShowAddForm(true);
  }, []);

  // Reuses the same "fetch a page and pull its image/description" endpoint
  // Vault's reading sources already use -- no reason to build a second
  // scraper just because this one fills different fields.
  const handleGrabIcon = useCallback(async () => {
    const url = urlDraft.trim();
    if (!url) {
      toast({ title: "Enter the link first, then grab its info", variant: "destructive" });
      return;
    }
    setGrabbingIcon(true);
    try {
      const res = await fetch(`/api/photos/prefetch?url=${encodeURIComponent(url)}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data: { imageUrl: string | null; description: string | null } = await res.json();
      if (!data.imageUrl && !data.description) {
        toast({ title: "Couldn't find an image or description on that page", variant: "destructive" });
        return;
      }
      if (data.imageUrl) setIconUrlDraft(data.imageUrl);
      if (data.description) setDescriptionDraft(data.description);
    } catch {
      toast({ title: "Couldn't grab info from that link", variant: "destructive" });
    } finally {
      setGrabbingIcon(false);
    }
  }, [urlDraft, toast]);

  const handleUploadIcon = useCallback(async (file: File) => {
    setUploadingIcon(true);
    try {
      const { thumbnailUrl } = await compressAndUploadPhoto(file);
      setIconUrlDraft(thumbnailUrl);
    } catch {
      toast({ title: "Couldn't upload that image", variant: "destructive" });
    } finally {
      setUploadingIcon(false);
    }
  }, [toast]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    setConfirmBulkDeleteOpen(false);
    try {
      const results = await Promise.all(
        ids.map((id) => fetch(`/api/integrations/custom-sources/${id}`, { method: "DELETE", credentials: "include" })),
      );
      if (results.some((r) => !r.ok)) throw new Error();
    } catch {
      toast({ title: "Some sources failed to delete", variant: "destructive" });
      void refresh();
    }
  }, [selectedIds, toast, refresh]);

  useEffect(() => {
    if (!isShareDialogOpen || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setFriends(data as typeof friends); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [isShareDialogOpen, friendsLoaded]);

  const toggleShareFriend = useCallback((friendId: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId); else next.add(friendId);
      return next;
    });
  }, []);

  const handleShareSend = useCallback(async () => {
    if (selectedFriendIds.size === 0) return;
    setSharing(true);
    try {
      const results = await Promise.all(
        Array.from(selectedFriendIds).map(async (friendId) => {
          const res = await fetch("/api/vault-source-shares", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceIds: Array.from(selectedIds), recipientId: friendId, message: shareMessage || undefined }),
          });
          // A failed request can come back as an HTML error page rather
          // than JSON (e.g. a raw 500), which would otherwise make
          // res.json() throw -- catch that explicitly so one bad response
          // can't silently swallow the whole batch.
          const data = await res.json().catch(() => ({})) as { error?: string };
          return { ok: res.ok, status: res.status, error: data.error };
        }),
      );
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (okCount > 0) {
        toast({ title: `Shared with ${okCount} friend${okCount !== 1 ? "s" : ""}${failCount > 0 ? ` (${failCount} failed)` : ""}` });
      }
      if (okCount === 0) {
        const firstError = results.find((r) => !r.ok)?.error;
        toast({ title: firstError ?? "Failed to share", variant: "destructive" });
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
  }, [selectedFriendIds, selectedIds, shareMessage, toast]);

  const builtInFavId = (name: string) => `b:${name}`;
  const customFavId = (id: number) => `c:${id}`;

  type SourceTile =
    | { kind: "built-in"; source: VaultSource }
    | { kind: "custom"; source: CustomVaultSource; color: string };

  const tiles: SourceTile[] = [
    ...[...builtIns, ...adminBuiltIns].map((source): SourceTile => ({ kind: "built-in", source })),
    ...(!loading
      ? items.map((source, i): SourceTile => ({
          kind: "custom",
          source,
          color: CUSTOM_VAULT_SOURCE_COLORS[i % CUSTOM_VAULT_SOURCE_COLORS.length]!,
        }))
      : []),
  ];
  const getTileFavId = (tile: SourceTile) =>
    tile.kind === "built-in" ? builtInFavId(tile.source.name) : customFavId(tile.source.id);
  const pinnedIds = new Set(tiles.filter(t => t.kind === "built-in" && t.source.pinned).map(getTileFavId));
  const favIdSet = new Set(tiles.filter(t => !pinnedIds.has(getTileFavId(t)) && isFavorite(getTileFavId(t))).map(getTileFavId));
  const tileByFavId = new Map(tiles.map(t => [getTileFavId(t), t]));
  const orderedFavIds = [
    ...favoritesOrder.filter(id => favIdSet.has(id)),
    ...[...favIdSet].filter(id => !favoritesOrder.includes(id)),
  ];
  orderedFavIdsRef.current = orderedFavIds;
  const sortedTiles: SourceTile[] = [
    ...tiles.filter(t => pinnedIds.has(getTileFavId(t))),
    ...orderedFavIds.map(id => tileByFavId.get(id)!),
    ...tiles.filter(t => !pinnedIds.has(getTileFavId(t)) && !favIdSet.has(getTileFavId(t))),
  ];

  const selectableIds = sortedTiles.filter((t) => t.kind === "custom").map((t) => t.source.id);

  const toggleSelect = (id: number, shiftKey: boolean) => {
    const index = selectableIds.indexOf(id);
    const prevIndex = lastClickedIndex.current;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && prevIndex !== null) {
        const lo = Math.min(prevIndex, index);
        const hi = Math.max(prevIndex, index);
        const adding = !next.has(id);
        for (let i = lo; i <= hi; i++) {
          const otherId = selectableIds[i];
          if (otherId !== undefined) adding ? next.add(otherId) : next.delete(otherId);
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
    <div className="max-w-7xl mx-auto px-8 w-full pt-6 pb-12">
      <p className="text-sm text-muted-foreground mb-6">{intro}</p>

      {/* Floating selection pill — fixed at bottom so it never stacks against the sticky page header */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
            <span className="text-sm font-semibold pl-1 pr-2">{selectedIds.size} selected</span>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <Button size="sm" variant="secondary" className="rounded-full gap-1.5" onClick={() => setIsShareDialogOpen(true)}>
              <Share2 className="w-3.5 h-3.5" /> Share
            </Button>
            <Button size="sm" variant="destructive" className="rounded-full gap-1.5" onClick={() => setConfirmBulkDeleteOpen(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <Button size="sm" variant="ghost" className="rounded-full text-primary-foreground hover:bg-primary-foreground/20" onClick={() => { setSelectedIds(new Set()); lastClickedIndex.current = null; }}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 bg-background/95 backdrop-blur">
        {showAddForm && (
        <div className="flex flex-col gap-2 mb-4 p-3 rounded-xl border border-border bg-card">
          {editingId ? (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit Source</p>
          ) : (
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={addMode === "link" ? "secondary" : "ghost"}
              onClick={() => setAddMode("link")}
              className="gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Link to a URL
            </Button>
            <Button
              type="button"
              size="sm"
              variant={addMode === "upload" ? "secondary" : "ghost"}
              onClick={() => setAddMode("upload")}
              className="gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Upload from my computer
            </Button>
          </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Name (e.g. Archive.org)"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="sm:max-w-[220px]"
            />
            {addMode === "link" ? (
              <Input
                placeholder="https://..."
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                className="flex-1"
              />
            ) : (
              <div className="flex-1 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,.pdf,text/html,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setFileDraft(file);
                    if (file && !nameDraft.trim()) {
                      setNameDraft(file.name.replace(/\.[^.]+$/, ""));
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  Choose file
                </Button>
                <span className="text-sm text-muted-foreground truncate">
                  {fileDraft ? fileDraft.name : "HTML or PDF, up to 50 MB"}
                </span>
              </div>
            )}
            <Button type="button" onClick={handleAdd} disabled={adding} className="gap-1.5 shrink-0">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingId ? "Save" : "Add"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setShowAddForm(false); setFileDraft(null); setEditingId(null); setNameDraft(""); setUrlDraft(""); setDescriptionDraft(""); setIconUrlDraft(""); }}
              className="shrink-0"
            >
              Cancel
            </Button>
          </div>
          <Input
            placeholder="Description (optional) — e.g. what this station plays"
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
          />
          <div className="flex gap-2">
            {iconUrlDraft && (
              <img src={iconUrlDraft} alt="" className="w-8 h-8 rounded object-contain bg-black/20 shrink-0 border border-border" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <Input
              placeholder="Icon image URL (optional)"
              value={iconUrlDraft}
              onChange={(e) => setIconUrlDraft(e.target.value)}
              className="flex-1"
            />
            <input
              ref={iconFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file) void handleUploadIcon(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => iconFileInputRef.current?.click()}
              disabled={uploadingIcon}
              title="Upload an image from your computer"
              className="gap-1.5 shrink-0"
            >
              {uploadingIcon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleGrabIcon()}
              disabled={grabbingIcon || !urlDraft.trim()}
              title="Pull the icon and description straight from the link above"
              className="gap-1.5 shrink-0"
            >
              {grabbingIcon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
              Grab it
            </Button>
          </div>
        </div>
        )}
        </div>
      )}

      <DndContext sensors={vaultSensors} collisionDetection={closestCenter} onDragEnd={(e) => { handleVaultFavDragEnd(e); const blockClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', blockClick, { capture: true }), 200); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <SortableContext items={orderedFavIds} strategy={rectSortingStrategy}>
        {sortedTiles.map((tile) => {
          const tileFavId = getTileFavId(tile);
          const isSortable = favIdSet.has(tileFavId);

          if (tile.kind === "built-in") {
            const favId = tileFavId;
            const isFav = isFavorite(favId);
            const cardBody = (
              <>
                {tile.source.emoji && <div className="text-4xl">{tile.source.emoji}</div>}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {tile.source.iconUrl && (
                      <img src={tile.source.iconUrl} alt="" className="w-7 h-7 rounded object-contain bg-black/20 shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    )}
                    <p className="font-semibold text-sm truncate">{tile.source.name}</p>
                  </div>
                  {!tile.source.emoji && tile.source.url && <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{tile.source.description}</p>
                {tile.source.onClick && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                    Plays in URLinc
                  </span>
                )}
              </>
            );
            const card = (
              <div className={`relative rounded-xl border bg-card hover:shadow-md transition-shadow group ${tile.source.color}`}>
                {tile.source.onClick ? (
                  <button type="button" onClick={tile.source.onClick} className="flex flex-col gap-2 p-4 pt-8 w-full text-left">
                    {cardBody}
                  </button>
                ) : (
                  <a href={tile.source.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2 p-4 pt-8"
                    onClick={(e) => { e.preventDefault(); if (tile.source.url) { if (onBuiltInClick) onBuiltInClick(tile.source as VaultSource & { url: string }); else openUrl(tile.source.url); } }}>
                    {cardBody}
                  </a>
                )}
                {tile.source.pinned ? (
                  <span title="Always shown first" className="absolute top-2 right-2 z-10 p-1 rounded-full bg-black/60 text-primary">
                    <Star className="w-3.5 h-3.5 fill-primary" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleToggleFavorite(favId, { name: tile.source.name, url: tile.source.url ?? "" }, isFav); }}
                    title={isFav ? "Remove from favorites" : "Add to favorites"}
                    className={`absolute top-2 right-2 z-10 p-1 rounded-full transition-all ${
                      isFav ? "bg-black/60 text-primary opacity-100" : "bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-primary"
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
                  </button>
                )}
              </div>
            );
            if (isSortable) return <SortableTile key={favId} id={favId}>{card}</SortableTile>;
            return <Fragment key={favId}>{card}</Fragment>;
          }

          const { source, color } = tile;
          const favId = tileFavId;
          const isFav = isFavorite(favId);
          const isSelected = selectedIds.has(source.id);
          const card = (
            <div className={`relative rounded-xl border bg-card hover:shadow-md transition-shadow group ${color}`}>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(source.id, e.shiftKey); }}
                title={isSelected ? "Deselect" : "Select"}
                className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? "bg-primary border-primary opacity-100"
                    : `bg-black/40 border-white/70 ${selectedIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
              </button>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-2 p-4 pt-8"
                onClick={(e) => {
                  e.preventDefault();
                  if (selectedIds.size > 0 || e.shiftKey) {
                    toggleSelect(source.id, e.shiftKey);
                  } else if (source.url) {
                    openUrl(source.url);
                  }
                }}
              >
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {source.iconUrl && (
                      <img src={source.iconUrl} alt="" className="w-7 h-7 rounded object-contain bg-black/20 shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    )}
                    <p className="font-semibold text-sm truncate">{source.name}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{source.description || "Added by you"}</p>
              </a>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(source); }}
                title="Rename or change the link"
                className="absolute top-2 right-9 z-10 p-1 rounded-full transition-all bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-primary"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleToggleFavorite(favId, { name: source.name, url: source.url }, isFav); }}
                title={isFav ? "Remove from favorites" : "Add to favorites"}
                className={`absolute top-2 right-2 z-10 p-1 rounded-full transition-all ${
                  isFav ? "bg-black/60 text-primary opacity-100" : "bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-primary"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
              </button>
            </div>
          );
          if (isSortable) return <SortableTile key={favId} id={favId}>{card}</SortableTile>;
          return <Fragment key={favId}>{card}</Fragment>;
        })}
        </SortableContext>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors min-h-[88px]"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Add Source</span>
        </button>
      </div>
      </DndContext>

      {loading && (
        <div className="flex items-center justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <AlertDialog open={confirmBulkDeleteOpen} onOpenChange={setConfirmBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} source{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleBulkDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isShareDialogOpen} onOpenChange={(open) => { setIsShareDialogOpen(open); if (!open) { setShareMessage(""); setSelectedFriendIds(new Set()); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {selectedIds.size} source{selectedIds.size !== 1 ? "s" : ""} with Friends</DialogTitle>
            <DialogDescription>Check one or more friends to send the selected sources to.</DialogDescription>
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
