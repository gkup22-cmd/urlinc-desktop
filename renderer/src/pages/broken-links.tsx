import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  bulkDeleteVideos,
  getListVideosQueryKey,
  getGetVideoStatsQueryKey,
} from "@workspace/api-client-react";
import {
  LinkIcon,
  Trash2,
  CheckSquare,
  Square,
  ExternalLink,
  Film,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

type BrokenVideo = {
  id: number;
  title: string;
  youtubeUrl: string;
  thumbnailUrl: string | null;
  category: string;
  createdAt: string;
};

function ThumbnailImg({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (!src) return (
    <div className="w-16 h-10 rounded bg-muted flex items-center justify-center shrink-0">
      <Film className="w-4 h-4 text-muted-foreground" />
    </div>
  );
  return (
    <img
      src={src}
      alt={alt}
      className="w-16 h-10 rounded object-cover shrink-0"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  );
}

async function fetchBrokenVideos(): Promise<{ checked: number; broken: BrokenVideo[]; apiError: boolean }> {
  const res = await fetch("/api/videos/broken", { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to check videos");
  }
  return res.json();
}

export default function BrokenLinks() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["videos-broken"],
    queryFn: fetchBrokenVideos,
  });

  const broken = data?.broken ?? [];
  const checked = data?.checked ?? 0;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);

  useEffect(() => {
    if (broken.length > 0) {
      setSelected(new Set(broken.map((v) => v.id)));
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
    if (ids.length === 0) {
      toast({ title: "Nothing selected to delete" });
      return;
    }
    setIsDeleting(true);
    try {
      await bulkDeleteVideos({ ids });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
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
              Find Broken Links
            </h1>
            <p className="text-muted-foreground mt-2">
              Checks all your YouTube videos against YouTube. Videos that are deleted, private,
              or otherwise unavailable show up here for you to review and remove.
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

        {!isLoading && !isError && data?.apiError && (
          <div className="flex items-center gap-2 mb-6 p-3 rounded-lg border border-yellow-600/40 bg-yellow-600/10 text-sm text-yellow-600">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Some videos couldn't be checked because YouTube's API failed partway through (bad key, quota limit, or a temporary error). Those videos are left out of the results below rather than being guessed as broken — try again later for a complete check.
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p>Checking your videos against YouTube — this may take a moment…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <AlertTriangle className="w-16 h-16 text-destructive" />
            <h2 className="text-xl font-semibold">Couldn't check your library</h2>
            <p className="text-muted-foreground">{(error as Error)?.message ?? "Something went wrong."}</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        )}

        {deletedCount !== null && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <h2 className="text-xl font-semibold">Done — {deletedCount} broken link{deletedCount !== 1 ? "s" : ""} removed</h2>
            <p className="text-muted-foreground">They've been moved to your trash. You can permanently delete them now or let them auto-purge in 30 days.</p>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button variant="destructive" onClick={() => setLocation("/manage/trash")}>
                <Trash2 className="w-4 h-4 mr-2" />
                Empty Trash Now
              </Button>
              <Button variant="outline" onClick={() => { setDeletedCount(null); void refetch(); }}>
                Check again
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")}>Go to Library</Button>
            </div>
          </div>
        )}

        {deletedCount === null && !isLoading && !isError && broken.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <h2 className="text-xl font-semibold">No broken links found</h2>
            <p className="text-muted-foreground">
              Checked {checked} video{checked !== 1 ? "s" : ""} — everything is still working.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")}>Go to Library</Button>
            </div>
          </div>
        )}

        {deletedCount === null && !isLoading && !isError && broken.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h2 className="text-lg font-semibold">Broken Links</h2>
              <span className="text-sm text-muted-foreground">
                ({broken.length} of {checked} checked)
              </span>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="divide-y divide-border">
                {broken.map((video) => {
                  const isMarked = selected.has(video.id);
                  return (
                    <div
                      key={video.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isMarked ? "bg-destructive/5" : "hover:bg-accent/30"}`}
                      onClick={() => toggle(video.id)}
                    >
                      <button className="shrink-0 text-muted-foreground hover:text-foreground">
                        {isMarked
                          ? <CheckSquare className="w-5 h-5 text-destructive" />
                          : <Square className="w-5 h-5" />}
                      </button>
                      <ThumbnailImg src={video.thumbnailUrl} alt={video.title} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{video.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {video.category} · Added {format(new Date(video.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                        <a href={video.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
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
