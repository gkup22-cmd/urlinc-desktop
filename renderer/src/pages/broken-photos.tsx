import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  bulkDeletePhotos,
  getListPhotosQueryKey,
  getGetPhotoStatsQueryKey,
} from "@workspace/api-client-react";
import {
  LinkIcon,
  Trash2,
  CheckSquare,
  Square,
  ExternalLink,
  ImageIcon,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

type BrokenPhoto = {
  id: number;
  title: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  category: string;
  createdAt: string;
};

function ThumbImg({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (!src) return (
    <div className="w-16 h-16 rounded bg-muted flex items-center justify-center shrink-0">
      <ImageIcon className="w-4 h-4 text-muted-foreground" />
    </div>
  );
  return (
    <img
      src={src}
      alt={alt}
      className="w-16 h-16 rounded object-cover shrink-0"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  );
}

async function fetchBrokenPhotos(): Promise<{ checked: number; broken: BrokenPhoto[] }> {
  const res = await fetch("/api/photos/broken", { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Failed to check photos");
  }
  return res.json();
}

export default function BrokenPhotos() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["photos-broken"],
    queryFn: fetchBrokenPhotos,
  });

  const broken = data?.broken ?? [];
  const checked = data?.checked ?? 0;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);

  useEffect(() => {
    if (broken.length > 0) {
      setSelected(new Set(broken.map((p) => p.id)));
    }
  }, [broken]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) { toast({ title: "Nothing selected to delete" }); return; }
    setIsDeleting(true);
    try {
      await bulkDeletePhotos({ ids });
      queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
      setSelected(new Set());
      setDeletedCount(ids.length);
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <LinkIcon className="w-8 h-8 text-primary" />
              Find Broken Photo Links
            </h1>
            <p className="text-muted-foreground mt-2">
              Checks all your vault photos with external image URLs. Photos whose source image
              is no longer accessible show up here for you to review and remove.
            </p>
          </div>
          {selected.size > 0 && (
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="shrink-0">
              {isDeleting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting…</>
                : <><Trash2 className="w-4 h-4 mr-2" />Delete {selected.size} selected</>}
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p>Checking your photos — this may take a moment…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <AlertTriangle className="w-16 h-16 text-destructive" />
            <h2 className="text-xl font-semibold">Couldn't check your photos</h2>
            <p className="text-muted-foreground">{(error as Error)?.message ?? "Something went wrong."}</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        )}

        {deletedCount !== null && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <h2 className="text-xl font-semibold">Done — {deletedCount} broken photo{deletedCount !== 1 ? "s" : ""} removed</h2>
            <p className="text-muted-foreground">They've been moved to your trash. You can permanently delete them now or let them auto-purge in 30 days.</p>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="destructive" onClick={() => setLocation("/manage/trash")}>
                <Trash2 className="w-4 h-4 mr-2" />Empty Trash Now
              </Button>
              <Button variant="outline" onClick={() => { setDeletedCount(null); void refetch(); }}>Check again</Button>
              <Button variant="outline" onClick={() => setLocation("/photos")}>Go to Photos</Button>
            </div>
          </div>
        )}

        {deletedCount === null && !isLoading && !isError && broken.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <h2 className="text-xl font-semibold">No broken photos found</h2>
            <p className="text-muted-foreground">
              Checked {checked} photo{checked !== 1 ? "s" : ""} — all external image links are still working.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back
              </Button>
              <Button variant="outline" onClick={() => setLocation("/photos")}>Go to Photos</Button>
            </div>
          </div>
        )}

        {deletedCount === null && !isLoading && !isError && broken.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h2 className="text-lg font-semibold">Broken Photo Links</h2>
              <span className="text-sm text-muted-foreground">
                ({broken.length} of {checked} checked)
              </span>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="divide-y divide-border">
                {broken.map((photo) => {
                  const isMarked = selected.has(photo.id);
                  return (
                    <div
                      key={photo.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isMarked ? "bg-destructive/5" : "hover:bg-accent/30"}`}
                      onClick={() => toggle(photo.id)}
                    >
                      <button className="shrink-0 text-muted-foreground hover:text-foreground">
                        {isMarked
                          ? <CheckSquare className="w-5 h-5 text-destructive" />
                          : <Square className="w-5 h-5" />}
                      </button>
                      <ThumbImg src={photo.imageUrl} alt={photo.title} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{photo.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {photo.category} · Added {format(new Date(photo.createdAt), "MMM d, yyyy")}
                        </p>
                        {photo.imageUrl && (
                          <p className="text-xs text-muted-foreground/60 truncate">{photo.imageUrl}</p>
                        )}
                      </div>
                      {photo.sourceUrl && (
                        <a
                          href={photo.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                          title="Open source page"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 bg-destructive/10 text-destructive">
                        Broken
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
