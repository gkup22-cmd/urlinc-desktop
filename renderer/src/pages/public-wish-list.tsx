import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { ShoppingBag, Package, ExternalLink, Loader2, Star, Film, Headphones } from "lucide-react";

interface WishItem {
  id: number;
  stationId: string;
  stationData: Record<string, unknown>;
  createdAt: string;
}

interface PublicWishData {
  displayName: string;
  items: WishItem[];
}

function amazonUrl(query: string, department?: string) {
  const tag = "&tag=urlinctm-20";
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}${tag}`;
  return department ? `${base}&i=${department}` : base;
}

interface SourcePlatform {
  label: string;
  primaryBg: string;
  primaryText: string;
  primaryBorder: string;
}

function detectSourcePlatform(sourceUrl?: string | null): SourcePlatform | null {
  if (!sourceUrl) return null;
  try {
    const host = new URL(sourceUrl).hostname.replace("www.", "");
    if (host.includes("etsy.com")) return { label: "Buy on Etsy", primaryBg: "bg-orange-500/10 hover:bg-orange-500/20", primaryText: "text-orange-500", primaryBorder: "border-orange-500/20" };
    if (host.includes("ebay.com")) return { label: "Bid on eBay", primaryBg: "bg-blue-500/10 hover:bg-blue-500/20", primaryText: "text-blue-400", primaryBorder: "border-blue-500/20" };
    if (host.includes("walmart.com")) return { label: "Shop on Walmart", primaryBg: "bg-blue-600/10 hover:bg-blue-600/20", primaryText: "text-blue-500", primaryBorder: "border-blue-600/20" };
    if (host.includes("target.com")) return { label: "Shop on Target", primaryBg: "bg-red-600/10 hover:bg-red-600/20", primaryText: "text-red-400", primaryBorder: "border-red-600/20" };
    if (host.includes("amazon.com")) return { label: "Buy on Amazon", primaryBg: "bg-[#FF9900]/10 hover:bg-[#FF9900]/20", primaryText: "text-[#FF9900]", primaryBorder: "border-[#FF9900]/20" };
    if (host.includes("pinterest.com")) return { label: "View on Pinterest", primaryBg: "bg-red-500/10 hover:bg-red-500/20", primaryText: "text-red-500", primaryBorder: "border-red-500/20" };
    // any non-Amazon, non-video source — treat as a shoppable link
    const shortHost = host.split(".").slice(-2).join(".");
    return { label: `Shop at ${shortHost}`, primaryBg: "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700", primaryText: "text-zinc-700 dark:text-zinc-300", primaryBorder: "border-zinc-200 dark:border-zinc-700" };
  } catch {
    return null;
  }
}

function ItemCard({ item }: { item: WishItem }) {
  const d = item.stationData;
  const title = (d.title as string) ?? "Untitled";
  const imageUrl = (d.imageUrl as string) ?? (d.thumbnailUrl as string) ?? null;
  const sourceUrl = (d.sourceUrl as string) ?? null;
  const affiliateUrl = (d.affiliateUrl as string) ?? null;

  // Determine content type based on stationData shape
  const isVideo = !!(d.youtubeUrl || d.videoUrl);
  const isMusic = !!(d.artist || d.audioUrl);

  // Source-aware primary button — direct to where the item came from if it's a known shop
  const sourcePlatform = detectSourcePlatform(sourceUrl);
  const hasKnownShopSource = sourcePlatform !== null && sourceUrl && !sourceUrl.includes("youtube.com") && !sourceUrl.includes("youtu.be");

  // Amazon fallback for videos / music / items with no shop source
  const amazonFallback = affiliateUrl ?? (isVideo
    ? amazonUrl(title, "instant-video")
    : isMusic
    ? amazonUrl(title, "music")
    : amazonUrl(title));

  return (
    <div className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col hover:border-amber-400/60 hover:shadow-md transition-all">
      {/* Image */}
      <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-800 shrink-0 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? <Film className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
              : isMusic ? <Headphones className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
              : <ShoppingBag className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold leading-snug line-clamp-2 text-zinc-900 dark:text-zinc-100">{title}</p>

        {sourceUrl && !hasKnownShopSource && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-1 truncate transition-colors">
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{new URL(sourceUrl).hostname.replace("www.", "")}</span>
          </a>
        )}

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {/* Primary: shop source or Amazon */}
          {hasKnownShopSource && sourcePlatform ? (
            <a href={sourceUrl!} target="_blank" rel="noopener noreferrer"
              className={`flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg border transition-colors font-medium ${sourcePlatform.primaryBg} ${sourcePlatform.primaryText} ${sourcePlatform.primaryBorder}`}>
              <ShoppingBag className="w-3 h-3" /> {sourcePlatform.label}
            </a>
          ) : (
            <a href={amazonFallback} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-[#FF9900]/10 hover:bg-[#FF9900]/20 text-[#FF9900] border border-[#FF9900]/20 transition-colors font-medium">
              <ShoppingBag className="w-3 h-3" />
              {isVideo ? "Stream on Prime" : isMusic ? "Buy on Amazon" : "Find on Amazon"}
            </a>
          )}
          {/* Secondary: Amazon search for items that have a shop source (so users can compare), Blu-ray for videos */}
          {hasKnownShopSource && !isVideo && (
            <a href={amazonFallback} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 transition-colors">
              <ExternalLink className="w-3 h-3" /> Also on Amazon
            </a>
          )}
          {isVideo && (
            <a href={amazonUrl(title, "movies-tv")} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 transition-colors">
              <Package className="w-3 h-3" /> Blu-ray / DVD
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PublicWishListPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<PublicWishData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`/api/public/wish-list/${userId}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.ok ? r.json() as Promise<PublicWishData> : null;
      })
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              UR<span className="text-amber-500">●</span>Linc
            </span>
            <span className="text-xs text-zinc-400 hidden sm:inline">Tayler-made™</span>
          </Link>
          <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 min-w-0">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
            <span className="truncate">
              {loading ? "Loading…" : data ? `${data.displayName}'s Wish List` : "Wish List"}
            </span>
          </div>
          <a
            href="/"
            className="ml-auto shrink-0 text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-medium transition-colors"
          >
            Create yours →
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : notFound || !data ? (
          <div className="text-center py-32 space-y-3">
            <ShoppingBag className="w-14 h-14 mx-auto text-zinc-300 dark:text-zinc-700" />
            <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">Wish list not found</p>
            <p className="text-sm text-zinc-400">This link may have expired or the list was removed.</p>
            <a href="/" className="inline-block mt-4 text-sm px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-medium transition-colors">
              Go to URLinc →
            </a>
          </div>
        ) : data.items.length === 0 ? (
          <div className="text-center py-32 space-y-3">
            <ShoppingBag className="w-14 h-14 mx-auto text-zinc-300 dark:text-zinc-700" />
            <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">{data.displayName}'s wish list is empty</p>
            <p className="text-sm text-zinc-400">Nothing's been added yet — check back later.</p>
          </div>
        ) : (
          <>
            {/* Page title */}
            <div className="mb-8 space-y-1">
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {data.displayName}'s Wish List
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                {data.items.length} item{data.items.length !== 1 ? "s" : ""} · Curated with <span className="text-amber-500 font-medium">URLinc</span>
              </p>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {data.items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>

            {/* Footer CTA */}
            <div className="mt-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-8 text-center space-y-3">
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Like what you see?</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                URLinc lets you save videos, photos, music and products you love — then share your wish list with anyone.
              </p>
              <a href="/" className="inline-block mt-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm transition-colors">
                Start your own Wish List →
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
