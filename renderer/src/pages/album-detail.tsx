import { useState, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Images, Trash2, ExternalLink, GripVertical, Pencil, Check, X, ImageIcon,
  Download, Share2, Send,
} from "lucide-react";
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

interface AlbumPhoto {
  id: number;
  title: string;
  imageUrl: string;
  category: string;
  sourceUrl: string | null;
}

interface AlbumDetail {
  id: number;
  name: string;
  description: string | null;
  photos: AlbumPhoto[];
  createdAt: string;
  updatedAt: string;
}

function albumQueryKey(id: number) {
  return ["album", id];
}

function albumsQueryKey() {
  return ["albums"];
}

async function fetchAlbum(id: number): Promise<AlbumDetail> {
  const res = await fetch(`/api/albums/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Not found");
  return res.json() as Promise<AlbumDetail>;
}

function SortablePhotoRow({
  photo,
  onRemove,
  removing,
}: {
  photo: AlbumPhoto;
  onRemove: (id: number, title: string) => void;
  removing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

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

      <Link href={`/photo/${photo.id}`}>
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted shrink-0 border border-border/50">
          <img
            src={photo.imageUrl}
            alt={photo.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      </Link>

      <Link href={`/photo/${photo.id}`} className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate leading-snug hover:text-primary transition-colors">{photo.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{photo.category}</p>
      </Link>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {photo.sourceUrl && (
          <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" title="Open source">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </a>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          title="Remove from album"
          onClick={() => onRemove(photo.id, photo.title)}
          disabled={removing}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function AlbumDetail() {
  const [, params] = useRoute("/albums/:id");
  const id = params ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: album, isLoading } = useQuery({
    queryKey: albumQueryKey(id),
    queryFn: () => fetchAlbum(id),
    enabled: !!id,
  });

  const [localPhotos, setLocalPhotos] = useState<AlbumPhoto[] | null>(null);
  const photos: AlbumPhoto[] = localPhotos ?? album?.photos ?? [];

  const removePhoto = useMutation({
    mutationFn: async (photoId: number) => {
      const res = await fetch(`/api/albums/${id}/photos/${photoId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<AlbumDetail>;
    },
  });

  const reorder = useMutation({
    mutationFn: async (photoIds: number[]) => {
      const res = await fetch(`/api/albums/${id}/reorder`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<AlbumDetail>;
    },
  });

  const deleteAlbum = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/albums/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
  });

  const updateAlbum = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await fetch(`/api/albums/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<AlbumDetail>;
    },
  });

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);

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

  const handleExport = () => {
    if (!album) return;
    setIsExporting(true);
    try {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        albumName: album.name,
        description: album.description,
        photos: photos.map((p) => ({
          title: p.title,
          imageUrl: p.imageUrl,
          category: p.category,
          sourceUrl: p.sourceUrl ?? null,
        })),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `web-vault-album-${album.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported "${album.name}" with ${photos.length} photo${photos.length !== 1 ? "s" : ""}` });
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async (friendId: string) => {
    if (!album || photos.length === 0) return;
    setSharing(friendId);
    try {
      const res = await fetch("/api/photo-category-shares", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: friendId,
          photoIds: photos.map((p) => p.id),
          message: shareMessage || undefined,
        }),
      });
      const data = await res.json() as { error?: string; photoCount?: number };
      if (res.ok) {
        toast({ title: `Shared "${album.name}" (${data.photoCount ?? photos.length} photo${(data.photoCount ?? photos.length) !== 1 ? "s" : ""})` });
        setShareMenuOpen(false);
        setShareMessage("");
      } else {
        toast({ title: data.error ?? "Failed to share", variant: "destructive" });
      }
    } finally {
      setSharing(null);
    }
  };

  const startEditName = () => {
    setEditNameValue(album?.name ?? "");
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const saveEditName = () => {
    const trimmed = editNameValue.trim();
    if (!trimmed || !album || trimmed === album.name) { setIsEditingName(false); return; }
    updateAlbum.mutate({ name: trimmed }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(albumQueryKey(id), updated);
        queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
        toast({ title: "Album renamed" });
      },
      onError: () => toast({ title: "Failed to rename album", variant: "destructive" }),
      onSettled: () => setIsEditingName(false),
    });
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAlphabetizeDialog, setShowAlphabetizeDialog] = useState(false);

  const handleAlphabetize = () => {
    const sorted = [...photos].sort((a, b) => a.title.localeCompare(b.title));
    setLocalPhotos(sorted);
    reorder.mutate(sorted.map((p) => p.id), {
      onSuccess: (data) => {
        setLocalPhotos(null);
        queryClient.setQueryData(albumQueryKey(id), data);
        toast({ title: "Album alphabetized" });
      },
      onError: () => {
        setLocalPhotos(null);
        toast({ title: "Failed to alphabetize album", variant: "destructive" });
      },
    });
  };

  const confirmDelete = () => {
    if (!album) return;
    deleteAlbum.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
        toast({ title: `Deleted "${album.name}"` });
        setLocation("/albums");
      },
      onError: () => toast({ title: "Failed to delete album", variant: "destructive" }),
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleRemove = (photoId: number, title: string) => {
    removePhoto.mutate(photoId, {
      onSuccess: () => {
        setLocalPhotos(null);
        queryClient.invalidateQueries({ queryKey: albumQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
        toast({ title: `Removed "${title}" from album` });
      },
      onError: () => toast({ title: "Failed to remove photo", variant: "destructive" }),
    });
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(photos, oldIndex, newIndex);
    setLocalPhotos(reordered);

    reorder.mutate(reordered.map((p) => p.id), {
      onSuccess: (data) => {
        setLocalPhotos(null);
        queryClient.setQueryData(albumQueryKey(id), data);
      },
      onError: () => {
        setLocalPhotos(null);
        toast({ title: "Failed to save new order", variant: "destructive" });
      },
    });
  }, [photos, id, reorder, queryClient, toast]);

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

        {!isLoading && album && (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-3 group">
                <Images className="w-8 h-8 text-primary shrink-0" />
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
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => setShowDeleteDialog(true)} disabled={deleteAlbum.isPending} className="text-destructive hover:opacity-70 shrink-0 ml-1 disabled:opacity-40" title="Delete album">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-3xl font-display font-bold truncate">{album.name}</h1>
                    <button
                      onClick={startEditName}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                      title="Rename album"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {album.description && (
                <p className="text-muted-foreground mt-2">{album.description}</p>
              )}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {photos.length} photo{photos.length !== 1 ? "s" : ""}
                  {photos.length > 1 && (
                    <span className="ml-2 text-muted-foreground/60">· drag to reorder</span>
                  )}
                </p>
                {photos.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAlphabetizeDialog(true)}
                    disabled={reorder.isPending}
                  >
                    A→Z
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting || photos.length === 0}
                  title="Export this album as a JSON file"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? "Exporting…" : "Export"}
                </Button>

                <div className="relative" ref={shareMenuRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShareMenuOpen((o) => !o)}
                    disabled={photos.length === 0}
                    title="Share album photos with a friend"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                  {shareMenuOpen && (
                    <div className="absolute left-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
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
                                disabled={sharing !== null}
                                onClick={() => void handleShare(f.id)}
                              >
                                <span className="text-sm truncate">{name}</span>
                                {sharing === f.id
                                  ? <span className="text-xs text-muted-foreground">Sending…</span>
                                  : <Send className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                }
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
              </div>
            </div>

            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <ImageIcon className="w-12 h-12 text-muted-foreground/40" />
                <p className="font-medium">This album is empty</p>
                <p className="text-sm text-muted-foreground">
                  Open any photo and add it to this album from there, or use Manage Photos.
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <Button variant="outline" onClick={() => setLocation("/manage-photos")}>
                    Add Photos
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deleteAlbum.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Album
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={photos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="divide-y divide-border">
                      {photos.map((photo) => (
                        <SortablePhotoRow
                          key={photo.id}
                          photo={photo}
                          onRemove={handleRemove}
                          removing={removePhoto.isPending}
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
            <AlertDialogTitle>Alphabetize this album?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sort all photos A → Z by title. Your current album order will be permanently lost and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowAlphabetizeDialog(false); handleAlphabetize(); }}>
              Alphabetize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle>Delete album "{album?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the album. Your photos will not be removed from the library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
