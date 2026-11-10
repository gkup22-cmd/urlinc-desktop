import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVideoDuplicates,
  useGetPhotoDuplicates,
  bulkDeleteVideos,
  bulkDeletePhotos,
  getGetVideoDuplicatesQueryKey,
  getGetPhotoDuplicatesQueryKey,
  getListVideosQueryKey,
  getGetVideoStatsQueryKey,
  getListPhotosQueryKey,
  getGetPhotoStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Copy,
  Trash2,
  CheckSquare,
  Square,
  ExternalLink,
  Film,
  Images,
  CheckCircle2,
  ArrowLeft,
  TextSearch,
} from "lucide-react";
import { format } from "date-fns";

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

type SimilarGroup = { url: string; items: { id: number; title: string; thumbnailUrl: string | null; category: string; createdAt: string }[] };

export default function Duplicates() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: videoDups = [], isLoading: vLoading, refetch: refetchVideos } = useGetVideoDuplicates();
  const { data: photoDups = [], isLoading: pLoading, refetch: refetchPhotos } = useGetPhotoDuplicates();

  const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [similarChecked, setSimilarChecked] = useState<Set<number>>(new Set());

  const fetchSimilar = useCallback(async () => {
    setSimilarLoading(true);
    try {
      const r = await fetch("/api/videos/similar-titles", { credentials: "include" });
      if (r.ok) setSimilarGroups(await r.json() as SimilarGroup[]);
    } finally {
      setSimilarLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSimilar(); }, [fetchSimilar]);

  const [videoChecked, setVideoChecked] = useState<Set<number>>(new Set());
  const [photoChecked, setPhotoChecked] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (videoDups.length > 0) {
      const toDelete = new Set<number>();
      for (const group of videoDups) {
        group.items.slice(1).forEach((v) => toDelete.add(v.id));
      }
      setVideoChecked(toDelete);
    }
  }, [videoDups]);

  useEffect(() => {
    if (photoDups.length > 0) {
      const toDelete = new Set<number>();
      for (const group of photoDups) {
        group.items.slice(1).forEach((p) => toDelete.add(p.id));
      }
      setPhotoChecked(toDelete);
    }
  }, [photoDups]);

  useEffect(() => {
    if (similarGroups.length > 0) {
      const toDelete = new Set<number>();
      for (const group of similarGroups) {
        group.items.slice(1).forEach((v) => toDelete.add(v.id));
      }
      setSimilarChecked(toDelete);
    }
  }, [similarGroups]);

  const toggleSimilar = (id: number) => {
    setSimilarChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleVideo = (id: number) => {
    setVideoChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const togglePhoto = (id: number) => {
    setPhotoChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    const vIds = [...videoChecked, ...similarChecked];
    const pIds = [...photoChecked];
    if (vIds.length === 0 && pIds.length === 0) {
      toast({ title: "Nothing selected to delete" });
      return;
    }
    setIsDeleting(true);
    try {
      if (vIds.length > 0) {
        await bulkDeleteVideos({ ids: vIds });
        queryClient.invalidateQueries({ queryKey: getGetVideoDuplicatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
        void fetchSimilar();
      }
      if (pIds.length > 0) {
        await bulkDeletePhotos({ ids: pIds });
        queryClient.invalidateQueries({ queryKey: getGetPhotoDuplicatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
      }
      toast({
        title: `Deleted ${vIds.length + pIds.length} duplicate${vIds.length + pIds.length !== 1 ? "s" : ""}`,
      });
      setVideoChecked(new Set());
      setPhotoChecked(new Set());
      setSimilarChecked(new Set());
      await Promise.all([refetchVideos(), refetchPhotos()]);
      window.dispatchEvent(new Event("urlinc:recheck-cleanup"));
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const totalSelected = videoChecked.size + photoChecked.size + similarChecked.size;
  const totalDupGroups = videoDups.length + photoDups.length + similarGroups.length;
  const isLoading = vLoading || pLoading || similarLoading;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Copy className="w-8 h-8 text-primary" />
              Find Duplicates
            </h1>
            <p className="text-muted-foreground mt-2">
              Scans for matching URLs and similar titles. Keep the ones you want; delete the rest.
            </p>
          </div>
          {totalSelected > 0 && (
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="shrink-0">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete {totalSelected} selected
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Scanning for duplicates…
          </div>
        )}

        {!isLoading && totalDupGroups === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <CheckCircle2 className="w-16 h-16 text-primary" />
            <h2 className="text-xl font-semibold">No duplicates found</h2>
            <p className="text-muted-foreground">Your library is clean — no duplicate URLs or similar titles.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")}>Go to Library</Button>
            </div>
          </div>
        )}

        {!isLoading && videoDups.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Film className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Video Duplicates</h2>
              <span className="text-sm text-muted-foreground">({videoDups.length} group{videoDups.length !== 1 ? "s" : ""})</span>
            </div>
            <div className="space-y-4">
              {videoDups.map((group, gi) => (
                <div key={gi} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">{group.url}</span>
                    <a href={group.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((video, idx) => {
                      const isMarked = videoChecked.has(video.id);
                      return (
                        <div
                          key={video.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isMarked ? "bg-destructive/5" : "hover:bg-accent/30"}`}
                          onClick={() => toggleVideo(video.id)}
                        >
                          <button className="shrink-0 text-muted-foreground hover:text-foreground">
                            {isMarked
                              ? <CheckSquare className="w-5 h-5 text-destructive" />
                              : <Square className="w-5 h-5" />}
                          </button>
                          <ThumbnailImg src={video.thumbnailUrl} alt={video.title} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{video.title}</p>
                            <p className="text-xs text-muted-foreground">{video.category} · Added {format(new Date(video.createdAt), "MMM d, yyyy")}</p>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${idx === 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                            {idx === 0 ? "Original" : "Duplicate"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isLoading && similarGroups.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <TextSearch className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Similar Titles</h2>
              <span className="text-sm text-muted-foreground">({similarGroups.length} group{similarGroups.length !== 1 ? "s" : ""})</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">These videos have different URLs but very similar names — likely the same content uploaded from different sources.</p>
            <div className="space-y-4">
              {similarGroups.map((group, gi) => (
                <div key={gi} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-muted/40 border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">"{group.url}"</span>
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((video, idx) => {
                      const isMarked = similarChecked.has(video.id);
                      return (
                        <div
                          key={video.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isMarked ? "bg-destructive/5" : "hover:bg-accent/30"}`}
                          onClick={() => toggleSimilar(video.id)}
                        >
                          <button className="shrink-0 text-muted-foreground hover:text-foreground">
                            {isMarked
                              ? <CheckSquare className="w-5 h-5 text-destructive" />
                              : <Square className="w-5 h-5" />}
                          </button>
                          <ThumbnailImg src={video.thumbnailUrl} alt={video.title} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{video.title}</p>
                            <p className="text-xs text-muted-foreground">{video.category} · Added {format(new Date(video.createdAt), "MMM d, yyyy")}</p>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${idx === 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                            {idx === 0 ? "Keep" : "Duplicate?"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isLoading && photoDups.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Images className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Photo Duplicates</h2>
              <span className="text-sm text-muted-foreground">({photoDups.length} group{photoDups.length !== 1 ? "s" : ""})</span>
            </div>
            <div className="space-y-4">
              {photoDups.map((group, gi) => (
                <div key={gi} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">{group.url}</span>
                    <a href={group.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((photo, idx) => {
                      const isMarked = photoChecked.has(photo.id);
                      return (
                        <div
                          key={photo.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isMarked ? "bg-destructive/5" : "hover:bg-accent/30"}`}
                          onClick={() => togglePhoto(photo.id)}
                        >
                          <button className="shrink-0 text-muted-foreground hover:text-foreground">
                            {isMarked
                              ? <CheckSquare className="w-5 h-5 text-destructive" />
                              : <Square className="w-5 h-5" />}
                          </button>
                          <img
                            src={photo.imageUrl}
                            alt={photo.title}
                            className="w-10 h-10 rounded object-cover shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{photo.title}</p>
                            <p className="text-xs text-muted-foreground">{photo.category} · Added {format(new Date(photo.createdAt), "MMM d, yyyy")}</p>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${idx === 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                            {idx === 0 ? "Original" : "Duplicate"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
