import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { LaunchDeckContent } from "@/pages/launch-deck";
import { Link, useSearch, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Layout } from "@/components/layout";
import { TabHeader } from "@/components/tab-header";
import { ArcadeSection } from "@/components/arcade-section";
import { scrollMainToTop } from "@/lib/scroll";
import {
  useInfiniteListPhotos, useGetPhotoStats, useGetPhotoCount, getPhotoSimilarItems,
  useGetBulkReadingProgress, getGetBulkReadingProgressQueryKey,
  useBulkDeletePhotos, useBulkRestorePhotos, useBulkPurgePhotos, useBulkUpdatePhotoCategory,
  getGetPhotoStatsQueryKey, getListPhotosQueryKey, getGetPhotoCountQueryKey,
  getInfiniteListPhotosQueryKey,
} from "@workspace/api-client-react";
import type { SimilarProduct } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ImageIcon, Images, Plus, Search, Loader2, ExternalLink, ArrowUpDown,
  Check, X, Download, Share2, Send, Sparkles, ShoppingBag, ShoppingCart,
  ChevronDown, ChevronRight, AlertTriangle, BookOpen, CheckCircle2,
  Headphones, Play, Pause, Archive, Star, FolderOpen, Trash2, Upload,
} from "lucide-react";
import { uploadFile } from "@/lib/upload";
import { openUrl } from "@/lib/openUrl";
import { useVaultSourceFavorites } from "@/hooks/use-vault-source-favorites";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useSettings } from "@/hooks/use-settings";
import { usePhotoFavorites } from "@/hooks/use-photo-favorites";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { triggerJsonDownload } from "./settings";
import { PrivateFilesTab } from "@/components/PrivateFilesTab";
import { VaultSourceGrid, type VaultSource } from "@/components/vault-source-grid";

function SortablePhotoWrapper({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 999 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

const UNDO_TIMEOUT_S = 15;
const CREATE_NEW_CATEGORY = "__create_new__";

function UndoToastAction({ onUndo }: { onUndo: () => void }) {
  const [remaining, setRemaining] = useState(UNDO_TIMEOUT_S);
  useEffect(() => {
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <ToastAction altText="Undo delete" onClick={onUndo}>
      Undo ({remaining}s)
    </ToastAction>
  );
}

function BulkCategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (val: string) => void;
  categories: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="New category name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) { onChange(draft.trim()); setCreating(false); setDraft(""); } }
            if (e.key === "Escape") { setCreating(false); setDraft(""); }
          }}
        />
        <Button type="button" size="sm" onClick={() => { if (draft.trim()) { onChange(draft.trim()); setCreating(false); setDraft(""); } }} disabled={!draft.trim()}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setCreating(false); setDraft(""); }}>Cancel</Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(val) => { if (val === CREATE_NEW_CATEGORY) setCreating(true); else onChange(val); }}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a category…" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((cat) => (
          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
        ))}
        {categories.length > 0 && <SelectSeparator />}
        <SelectItem value={CREATE_NEW_CATEGORY} className="text-primary font-medium">+ Add Category</SelectItem>
      </SelectContent>
    </Select>
  );
}

