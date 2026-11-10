import { useEffect, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { Layout } from "@/components/layout";
import { Star, Film, Headphones, Archive, ShoppingBag, ExternalLink, Loader2, Package, Trash2, Pencil, X, Check, Sparkles, ChevronDown, ChevronUp, Share2, Telescope } from "lucide-react";
import { DiscoverContent } from "@/pages/discover";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface FavoriteRow {
  id: number;
  source: string;
  stationId: string;
  stationData: Record<string, unknown>;
  createdAt: string;
}

type WishTab = "photos" | "videos" | "music" | "discover";

function amazonUrl(query: string, department?: string, noAffiliate?: boolean) {
  const tag = noAffiliate ? "" : "&tag=urlinctm-20";
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}${tag}`;
  return department ? `${base}&i=${department}` : base;
}

interface SourcePlatform {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

function detectSourcePlatform(sourceUrl?: string): SourcePlatform | null {
  if (!sourceUrl) return null;
  try {
    const host = new URL(sourceUrl).hostname.replace("www.", "");
    if (host.includes("etsy.com")) return { label: "Buy on Etsy", bgClass: "bg-orange-500/10 hover:bg-orange-500/20", textClass: "text-orange-500", borderClass: "border-orange-500/20" };
    if (host.includes("ebay.com")) return { label: "Bid on eBay", bgClass: "bg-blue-500/10 hover:bg-blue-500/20", textClass: "text-blue-400", borderClass: "border-blue-500/20" };
    if (host.includes("walmart.com")) return { label: "Shop on Walmart", bgClass: "bg-blue-600/10 hover:bg-blue-600/20", textClass: "text-blue-500", borderClass: "border-blue-600/20" };
    if (host.includes("target.com")) return { label: "Shop on Target", bgClass: "bg-red-600/10 hover:bg-red-600/20", textClass: "text-red-400", borderClass: "border-red-600/20" };
    if (host.includes("amazon.com")) return { label: "Buy on Amazon", bgClass: "bg-[#FF9900]/10 hover:bg-[#FF9900]/20", textClass: "text-[#FF9900]", borderClass: "border-[#FF9900]/20" };
    if (host.includes("pinterest.com")) return { label: "View on Pinterest", bgClass: "bg-red-500/10 hover:bg-red-500/20", textClass: "text-red-500", borderClass: "border-red-500/20" };
    // any other site: show generic "Shop at [host]"
    const shortHost = host.split(".").slice(-2).join(".");
    return { label: `Shop at ${shortHost}`, bgClass: "bg-muted/50 hover:bg-muted", textClass: "text-muted-foreground hover:text-foreground", borderClass: "border-border" };
  } catch {
    return null;
  }
}

// ── Selection circle overlay (shared across card types) ──────────────────────
function SelectCircle({ selected, onToggle }: { selected: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onToggle}
      className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
        ${selected
          ? "bg-primary border-primary text-primary-foreground opacity-100"
          : "bg-black/40 border-white/60 opacity-0 group-hover:opacity-100"
        }`}
    >
      {selected && <Check className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Card components ───────────────────────────────────────────────────────────
function VideoCard({ row, selected, onToggleSelect }: { row: FavoriteRow; selected: boolean; onToggleSelect: (e: React.MouseEvent) => void }) {
  const { user } = useAuth();
  const noAffiliate = user?.affiliateExcluded ?? false;
  const d = row.stationData as { id?: number; title?: string; thumbnailUrl?: string; youtubeUrl?: string };
  const title = d.title ?? "Untitled";
  const thumb = d.thumbnailUrl;
  return (
    <div className={`relative group bg-card border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <SelectCircle selected={selected} onToggle={onToggleSelect} />
      <a href={`/video/${d.id}`} className="relative aspect-video bg-black block shrink-0">
        {thumb
          ? <img src={thumb} alt={title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><Film className="w-8 h-8 text-muted-foreground/40" /></div>}
      </a>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium line-clamp-2 leading-snug">{title}</p>
        <div className="mt-auto flex flex-col gap-1.5">
          <a href={amazonUrl(title, "instant-video", noAffiliate)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-[#FF9900]/10 hover:bg-[#FF9900]/20 text-[#FF9900] border border-[#FF9900]/20 transition-colors">
            <ShoppingBag className="w-3 h-3" /> Stream on Prime Video
          </a>
          <a href={amazonUrl(title, "movies-tv", noAffiliate)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors">
            <Package className="w-3 h-3" /> Buy Blu-ray / DVD
          </a>
        </div>
      </div>
    </div>
  );
}

function MusicCard({ row, selected, onToggleSelect }: { row: FavoriteRow; selected: boolean; onToggleSelect: (e: React.MouseEvent) => void }) {
  const { user } = useAuth();
  const noAffiliate = user?.affiliateExcluded ?? false;
  const d = row.stationData as { id?: number; title?: string; artist?: string; coverImageUrl?: string };
  const title = d.title ?? "Untitled";
  const artist = d.artist ?? "";
  const cover = d.coverImageUrl;
  const query = artist ? `${artist} ${title}` : title;
  return (
    <div className={`relative group bg-card border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <SelectCircle selected={selected} onToggle={onToggleSelect} />
      <a href="/music" className="relative aspect-square bg-muted block shrink-0 overflow-hidden">
        {cover && <img src={cover} alt={title} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
        <div className="absolute inset-0 flex items-center justify-center">
          <Headphones className="w-8 h-8 text-muted-foreground/40" />
        </div>
      </a>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-sm font-medium line-clamp-1">{title}</p>
        {artist && <p className="text-xs text-muted-foreground line-clamp-1">{artist}</p>}
        <div className="mt-auto pt-2 flex flex-col gap-1.5">
          <a href={amazonUrl(query + " vinyl", undefined, noAffiliate)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-[#FF9900]/10 hover:bg-[#FF9900]/20 text-[#FF9900] border border-[#FF9900]/20 transition-colors">
            <ShoppingBag className="w-3 h-3" /> Buy Vinyl on Amazon
          </a>
          <a href={amazonUrl(query, "music", noAffiliate)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors">
            <Package className="w-3 h-3" /> Buy Album / CD
          </a>
        </div>
      </div>
    </div>
  );
}

function VideoWishCard({ row, selected, onToggleSelect }: { row: FavoriteRow; selected: boolean; onToggleSelect: (e: React.MouseEvent) => void }) {
  const { user } = useAuth();
  const noAffiliate = user?.affiliateExcluded ?? false;
  const d = row.stationData as { title?: string; imageUrl?: string; thumbnailUrl?: string; youtubeUrl?: string };
  const title = d.title ?? "Untitled";
  const thumb = d.imageUrl ?? d.thumbnailUrl;
  const ytUrl = d.youtubeUrl;
  return (
    <div className={`relative group bg-card border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <SelectCircle selected={selected} onToggle={onToggleSelect} />
      {ytUrl
        ? <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="relative aspect-video bg-black block shrink-0">
            {thumb ? <img src={thumb} alt={title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-8 h-8 text-muted-foreground/40" /></div>}
          </a>
        : <div className="relative aspect-video bg-black shrink-0">
            {thumb ? <img src={thumb} alt={title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-8 h-8 text-muted-foreground/40" /></div>}
          </div>}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium line-clamp-2 leading-snug">{title}</p>
        <div className="mt-auto flex flex-col gap-1.5">
          {ytUrl && (
            <a href={ytUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors">
              <ExternalLink className="w-3 h-3" /> Watch on YouTube
            </a>
          )}
          <a href={amazonUrl(title, "instant-video", noAffiliate)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-[#FF9900]/10 hover:bg-[#FF9900]/20 text-[#FF9900] border border-[#FF9900]/20 transition-colors">
            <ShoppingBag className="w-3 h-3" /> Stream on Prime
          </a>
        </div>
      </div>
    </div>
  );
}

function PhotoCard({ row, selected, onToggleSelect }: { row: FavoriteRow; selected: boolean; onToggleSelect: (e: React.MouseEvent) => void }) {
  const d = row.stationData as { id?: number; title?: string; imageUrl?: string; thumbnailUrl?: string; sourceUrl?: string; type?: string };
  const sourcePlatform = detectSourcePlatform(d.sourceUrl);

  // YouTube videos added from Find Similar get a proper video card
  if (d.type === "video") {
    return <VideoWishCard row={row} selected={selected} onToggleSelect={onToggleSelect} />;
  }

  const title = d.title ?? "Untitled";
  const imageUrl = d.imageUrl ?? d.thumbnailUrl;
  const hasPhotoRecord = Boolean(d.id);
  const thumb = (
    <div className="relative aspect-square bg-muted shrink-0">
      {imageUrl
        ? <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center"><Archive className="w-8 h-8 text-muted-foreground/40" /></div>}
    </div>
  );
  return (
    <div className={`relative group bg-card border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <SelectCircle selected={selected} onToggle={onToggleSelect} />
      {hasPhotoRecord
        ? <a href={`/photo/${d.id}`} className="block">{thumb}</a>
        : d.sourceUrl
          ? <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="block">{thumb}</a>
          : thumb}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium line-clamp-2 leading-snug">{title}</p>
        <div className="mt-auto flex flex-col gap-1.5">
          {hasPhotoRecord ? (
            <>
              <a href={`/photo/${d.id}?shopSimilar=1`}
                className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors">
                <ShoppingBag className="w-3 h-3" /> Find Similar Items
              </a>
              <a href={`/photo/${d.id}`}
                className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors">
                <ExternalLink className="w-3 h-3" /> View in Vault
              </a>
            </>
          ) : d.sourceUrl ? (
            <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer"
              className={`flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg border transition-colors ${sourcePlatform ? `${sourcePlatform.bgClass} ${sourcePlatform.textClass} ${sourcePlatform.borderClass}` : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border-border"}`}>
              <ShoppingBag className="w-3 h-3" /> {sourcePlatform?.label ?? "View Source"}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: WishTab }) {
  const config = {
    videos: { icon: Film, label: "My Videos", href: "/", tip: "Star a video in your library to add it here." },
    music: { icon: Headphones, label: "My Audio", href: "/music", tip: "Star a track in your music library to add it here." },
    photos: { icon: Archive, label: "My Vault", href: "/photos", tip: "Star a photo in your vault to add it here." },
  }[tab];
  const Icon = config.icon;
  return (
    <div className="py-20 text-center flex flex-col items-center gap-4 text-muted-foreground">
      <div className="relative">
        <Icon className="w-12 h-12 opacity-20" />
        <Star className="w-5 h-5 text-primary absolute -bottom-1 -right-1 fill-primary" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">No starred {config.label} yet</p>
        <p className="text-sm">{config.tip}</p>
      </div>
      <Link href={config.href} className="text-sm text-primary hover:underline">
        Go to {config.label} →
      </Link>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type DreamSuggestion = { title: string; why: string; type: string; query: string };

export default function WishListPage() {
  const { user } = useAuth();
  const noAffiliate = user?.affiliateExcluded ?? false;
  const { toast } = useToast();
  const [location] = useLocation();
  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const tabFromUrl = urlParams.get("tab") as WishTab | null;
  const qFromUrl = urlParams.get("q") ?? undefined;
  const [activeTab, setActiveTab] = useState<WishTab>(tabFromUrl ?? "photos");
  const [discoverKey, setDiscoverKey] = useState(0);
  const [discoverInitialQuery, setDiscoverInitialQuery] = useState<string | undefined>(qFromUrl);
  const [videos, setVideos] = useState<FavoriteRow[]>([]);
  const [music, setMusic] = useState<FavoriteRow[]>([]);
  const [wishItems, setWishItems] = useState<FavoriteRow[]>([]);
  const [starredPhotos, setStarredPhotos] = useState<FavoriteRow[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Dream suggestions ──────────────────────────────────────────────────────
  const [dreams, setDreams] = useState<DreamSuggestion[]>([]);
  const [dreamsLoading, setDreamsLoading] = useState(false);
  const [dreamsOpen, setDreamsOpen] = useState(true);
  const dreamsFetchedRef = useRef(false);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastIndexRef = useRef<number | null>(null);

  // ── Confirmation / rename dialogs ─────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [renameRow, setRenameRow] = useState<FavoriteRow | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/radio-favorites?source=video", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<FavoriteRow[]>) : Promise.resolve([]))),
      fetch("/api/radio-favorites?source=library", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<FavoriteRow[]>) : Promise.resolve([]))),
      fetch("/api/radio-favorites?source=wish-list", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<FavoriteRow[]>) : Promise.resolve([]))),
      fetch("/api/radio-favorites?source=photo", { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<FavoriteRow[]>) : Promise.resolve([]))),
    ])
      .then(([v, m, w, p]) => { setVideos(v); setMusic(m); setWishItems(w); setStarredPhotos(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch dream suggestions once (lazy, after library loads)
  useEffect(() => {
    if (dreamsFetchedRef.current || loading) return;
    dreamsFetchedRef.current = true;
    setDreamsLoading(true);
    fetch("/api/radio-favorites/wish-list/predictions", { credentials: "include" })
      .then((r) => r.ok ? r.json() as Promise<{ suggestions: DreamSuggestion[] }> : Promise.resolve({ suggestions: [] }))
      .then(({ suggestions }) => setDreams(suggestions))
      .catch(() => {})
      .finally(() => setDreamsLoading(false));
  }, [loading]);

  // Clear selection when switching tabs
  useEffect(() => { setSelectedIds(new Set()); lastIndexRef.current = null; }, [activeTab]);

  const photoItems = showFavorites
    ? [...wishItems, ...starredPhotos.filter((p) => !wishItems.some((w) => w.stationId === p.stationId))]
    : wishItems;

  // The active list based on current tab
  const activeItems: FavoriteRow[] = activeTab === "photos" ? photoItems : activeTab === "videos" ? videos : music;
  const hasSelection = selectedIds.size > 0;

  function toggleSelect(row: FavoriteRow, idx: number, shiftKey: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastIndexRef.current !== null) {
        const lo = Math.min(lastIndexRef.current, idx);
        const hi = Math.max(lastIndexRef.current, idx);
        for (let i = lo; i <= hi; i++) {
          const r = activeItems[i];
          if (r) next.add(r.id);
        }
      } else {
        if (next.has(row.id)) { next.delete(row.id); } else { next.add(row.id); }
      }
      lastIndexRef.current = idx;
      return next;
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    const toDelete = activeItems.filter((r) => selectedIds.has(r.id));
    await Promise.all(
      toDelete.map((r) =>
        fetch(`/api/radio-favorites/${encodeURIComponent(r.stationId)}?source=${encodeURIComponent(r.source)}`, {
          method: "DELETE", credentials: "include",
        }),
      ),
    );
    const deletedIds = new Set(toDelete.map((r) => r.id));
    if (activeTab === "photos") {
      setWishItems((p) => p.filter((r) => !deletedIds.has(r.id)));
      setStarredPhotos((p) => p.filter((r) => !deletedIds.has(r.id)));
    } else if (activeTab === "videos") {
      setVideos((p) => p.filter((r) => !deletedIds.has(r.id)));
    } else {
      setMusic((p) => p.filter((r) => !deletedIds.has(r.id)));
    }
    setSelectedIds(new Set());
    toast({ title: `Removed ${toDelete.length} item${toDelete.length !== 1 ? "s" : ""}` });
  }

  // ── Rename ────────────────────────────────────────────────────────────────
  function openRename() {
    const row = activeItems.find((r) => selectedIds.has(r.id));
    if (!row) return;
    setRenameRow(row);
    setRenameDraft((row.stationData.title as string | undefined) ?? "");
  }

  async function confirmRename() {
    if (!renameRow || !renameDraft.trim()) return;
    const res = await fetch(`/api/radio-favorites/${renameRow.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameDraft.trim() }),
    });
    if (!res.ok) { toast({ title: "Rename failed", variant: "destructive" }); setRenameRow(null); return; }
    const update = (list: FavoriteRow[]) =>
      list.map((r) => r.id === renameRow.id ? { ...r, stationData: { ...r.stationData, title: renameDraft.trim() } } : r);
    if (activeTab === "photos") { setWishItems(update); setStarredPhotos(update); }
    else if (activeTab === "videos") { setVideos(update); }
    else { setMusic(update); }
    setSelectedIds(new Set());
    setRenameRow(null);
    toast({ title: "Renamed" });
  }

  function dreamLink(suggestion: DreamSuggestion): string {
    const q = encodeURIComponent(suggestion.query);
    const tag = noAffiliate ? "" : "&tag=urlinctm-20";
    switch (suggestion.type) {
      case "prime": return `https://www.amazon.com/s?k=${q}&i=instant-video${tag}`;
      case "youtube": return `https://www.youtube.com/results?search_query=${q}`;
      case "book": return `https://www.amazon.com/s?k=${q}&i=stripbooks${tag}`;
      case "streaming": return `https://www.amazon.com/s?k=${q}&i=instant-video${tag}`;
      default: return `https://www.amazon.com/s?k=${q}${tag}`;
    }
  }

  const TABS: { id: WishTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "photos", label: "Wish List", icon: ShoppingBag, count: wishItems.length + (showFavorites ? starredPhotos.length : 0) },
    { id: "videos", label: "My Videos", icon: Film, count: videos.length },
    { id: "music", label: "My Audio", icon: Headphones, count: music.length },
    { id: "discover", label: "Discover", icon: Telescope },
  ];

  return (
    <Layout>
      <div className="px-8 pb-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 pt-6">
          <ShoppingBag className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">Wish List</h1>
          <span className="text-sm text-muted-foreground hidden sm:inline">— items you want to buy, ready to shop</span>
          {user?.id && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/wish/${user.id}`;
                navigator.clipboard.writeText(url).then(() => {
                  toast({ title: "Link copied!", description: "Share this link so others can see your Wish List." });
                }).catch(() => {
                  prompt("Copy this link:", url);
                });
              }}
              className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" /> Share my list
            </button>
          )}
        </div>

        {/* ── Dreaming of… section ── */}
        {(dreamsLoading || dreams.length > 0) && (
          <div className="border border-border/60 rounded-xl overflow-hidden bg-gradient-to-br from-muted/30 to-muted/10">
            <button
              onClick={() => setDreamsOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-foreground">Dreaming of…</span>
              <span className="text-xs text-muted-foreground ml-1">Based on what you love in URLinc</span>
              <span className="ml-auto text-muted-foreground">
                {dreamsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>

            {dreamsOpen && (
              <div className="px-4 pb-4">
                {dreamsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-lg border border-border/40 p-3 space-y-2 animate-pulse">
                        <div className="h-3 bg-muted rounded w-3/4" />
                        <div className="h-2 bg-muted rounded w-full" />
                        <div className="h-2 bg-muted rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {dreams.map((s, i) => (
                      <a
                        key={i}
                        href={dreamLink(s)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col gap-1.5 rounded-lg border border-border/40 bg-card/60 hover:border-amber-500/40 hover:bg-amber-500/5 p-3 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold leading-snug text-foreground group-hover:text-amber-400 transition-colors line-clamp-2">{s.title}</p>
                          <ExternalLink className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-3">{s.why}</p>
                        <span className={`mt-auto self-start text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          s.type === "prime" || s.type === "streaming" ? "bg-[#FF9900]/15 text-[#FF9900]" :
                          s.type === "youtube" ? "bg-red-500/15 text-red-400" :
                          s.type === "book" ? "bg-emerald-500/15 text-emerald-400" :
                          "bg-amber-500/15 text-amber-400"
                        }`}>
                          {s.type === "prime" || s.type === "streaming" ? "Prime Video" :
                           s.type === "youtube" ? "YouTube" :
                           s.type === "book" ? "Book" : "Amazon"}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-border">
          {TABS.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); if (id === "discover") { setDiscoverInitialQuery(undefined); setDiscoverKey(k => k + 1); } }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {count > 0 && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
            </button>
          ))}

          {activeTab === "photos" && (
            <button
              onClick={() => setShowFavorites((v) => !v)}
              className={`ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                showFavorites
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Star className={`w-3 h-3 ${showFavorites ? "fill-amber-400" : ""}`} />
              {showFavorites ? "Hiding starred" : "Show starred photos"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === "photos" ? (
          photoItems.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-4 text-muted-foreground">
              <div className="relative">
                <ShoppingBag className="w-12 h-12 opacity-20" />
                <Star className="w-5 h-5 text-primary absolute -bottom-1 -right-1 fill-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Your Wish List is empty</p>
                <p className="text-sm">Right-click any image on the web → URLinc → Add to Wish List</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {photoItems.map((row, idx) => (
                <PhotoCard
                  key={`${row.source}-${row.stationId}`}
                  row={row}
                  selected={selectedIds.has(row.id)}
                  onToggleSelect={(e) => toggleSelect(row, idx, e.shiftKey)}
                />
              ))}
            </div>
          )
        ) : activeTab === "videos" ? (
          videos.length === 0 ? <EmptyState tab="videos" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {videos.map((row, idx) => (
                <VideoCard
                  key={row.stationId}
                  row={row}
                  selected={selectedIds.has(row.id)}
                  onToggleSelect={(e) => toggleSelect(row, idx, e.shiftKey)}
                />
              ))}
            </div>
          )
        ) : activeTab === "music" ? (
          music.length === 0 ? <EmptyState tab="music" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {music.map((row, idx) => (
                <MusicCard
                  key={row.stationId}
                  row={row}
                  selected={selectedIds.has(row.id)}
                  onToggleSelect={(e) => toggleSelect(row, idx, e.shiftKey)}
                />
              ))}
            </div>
          )
        ) : (
          <DiscoverContent key={discoverKey} initialQuery={discoverInitialQuery} />
        )}
      </div>

      {/* ── Floating selection bar ─────────────────────────────────────────── */}
      {hasSelection && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200">
            <span className="text-sm font-semibold pl-1 pr-2">
              {selectedIds.size} selected
            </span>
            <div className="h-5 w-px bg-primary-foreground/30" />
            {selectedIds.size === 1 && (
              <Button size="sm" variant="secondary" className="rounded-full gap-1.5" onClick={openRename}>
                <Pencil className="w-4 h-4" /> Rename
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full gap-1.5"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size === 1
                ? "This item will be removed from your Wish List."
                : `${selectedIds.size} items will be removed from your Wish List.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Rename dialog ──────────────────────────────────────────────────── */}
      <Dialog open={renameRow !== null} onOpenChange={(o) => { if (!o) setRenameRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename item</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void confirmRename(); if (e.key === "Escape") setRenameRow(null); }}
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Item name…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameRow(null)}>Cancel</Button>
            <Button onClick={() => void confirmRename()} disabled={!renameDraft.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
