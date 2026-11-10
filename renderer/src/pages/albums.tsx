import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Images, Plus, Trash2, ImageIcon } from "lucide-react";

interface AlbumSummary {
  id: number;
  name: string;
  description: string | null;
  photoCount: number;
  createdAt: string;
}

function albumsQueryKey() {
  return ["albums"];
}

async function fetchAlbums(): Promise<AlbumSummary[]> {
  const res = await fetch("/api/albums", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json() as Promise<AlbumSummary[]>;
}

export default function Albums() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: albums = [], isLoading } = useQuery({
    queryKey: albumsQueryKey(),
    queryFn: fetchAlbums,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<AlbumSummary | null>(null);

  const createAlbum = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch("/api/albums", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<AlbumSummary & { id: number }>;
    },
    onSuccess: (album) => {
      queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
      toast({ title: `Album "${album.name}" created` });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setLocation(`/albums/${album.id}`);
    },
    onError: () => toast({ title: "Failed to create album", variant: "destructive" }),
  });

  const deleteAlbum = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/albums/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
      toast({ title: `Deleted "${deleteTarget?.name}"` });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Failed to delete album", variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Images className="w-8 h-8 text-primary" />
              Albums
            </h1>
            <p className="text-muted-foreground mt-1">
              Curate your photos into custom collections.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Album
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-muted animate-pulse aspect-[4/3]" />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Images className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-lg font-medium">No albums yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Create an album to group your photos into curated collections.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="mt-2 gap-2">
              <Plus className="w-4 h-4" />
              Create your first album
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {albums.map((album) => (
              <div key={album.id} className="group relative">
                <Link href={`/albums/${album.id}`}>
                  <div className="rounded-xl overflow-hidden bg-muted border border-border/50 shadow-sm hover:shadow-md transition-all hover:border-primary/30 cursor-pointer">
                    <div className="aspect-[4/3] flex items-center justify-center bg-muted">
                      <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-sm truncate">{album.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {album.photoCount} photo{album.photoCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteTarget(album); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
                  title="Delete album"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setNewName(""); setNewDesc(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Album</DialogTitle>
            <DialogDescription>Give your album a name to get started.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              autoFocus
              placeholder="Album name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createAlbum.mutate({ name: newName.trim(), description: newDesc.trim() || undefined }); }}
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || createAlbum.isPending}
              onClick={() => createAlbum.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })}
            >
              Create Album
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete album "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the album. Your photos will remain in your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteAlbum.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