const VAULT_GAMES_SOURCES: VaultSource[] = [
  { name: "Internet Archive", description: "Thousands of free, legal classic DOS and console games playable in your browser.", url: "https://archive.org/details/classicpcgames", color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { name: "Classic Reload", description: "Licensed retro games playable instantly in your browser. No download needed.", url: "https://classicreload.com", color: "bg-green-500/10 border-green-500/30 text-green-400" },
  { name: "My Abandonware", description: "Classic games officially abandoned by their publishers, free to download legally.", url: "https://www.myabandonware.com", color: "bg-purple-500/10 border-purple-500/30 text-purple-400" },
  { name: "GOG.com", description: "DRM-free classic and modern games. Many free titles available.", url: "https://www.gog.com", color: "bg-rose-500/10 border-rose-500/30 text-rose-400" },
  { name: "Epic Games Store", description: "Frequently gives away free games. Build your legal library over time.", url: "https://store.epicgames.com/en-US/free-games", color: "bg-gray-500/10 border-gray-500/30 text-gray-400" },
  { name: "Xbox Cloud Gaming", description: "Stream hundreds of games legally via Game Pass. Play instantly in browser.", url: "https://www.xbox.com/en-US/play", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  { name: "NVIDIA GeForce NOW", description: "Stream your legally owned PC games from the cloud to any device.", url: "https://www.nvidia.com/en-us/geforce-now", color: "bg-lime-500/10 border-lime-500/30 text-lime-400" },
  { name: "Amazon Luna", description: "Cloud gaming service with a rotating library of licensed titles.", url: "https://luna.amazon.com", color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  { name: "js13kGames", description: "Hundreds of tiny browser games from an annual 13 KB JavaScript competition. All free, no download needed.", url: "https://js13kgames.com/games", color: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" },
];

const VAULT_READING_SOURCES: VaultSource[] = [
  { name: "Project Gutenberg", description: "Over 70,000 free public domain ebooks — the original free book site.", url: "https://www.gutenberg.org", color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { name: "Standard Ebooks", description: "Beautifully formatted, free public domain classics with modern typography.", url: "https://standardebooks.org", color: "bg-violet-500/10 border-violet-500/30 text-violet-400" },
  { name: "Open Library", description: "Borrow digital books free from the Internet Archive's lending library.", url: "https://openlibrary.org", color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  { name: "ManyBooks", description: "Free ebooks in multiple formats — fiction, non-fiction, and more.", url: "https://manybooks.net", color: "bg-rose-500/10 border-rose-500/30 text-rose-400" },
  { name: "Internet Archive Books", description: "Millions of free texts, magazines, and historical documents.", url: "https://archive.org/details/texts", color: "bg-sky-500/10 border-sky-500/30 text-sky-400" },
  { name: "Pocket", description: "Save articles, videos and stories from any publication to read later.", url: "https://getpocket.com", color: "bg-red-500/10 border-red-500/30 text-red-400" },
  { name: "Instapaper", description: "Save anything from the web and read it later, cleanly formatted.", url: "https://www.instapaper.com", color: "bg-gray-500/10 border-gray-500/30 text-gray-400" },
  { name: "Khan Academy", description: "Free world-class education — articles, courses and exercises.", url: "https://www.khanacademy.org", color: "bg-green-500/10 border-green-500/30 text-green-400" },
  { name: "Wikisource", description: "Free library of source texts — historical documents, literature and more.", url: "https://wikisource.org", color: "bg-teal-500/10 border-teal-500/30 text-teal-400" },
  { name: "OpenStax", description: "Free peer-reviewed textbooks for college and high school students.", url: "https://openstax.org", color: "bg-orange-500/10 border-orange-500/30 text-orange-400" },
  { name: "Digital Comic Museum", description: "Free vintage public domain comics from the golden and silver ages.", url: "https://digitalcomicmuseum.com", color: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" },
];

const VAULT_STORIES_SOURCES: VaultSource[] = [
  { name: "Knight in Rusty Armor", description: "A brave bear knight crosses an alligator-filled moat to rescue Princess Luna. An interactive illustrated storybook.", url: "/knight_storybook.html", emoji: "🐻⚔️", color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  { name: "Holy Moly Moly Mackerel!", description: "A silly sing-along and dance-along song for kids! Spin, crawl, reach for the sky and wiggle like a mackerel!", url: "/holy_mackerel_songbook.html", emoji: "🐟🎵", color: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" },
  { name: "Chasing Yeti", description: "Finn the tracker leads an expedition to Antarctica in search of the Abominable Snowman — with a volcanic eruption and earthquake along the way!", url: "/chasing_yeti.html", emoji: "🦣❄️", color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { name: "Velcro Vinnie and Zack the Zipper", description: "A childhood friendship ended by a snowball fight. Years later, fate brings them back together in the most unexpected way. Twice upon a time!", url: "/velcro_vinnie.html", emoji: "🧤🤐", color: "bg-purple-500/10 border-purple-500/30 text-purple-400" },
];


type SortKey = "alpha-asc" | "alpha-desc" | "date-desc" | "date-asc";
const SORT_LABELS: Record<SortKey, string> = {
  "alpha-asc": "A → Z",
  "alpha-desc": "Z → A",
  "date-desc": "Newest First",
  "date-asc": "Oldest First",
};

function sortPhotos<T extends { title: string; createdAt: string }>(arr: T[], key: SortKey): T[] {
  return [...arr].sort((a, b) => {
    if (key === "alpha-asc") return a.title.localeCompare(b.title);
    if (key === "alpha-desc") return b.title.localeCompare(a.title);
    if (key === "date-asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function ProductCard({ product }: { product: SimilarProduct }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-square bg-muted overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://placehold.co/300x300/4a4a4a/ffffff?text=Item`;
          }}
        />
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-xs font-medium leading-snug line-clamp-2">{product.name}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-2 flex-1">{product.description}</p>
        <p className="text-xs font-semibold text-primary">{product.priceRange}</p>
        <a
          href={product.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg px-2 py-1.5 hover:bg-amber-500/20 transition-colors mt-auto"
          onClick={(e) => { e.preventDefault(); }}
          aria-disabled="true"
          title="Affiliate links coming soon"
        >
          <ShoppingCart className="h-3 w-3" />
          Buy on Amazon
        </a>
      </div>
    </div>
  );
}

type PhotoItem = {
  id: number;
  title: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  category: string;
  sourceUrl?: string | null;
  createdAt: string;
  epubUrl?: string | null;
  audioUrl?: string | null;
};

type ActiveTrack = {
  id: number;
  title: string;
  imageUrl: string;
  audioUrl: string;
};

function fmtTime(secs: number): string {
  if (!isFinite(secs) || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ScanResult = {
  photo: PhotoItem;
  labels: string[];
  products: SimilarProduct[];
  skipped?: boolean;
  error?: boolean;
};

const VAULT_TABS = [
  { id: "tab1" as const, label: "Photos" },
  { id: "tab2" as const, label: "Reading" },
  { id: "tab3" as const, label: "Launch Deck" },
  { id: "tab5" as const, label: "Games" },
  { id: "tab6" as const, label: "Stories" },
  { id: "tab8" as const, label: "My Bookmarks" },
];
// tab7 (Private Files) is intentionally absent from the nav — accessible only via the vault keypad.
type VaultTab = "tab1" | "tab2" | "tab3" | "tab5" | "tab6" | "tab7" | "tab8";

const TAYLER_MADE_VIDEO =
  "https://customer-assets-lqy194kg.emergentagent.net/wingman/3e6874c7-46ba-4e02-a2a0-c12358256004/attachments/830920f5c560412cbc2f7d8fe0db00f2_book-open-wide.mp4";

function TaylerMadeTalesOverlay({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);

  const finish = useCallback(() => {
    setVisible(false);
    setTimeout(onDone, 400);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 400ms" }}
    >
      <video
        src={TAYLER_MADE_VIDEO}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        onEnded={finish}
        onError={finish}
      />
      <button
        onClick={finish}
        className="absolute bottom-6 right-6 text-white/50 text-sm hover:text-white/90 transition-colors bg-black/40 px-3 py-1.5 rounded-full"
      >
        Skip intro →
      </button>
    </div>
  );
}

export function Photos() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const categoryParam = params.get("category") ?? undefined;
  const { toast } = useToast();
  const { settings } = useSettings();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Lets other pages link straight to a vault tab (/photos?tab=games), which
  // is how the puzzle player gets you back where you started. Without this the
  // query string was accepted and ignored, always landing on Photos.
  const VAULT_TAB_BY_PARAM: Record<string, VaultTab> = {
    photos: "tab1", reading: "tab2", "launch-deck": "tab3",
    games: "tab5", stories: "tab6", bookmarks: "tab8", "my-bookmarks": "tab8",
  };
  const VAULT_TAB_TO_PARAM: Record<VaultTab, string> = {
    tab1: "photos", tab2: "reading", tab3: "launch-deck",
    tab5: "games", tab6: "stories", tab7: "photos", tab8: "bookmarks",
  };
  const [activeVaultTab, setActiveVaultTab] = useState<VaultTab>(
    () => VAULT_TAB_BY_PARAM[new URLSearchParams(search).get("tab") ?? ""] ?? "tab1",
  );
  const [storyTarget, setStoryTarget] = useState<string | null>(null);
  // Remembered so Private Files can send you back where you came from rather
  // than guessing. Its PIN prompt is otherwise a one-way door.
  const previousVaultTab = useRef<VaultTab>("tab1");
  const goToVaultTab = useCallback((tabId: VaultTab) => {
    setActiveVaultTab((current) => {
      if (current !== tabId) previousVaultTab.current = current;
      return tabId;
    });
    // Clear photo selection when leaving a photo-grid tab so it doesn't bleed into vault tabs
    if (tabId !== "tab1") clearSelection();
    scrollMainToTop();
    if (tabId !== "tab7") setLocation(`/photos?tab=${VAULT_TAB_TO_PARAM[tabId]}`);
  }, [setLocation]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleVaultTabClick = useCallback((tabId: VaultTab) => {
    if (tabId === "tab8") {
      let acked = false;
      const onAck = () => { acked = true; };
      window.addEventListener("urlinc:bookmarksAck", onAck, { once: true });
      window.dispatchEvent(new CustomEvent("urlinc:openBookmarks"));
      setTimeout(() => {
        window.removeEventListener("urlinc:bookmarksAck", onAck);
        if (!acked) {
          toast({
            title: "Extension disconnected",
            description: "Reload this page to reconnect the URLinc extension, then try again.",
            variant: "destructive",
          });
        }
      }, 500);
      return;
    }
    goToVaultTab(tabId);
  }, [goToVaultTab]);
  const leavePrivateFiles = useCallback(() => {
    // Falls back to Photos if the last tab was Private Files itself, so this
    // can never bounce you straight back to the lock screen.
    const back = previousVaultTab.current;
    setActiveVaultTab(back === "tab7" ? "tab1" : back);
  }, []);

  // The vault artwork has a working-looking ACCESS keypad on the wall, so it
  // opens Private Files. Coordinates are percentages of the image, measured
  // against the door panel in the bundled art.
  //
  // This used to switch itself off when a custom image was uploaded, on the
  // theory that a hotspot over unrelated artwork is worse than none. In
  // practice that just meant the Easter egg could disappear with nothing to
  // explain why, and no way to tell that from a bug -- which is exactly what
  // happened. An unconditional hotspot is the lesser problem: at worst it's an
  // invisible region on a picture that doesn't warrant one.
  const vaultHotspots = useMemo(
    () => [
      {
        // Measured against the keypad housing itself -- the metal plate's edges
        // and its four corner screws -- rather than eyeballed, so it doesn't
        // spill onto the vault door beside it.
        left: 31.5, top: 33.0, width: 7.0, height: 16.5,
        title: "Enter Private Files",
        onClick: () => goToVaultTab("tab7"),
      },
      {
        // The key lying on the notebook on the desk -- navigates to the Games Vault.
        // Coordinates are percentages of the expanded image; adjust if the artwork changes.
        left: 42.0, top: 91.5, width: 11.0, height: 7.0,
        title: "Enter Games Vault",
        onClick: () => setLocation("/games-vault"),
      },
    ],
    [goToVaultTab, setLocation],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(categoryParam ?? "All");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [pinnedPhotoCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("vvm_pinned_photo_cats") ?? "[]") as string[]; }
    catch { return []; }
  });

  const [activeTrack, setActiveTrack] = useState<ActiveTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set());

  const [albums, setAlbums] = useState<{ id: number; name: string; photoCount: number }[]>([]);
  useEffect(() => {
    fetch("/api/albums", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => setAlbums(data as typeof albums))
      .catch(() => {});
  }, []);

  const [isExporting, setIsExporting] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const shareMenuRef = useRef<HTMLDivElement>(null);

  // --- Multi-select & bulk scan state ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const lastClickedIndex = useRef<number | null>(null);
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const isScanning = scanProgress !== null;

  const { isFavorite, toggleFavorite } = usePhotoFavorites();
  const photoSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const [photoFavOrder, setPhotoFavOrder] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("photo-favorites-order") ?? "[]") as number[]; }
    catch { return []; }
  });

  // Bulk action state (Move/Add to Album/Delete/Share) -- mirrors the same
  // pattern already built for My Videos' Library grid, so selecting photos
  // here works the exact same way.
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategoryDraft, setNewCategoryDraft] = useState("");
  const [isAlbumMenuOpen, setIsAlbumMenuOpen] = useState(false);
  const [isCreatingNewAlbum, setIsCreatingNewAlbum] = useState(false);
  const [newAlbumDraft, setNewAlbumDraft] = useState("");
  const [addingToAlbum, setAddingToAlbum] = useState(false);
  const [addingToAlbumId, setAddingToAlbumId] = useState<number | null>(null);
  const albumMenuRef = useRef<HTMLDivElement>(null);
  const [isSelectionShareDialogOpen, setIsSelectionShareDialogOpen] = useState(false);
  const [selectionSharing, setSelectionSharing] = useState(false);
  const [selectionShareMessage, setSelectionShareMessage] = useState("");
  const [emptyCategoryName, setEmptyCategoryName] = useState<string | null>(null);

  const bulkDeletePhotos = useBulkDeletePhotos();
  const bulkRestorePhotos = useBulkRestorePhotos();
  const bulkPurgePhotos = useBulkPurgePhotos();
  const bulkUpdatePhotoCategory = useBulkUpdatePhotoCategory();

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAllMode(false);
    lastClickedIndex.current = null;
  }, []);

  const handleBulkScan = useCallback(async () => {
    const selectedPhotos = ([] as PhotoItem[]).concat(
      ...Array.from(selectedIds).map((id) => {
        const found = filteredRef.current.find((p) => p.id === id);
        return found ? [found as PhotoItem] : [];
      })
    );
    if (selectedPhotos.length === 0) return;

    setScanResults([]);
    setCollapsedGroups(new Set());
    setBulkSheetOpen(true);
    setScanProgress({ current: 0, total: selectedPhotos.length });

    for (let i = 0; i < selectedPhotos.length; i++) {
      const photo = selectedPhotos[i]!;
      setScanProgress({ current: i + 1, total: selectedPhotos.length });

      if (!photo.imageUrl) {
        setScanResults((prev) => [...prev, { photo, labels: [], products: [], skipped: true }]);
        continue;
      }

      try {
        const result = await getPhotoSimilarItems(photo.id);
        setScanResults((prev) => [...prev, { photo, labels: result.labels, products: result.products }]);
      } catch {
        setScanResults((prev) => [...prev, { photo, labels: [], products: [], error: true }]);
      }
    }

    setScanProgress(null);
  }, [selectedIds]);

  const toggleGroupCollapse = useCallback((photoId: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (!selectAllMode && selectedIds.size === 0) return;
    const body = selectAllMode
      ? {
          selectAll: true as const,
          filter: {
            ...(activeCategory !== "All" ? { category: activeCategory } : {}),
            ...(searchQuery ? { search: searchQuery } : {}),
          },
        }
      : { ids: Array.from(selectedIds) };
    const deletedCount = selectAllMode ? (selectAllTotalRef.current ?? selectedIds.size) : selectedIds.size;

    bulkDeletePhotos.mutate(
      { data: body },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
          if (activeCategory !== "All") setEmptyCategoryName(activeCategory);
          clearSelection();
          setIsDeleteDialogOpen(false);

          const softDeletedIds = (data as { ids: number[] }).ids;
          let undone = false;
          const handleUndo = () => {
            undone = true;
            clearTimeout(purgeTimer);
            bulkRestorePhotos.mutate(
              { data: { ids: softDeletedIds } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
                  toast({ title: `Restored ${deletedCount} photo${deletedCount !== 1 ? "s" : ""}` });
                },
                onError: () => toast({ title: "Failed to restore photos", variant: "destructive" }),
              },
            );
          };

          const { dismiss } = toast({
            title: `Deleted ${deletedCount} photo${deletedCount !== 1 ? "s" : ""}`,
            duration: (UNDO_TIMEOUT_S + 1) * 1000,
            action: <UndoToastAction onUndo={handleUndo} />,
          });

          const purgeTimer = setTimeout(() => {
            if (!undone) {
              dismiss();
              bulkPurgePhotos.mutate({ data: { ids: softDeletedIds } });
            }
          }, UNDO_TIMEOUT_S * 1000);
        },
        onError: () => toast({ title: "Failed to delete photos", variant: "destructive" }),
      },
    );
  }, [selectAllMode, selectedIds, activeCategory, searchQuery, bulkDeletePhotos, bulkRestorePhotos, bulkPurgePhotos, queryClient, toast, clearSelection]);

  const handleBulkCategory = useCallback(() => {
    if (!selectAllMode && selectedIds.size === 0) return;
    if (!newCategoryDraft.trim()) return;
    const oldCategory = activeCategory;
    const movedCount = selectAllMode ? (selectAllTotalRef.current ?? selectedIds.size) : selectedIds.size;

    const body = selectAllMode
      ? {
          selectAll: true as const,
          category: newCategoryDraft.trim(),
          filter: {
            ...(activeCategory !== "All" ? { category: activeCategory } : {}),
            ...(searchQuery ? { search: searchQuery } : {}),
          },
        }
      : { ids: Array.from(selectedIds), category: newCategoryDraft.trim() };

    bulkUpdatePhotoCategory.mutate(
      { data: body },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
          toast({ title: `Updated category for ${movedCount} photo${movedCount !== 1 ? "s" : ""}` });
          clearSelection();
          setIsCategoryDialogOpen(false);
          setNewCategoryDraft("");
          if (oldCategory !== "All" && oldCategory !== newCategoryDraft.trim()) {
            setEmptyCategoryName(oldCategory);
          }
        },
        onError: () => toast({ title: "Failed to update categories", variant: "destructive" }),
      },
    );
  }, [selectAllMode, selectedIds, newCategoryDraft, activeCategory, searchQuery, bulkUpdatePhotoCategory, queryClient, toast, clearSelection]);

  const handleAddToAlbum = useCallback(async (albumId: number, albumName: string) => {
    if (addingToAlbum) return;
    const photosToAdd = Array.from(selectedIds);
    if (photosToAdd.length === 0) return;
    setAddingToAlbum(true);
    setAddingToAlbumId(albumId);
    let added = 0;
    for (const photoId of photosToAdd) {
      const res = await fetch(`/api/albums/${albumId}/photos`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (res.ok) added++;
    }
    setAddingToAlbum(false);
    setAddingToAlbumId(null);
    setAlbums((prev) => prev.map((a) => a.id === albumId ? { ...a, photoCount: a.photoCount + added } : a));
    toast({ title: `Added ${added} photo${added !== 1 ? "s" : ""} to "${albumName}"` });
    clearSelection();
    setIsAlbumMenuOpen(false);
  }, [addingToAlbum, selectedIds, toast, clearSelection]);

  const handleCreateAndAddToAlbum = useCallback(async () => {
    const name = newAlbumDraft.trim();
    if (!name || addingToAlbum) return;
    const photosToAdd = Array.from(selectedIds);
    setAddingToAlbum(true);
    try {
      const res = await fetch("/api/albums", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      const newAlbum = await res.json() as { id: number; name: string };
      let added = 0;
      for (const photoId of photosToAdd) {
        const r = await fetch(`/api/albums/${newAlbum.id}/photos`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId }),
        });
        if (r.ok) added++;
      }
      setAlbums((prev) => [...prev, { id: newAlbum.id, name: newAlbum.name, photoCount: added }]);
      toast({ title: `Created "${name}" and added ${added} photo${added !== 1 ? "s" : ""}` });
      clearSelection();
      setIsAlbumMenuOpen(false);
      setIsCreatingNewAlbum(false);
      setNewAlbumDraft("");
    } catch {
      toast({ title: "Failed to create album", variant: "destructive" });
    } finally {
      setAddingToAlbum(false);
    }
  }, [newAlbumDraft, addingToAlbum, selectedIds, toast, clearSelection]);

  const handleSelectionShare = useCallback(async (friendId: string) => {
    setSelectionSharing(true);
    try {
      const res = await fetch("/api/photo-category-shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: Array.from(selectedIds), recipientId: friendId, message: selectionShareMessage || undefined }),
      });
      const data = await res.json() as { error?: string; photoCount?: number };
      if (res.ok) {
        toast({ title: `Shared ${data.photoCount ?? selectedIds.size} photo${(data.photoCount ?? selectedIds.size) !== 1 ? "s" : ""} successfully` });
        setIsSelectionShareDialogOpen(false);
        setSelectionShareMessage("");
      } else {
        toast({ title: data.error ?? "Failed to share", variant: "destructive" });
      }
    } finally {
      setSelectionSharing(false);
    }
  }, [selectedIds, selectionShareMessage, toast]);

  useEffect(() => {
    if (!isAlbumMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (albumMenuRef.current && !albumMenuRef.current.contains(e.target as Node)) {
        setIsAlbumMenuOpen(false);
        setIsCreatingNewAlbum(false);
        setNewAlbumDraft("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isAlbumMenuOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false);
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) setShareMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void queryClient.invalidateQueries({ queryKey: getInfiniteListPhotosQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetPhotoCountQueryKey() });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient]);

  useEffect(() => {
    if ((!shareMenuOpen && !isSelectionShareDialogOpen) || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setFriends(data as typeof friends); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [shareMenuOpen, isSelectionShareDialogOpen, friendsLoaded]);

  const handleExport = () => {
    if (activeCategory === "All" || filtered.length === 0) return;
    setIsExporting(true);
    try {
      const slug = activeCategory.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      triggerJsonDownload(
        { version: 1, exportedAt: new Date().toISOString(), photos: filtered.map((p) => ({ title: p.title, category: p.category, imageUrl: p.imageUrl, sourceUrl: p.sourceUrl ?? null, description: (p as { description?: string }).description ?? null })) },
        `web-vault-photos-${slug}-${new Date().toISOString().slice(0, 10)}.json`
      );
      toast({ title: `Exported ${filtered.length} photo${filtered.length !== 1 ? "s" : ""} from "${activeCategory}"` });
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async (friendId: string) => {
    setSharing(friendId);
    try {
      const res = await fetch("/api/photo-category-shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: friendId, categoryName: activeCategory, message: shareMessage || undefined }),
      });
      const data = await res.json() as { error?: string; photoCount?: number };
      if (res.ok) {
        toast({ title: `Shared "${activeCategory}" (${data.photoCount ?? filtered.length} photo${(data.photoCount ?? filtered.length) !== 1 ? "s" : ""})` });
        setShareMenuOpen(false);
        setShareMessage("");
      } else {
        toast({ title: data.error ?? "Failed to share", variant: "destructive" });
      }
    } finally {
      setSharing(null);
    }
  };

  const photoQueryParams = {
    ...(searchQuery ? { search: searchQuery } : {}),
    ...(activeCategory !== "All" ? { category: activeCategory } : {}),
  };
  const sentinelRef = useRef<HTMLDivElement>(null);
  const {
    data: photosData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteListPhotos(
    Object.keys(photoQueryParams).length > 0 ? photoQueryParams : undefined,
  );
  const photos = photosData?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    const root = document.getElementById("main-scroll");
    if (!el || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: stats } = useGetPhotoStats();

  const photoCountForSearchParams = searchQuery
    ? { search: searchQuery, ...(activeCategory !== "All" ? { category: activeCategory } : {}) }
    : undefined;
  const { data: photoCountForSearch } = useGetPhotoCount(photoCountForSearchParams, {
    query: { queryKey: getGetPhotoCountQueryKey(photoCountForSearchParams), enabled: !!searchQuery },
  });
  const selectAllTotal: number | undefined = searchQuery
    ? photoCountForSearch?.total
    : activeCategory === "All"
      ? stats?.total
      : stats?.byCategory.find((b) => b.category === activeCategory)?.count;
  const selectAllTotalRef = useRef(selectAllTotal);
  useEffect(() => { selectAllTotalRef.current = selectAllTotal; });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    audio.src = activeTrack.audioUrl;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [activeTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying]);

  const closePlayer = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setActiveTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const playTrack = useCallback((photo: PhotoItem) => {
    if (!photo.audioUrl) return;
    setActiveTrack({ id: photo.id, title: photo.title, imageUrl: photo.imageUrl, audioUrl: photo.audioUrl });
  }, []);

  const bookIds = photos.filter((p) => p.epubUrl).map((p) => p.id);
  const bookIdsKey = bookIds.sort((a, b) => a - b).join(",");
  const { data: bulkProgressData } = useGetBulkReadingProgress(
    { ids: bookIdsKey },
    { query: { queryKey: getGetBulkReadingProgressQueryKey({ ids: bookIdsKey }), enabled: bookIds.length > 0 } },
  );

  const categories = ["All", ...Array.from(new Set([...photos.map((p) => p.category), ...pinnedPhotoCategories])).sort()];
  const pinnedOnlyPhotoCategories = pinnedPhotoCategories.filter(p => !(stats?.byCategory ?? []).some(c => c.category === p));

  const favPhotos = photos.filter(p => isFavorite(p.id));
  const favPhotoIds = new Set(favPhotos.map(p => p.id));
  const orderedFavPhotoIds = [
    ...photoFavOrder.filter(id => favPhotoIds.has(id)),
    ...[...favPhotoIds].filter(id => !photoFavOrder.includes(id)),
  ];
  const orderedFavPhotos = orderedFavPhotoIds.map(id => favPhotos.find(p => p.id === id)!).filter(Boolean);
  const nonFavPhotos = sortPhotos(photos.filter(p => !isFavorite(p.id)), sortKey);
  // Combined list for shift-click range selection and existing references throughout the file
  const filtered = [...orderedFavPhotos, ...nonFavPhotos];

  const handlePhotoFavDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = [
      ...photoFavOrder.filter(id => favPhotoIds.has(id)),
      ...[...favPhotoIds].filter(id => !photoFavOrder.includes(id)),
    ];
    const oldIdx = currentOrder.indexOf(active.id as number);
    const newIdx = currentOrder.indexOf(over.id as number);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(currentOrder, oldIdx, newIdx);
    setPhotoFavOrder(next);
    try { localStorage.setItem("photo-favorites-order", JSON.stringify(next)); } catch {}
  };

  // Keep a ref for use inside the async scan callback
  const filteredRef = useRef(filtered);
  useEffect(() => { filteredRef.current = filtered; });

  // Declared here (after `filtered` exists) and depending on it directly,
  // exactly matching My Videos' Library grid's own toggleSelect -- rather
  // than reading a ref inside a zero-dependency useCallback, which didn't
  // reliably pick up range selections in testing.
  const toggleSelect = useCallback((photoId: number, index: number, shiftKey: boolean) => {
    // Capture the previous index into a plain variable BEFORE the ref gets
    // overwritten below. setSelectedIds's updater doesn't run synchronously
    // -- by the time React actually calls it, `lastClickedIndex.current =
    // index` (a few lines down) has already run, so reading the ref inside
    // the updater was seeing the NEW index on both ends of the range.
    const prevIndex = lastClickedIndex.current;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && prevIndex !== null) {
        const lo = Math.min(prevIndex, index);
        const hi = Math.max(prevIndex, index);
        const adding = !next.has(photoId);
        for (let i = lo; i <= hi; i++) {
          const p = filtered[i];
          if (p) { if (adding) next.add(p.id); else next.delete(p.id); }
        }
      } else if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
    lastClickedIndex.current = index;
  }, [filtered]);

  const getGridCols = useCallback((): number => {
    if (window.matchMedia("(min-width: 1280px)").matches) return 4;
    if (window.matchMedia("(min-width: 1024px)").matches) return 3;
    if (window.matchMedia("(min-width: 640px)").matches) return 2;
    return 1;
  }, []);

  const [gridCols, setGridCols] = useState<number>(() => getGridCols());

  const gridColsRef = useRef(gridCols);
  useEffect(() => { gridColsRef.current = gridCols; }, [gridCols]);

  const anchorPhotoIndexRef = useRef<number | null>(null);

  const gridListRef = useRef<HTMLDivElement>(null);
  const favGridRef = useRef<HTMLDivElement>(null);

  const photoRows: (typeof nonFavPhotos)[] = [];
  for (let i = 0; i < nonFavPhotos.length; i += gridCols) {
    photoRows.push(nonFavPhotos.slice(i, i + gridCols));
  }

  const gridVirtualizer = useVirtualizer({
    count: photoRows.length,
    getScrollElement: () => document.getElementById("main-scroll"),
    estimateSize: () => 310,
    overscan: 8,
  });

  const gridVirtualizerRef = useRef(gridVirtualizer);
  useEffect(() => { gridVirtualizerRef.current = gridVirtualizer; });

  useEffect(() => {
    const mqXl = window.matchMedia("(min-width: 1280px)");
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const mqSm = window.matchMedia("(min-width: 640px)");
    const update = () => {
      const newCols = getGridCols();
      if (newCols !== gridColsRef.current) {
        const firstVisibleRow = gridVirtualizerRef.current.getVirtualItems()[0]?.index ?? 0;
        anchorPhotoIndexRef.current = firstVisibleRow * gridColsRef.current;
        setGridCols(newCols);
      }
    };
    mqXl.addEventListener("change", update);
    mqLg.addEventListener("change", update);
    mqSm.addEventListener("change", update);
    return () => {
      mqXl.removeEventListener("change", update);
      mqLg.removeEventListener("change", update);
      mqSm.removeEventListener("change", update);
    };
  }, [getGridCols]);

  useLayoutEffect(() => {
    if (anchorPhotoIndexRef.current !== null) {
      const newRowIndex = Math.floor(anchorPhotoIndexRef.current / gridCols);
      gridVirtualizer.scrollToIndex(newRowIndex, { align: "start" });
      anchorPhotoIndexRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridCols]);

  const hasSelection = selectAllMode || selectedIds.size > 0;
  const showSelectAllBanner = !selectAllMode && selectedIds.size === filtered.length && filtered.length > 0 && !!hasNextPage;

  useEffect(() => { clearSelection(); }, [activeCategory, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout>
      {storyTarget && (
        <TaylerMadeTalesOverlay
          onDone={() => {
            const url = storyTarget;
            setStoryTarget(null);
            openUrl(url);
          }}
        />
      )}
      <div className="flex flex-col">

        {/* STICKY HEADER */}
        <div className="sticky top-0 z-20 bg-background flex-shrink-0">

          {/* Row 1: page title */}
          <div className="flex items-center gap-3 px-8 pt-4 pb-2 border-b border-border/30">
            <Archive className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">My Vault</h1>
            </div>
          </div>

          {/* Row 2: tab bar */}
          <div className="flex gap-0 px-8 border-b border-border">
            {VAULT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleVaultTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeVaultTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Row 3: toolbar -- hidden on Private Files, where none of it
              applies. Search, Category, Album and Sort all act on the photo
              library, and Add Item opens the photo form; Private Files is a
              browser over a folder on your own disk, so these controls do
              nothing there whether it's locked or unlocked. Dropping them also
              buys back the vertical space the PIN pad was overflowing into. */}
          {activeVaultTab !== "tab7" && (
          <div className="flex items-start gap-3 px-8 py-3 border-b border-border/40">
            <div className="flex flex-col gap-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder=""
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm w-full"
                />
              </div>
              <span className="text-[10px] text-muted-foreground px-0.5">Search by title</span>
            </div>
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </Button>
            )}

            {/* Category dropdown */}
            <div className="flex flex-col gap-1">
              <Select value={activeCategory} onValueChange={(val) => setActiveCategory(val)}>
                <SelectTrigger className="h-8 w-44 text-sm shrink-0">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="max-h-[40vh] overflow-y-auto">
                  <SelectItem value="All">
                    All{stats ? ` (${stats.total})` : ""}
                  </SelectItem>
                  {stats &&
                    [...stats.byCategory,
                      ...pinnedOnlyPhotoCategories.map((p) => ({ category: p, count: 0 })),
                    ]
                      .sort((a, b) => a.category.localeCompare(b.category))
                      .map((cat) => (
                        <SelectItem key={cat.category} value={cat.category}>
                          {cat.category} ({cat.count})
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground px-0.5">Category</span>
            </div>

            {/* Album dropdown */}
            <div className="flex flex-col gap-1">
              <Select
                value={location.startsWith("/albums/") ? location.split("/albums/")[1] : "__none__"}
                onValueChange={(val) => {
                  if (val !== "__none__") setLocation(`/albums/${val}`);
                }}
              >
                <SelectTrigger className="h-8 w-44 text-sm shrink-0">
                  <SelectValue placeholder="Albums" />
                </SelectTrigger>
                <SelectContent className="max-h-[40vh] overflow-y-auto">
                  {albums.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No albums yet</div>
                  ) : (
                    albums.map((al) => (
                      <SelectItem key={al.id} value={String(al.id)}>
                        {al.name} ({al.photoCount})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground px-0.5">Album</span>
            </div>

            {/* Sort dropdown */}
            <div className="flex flex-col gap-1">
              <div className="relative shrink-0" ref={sortMenuRef}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSortMenuOpen((o) => !o)}
                >
                  <ArrowUpDown className="w-4 h-4" />
                  {SORT_LABELS[sortKey]}
                </Button>
                {sortMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-popover border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
                    {(["alpha-asc", "alpha-desc", "date-desc", "date-asc"] as SortKey[]).map((key) => (
                      <button
                        key={key}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                        onClick={() => {
                          setSortKey(key);
                          setSortMenuOpen(false);
                        }}
                      >
                        <Check className={`w-4 h-4 shrink-0 ${sortKey === key ? "text-primary" : "opacity-0"}`} />
                        {SORT_LABELS[key]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground px-0.5">Sort order</span>
            </div>

            <Link href="/add-photo" className="ml-auto">
              <Button size="sm" className="gap-1.5 shrink-0">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </Button>
            </Link>
          </div>
          )}

          {/* Row 4: select-all-matching banner */}
          {showSelectAllBanner && (
            <div className="px-8 py-2 border-b border-primary/20 bg-primary/10 text-center text-sm">
              All {filtered.length} photos loaded are selected.{" "}
              <button
                className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                onClick={() => setSelectAllMode(true)}
              >
                {selectAllTotal !== undefined ? `Select all ${selectAllTotal} matching` : "Select all matching photos"}
              </button>
            </div>
          )}
          {selectAllMode && (
            <div className="px-8 py-2 border-b border-primary/20 bg-primary/10 text-center text-sm">
              {selectAllTotal !== undefined ? `All ${selectAllTotal} photos are selected.` : "All matching photos are selected."}{" "}
              <button
                className="text-primary font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                onClick={clearSelection}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        {/* One greeting for the whole vault. The artwork is about the vault
            itself rather than any single tab, so it sits above the tab switch
            and shows on all of them. empty:hidden so the padding collapses too
            when an admin turns the banner off -- TabHeader renders null then,
            leaving this wrapper genuinely empty. */}
        <div className="max-w-7xl mx-auto px-8 w-full pt-4 empty:hidden">
          <TabHeader tabKey="vault" hotspots={vaultHotspots} />
        </div>

        {/* TAB CONTENT */}
        {activeVaultTab === "tab1" && (
          <div className="max-w-7xl mx-auto px-8 w-full pt-4">

        {/* Favorited photos -- DnD-sortable, rendered above the main grid */}
        {orderedFavPhotos.length > 0 && !isLoading && (
          <DndContext sensors={photoSensors} collisionDetection={closestCenter} onDragEnd={(e) => { handlePhotoFavDragEnd(e); const blockClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', blockClick, { capture: true }), 200); }}>
          <SortableContext items={orderedFavPhotoIds} strategy={rectSortingStrategy}>
          <div ref={favGridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4 mb-2">
            {orderedFavPhotos.map((photo, index) => {
              const isSelected = selectedIds.has(photo.id);
              const readingProgress = photo.epubUrl ? bulkProgressData?.[String(photo.id)] : undefined;
              const progressPct = readingProgress?.percentage ?? null;
              const isCompleted = progressPct === 100;
              const clickableSourceUrl = photo.sourceUrl && !photo.sourceUrl.includes("dropboxusercontent.com") ? photo.sourceUrl : null;
              return (
                <SortablePhotoWrapper key={photo.id} id={photo.id}>
                  <div className={`group relative rounded-xl overflow-hidden bg-muted border transition-all shadow-sm hover:shadow-lg select-none ${isSelected ? "border-primary/70 ring-2 ring-primary/30" : "border-border/50 hover:border-primary/40"}`}>
                    <button className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary opacity-100" : `bg-black/40 border-white/70 ${hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(photo.id, index, e.shiftKey); }} onPointerDown={(e) => e.stopPropagation()} title={isSelected ? "Deselect" : "Select"} aria-label={isSelected ? "Deselect photo" : "Select photo"}>{isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />}</button>
                    <button className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-all ${"bg-black/60 text-primary opacity-100"}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggleFavorite(photo.id, { id: photo.id, title: photo.title, imageUrl: photo.imageUrl, category: photo.category }); }} onPointerDown={(e) => e.stopPropagation()} title="Remove from favorites"><Star className="w-3.5 h-3.5 fill-primary" /></button>
                    <a href={photo.audioUrl ? undefined : `/photo/${photo.id}`} className="block relative" onClick={(e) => { if (hasSelection || e.shiftKey) { e.preventDefault(); toggleSelect(photo.id, index, e.shiftKey); return; } if (photo.audioUrl) { e.preventDefault(); playTrack(photo); } }}>
                      <img src={photo.thumbnailUrl ?? `/api/photos/${photo.id}/thumbnail`} alt={photo.title} className="w-full h-auto block" onError={() => setImgErrors((prev) => new Set([...prev, photo.id]))} />
                      {imgErrors.has(photo.id) && (
                        <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-2 p-3">
                          {photo.sourceUrl && !photo.audioUrl ? (
                            <>
                              <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent((() => { try { return new URL(photo.sourceUrl!).hostname; } catch { return ""; } })())}&sz=32`} className="w-8 h-8 rounded" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              <span className="text-xs text-muted-foreground text-center truncate max-w-full px-2">{(() => { try { return new URL(photo.sourceUrl!).hostname.replace(/^www\./, ""); } catch { return photo.sourceUrl!.slice(0, 30); } })()}</span>
                            </>
                          ) : photo.audioUrl ? <Headphones className="w-8 h-8 text-muted-foreground" /> : <ImageIcon className="w-8 h-8 text-muted-foreground/40" />}
                        </div>
                      )}
                      {photo.audioUrl && <button className={`absolute bottom-2 right-2 z-10 p-1.5 rounded-full transition-colors ${activeTrack?.id === photo.id ? "bg-primary text-white" : "bg-black/60 hover:bg-primary text-white"}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); playTrack(photo); }} onPointerDown={(e) => e.stopPropagation()} title="Play audio"><Headphones className="w-3.5 h-3.5" /></button>}
                    </a>
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-medium truncate">{photo.title}</p>
                      {photo.epubUrl && progressPct !== null && <div className="w-full bg-muted-foreground/20 rounded-full h-1.5"><div className={`h-1.5 rounded-full transition-all ${isCompleted ? "bg-green-500" : "bg-primary"}`} style={{ width: `${progressPct}%` }} /></div>}
                    </div>
                  </div>
                </SortablePhotoWrapper>
              );
            })}
          </div>
          </SortableContext>
          </DndContext>
        )}

        {/* Photo grid */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <ImageIcon className="w-16 h-16 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">
                {searchQuery || activeCategory !== "All" ? "No photos match your filters" : "No photos yet"}
              </p>
              {!searchQuery && activeCategory === "All" && (
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Add your first photo to get started
                </p>
              )}
            </div>
            {!searchQuery && activeCategory === "All" && (
              <Button asChild variant="outline">
                <Link href="/add-photo">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Photo
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div ref={gridListRef} style={{ position: "relative", height: `${gridVirtualizer.getTotalSize()}px` }}>
            {gridVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowPhotos = photoRows[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={gridVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                    {rowPhotos.map((photo, colIdx) => {
                      const flatIndex = orderedFavPhotos.length + virtualRow.index * gridCols + colIdx;
                      const isSelected = selectedIds.has(photo.id);
                      const isFav = isFavorite(photo.id);
                      const readingProgress = photo.epubUrl ? bulkProgressData?.[String(photo.id)] : undefined;
                      const progressPct = readingProgress?.percentage ?? null;
                      const isCompleted = progressPct === 100;
                      // Older Dropbox imports stored the Chooser widget's own
                      // raw link here, which expires on Dropbox's own
                      // schedule and eventually 403s -- treat it as absent so
                      // the click falls through to our own durable /photo/:id
                      // page instead (which displays the image via our proxy
                      // route, not this expiring link).
                      const clickableSourceUrl = photo.sourceUrl && !photo.sourceUrl.includes("dropboxusercontent.com")
                        ? photo.sourceUrl
                        : null;
                      return (
                        <div
                          key={photo.id}
                          className={`group relative rounded-xl overflow-hidden bg-muted border transition-all shadow-sm hover:shadow-lg select-none ${
                            isSelected
                              ? "border-primary/70 ring-2 ring-primary/30"
                              : "border-border/50 hover:border-primary/40"
                          }`}
                        >
                          {/* Selection circle — always available, shift-click for range select */}
                          <button
                            className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-primary border-primary opacity-100"
                                : `bg-black/40 border-white/70 ${hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
                            }`}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(photo.id, flatIndex, e.shiftKey); }}
                            title={isSelected ? "Deselect" : "Select"}
                            aria-label={isSelected ? "Deselect photo" : "Select photo"}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />}
                          </button>

                          {/* Favorite star */}
                          <button
                            className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-all ${
                              isFav ? "bg-black/60 text-primary opacity-100" : "bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-primary"
                            }`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void toggleFavorite(photo.id, { id: photo.id, title: photo.title, imageUrl: photo.imageUrl, category: photo.category });
                            }}
                            title={isFav ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
                          </button>

                          <a
                            href={photo.audioUrl ? undefined : `/photo/${photo.id}`}
                            className="block relative"
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey || e.altKey || e.button !== 0) return;
                              if (hasSelection || e.shiftKey) { e.preventDefault(); toggleSelect(photo.id, flatIndex, e.shiftKey); return; }
                              if (photo.audioUrl) { e.preventDefault(); playTrack(photo); }
                              else { e.preventDefault(); setLocation(`/photo/${photo.id}`); }
                            }}
                          >
                            {imgErrors.has(photo.id) ? (
                              photo.sourceUrl && !photo.audioUrl ? (
                                <div className="w-full aspect-video bg-muted/60 flex flex-col items-center justify-center gap-2 p-3">
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent((() => { try { return new URL(photo.sourceUrl!).hostname; } catch { return ""; } })())}&sz=32`}
                                    className="w-8 h-8 rounded"
                                    alt=""
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                  <span className="text-xs text-muted-foreground text-center truncate max-w-full px-2">
                                    {(() => { try { return new URL(photo.sourceUrl!).hostname.replace(/^www\./, ""); } catch { return photo.sourceUrl!.slice(0, 30); } })()}
                                  </span>
                                </div>
                              ) : (
                                <div className="w-full aspect-video bg-muted flex items-center justify-center">
                                  {photo.audioUrl
                                    ? <Headphones className="w-8 h-8 text-muted-foreground" />
                                    : <ImageIcon className="w-8 h-8 text-muted-foreground/40" />}
                                </div>
                              )
                            ) : (
                              <img
                                src={photo.thumbnailUrl ?? `/api/photos/${photo.id}/thumbnail`}
                                alt={photo.title}
                                className="w-full h-auto block"
                                onError={() => setImgErrors((prev) => new Set([...prev, photo.id]))}
                              />
                            )}
                            {photo.audioUrl && (
                              <button
                                className={`absolute bottom-2 right-2 z-10 p-1.5 rounded-full transition-colors ${activeTrack?.id === photo.id ? "bg-primary text-white" : "bg-black/60 hover:bg-primary text-white"}`}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); playTrack(photo); }}
                                title="Play audio"
                              >
                                <Headphones className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </a>
                          {/* Plain <a>, not wouter's Link -- see note above. */}
                          <a
                            href={`/photo/${photo.id}`}
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey || e.altKey || e.button !== 0) return;
                              e.preventDefault();
                              if (hasSelection || e.shiftKey) {
                                toggleSelect(photo.id, flatIndex, e.shiftKey);
                              } else {
                                setLocation(`/photo/${photo.id}`);
                              }
                            }}
                          >
                            <div className="p-3 bg-card hover:bg-accent/30 transition-colors cursor-pointer">
                              <p className="text-sm font-medium line-clamp-2 leading-snug">
                                {(() => {
                                  try {
                                    const u = new URL(photo.title);
                                    return u.hostname.replace("www.", "") || photo.title;
                                  } catch {
                                    return photo.title;
                                  }
                                })()}
                              </p>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-foreground">
                                  {photo.category}
                                </span>
                                {clickableSourceUrl && (
                                  <span className="text-[10px] text-muted-foreground/60 truncate ml-2 max-w-[100px]">
                                    {(() => { try { return new URL(clickableSourceUrl).hostname.replace("www.", ""); } catch { return ""; } })()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div ref={sentinelRef} className="h-8 flex items-center justify-center mt-2">
          {isFetchingNextPage && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more…
            </div>
          )}
        </div>
          </div>
        )}

        {activeVaultTab === "tab7" && (
          <div className="px-8 flex flex-col" style={{ minHeight: "calc(100vh - 160px)" }}>
            <PrivateFilesTab onExit={leavePrivateFiles} />
          </div>
        )}

        {activeVaultTab === "tab5" && (
          <>
            <ArcadeSection />
            <VaultSourceGrid
              listType="vault-games"
              intro="Legal, free game streaming and download sources."
              builtIns={VAULT_GAMES_SOURCES}
            />
          </>
        )}

        {activeVaultTab === "tab2" && (
          <VaultSourceGrid
            listType="vault-reading"
            intro="Free and legal reading sources — books, articles, comics and more."
            builtIns={VAULT_READING_SOURCES}
          />
        )}

        {activeVaultTab === "tab6" && (
          <VaultSourceGrid
            listType="vault-stories"
            intro="Stories by Gary Kuper — interactive books for children."
            builtIns={VAULT_STORIES_SOURCES}
            onBuiltInClick={(s) => setStoryTarget(s.url)}
          />
        )}

        {activeVaultTab === "tab3" && (
          <LaunchDeckContent />
        )}

        {activeVaultTab === "tab8" && (() => {
          const linkPhotos = photos.filter((p) => p.sourceUrl);
          return linkPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <Archive className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="text-lg font-medium text-muted-foreground">No bookmarks yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Use the URLinc extension to save links from any page.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 pb-4">
              {linkPhotos.map((photo) => {
                const host = (() => { try { return new URL(photo.sourceUrl!).hostname; } catch { return ""; } })();
                const domain = host.replace(/^www\./, "");
                return (
                  <a
                    key={photo.id}
                    href={photo.sourceUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
                      className="w-4 h-4 rounded-sm shrink-0 object-contain"
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="flex-1 text-sm text-blue-400 group-hover:underline truncate min-w-0">{photo.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{domain}</span>
                  </a>
                );
              })}
            </div>
          );
        })()}

{activeVaultTab !== "tab1" && activeVaultTab !== "tab2" && activeVaultTab !== "tab3" && activeVaultTab !== "tab5" && activeVaultTab !== "tab6" && activeVaultTab !== "tab7" && activeVaultTab !== "tab8" && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <Archive className="w-16 h-16 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">Coming soon</p>
              <p className="text-sm text-muted-foreground/70 mt-1">This section is under construction</p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" className="hidden" />

      {/* Mini-player bar */}
      {activeTrack && (
        <div className="fixed bottom-0 left-64 right-0 z-50 bg-card border-t border-border shadow-2xl">
          <div className="flex items-center gap-3 px-4 py-2">
            {/* Cover art */}
            {activeTrack.imageUrl ? (
              <img src={activeTrack.imageUrl} alt="" className="w-9 h-9 rounded-md object-cover shrink-0 border border-border/50" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Headphones className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            {/* Title */}
            <p className="text-sm font-medium truncate w-40 shrink-0">{activeTrack.title}</p>
            {/* Play/pause */}
            <button
              onClick={togglePlayPause}
              className="shrink-0 w-8 h-8 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-primary" />}
            </button>
            {/* Time + Seek */}
            <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-8 text-right">{fmtTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const t = parseFloat(e.target.value);
                setCurrentTime(t);
                if (audioRef.current) audioRef.current.currentTime = t;
              }}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
            />
            <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-8">{fmtTime(duration)}</span>
            {/* Close */}
            <button
              onClick={closePlayer}
              className="shrink-0 w-7 h-7 rounded-full hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
              title="Close player"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk Similar Items Sheet */}
      <Sheet open={bulkSheetOpen} onOpenChange={(open) => { if (!isScanning) setBulkSheetOpen(open); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-amber-400" />
              Similar Items
              {scanProgress && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  — Analysing {scanProgress.current} of {scanProgress.total}…
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Progress bar */}
          {scanProgress && (
            <div className="mb-5">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {scanProgress.current < scanProgress.total
                  ? "Scanning photos with AI…"
                  : "Finalizing…"}
              </p>
            </div>
          )}

          {/* No results yet (just opened, scan hasn't yielded anything) */}
          {scanResults.length === 0 && scanProgress && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm">Analyzing photos with AI…</p>
            </div>
          )}

          {/* Disclaimer */}
          {scanResults.length > 0 && (
            <p className="text-xs text-muted-foreground mb-4 bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
              Concept suggestions — affiliate links will be live once real product integration is enabled.
            </p>
          )}

        {activeVaultTab !== "tab1" && activeVaultTab !== "tab5" && activeVaultTab !== "tab7" && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <Archive className="w-16 h-16 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">Coming soon</p>
              <p className="text-sm text-muted-foreground/70 mt-1">This section is under construction</p>
            </div>
          </div>
        )}
          {/* Results grouped by photo */}
          <div className="space-y-4">
            {scanResults.map((result) => {
              const isCollapsed = collapsedGroups.has(result.photo.id);
              return (
                <div key={result.photo.id} className="border border-border rounded-xl overflow-hidden">
                  {/* Group header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                    onClick={() => toggleGroupCollapse(result.photo.id)}
                  >
                    <img
                      src={result.photo.imageUrl}
                      alt={result.photo.title}
                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{result.photo.title}</p>
                      <p className="text-xs text-muted-foreground">{result.photo.category}</p>
                    </div>

                    {result.skipped && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                        <AlertTriangle className="h-3 w-3" /> Skipped
                      </span>
                    )}
                    {result.error && (
                      <span className="flex items-center gap-1 text-xs text-destructive bg-destructive/10 rounded-full px-2 py-0.5 shrink-0">
                        <AlertTriangle className="h-3 w-3" /> Failed
                      </span>
                    )}
                    {!result.skipped && !result.error && (
                      <span className="text-xs text-amber-400 shrink-0">{result.products.length} items</span>
                    )}

                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                  </button>

                  {/* Group body */}
                  {!isCollapsed && (
                    <div className="px-4 py-4 space-y-4">
                      {result.skipped && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          This photo has no image URL and was skipped.
                        </p>
                      )}
                      {result.error && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Analysis failed for this photo.
                        </p>
                      )}
                      {!result.skipped && !result.error && (
                        <>
                          {result.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {result.labels.map((label) => (
                                <span
                                  key={label}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                >
                                  <Sparkles className="h-2.5 w-2.5" />
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {result.products.map((product, i) => (
                              <ProductCard key={i} product={product} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Still scanning placeholder for photos not yet processed */}
          {scanProgress && scanProgress.current < scanProgress.total && (
            <div className="mt-4 space-y-2">
              {Array.from({ length: scanProgress.total - scanResults.length }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse border border-border/30" />
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectAllMode ? (selectAllTotal ?? selectedIds.size) : selectedIds.size} photo{(selectAllMode ? (selectAllTotal ?? selectedIds.size) : selectedIds.size) !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They'll be moved to the trash and recoverable there for 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty category prompt */}
      <AlertDialog open={emptyCategoryName !== null} onOpenChange={(open) => { if (!open) setEmptyCategoryName(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Category may now be empty</AlertDialogTitle>
            <AlertDialogDescription>
              "{emptyCategoryName}" might have no more photos in it. You can keep it in the list or remove it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEmptyCategoryName(null)}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => setEmptyCategoryName(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk category change */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={(open) => { setIsCategoryDialogOpen(open); if (!open) setNewCategoryDraft(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectAllMode ? (selectAllTotal ?? selectedIds.size) : selectedIds.size} photo{(selectAllMode ? (selectAllTotal ?? selectedIds.size) : selectedIds.size) !== 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>
              {!selectAllMode && selectedIds.size === 1
                ? `Currently in "${photos.find((p) => p.id === [...selectedIds][0])?.category ?? "—"}". Pick a new category or type a new name.`
                : "Pick an existing category or type a new name."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <BulkCategorySelect value={newCategoryDraft} onChange={setNewCategoryDraft} categories={categories.filter((c) => c !== "All")} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkCategory} disabled={!newCategoryDraft.trim() || bulkUpdatePhotoCategory.isPending}>Save Category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share selected photos */}
      <Dialog open={isSelectionShareDialogOpen} onOpenChange={(open) => { setIsSelectionShareDialogOpen(open); if (!open) setSelectionShareMessage(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {selectedIds.size} photo{selectedIds.size !== 1 ? "s" : ""} with a Friend</DialogTitle>
            <DialogDescription>Choose a friend to send the selected photos to.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Input
              placeholder="Add a message (optional)"
              value={selectionShareMessage}
              onChange={(e) => setSelectionShareMessage(e.target.value)}
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
                      disabled={selectionSharing}
                      onClick={() => void handleSelectionShare(f.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors text-sm text-left disabled:opacity-50"
                    >
                      <span>{name}</span>
                      {selectionSharing ? <span className="text-xs text-muted-foreground">Sending…</span> : <Share2 className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSelectionShareDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating selection bar — only relevant on photo/reading tabs */}
      {hasSelection && activeVaultTab === "tab1" && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground shadow-xl rounded-full px-4 py-2.5 animate-in slide-in-from-bottom-3 duration-200 flex-wrap justify-center max-w-[95vw]">
            <span className="text-sm font-semibold pl-1 pr-2">
              {selectAllMode ? (selectAllTotal !== undefined ? `All ${selectAllTotal} selected` : "All matching selected") : `${selectedIds.size} selected`}
            </span>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsCategoryDialogOpen(true)}>
              <FolderOpen className="w-4 h-4 mr-1.5" />
              Move
            </Button>
            <div className="relative" ref={albumMenuRef}>
              <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsAlbumMenuOpen((o) => !o)} disabled={addingToAlbum || selectAllMode}>
                {addingToAlbum ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Images className="w-4 h-4 mr-1.5" />}
                {addingToAlbum ? "Adding…" : "Add to Album"}
              </Button>
              {isAlbumMenuOpen && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 bg-popover text-popover-foreground border rounded-xl shadow-xl py-1 z-50">
                  <div className="max-h-52 overflow-y-auto">
                    {albums.length === 0 && !isCreatingNewAlbum ? (
                      <p className="px-4 py-2.5 text-sm text-muted-foreground">No albums yet</p>
                    ) : (
                      albums.map((a) => (
                        <button
                          key={a.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left disabled:opacity-50"
                          onClick={() => void handleAddToAlbum(a.id, a.name)}
                          disabled={addingToAlbum}
                        >
                          {addingToAlbumId === a.id ? (
                            <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />
                          ) : (
                            <Images className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {addingToAlbumId === a.id ? "Adding…" : `${a.photoCount} photo${a.photoCount !== 1 ? "s" : ""}`}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border mt-1" />
                  {isCreatingNewAlbum ? (
                    <div className="px-3 py-2 flex gap-2">
                      <input
                        autoFocus
                        placeholder="Album name…"
                        value={newAlbumDraft}
                        onChange={(e) => setNewAlbumDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleCreateAndAddToAlbum();
                          if (e.key === "Escape") { setIsCreatingNewAlbum(false); setNewAlbumDraft(""); }
                        }}
                        className="flex-1 bg-transparent text-sm outline-none border border-border rounded-md px-2 py-1 placeholder:text-muted-foreground"
                        disabled={addingToAlbum}
                      />
                      <button onClick={() => void handleCreateAndAddToAlbum()} disabled={!newAlbumDraft.trim() || addingToAlbum} className="text-xs font-medium text-primary disabled:opacity-40 px-1">
                        Add
                      </button>
                      <button onClick={() => { setIsCreatingNewAlbum(false); setNewAlbumDraft(""); }} className="text-xs text-muted-foreground px-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left text-primary font-medium" onClick={() => setIsCreatingNewAlbum(true)}>
                      <Plus className="w-4 h-4 shrink-0" />
                      Add New Album
                    </button>
                  )}
                </div>
              )}
            </div>
            {settings.findSimilarItems && !selectAllMode && (
              <Button size="sm" variant="secondary" className="rounded-full" onClick={() => void handleBulkScan()} disabled={isScanning}>
                {isScanning ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Analyzing…</> : <><ShoppingBag className="w-4 h-4 mr-1.5" />Find Similar</>}
              </Button>
            )}
            {!selectAllMode && (
              <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsSelectionShareDialogOpen(true)}>
                <Share2 className="w-4 h-4 mr-1.5" />
                Share
              </Button>
            )}
            <Button size="sm" variant="destructive" className="rounded-full" onClick={() => setIsDeleteDialogOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
            <div className="h-5 w-px bg-primary-foreground/30" />
            <button onClick={clearSelection} className="text-xs opacity-70 hover:opacity-100 transition-opacity px-1" title="Clear selection">
              ✕
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default Photos;
