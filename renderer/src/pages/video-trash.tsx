import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useBulkRestoreVideos,
  useBulkPurgeVideos,
  getListVideosQueryKey,
  getGetVideoStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Trash2,
  CheckSquare,
  Square,
  Film,
  RotateCcw,
  ArrowLeft,
  Loader2,
} from "lucide-react";

type TrashedVideo = {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  category: string;
  deletedAt: string;
  daysUntilPurge: number | null;
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

async function fetchTrashPage(cursor: string | null): Promise<{ items: TrashedVideo[]; nextCursor: string | null; totalCount: number }> {
  const url = cursor ? `/api/videos/trash?cursor=${encodeURIComponent(cursor)}` : "/api/videos/trash";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load trash");
  return res.json();
}

export default function VideoTrash() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<TrashedVideo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [selectAllProgress, setSelectAllProgress] = useState(0);
  // Set once a "Select All in Trash" sweep has paged through everything --
  // overrides the (by then stale) query-derived nextCursor below, so the
  // auto-load-next-batch effect doesn't try to re-fetch a cursor position
  // from before the sweep, which could return odd results now that the
  // underlying rows have actually been restored/purged.
  const [allLoaded, setAllLoaded] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["videos-trash", cursor],
    queryFn: async () => {
      const page = await fetchTrashPage(cursor);
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
      setTotalCount(page.totalCount);
      setLoadedOnce(true);
      return page;
    },
  });
  const nextCursor = allLoaded ? null : (data?.nextCursor ?? null);

  // At this scale (thousands of items, 50 per page) requiring a manual
  // "Load more" click after every single batch would mean 100+ clicks to
  // get through the whole backlog. Once the currently-loaded batch is
  // fully cleared (via Restore/Delete Forever) but more exist on the
  // server, automatically pull in the next one.
  useEffect(() => {
    if (loadedOnce && !isFetching && !isSelectingAll && items.length === 0 && nextCursor) {
      setCursor(nextCursor);
    }
  }, [loadedOnce, isFetching, isSelectingAll, items.length, nextCursor]);

  const handleSelectAllInTrash = async () => {
    setIsSelectingAll(true);
    setSelectAllProgress(items.length);
    try {
      let allItems = items;
      let cur = nextCursor;
      while (cur) {
        const page = await fetchTrashPage(cur);
        allItems = [...allItems, ...page.items];
        cur = page.nextCursor;
        setItems(allItems);
        setSelectAllProgress(allItems.length);
      }
      setAllLoaded(true);
      setSelected(new Set(allItems.map((v) => v.id)));
    } catch {
      toast({ title: "Failed to load the rest of trash", variant: "destructive" });
    } finally {
      setIsSelectingAll(false);
    }
  };

  const bulkRestore = useBulkRestoreVideos();
  const bulkPurge = useBulkPurgeVideos();

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((v) => v.id))));
  };

  // Deliberately doesn't invalidate the ["videos-trash", cursor] query --
  // this page already tracks items/totalCount itself, and invalidating
  // would re-run queryFn with the *current* cursor, which always appends
  // (assuming pagination), duplicating already-loaded items instead of
  // replacing them.
  const invalidateEverything = () => {
    queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
    // Tell the sidebar's cleanup nudge to recheck itself now instead of
    // sitting stale (showing "videos need cleanup") until the next full
    // page load, even though the trash was just emptied.
    window.dispatchEvent(new Event("urlinc:recheck-cleanup"));
  };

  const handleRestore = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    bulkRestore.mutate(
      { data: { ids } },
      {
        onSuccess: () => {
          const remaining = totalCount !== null ? Math.max(0, totalCount - ids.length) : null;
          toast({
            title: `Restored ${ids.length} video${ids.length !== 1 ? "s" : ""}`,
            description: remaining !== null ? `${remaining.toLocaleString()} still in trash.` : undefined,
          });
          setItems((prev) => prev.filter((v) => !selected.has(v.id)));
          setTotalCount(remaining);
          setSelected(new Set());
          invalidateEverything();
        },
        onError: () => toast({ title: "Failed to restore", variant: "destructive" }),
      },
    );
  };

  const handlePurge = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Permanently delete ${ids.length} video${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    bulkPurge.mutate(
      { data: { ids } },
      {
        onSuccess: () => {
          const remaining = totalCount !== null ? Math.max(0, totalCount - ids.length) : null;
          toast({
            title: `Permanently deleted ${ids.length} video${ids.length !== 1 ? "s" : ""}`,
            description: remaining !== null ? `${remaining.toLocaleString()} still in trash.` : undefined,
          });
          setItems((prev) => prev.filter((v) => !selected.has(v.id)));
          setTotalCount(remaining);
          setSelected(new Set());
          invalidateEverything();
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      },
    );
  };

  const busy = bulkRestore.isPending || bulkPurge.isPending || isSelectingAll;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold flex items-center gap-3">
              <Trash2 className="w-8 h-8 text-primary" />
              Video Trash
              {totalCount !== null && (
                <span className="text-lg font-normal text-muted-foreground">
                  ({totalCount.toLocaleString()} total)
                </span>
              )}
            </h1>
            <p className="text-muted-foreground mt-2">
              Deleted videos sit here for 30 days before being permanently removed, so you can restore them
              if you change your mind. Items marked "No purge scheduled" were already here before this page
              existed — they'll stay until you restore or delete them yourself.
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/manage")} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Manage
          </Button>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 mb-4 sticky top-2 z-10">
            <span className="text-sm text-muted-foreground mr-2">{selected.size} selected</span>
            <Button size="sm" onClick={handleRestore} disabled={busy}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={handlePurge} disabled={busy}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Forever
            </Button>
          </div>
        )}

        {isLoading && !loadedOnce && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading trash…
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-muted-foreground">Couldn't load your trash.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        )}

        {loadedOnce && !isError && items.length === 0 && nextCursor && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading the next batch…
          </div>
        )}

        {loadedOnce && !isError && items.length === 0 && !nextCursor && (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
            <Trash2 className="w-12 h-12 text-muted-foreground/30" />
            <h2 className="text-lg font-semibold">Trash is empty</h2>
            <p className="text-sm text-muted-foreground">Nothing here to clean up.</p>
          </div>
        )}

        {items.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                {selected.size === items.length
                  ? <CheckSquare className="w-4 h-4" />
                  : <Square className="w-4 h-4" />}
                Select all loaded
              </button>
              <span className="text-sm text-muted-foreground">({items.length} loaded)</span>
              {nextCursor && totalCount !== null && (
                <Button size="sm" variant="outline" onClick={() => void handleSelectAllInTrash()} disabled={isSelectingAll || busy}>
                  {isSelectingAll
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Loading {selectAllProgress.toLocaleString()} of {totalCount.toLocaleString()}…</>
                    : `Select All in Trash (${totalCount.toLocaleString()})`}
                </Button>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="divide-y divide-border">
                {items.map((video) => {
                  const isMarked = selected.has(video.id);
                  return (
                    <div
                      key={video.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isMarked ? "bg-primary/5" : "hover:bg-accent/30"}`}
                      onClick={() => toggle(video.id)}
                    >
                      <button className="shrink-0 text-muted-foreground hover:text-foreground">
                        {isMarked
                          ? <CheckSquare className="w-5 h-5 text-primary" />
                          : <Square className="w-5 h-5" />}
                      </button>
                      <ThumbnailImg src={video.thumbnailUrl} alt={video.title} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{video.title}</p>
                        <p className="text-xs text-muted-foreground">{video.category}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 text-right">
                        {video.daysUntilPurge === null
                          ? "No purge scheduled"
                          : video.daysUntilPurge > 0
                            ? `Purges in ${video.daysUntilPurge}d`
                            : "Purging soon"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {nextCursor && (
              <div className="flex justify-center mt-4">
                <Button variant="outline" onClick={() => setCursor(nextCursor)} disabled={isFetching}>
                  {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
