import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOldRadioWorldShows,
  usePreviewOldRadioWorldImport,
  useConfirmOldRadioWorldImport,
  useListMusicPlaylists,
  getListMusicPlaylistsQueryKey,
  getGetMusicCountQueryKey,
  type OldRadioWorldPreviewResponse,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMusicPlayer, type MusicTrack } from "@/contexts/MusicPlayerContext";
import { TabHeader } from "@/components/tab-header";
import { RadioBrowserApi, type Station } from "radio-browser-api";
import {
  Search, Radio, Loader2, Download, CheckCircle2,
  ChevronRight, AlertCircle, ListMusic, Wifi, Play, Pause, Star,
  TrendingUp, MapPin, ExternalLink,
} from "lucide-react";
import { VaultSourceGrid } from "@/components/vault-source-grid";
import RadioCabinetPhoto, { SKINS, useScreenMode, type SkinId } from "@/components/radio/RadioCabinetPhoto";
import { type CabinetStation } from "@/components/radio/RadioCabinet";
import { openUrl } from "@/lib/openUrl";

// radio-browser.info returns null for language/tags on stations that have no data.
class SafeRadioBrowserApi extends RadioBrowserApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override normalizeStations(stations: any[], removeDuplicates?: boolean): Station[] {
    return super.normalizeStations(
      stations.map((s) => ({
        ...s,
        language: typeof s.language === "string" ? s.language : "",
        tags: typeof s.tags === "string" ? s.tags : "",
      })),
      removeDuplicates,
    );
  }
}

interface ShowItem {
  title: string;
  url: string;
}

type RadioSource = "liveradio" | "oldradioworld";

interface FavoriteRow {
  id: number;
  source: RadioSource;
  stationId: string;
  stationData: Record<string, unknown>;
  createdAt: string;
}

const PREVIEW_STALE_MS = 1000 * 60 * 60;
const PREVIEW_GC_MS = 1000 * 60 * 60 * 24;

const QUICK_GENRES = [
  "jazz", "classical", "rock", "pop", "news",
  "talk", "country", "electronic", "hip-hop", "ambient",
];

const SOURCE_LABELS: Record<RadioSource, string> = {
  liveradio: "Live Radio",
  oldradioworld: "Old Radio World",
};

type ViewMode = "top" | "trending" | "nearby";
interface RawCountry { name: string; iso_3166_1: string; stationcount: number; }
interface RawLanguage { name: string; iso_639: string; stationcount: number; }

function normalizeRawStation(s: Record<string, unknown>): Station {
  return {
    ...s,
    id: (s.stationuuid as string) || "",
    stationuuid: (s.stationuuid as string) || "",
    name: (s.name as string) || "",
    url: (s.url as string) || "",
    urlResolved: (s.url_resolved as string) || (s.url as string) || "",
    favicon: (s.favicon as string) || "",
    homepage: (s.homepage as string) || "",
    tags: typeof s.tags === "string" ? s.tags.split(",").filter(Boolean) : [],
    language: typeof s.language === "string" ? s.language.split(",").filter(Boolean) : [],
    country: (s.country as string) || "",
    countrycode: (s.countrycode as string) || "",
    state: (s.state as string) || "",
    votes: Number(s.votes) || 0,
    codec: (s.codec as string) || "",
    bitrate: Number(s.bitrate) || 0,
    hls: Number(s.hls) || 0,
    lastcheckok: Number(s.lastcheckok) || 0,
    clickcount: Number(s.clickcount) || 0,
    clicktrend: Number(s.clicktrend) || 0,
  } as Station;
}

function SortableStationRow({
  station, isFav, playing, isQueued, onPlay, onToggleFavorite,
}: {
  station: Station; isFav: boolean; playing: boolean; isQueued: boolean;
  onPlay: () => void; onToggleFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: station.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onPlay}
      data-station-id={station.id}
      className={`flex items-center gap-3 px-4 py-3 text-left transition-colors group cursor-pointer select-none ${isQueued ? "bg-primary/10" : "hover:bg-accent/40"}`}
    >
      <StationFavicon src={station.favicon} name={station.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${isQueued ? "text-primary" : ""}`}>{station.name}</span>
          {playing && <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-primary animate-pulse"><Wifi className="w-3 h-3" /> LIVE</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {station.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded capitalize">{tag}</span>
          ))}
          {station.country && <span className="text-[10px] text-muted-foreground/70">{station.country}</span>}
          {station.bitrate > 0 && <span className="text-[10px] text-muted-foreground/50">{station.bitrate} kbps</span>}
        </div>
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className={`shrink-0 p-1.5 rounded transition-colors hover:bg-white/10 ${isFav ? "text-primary" : "text-muted-foreground/30 opacity-0 group-hover:opacity-100"}`}
        title={isFav ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
      </button>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity ${isQueued ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${isQueued ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-px" />}
      </div>
    </div>
  );
}

function SortableShowRow({
  show, imported, active, isFav, onSelect, onToggleFavorite,
}: {
  show: ShowItem; imported: boolean; active: boolean; isFav: boolean;
  onSelect: () => void; onToggleFavorite: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: show.url });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onSelect}
      data-show-url={show.url}
      className={`flex items-center gap-3 px-4 py-3 text-left transition-colors group cursor-pointer select-none ${active ? "bg-primary/10 text-primary" : "hover:bg-accent/40 text-foreground"}`}
    >
      {imported ? (
        <CheckCircle2 className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-green-500"}`} />
      ) : (
        <Radio className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
      )}
      <span className="flex-1 text-sm font-medium truncate">{show.title}</span>
      {imported && <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 shrink-0">Imported</span>}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className={`shrink-0 p-1 rounded transition-colors hover:bg-white/10 ${isFav ? "text-primary" : "text-muted-foreground/30 opacity-0 group-hover:opacity-100"}`}
        title={isFav ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={`w-3.5 h-3.5 ${isFav ? "fill-primary" : ""}`} />
      </button>
      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${active ? "rotate-90 text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground"}`} />
    </div>
  );
}

function StationFavicon({ src, name }: { src: string; name: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Radio className="w-5 h-5 text-primary/60" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className="w-10 h-10 rounded-lg object-cover shrink-0 bg-muted"
      onError={() => setErr(true)}
    />
  );
}

function LiveRadioTab({
  favorites,
  onToggleFavorite,
  externalSearch,
}: {
  favorites: Map<string, FavoriteRow>;
  onToggleFavorite: (stationId: string, stationData: Record<string, unknown>) => void;
  externalSearch?: string;
}) {
  const { user } = useAuth();
  const player = useMusicPlayer();
  const apiRef = useRef<RadioBrowserApi | null>(null);
  const apiReady = useRef(false);
  const baseUrlRef = useRef("https://de1.api.radio-browser.info");

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const PAGE_SIZE = 100;
  const [internalSearch, setInternalSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("top");
  const [country, setCountry] = useState(() => {
    try { return localStorage.getItem("radio_country") ?? ""; } catch { return ""; }
  });
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem("radio_language") ?? ""; } catch { return ""; }
  });
  const [countries, setCountries] = useState<RawCountry[]>([]);
  const [languages, setLanguages] = useState<RawLanguage[]>([]);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "denied">("idle");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Vintage radio cabinet state
  const [cabinetPowered, setCabinetPowered] = useState(true);
  const [cabinetOpen, setCabinetOpen] = useState(true);
  const [cabinetVolume, setCabinetVolume] = useState(() => Math.round(player.volume * 100));

  // Skin + calibration state (lifted here so the switcher can live in the header row)
  const screenMode = useScreenMode();
  const [liveSkinId, setLiveSkinId] = useState<SkinId>(() => {
    if (typeof window === "undefined") return "wood";
    try {
      const saved = localStorage.getItem("urlinc-live-radio-skin");
      if (saved) return saved as SkinId;
    } catch {}
    const w = window.innerWidth, h = window.innerHeight;
    if (w < 900 && w > h) return "car-gold";
    if (w < 900 && h >= w) return "mobile-portrait";
    return "wood";
  });
  const saveLiveSkinId = (id: SkinId) => {
    setLiveSkinId(id);
    try { localStorage.setItem("urlinc-live-radio-skin", id); } catch {}
  };
  const calibrateFnRef = useRef<(() => void) | null>(null);
  const cabinetSectionRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [cabinetVisible, setCabinetVisible] = useState(true);
  const [stationLoading, setStationLoading] = useState(false);
  const stationLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cabinetPresets, setCabinetPresets] = useState<(CabinetStation | null)[]>(() => {
    try { return JSON.parse(localStorage.getItem("urlinc-radio-presets-v1") ?? "null") || Array(6).fill(null); }
    catch { return Array(6).fill(null); }
  });
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [streamErrorUrl, setStreamErrorUrl] = useState<string | null>(null);

  // Drive MusicPlayerBar visibility: show bar when cabinet scrolls out of view
  useEffect(() => {
    const el = cabinetSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setCabinetVisible(entry.isIntersecting);
        player.setHidePlayerBar(entry.isIntersecting);
      },
      { threshold: 0.05 },
    );
    obs.observe(el);
    player.setHidePlayerBar(true); // cabinet starts visible
    return () => { obs.disconnect(); player.setHidePlayerBar(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show a dialog when a radio stream fails instead of silently opening a tab
  useEffect(() => {
    if (player.playbackErrorUrl) {
      setStreamErrorUrl(player.playbackErrorUrl);
      player.clearPlaybackError();
      setStationLoading(false);
    }
  }, [player.playbackErrorUrl, player.clearPlaybackError]);

  const [liveFavOrder, setLiveFavOrder] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem("radio-liveradio-favorites-order");
      return v ? (JSON.parse(v) as string[]) : [];
    } catch { return []; }
  });
  const liveRadioSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const handleLiveFavDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const favIds = new Set([...favorites.keys()].filter(k => k.startsWith("liveradio:")).map(k => k.slice("liveradio:".length)));
    const currentOrder = [
      ...liveFavOrder.filter(id => favIds.has(id)),
      ...[...favIds].filter(id => !liveFavOrder.includes(id)),
    ];
    const oldIdx = currentOrder.indexOf(active.id as string);
    const newIdx = currentOrder.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(currentOrder, oldIdx, newIdx);
    setLiveFavOrder(next);
    try { localStorage.setItem("radio-liveradio-favorites-order", JSON.stringify(next)); } catch {}
  }, [favorites, liveFavOrder]);

  const effectiveSearch = externalSearch ?? internalSearch;

  const loadFilterLists = useCallback(async () => {
    if (countries.length > 0) return;
    try {
      const [cRes, lRes] = await Promise.all([
        fetch(`${baseUrlRef.current}/json/countries?order=name`),
        fetch(`${baseUrlRef.current}/json/languages?order=name`),
      ]);
      const [cData, lData]: [RawCountry[], RawLanguage[]] = await Promise.all([cRes.json(), lRes.json()]);
      setCountries(cData.filter(c => c.stationcount > 5));
      setLanguages(lData.filter(l => l.stationcount > 10));
    } catch {}
  }, [countries.length]);

  const lastOptsRef = useRef<{ q: string; tag: string; mode: ViewMode; country: string; language: string; lat?: number; lng?: number } | null>(null);

  const fetchPage = useCallback(async (opts: {
    q: string; tag: string; mode: ViewMode; country: string; language: string;
    lat?: number; lng?: number;
  }, pageOffset: number): Promise<Station[]> => {
    const api = apiRef.current;
    if (!api) return [];

    if (opts.mode === "nearby" && opts.lat != null && opts.lng != null) {
      const base = baseUrlRef.current;
      const params = new URLSearchParams({
        geo_lat: String(opts.lat), geo_long: String(opts.lng),
        order: "geo_distance", limit: String(PAGE_SIZE), offset: String(pageOffset),
        hidebroken: "true", has_geo_info: "true",
        ...(opts.country ? { countrycode: opts.country } : {}),
        ...(opts.language ? { language: opts.language } : {}),
      });
      const res = await fetch(`${base}/json/stations/search?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: Record<string, unknown>[] = await res.json();
      return raw.map(normalizeRawStation);
    } else {
      const isTrending = opts.mode === "trending";
      const hasFilters = opts.q.trim() || opts.tag || opts.country || opts.language || isTrending;
      if (!hasFilters) {
        return api.getStationsByClicks(PAGE_SIZE, { offset: pageOffset } as never);
      } else {
        return api.searchStations({
          ...(opts.q.trim() ? { name: opts.q.trim() } : {}),
          ...(opts.tag ? { tag: opts.tag } : {}),
          ...(opts.country ? { countrycode: opts.country } : {}),
          ...(opts.language ? { language: opts.language } : {}),
          limit: PAGE_SIZE,
          offset: pageOffset,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          order: (isTrending ? "clicktrend" : "clickcount") as any,
          reverse: true,
          hideBroken: true,
        });
      }
    }
  }, [PAGE_SIZE]);

  const doLoad = useCallback(async (opts: {
    q: string; tag: string; mode: ViewMode; country: string; language: string;
    lat?: number; lng?: number;
  }) => {
    lastOptsRef.current = opts;
    setLoading(true);
    setError(false);
    setOffset(0);
    setHasMore(true);
    try {
      const results = await fetchPage(opts, 0);
      setStations(results);
      setHasMore(results.length === PAGE_SIZE);
      setOffset(results.length);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, PAGE_SIZE]);

  const doLoadMore = useCallback(async () => {
    const opts = lastOptsRef.current;
    if (!opts || loadingMore) return;
    setLoadingMore(true);
    try {
      const results = await fetchPage(opts, offset);
      setStations((prev) => [...prev, ...results]);
      setHasMore(results.length === PAGE_SIZE);
      setOffset((prev) => prev + results.length);
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, offset, loadingMore, PAGE_SIZE]);

  useEffect(() => {
    const api = new SafeRadioBrowserApi("URLinc/1.0", true);
    api.resolveBaseUrl().then(() => {
      apiRef.current = api;
      apiReady.current = true;
      const resolved = (api as unknown as { baseUrl?: string }).baseUrl;
      if (resolved) baseUrlRef.current = resolved;
      void doLoad({ q: "", tag: "", mode: "top", country: "", language: "" });
      void loadFilterLists();
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, [doLoad, loadFilterLists]);

  useEffect(() => {
    if (!apiReady.current) return;
    if (viewMode === "nearby" && !geoCoords) return;
    const timer = setTimeout(() => {
      void doLoad({
        q: effectiveSearch, tag: genre, mode: viewMode, country, language,
        lat: geoCoords?.lat, lng: geoCoords?.lng,
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [effectiveSearch, genre, viewMode, country, language, geoCoords, doLoad]);

  const handleNearMe = useCallback(() => {
    setViewMode("nearby");
    setGenre("");
    setInternalSearch("");
    if (geoCoords) return;
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus("idle");
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setGeoStatus("denied");
        setViewMode("top");
      },
      { timeout: 8000 },
    );
  }, [geoCoords]);

  const playStation = useCallback((station: Station) => {
    const streamUrl = station.urlResolved || station.url;
    if (playingId === station.id) {
      player.togglePlay();
      return;
    }
    setPlayingId(station.id);
    player.playTrack({
      id: 0,
      title: station.name,
      artist: station.tags.slice(0, 2).join(" · ") || station.country || null,
      audioUrl: streamUrl,
      coverImageUrl: station.favicon || null,
      durationSeconds: null,
    });
  }, [player, playingId]);

  const currentlyPlaying = player.queue[player.currentIndex];
  const isThisStationPlaying = useCallback((station: Station) => {
    return currentlyPlaying?.audioUrl === (station.urlResolved || station.url) && player.isPlaying;
  }, [currentlyPlaying, player.isPlaying]);

  const favoriteStations = useMemo((): Station[] => {
    const favs: Station[] = [];
    for (const [key, row] of favorites.entries()) {
      if (key.startsWith("liveradio:")) favs.push(row.stationData as unknown as Station);
    }
    return favs;
  }, [favorites]);

  const displayedStations = useMemo(() => {
    const loadedIds = new Set(stations.map((s) => s.id));
    const merged = [...favoriteStations.filter((s) => !loadedIds.has(s.id)), ...stations];
    const stationById = new Map(merged.map(s => [s.id, s]));
    const favIds = new Set([...favorites.keys()].filter(k => k.startsWith("liveradio:")).map(k => k.slice("liveradio:".length)));
    const orderedFavIds = [
      ...liveFavOrder.filter(id => favIds.has(id) && stationById.has(id)),
      ...merged.filter(s => favIds.has(s.id) && !liveFavOrder.includes(s.id)).map(s => s.id),
    ];
    return [
      ...orderedFavIds.map(id => stationById.get(id)!),
      ...merged.filter(s => !favIds.has(s.id)),
    ];
  }, [stations, favoriteStations, favorites, liveFavOrder]);

  const footerLabel = useMemo(() => {
    if (viewMode === "trending") return "trending now · Radio Browser";
    if (viewMode === "nearby") return "sorted by distance · Radio Browser";
    if (genre) return `tagged "${genre}" · Radio Browser`;
    if (effectiveSearch) return `matching "${effectiveSearch}" · Radio Browser`;
    return "by popularity · Radio Browser";
  }, [viewMode, genre, effectiveSearch]);

  // Cabinet adapter: map Station[] → CabinetStation[]
  const cabinetStations = useMemo<CabinetStation[]>(() =>
    displayedStations.map(s => ({
      id: s.id,
      name: s.name,
      country: s.country,
      countryCode: s.countryCode,
      genre: s.tags[0] || "",
      bitrate: s.bitrate,
      url: s.urlResolved || s.url,
    })), [displayedStations]);

  const currentCabinetStation = useMemo<CabinetStation | null>(() => {
    const url = currentlyPlaying?.audioUrl;
    if (!url) return null;
    const s = displayedStations.find(st => (st.urlResolved || st.url) === url);
    if (!s) return null;
    return { id: s.id, name: s.name, country: s.country, countryCode: s.countryCode, genre: s.tags[0] || "", bitrate: s.bitrate };
  }, [currentlyPlaying, displayedStations]);

  const cabinetFavoriteIds = useMemo(() =>
    [...favorites.keys()].filter(k => k.startsWith("liveradio:")).map(k => k.slice("liveradio:".length)),
    [favorites]);

  const handleCabinetSelectStation = useCallback((cs: CabinetStation) => {
    if (!cabinetPowered) setCabinetPowered(true);
    setStationLoading(true);
    if (stationLoadTimer.current) clearTimeout(stationLoadTimer.current);
    stationLoadTimer.current = setTimeout(() => setStationLoading(false), 1400);
    const s = displayedStations.find(st => st.id === cs.id);
    if (s) {
      playStation(s);
    } else if (cs.url) {
      // Fallback: station list not loaded yet (e.g. preset recalled on remount)
      setPlayingId(cs.id);
      player.playTrack({ id: 0, title: cs.name, artist: cs.genre || cs.country || null, audioUrl: cs.url, coverImageUrl: null, durationSeconds: null });
    }
  }, [displayedStations, cabinetPowered, playStation, player]);

  const handleCabinetPrev = useCallback(() => {
    const idx = displayedStations.findIndex(st => (st.urlResolved || st.url) === currentlyPlaying?.audioUrl);
    const prev = displayedStations[(idx - 1 + displayedStations.length) % displayedStations.length];
    if (prev) { setActivePreset(null); playStation(prev); }
  }, [displayedStations, currentlyPlaying, playStation]);

  const handleCabinetNext = useCallback(() => {
    const idx = displayedStations.findIndex(st => (st.urlResolved || st.url) === currentlyPlaying?.audioUrl);
    const next = displayedStations[(idx + 1) % displayedStations.length];
    if (next) { setActivePreset(null); playStation(next); }
  }, [displayedStations, currentlyPlaying, playStation]);

  const handleCabinetPower = useCallback(() => {
    if (cabinetPowered) {
      setCabinetPowered(false);
      if (player.isPlaying) player.togglePlay();
    } else {
      setCabinetPowered(true);
      if (currentCabinetStation) {
        const s = displayedStations.find(st => st.id === currentCabinetStation.id);
        if (s) playStation(s);
      }
    }
  }, [cabinetPowered, player, currentCabinetStation, displayedStations, playStation]);

  const handleSetPreset = useCallback((i: number, cs: CabinetStation) => {
    setCabinetPresets(prev => {
      const next = prev.map((x, j) => j === i ? cs : x) as (CabinetStation | null)[];
      try { localStorage.setItem("urlinc-radio-presets-v1", JSON.stringify(next)); } catch {}
      return next;
    });
    setActivePreset(i);
  }, []);

  const handleRecallPreset = useCallback((i: number) => {
    const p = cabinetPresets[i];
    if (!p) return;
    setActivePreset(i);
    handleCabinetSelectStation(p);
  }, [cabinetPresets, handleCabinetSelectStation]);

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
    {/* Stream-error dialog — shown when the browser can't play a station inline */}
    {streamErrorUrl && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Stream unavailable">
        <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm text-foreground">Station couldn't play in URLinc</h3>
              <p className="text-xs text-muted-foreground mt-1">
                This stream uses a format your browser can't play inline. You can open it in a new tab to listen directly, or choose a different station.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setStreamErrorUrl(null)}>
              Stay here
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => { openUrl(streamErrorUrl); setStreamErrorUrl(null); }}>
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </Button>
          </div>
        </div>
      </div>
    )}
    <div ref={scrollContainerRef} className="relative z-10 flex flex-col flex-1 overflow-y-auto">
      {/* Vintage Radio Cabinet */}
      <div ref={cabinetSectionRef} className="px-2 pt-3 pb-1 flex-shrink-0 flex flex-col items-center" style={{ background: "transparent" }}>
        {/* Hide/Show button + skin switcher row — above cabinet */}
        <div className="mb-1 flex items-center gap-2">
          <button
            onClick={() => setCabinetOpen(o => !o)}
            aria-expanded={cabinetOpen}
            className="text-xs px-3 py-1 rounded-md border border-white/10 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 text-amber-600/80 font-medium tracking-wide"
          >
            {cabinetOpen ? "▾ Hide Radio" : "▸ Show Radio"}
          </button>
          <div className="flex items-center gap-1.5 ml-2">
            <button
              type="button"
              title="Calibrate hit targets"
              onClick={() => calibrateFnRef.current?.()}
              style={{
                width: 20, height: 20, borderRadius: "50%",
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)",
                color: "#e8c67a", fontSize: 11, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >⚙</button>
            {SKINS
              .filter(s => {
                if (screenMode === "landscape-mobile") return s.id === "car-gold" || s.id === "car-black";
                if (screenMode === "portrait-mobile")  return s.id === "mobile-portrait";
                return s.id !== "car-gold" && s.id !== "car-black" && s.id !== "mobile-portrait";
              })
              .map(s => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Switch to ${s.label} skin`}
                  aria-pressed={liveSkinId === s.id}
                  onClick={() => saveLiveSkinId(s.id)}
                  title={s.label}
                  style={{
                    width: 20, height: 20, borderRadius: "50%",
                    border: liveSkinId === s.id ? "2px solid #e8c67a" : "2px solid rgba(255,255,255,0.25)",
                    boxShadow: liveSkinId === s.id ? "0 0 5px rgba(232,198,122,0.6)" : "none",
                    backgroundImage: `url(${s.src})`,
                    backgroundSize: "200%", backgroundPosition: "center",
                    cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                />
              ))}
          </div>
        </div>
        {cabinetOpen && (
          <div style={{ width: "100%", maxWidth: 780 }}>
          <RadioCabinetPhoto
            currentStation={currentCabinetStation}
            stations={cabinetStations}
            powered={cabinetPowered}
            isPlaying={player.isPlaying && !!currentCabinetStation}
            isLoading={stationLoading}
            error={null}
            volume={cabinetVolume}
            favorites={cabinetFavoriteIds}
            presets={cabinetPresets}
            activePreset={activePreset}
            onPower={handleCabinetPower}
            onPlayPause={() => { if (currentCabinetStation) player.togglePlay(); }}
            onSelectStation={(cs) => { setActivePreset(null); handleCabinetSelectStation(cs); }}
            onPrev={handleCabinetPrev}
            onNext={handleCabinetNext}
            onVolumeChange={(v) => { setCabinetVolume(v); player.setVolume(v / 100); }}
            onToggleFavorite={(id) => {
              const s = displayedStations.find(st => st.id === id);
              if (s) onToggleFavorite(id, s as unknown as Record<string, unknown>);
            }}
            onSetPreset={handleSetPreset}
            onRecallPreset={handleRecallPreset}
            isAdmin={user?.isAdmin ?? false}
            skinId={liveSkinId}
            onSkinChange={setLiveSkinId}
            calibrateFnRef={calibrateFnRef}
            onSliders={() => { window.open(`https://www.amazon.com/music${user?.affiliateExcluded ? "" : "?tag=urlinctm-20"}`, "_blank"); }}
            onDisplayClick={() => {
              if (!currentCabinetStation) return;
              const el = scrollContainerRef.current?.querySelector(`[data-station-id="${currentCabinetStation.id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
          </div>
        )}
      </div>
      {/* Filters */}
      <div className="relative z-10 px-4 py-2 border-b border-border/50 bg-black/30 backdrop-blur-sm flex flex-col gap-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search stations…"
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Mode + genre pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            onClick={() => { setViewMode("top"); setGenre(""); setInternalSearch(""); }}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              viewMode === "top" && !genre && !effectiveSearch
                ? "bg-primary text-primary-foreground"
                : "bg-background/60 text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            Top
          </button>
          <button
            onClick={() => { setViewMode("trending"); setGenre(""); setInternalSearch(""); }}
            className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              viewMode === "trending"
                ? "bg-orange-500 text-white"
                : "bg-background/60 text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            Trending
          </button>
          <button
            onClick={handleNearMe}
            disabled={geoStatus === "loading"}
            className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-60 ${
              viewMode === "nearby"
                ? "bg-emerald-600 text-white"
                : "bg-background/60 text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            {geoStatus === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
            Near Me
          </button>
          <div className="w-px h-4 bg-border/40 shrink-0" />
          {QUICK_GENRES.map((g) => (
            <button
              key={g}
              onClick={() => { setViewMode("top"); setGenre(genre === g ? "" : g); setInternalSearch(""); }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                genre === g
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 text-muted-foreground hover:text-foreground border border-border/60"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Country + Language selects */}
        <div className="flex gap-2">
          <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); try { localStorage.setItem("radio_country", e.target.value); } catch {} }}
            onFocus={() => void loadFilterLists()}
            style={{ colorScheme: "dark" }}
            className="flex-1 h-7 rounded-md border border-border/60 bg-zinc-900 text-xs text-zinc-200 px-2 cursor-pointer"
          >
            <option value="">All countries</option>
            {countries.map(c => (
              <option key={c.iso_3166_1} value={c.iso_3166_1}>{c.name}</option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => { setLanguage(e.target.value); try { localStorage.setItem("radio_language", e.target.value); } catch {} }}
            onFocus={() => void loadFilterLists()}
            style={{ colorScheme: "dark" }}
            className="flex-1 h-7 rounded-md border border-border/60 bg-zinc-900 text-xs text-zinc-200 px-2 cursor-pointer"
          >
            <option value="">All languages</option>
            {languages.map(l => (
              <option key={l.iso_639 || l.name} value={l.name}>{l.name}</option>
            ))}
          </select>
        </div>

        {geoStatus === "denied" && (
          <p className="text-[10px] text-destructive leading-tight">
            Location access was denied. Allow it in browser settings and try again.
          </p>
        )}
      </div>

      {/* Station list — pb-24 leaves room for the floating strip */}
      <div className="min-h-[300px] pb-24">
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">
              {viewMode === "nearby" && geoStatus === "loading" ? "Getting your location…" : "Loading stations…"}
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm">Could not reach Radio Browser. Check your connection.</p>
            <Button variant="outline" size="sm" onClick={() => void doLoad({ q: effectiveSearch, tag: genre, mode: viewMode, country, language, lat: geoCoords?.lat, lng: geoCoords?.lng })}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && displayedStations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
            <Radio className="w-8 h-8 opacity-30" />
            <p className="text-sm">No stations found{effectiveSearch ? ` for "${effectiveSearch}"` : ""}.</p>
          </div>
        )}

        {displayedStations.length > 0 && (() => {
          const favStations = displayedStations.filter(s => favorites.has(`liveradio:${s.id}`));
          const nonFavStations = displayedStations.filter(s => !favorites.has(`liveradio:${s.id}`));
          return (
            <div className="divide-y divide-border/40">
              {favStations.length > 0 && (
                <DndContext sensors={liveRadioSensors} collisionDetection={closestCenter} onDragEnd={(e) => { handleLiveFavDragEnd(e); const blockClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', blockClick, { capture: true }), 200); }}>
                  <SortableContext items={favStations.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    {favStations.map((station) => (
                      <SortableStationRow
                        key={station.id}
                        station={station}
                        isFav={true}
                        playing={isThisStationPlaying(station)}
                        isQueued={currentlyPlaying?.audioUrl === (station.urlResolved || station.url)}
                        onPlay={() => playStation(station)}
                        onToggleFavorite={() => onToggleFavorite(station.id, station as unknown as Record<string, unknown>)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
              {nonFavStations.map((station) => {
                const playing = isThisStationPlaying(station);
                const isQueued = currentlyPlaying?.audioUrl === (station.urlResolved || station.url);
                return (
                  <button
                    key={station.id}
                    data-station-id={station.id}
                    onClick={() => playStation(station)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group ${
                      isQueued ? "bg-primary/10" : "hover:bg-accent/40"
                    }`}
                  >
                    <StationFavicon src={station.favicon} name={station.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium truncate ${isQueued ? "text-primary" : ""}`}>{station.name}</span>
                        {playing && <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-primary animate-pulse"><Wifi className="w-3 h-3" /> LIVE</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {viewMode === "trending" && (station as unknown as { clicktrend?: number }).clicktrend != null && (
                          <span className="text-[10px] font-semibold text-orange-400">
                            +{(station as unknown as { clicktrend: number }).clicktrend} trending
                          </span>
                        )}
                        {station.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded capitalize">{tag}</span>
                        ))}
                        {station.country && <span className="text-[10px] text-muted-foreground/70">{station.country}</span>}
                        {station.bitrate > 0 && <span className="text-[10px] text-muted-foreground/50">{station.bitrate} kbps</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(station.id, station as unknown as Record<string, unknown>); }}
                      className="shrink-0 p-1.5 rounded transition-colors hover:bg-white/10 text-muted-foreground/30 opacity-0 group-hover:opacity-100"
                      title="Add to favorites"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity ${
                      isQueued ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    } ${isQueued ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>
                      {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-px" />}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {!loading && !error && stations.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-center text-xs text-muted-foreground/50">
              {stations.length} station{stations.length !== 1 ? "s" : ""} · {footerLabel}
            </p>
            {hasMore && (
              <button
                onClick={doLoadMore}
                disabled={loadingMore}
                className="text-xs px-4 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more stations"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>

    </div>
  );
}

export default function RadioTabContent({
  search, source, onSourceChange,
}: {
  search: string;
  source: RadioSource | null;
  onSourceChange: (src: RadioSource | null) => void;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const player = useMusicPlayer();
  const { user } = useAuth();

  // Vintage radio cabinet state for Old Radio World tab
  const [orwCabinetOpen, setOrwCabinetOpen] = useState(true);
  const [orwCabinetPowered, setOrwCabinetPowered] = useState(true);
  const [orwCabinetVolume, setOrwCabinetVolume] = useState(() => Math.round(player.volume * 100));

  // ORW skin + calibration
  const orwScreenMode = useScreenMode();
  const [orwSkinId, setOrwSkinId] = useState<SkinId>(() => {
    if (typeof window === "undefined") return "wood";
    const w = window.innerWidth, h = window.innerHeight;
    if (w < 900 && w > h) return "car-gold";
    if (w < 900 && h >= w) return "mobile-portrait";
    return "wood";
  });
  const orwCalibrateFnRef = useRef<(() => void) | null>(null);
  const orwCabinetSectionRef = useRef<HTMLDivElement>(null);
  const orwScrollContainerRef = useRef<HTMLDivElement>(null);
  const orwPreviewPanelRef = useRef<HTMLDivElement>(null);
  const [orwCabinetVisible, setOrwCabinetVisible] = useState(true);

  useEffect(() => {
    if (source !== "oldradioworld") return;
    const el = orwCabinetSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setOrwCabinetVisible(entry.isIntersecting);
        player.setHidePlayerBar(entry.isIntersecting);
      },
      { threshold: 0.05 },
    );
    obs.observe(el);
    player.setHidePlayerBar(true); // cabinet starts visible
    return () => { obs.disconnect(); player.setHidePlayerBar(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);
  const [orwActivePreset, setOrwActivePreset] = useState<number | null>(null);
  const [orwPresets, setOrwPresets] = useState<(CabinetStation | null)[]>(() => {
    try { return JSON.parse(localStorage.getItem("urlinc-orw-presets-v1") ?? "null") || Array(6).fill(null); }
    catch { return Array(6).fill(null); }
  });

  // source is now lifted to music.tsx — received as a prop

  // Immediately hide the MusicPlayerBar whenever any radio source is active;
  // the per-tab IntersectionObservers reveal it only when cabinet scrolls out.
  useEffect(() => {
    if (!source) return;
    player.setHidePlayerBar(true);
    return () => { player.setHidePlayerBar(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const [favorites, setFavorites] = useState<Map<string, FavoriteRow>>(new Map());

  const [orwFavOrder, setOrwFavOrder] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem("radio-oldradioworld-favorites-order");
      return v ? (JSON.parse(v) as string[]) : [];
    } catch { return []; }
  });
  const orwSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
  const handleOrwFavDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const favUrls = new Set([...favorites.keys()].filter(k => k.startsWith("oldradioworld:")).map(k => k.slice("oldradioworld:".length)));
    const currentOrder = [
      ...orwFavOrder.filter(url => favUrls.has(url)),
      ...[...favUrls].filter(url => !orwFavOrder.includes(url)),
    ];
    const oldIdx = currentOrder.indexOf(active.id as string);
    const newIdx = currentOrder.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(currentOrder, oldIdx, newIdx);
    setOrwFavOrder(next);
    try { localStorage.setItem("radio-oldradioworld-favorites-order", JSON.stringify(next)); } catch {}
  }, [favorites, orwFavOrder]);

  useEffect(() => {
    fetch("/api/radio-favorites", { credentials: "include" })
      .then((r) => r.ok ? r.json() as Promise<FavoriteRow[]> : Promise.resolve([]))
      .then((rows) => setFavorites(new Map(rows.map((r) => [`${r.source}:${r.stationId}`, r]))))
      .catch(() => {});
  }, []);

  const toggleFavorite = useCallback(async (src: RadioSource, stationId: string, stationData: Record<string, unknown>) => {
    const key = `${src}:${stationId}`;
    const wasFav = favorites.has(key);
    setFavorites((prev) => {
      const next = new Map(prev);
      if (wasFav) next.delete(key);
      else next.set(key, { id: 0, source: src, stationId, stationData, createdAt: new Date().toISOString() });
      return next;
    });
    try {
      if (wasFav) {
        await fetch(`/api/radio-favorites/${encodeURIComponent(stationId)}?source=${src}`, { method: "DELETE", credentials: "include" });
      } else {
        await fetch("/api/radio-favorites", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: src, stationId, stationData }),
        });
      }
    } catch {
      setFavorites((prev) => {
        const next = new Map(prev);
        if (wasFav) next.set(key, { id: 0, source: src, stationId, stationData, createdAt: new Date().toISOString() });
        else next.delete(key);
        return next;
      });
    }
  }, [favorites]);

  const [selectedShow, setSelectedShow] = useState<ShowItem | null>(null);
  const [preview, setPreview] = useState<OldRadioWorldPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [loadingMore] = useState(false);
  const [totalEpisodes, setTotalEpisodes] = useState<number | null>(null);

  const previewQKey = useCallback(
    (url: string) => ["radio-preview", source, url] as const,
    [source],
  );

  useEffect(() => {
    queryClient.setQueryDefaults(["radio-preview"], {
      staleTime: PREVIEW_STALE_MS,
      gcTime: PREVIEW_GC_MS,
    });
  }, [queryClient]);

  const { data: orwCatalog, isLoading: orwLoading, isError: orwError } = useListOldRadioWorldShows();
  const { data: playlists } = useListMusicPlaylists();

  // Backfill sourceUrl for playlists imported before URL tracking was added
  useEffect(() => {
    const hasOrphans = (playlists ?? []).some((p) => !p.sourceUrl && p.trackCount > 0);
    if (!hasOrphans) return;
    void fetch("/api/music/backfill-playlist-sources", { method: "POST", credentials: "include" })
      .then(() => queryClient.invalidateQueries({ queryKey: getListMusicPlaylistsQueryKey() }));
  }, [playlists, queryClient]);

  // Clean up empty playlists created by previous duplicate-creation bug
  useEffect(() => {
    const hasEmpty = (playlists ?? []).some((p) => p.trackCount === 0);
    if (!hasEmpty) return;
    void fetch("/api/music/empty-playlists", { method: "DELETE", credentials: "include" })
      .then(() => queryClient.invalidateQueries({ queryKey: getListMusicPlaylistsQueryKey() }));
  }, [playlists, queryClient]);

  const orwPreview = usePreviewOldRadioWorldImport();
  const orwConfirm = useConfirmOldRadioWorldImport();

  // Map from sourceUrl → playlist id
  const importedByUrl = useMemo(
    () => new Map((playlists ?? []).filter((p) => p.sourceUrl).map((p) => [p.sourceUrl as string, p.id])),
    [playlists],
  );

  const importedSourceUrls = useMemo(
    () => new Set((playlists ?? []).filter((p) => p.sourceUrl).map((p) => p.sourceUrl as string)),
    [playlists],
  );

  const importedTitles = useMemo(
    () => new Set((playlists ?? []).filter((p) => !p.sourceUrl).map((p) => p.name.toLowerCase())),
    [playlists],
  );

  const importedPlaylistMap = useMemo(() => {
    const best = new Map<string, { id: number; trackCount: number }>();
    for (const p of (playlists ?? [])) {
      if (p.sourceUrl) continue;
      const key = p.name.toLowerCase();
      const existing = best.get(key);
      if (!existing || p.trackCount > existing.trackCount) {
        best.set(key, { id: p.id, trackCount: p.trackCount });
      }
    }
    return new Map([...best.entries()].map(([k, v]) => [k, v.id]));
  }, [playlists]);

  const filteredShows = useMemo(() => {
    const all = (orwCatalog as { shows?: ShowItem[] } | undefined)?.shows ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((s) => s.title.toLowerCase().includes(q));
  }, [orwCatalog, search]);

  const displayedShows = useMemo(() => {
    const showByUrl = new Map(filteredShows.map(s => [s.url, s]));
    const favUrls = new Set([...favorites.keys()].filter(k => k.startsWith("oldradioworld:")).map(k => k.slice("oldradioworld:".length)));
    const orderedFavUrls = [
      ...orwFavOrder.filter(url => favUrls.has(url) && showByUrl.has(url)),
      ...filteredShows.filter(s => favUrls.has(s.url) && !orwFavOrder.includes(s.url)).map(s => s.url),
    ];
    return [
      ...orderedFavUrls.map(url => showByUrl.get(url)!),
      ...filteredShows.filter(s => !favUrls.has(s.url)),
    ];
  }, [filteredShows, favorites, orwFavOrder]);

  // Map ORW shows → CabinetStation shape for the radio cabinet tuner
  const orwShowsAsStations = useMemo<CabinetStation[]>(() =>
    displayedShows.map(s => ({
      id: s.url, name: s.title, country: "Old Time Radio",
      countryCode: "US", genre: "Classic Radio", bitrate: 0, url: s.url,
    })), [displayedShows]);

  // Map the currently playing track → cabinet display.
  // Only show ORW content: require queueSource to match an ORW show URL so
  // live radio played before switching sections never bleeds into the ORW cabinet.
  const orwCurrentStation = useMemo<CabinetStation | null>(() => {
    const isOrwSource = displayedShows.some(s => s.url === player.queueSource);
    if (!isOrwSource) return null;
    const t = player.queue[player.currentIndex];
    if (!t) return null;
    return { id: t.audioUrl, name: t.title, country: "Old Time Radio",
      countryCode: "US", genre: t.artist || "Classic Radio", bitrate: 0, url: t.audioUrl };
  }, [player.queue, player.currentIndex, player.queueSource, displayedShows]);

  const handleSourceChange = useCallback((newSource: RadioSource) => {
    try { localStorage.setItem("urlinc-last-radio-source", newSource); } catch {}
    onSourceChange(newSource);           // lift up to music.tsx
    setSelectedShow(null);
    setPreview(null);
    setPreviewError(null);
    setTotalEpisodes(null);
    setPlaylistName("");
  }, [onSourceChange, player]);

  const runPreviewFetch = useCallback(async (show: ShowItem) => {
    setPreview(null);
    setPreviewError(null);
    setTotalEpisodes(null);
    try {
      const data = await orwPreview.mutateAsync({
        data: { url: show.url },
      });
      queryClient.setQueryData(previewQKey(show.url), data);
      setPreview(data);
      setPlaylistName(data.showTitle);
      const total = (data as OldRadioWorldPreviewResponse & { totalEpisodes?: number }).totalEpisodes;
      if (total) setTotalEpisodes(total);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      let msg: string;
      if (status === 429) {
        msg = "The source site is rate-limiting requests — wait a moment and try again.";
      } else if (status === 404 || status === 422) {
        msg = "No episodes were found for this show. It may have been moved or removed on the source site.";
      } else {
        msg = "Could not reach the source site — it may be temporarily unavailable. Try again shortly.";
      }
      setPreviewError(msg);
    }
  }, [orwPreview, queryClient, previewQKey]);

  const handleRetry = useCallback(() => {
    if (!selectedShow) return;
    void runPreviewFetch(selectedShow);
  }, [selectedShow, runPreviewFetch]);

  const handleSelectShow = useCallback(async (show: ShowItem) => {
    const bySourceUrl = importedByUrl.get(show.url);
    if (bySourceUrl !== undefined) {
      setLocation(`/music/playlists/${bySourceUrl}`);
      return;
    }

    const byTitle = importedPlaylistMap.get(show.title.toLowerCase());
    if (byTitle !== undefined) {
      setLocation(`/music/playlists/${byTitle}`);
      return;
    }

    if (selectedShow?.url === show.url) {
      setSelectedShow(null);
      setPreview(null);
      setPreviewError(null);
      return;
    }

    setSelectedShow(show);
    setPreviewError(null);
    setPlaylistName(show.title);
    // Scroll the preview panel into view so the import button is visible
    setTimeout(() => orwPreviewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    const qk = previewQKey(show.url);
    const cached = queryClient.getQueryData<OldRadioWorldPreviewResponse>(qk);
    const state = queryClient.getQueryState(qk);
    const isStale = !state || Date.now() - (state.dataUpdatedAt ?? 0) > PREVIEW_STALE_MS;
    if (cached && !isStale) {
      setPreview(cached);
      setPlaylistName(cached.showTitle);
      return;
    }

    await runPreviewFetch(show);
  }, [selectedShow, previewQKey, queryClient, runPreviewFetch, importedByUrl, importedPlaylistMap, setLocation]);

  // Preset recall for ORW: fetch episodes (cache-first) and play them directly.
  // Does NOT navigate away — the user stays in ORW and hears the show immediately.
  const handleOrwPresetRecall = useCallback(async (show: ShowItem) => {
    const qk = previewQKey(show.url);
    let data = queryClient.getQueryData<OldRadioWorldPreviewResponse>(qk);
    const state = queryClient.getQueryState(qk);
    const isStale = !state || Date.now() - (state.dataUpdatedAt ?? 0) > PREVIEW_STALE_MS;
    if (!data || isStale) {
      try {
        data = await orwPreview.mutateAsync({ data: { url: show.url } });
        queryClient.setQueryData(qk, data);
      } catch {
        return;
      }
    }
    if (!data || data.episodes.length === 0) return;
    const tracks: MusicTrack[] = data.episodes.map((ep) => ({
      id: 0,
      title: ep.title,
      artist: data!.showTitle,
      audioUrl: ep.audioUrl,
      coverImageUrl: null,
      durationSeconds: null,
    }));
    player.playQueue(tracks, 0, show.url);
  }, [previewQKey, queryClient, orwPreview, player]);

  const handleImport = useCallback(async () => {
    if (!preview || !playlistName.trim()) return;
    try {
      const result = await orwConfirm.mutateAsync({
        data: {
          showTitle: preview.showTitle,
          description: preview.description ?? null,
          playlistName: playlistName.trim(),
          sourceUrl: selectedShow?.url,
          episodes: preview.episodes,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["listMusic"] }),
        queryClient.invalidateQueries({ queryKey: getListMusicPlaylistsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMusicCountQueryKey() }),
      ]);
      const skippedMsg = result.skipped > 0 ? ` (${result.skipped} already in library)` : "";
      toast({
        title: `Imported ${result.imported} episodes${skippedMsg}`,
        description: `Playlist "${playlistName.trim()}" created.`,
      });
      setLocation(`/music/playlists/${result.playlistId}`);
    } catch {
      toast({ title: "Import failed", description: "Could not save episodes.", variant: "destructive" });
    }
  }, [preview, playlistName, orwConfirm, queryClient, toast, setLocation, selectedShow]);

  const isImported = selectedShow
    ? importedTitles.has(selectedShow.title.toLowerCase())
    : false;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Picker -- same pick-a-section-first pattern as Plex/Jellyfin Library,
          now built on the same curated+custom+favorites grid as Browse
          Music/Stream Sources/Audiobooks/Vault. The two built-in cards
          switch this tab's own view (onClick) rather than opening a link;
          anything a user adds is a plain external radio-site link, same as
          every other tab's "Add Source" flow. */}
      {source === null && (
        <div className="flex-1 overflow-y-auto">
          <TabHeader tabKey="audio-radio" />
          <VaultSourceGrid
            listType="music-radio-picker"
            intro="Choose what to browse"
            builtIns={[
              {
                name: "Live Radio",
                description: "Search and stream thousands of live radio stations from around the world.",
                color: "bg-sky-500/10 border-sky-500/30 text-sky-400",
                pinned: true,
                onClick: () => handleSourceChange("liveradio"),
              },
              {
                name: "Old Radio World",
                description: "Browse and import classic old-time radio shows into your library.",
                color: "bg-amber-500/10 border-amber-500/30 text-amber-400",
                pinned: true,
                onClick: () => handleSourceChange("oldradioworld"),
              },
            ]}
          />
        </div>
      )}

      {/* Live Radio */}
      {source === "liveradio" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <LiveRadioTab
            favorites={favorites}
            onToggleFavorite={(stationId, stationData) => void toggleFavorite("liveradio", stationId, stationData)}
            externalSearch={search}
          />
        </div>
      )}

      {/* Old Radio World */}
      {source === "oldradioworld" && (
        <div className="relative flex flex-col flex-1 overflow-hidden">
          <div ref={orwScrollContainerRef} className="relative z-10 flex flex-col flex-1 overflow-y-auto">
          {/* Vintage radio cabinet for Old Time Radio */}
          <div ref={orwCabinetSectionRef} className="px-2 pt-3 pb-1 flex-shrink-0 flex flex-col items-center">
            <div className="mb-1 flex items-center gap-2">
              <button
                onClick={() => setOrwCabinetOpen(o => !o)}
                className="text-xs px-3 py-1 rounded-md border border-white/10 hover:bg-white/5 focus:outline-none text-amber-600/80 font-medium tracking-wide"
              >
                {orwCabinetOpen ? "▾ Hide Radio" : "▸ Show Radio"}
              </button>
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  type="button"
                  title="Calibrate hit targets"
                  onClick={() => orwCalibrateFnRef.current?.()}
                  style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)",
                    color: "#e8c67a", fontSize: 11, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >⚙</button>
                {SKINS
                  .filter(s => {
                    if (orwScreenMode === "landscape-mobile") return s.id === "car-gold" || s.id === "car-black";
                    if (orwScreenMode === "portrait-mobile")  return s.id === "mobile-portrait";
                    return s.id !== "car-gold" && s.id !== "car-black" && s.id !== "mobile-portrait";
                  })
                  .map(s => (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={`Switch to ${s.label} skin`}
                      aria-pressed={orwSkinId === s.id}
                      onClick={() => setOrwSkinId(s.id)}
                      title={s.label}
                      style={{
                        width: 20, height: 20, borderRadius: "50%",
                        border: orwSkinId === s.id ? "2px solid #e8c67a" : "2px solid rgba(255,255,255,0.25)",
                        boxShadow: orwSkinId === s.id ? "0 0 5px rgba(232,198,122,0.6)" : "none",
                        backgroundImage: `url(${s.src})`,
                        backgroundSize: "200%", backgroundPosition: "center",
                        cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                    />
                  ))}
              </div>
            </div>
            {orwCabinetOpen && (
              <div style={{ width: "100%", maxWidth: 780 }}>
                <RadioCabinetPhoto
                  currentStation={orwCurrentStation}
                  stations={orwShowsAsStations}
                  powered={orwCabinetPowered}
                  isPlaying={player.isPlaying && !!orwCurrentStation}
                  isLoading={false}
                  error={null}
                  volume={orwCabinetVolume}
                  nowPlayingTitle={(player.isPlaying && !!orwCurrentStation) ? (player.queue[player.currentIndex]?.title ?? undefined) : undefined}
                  favorites={[...favorites.keys()].filter(k => k.startsWith("oldradioworld:")).map(k => k.slice("oldradioworld:".length))}
                  presets={orwPresets}
                  activePreset={orwActivePreset}
                  isAdmin={user?.isAdmin ?? false}
                  skinId={orwSkinId}
                  onSkinChange={setOrwSkinId}
                  calibrateFnRef={orwCalibrateFnRef}
                  storeStation={selectedShow
                    ? { id: selectedShow.url, name: selectedShow.title, country: "Old Time Radio",
                        countryCode: "US", genre: "Classic Radio", bitrate: 0, url: selectedShow.url }
                    : null}
                  onPower={() => {
                    setOrwCabinetPowered(p => !p);
                    if (player.isPlaying) player.togglePlay();
                  }}
                  onPlayPause={() => player.togglePlay()}
                  onSelectStation={(cs) => {
                    // Tune selects a show — open its preview panel
                    const show = filteredShows.find(s => s.url === cs.url || s.url === cs.id);
                    if (show) void handleSelectShow(show);
                    setOrwActivePreset(null);
                  }}
                  onPrev={() => player.prev()}
                  onNext={() => player.next()}
                  onVolumeChange={(v) => { setOrwCabinetVolume(v); player.setVolume(v / 100); }}
                  onToggleFavorite={(id) => {
                    const show = filteredShows.find(s => s.url === id);
                    if (show) void toggleFavorite("oldradioworld", show.url, { title: show.title, url: show.url });
                  }}
                  onSetPreset={(i, cs) => {
                    setOrwPresets(prev => {
                      const next = prev.map((x, j) => j === i ? cs : x) as (CabinetStation | null)[];
                      try { localStorage.setItem("urlinc-orw-presets-v1", JSON.stringify(next)); } catch {}
                      return next;
                    });
                    setOrwActivePreset(i);
                  }}
                  onRecallPreset={(i) => {
                    const p = orwPresets[i];
                    if (!p) return;
                    setOrwActivePreset(i);
                    const show = filteredShows.find(s => s.url === p.url || s.url === p.id);
                    if (show) void handleOrwPresetRecall(show);
                  }}
                  onSliders={() => { window.open(`https://www.amazon.com/music${user?.affiliateExcluded ? "" : "?tag=urlinctm-20"}`, "_blank"); }}
                  onDisplayClick={() => {
                    if (!orwCurrentStation) return;
                    const el = orwScrollContainerRef.current?.querySelector(`[data-show-url="${orwCurrentStation.url}"]`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                />
              </div>
            )}
          </div>

          {/* Preview panel — full width, above the list */}
          {selectedShow && (
            <div ref={orwPreviewPanelRef} className="border-b border-border/50 bg-black/30 backdrop-blur-sm px-4 py-3 flex-shrink-0">
              <div className="flex flex-col gap-2 max-w-3xl mx-auto">
                {/* Header row: title + close */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {orwPreview.isPending ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="font-medium text-sm text-foreground">{selectedShow.title}</span>
                        <span className="opacity-60">Loading episodes…</span>
                      </div>
                    ) : previewError ? (
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs">{previewError}</p>
                        <Button variant="outline" size="sm" onClick={handleRetry} className="ml-auto">Retry</Button>
                      </div>
                    ) : preview ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <h2 className="font-semibold text-sm leading-tight">{preview.showTitle}</h2>
                        <span className="flex items-center gap-1 text-xs text-primary font-medium">
                          <ListMusic className="w-3 h-3" />
                          {totalEpisodes && totalEpisodes > preview.episodes.length
                            ? `${preview.episodes.length} of ${totalEpisodes} loaded`
                            : `${preview.episodes.length} episode${preview.episodes.length !== 1 ? "s" : ""}`}
                        </span>
                        {isImported && (
                          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-3 h-3" /> Already imported
                          </span>
                        )}
                      </div>
                    ) : null}
                    {preview?.description && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1 mt-0.5">
                        {preview.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => { setSelectedShow(null); setPreview(null); setPreviewError(null); }}
                    className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 text-base leading-none"
                    title="Close"
                  >✕</button>
                </div>
                {/* Episodes preview row */}
                {preview && !orwPreview.isPending && preview.episodes.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto scrollbar-none pb-0.5">
                    {preview.episodes.slice(0, 6).map((ep, i) => (
                      <div key={i} className="shrink-0 text-xs text-muted-foreground flex items-center gap-1">
                        <span className="opacity-40">{i + 1}.</span>
                        <span className="max-w-[140px] truncate">{ep.title}</span>
                      </div>
                    ))}
                    {preview.episodes.length > 6 && (
                      <span className="shrink-0 text-[11px] text-muted-foreground/40">+{preview.episodes.length - 6} more</span>
                    )}
                  </div>
                )}
                {/* Import row */}
                {preview && !orwPreview.isPending && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={playlistName}
                      onChange={(e) => setPlaylistName(e.target.value)}
                      placeholder="Playlist name"
                      className="text-sm h-7 flex-1 max-w-xs"
                    />
                    <Button
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => void handleImport()}
                      disabled={orwConfirm.isPending || !playlistName.trim() || loadingMore}
                    >
                      {orwConfirm.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Import {preview.episodes.length}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Show list — full width */}
          <div className="pb-24">
            {orwLoading && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">Loading show catalog from Old Radio World…</p>
              </div>
            )}

            {orwError && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <AlertCircle className="w-6 h-6 text-destructive" />
                <p className="text-sm">Could not load the show catalog. Try again later.</p>
              </div>
            )}

            {!orwLoading && !orwError && filteredShows.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
                <Radio className="w-8 h-8 opacity-30" />
                <p className="text-sm">No shows found{search ? ` matching "${search}"` : ""}.</p>
              </div>
            )}

            {displayedShows.length > 0 && (() => {
              const favShowUrls = new Set([...favorites.keys()].filter(k => k.startsWith("oldradioworld:")).map(k => k.slice("oldradioworld:".length)));
              const favShows = displayedShows.filter(s => favShowUrls.has(s.url));
              const nonFavShows = displayedShows.filter(s => !favShowUrls.has(s.url));
              return (
                <div className="divide-y divide-border/50">
                  {favShows.length > 0 && (
                    <DndContext sensors={orwSensors} collisionDetection={closestCenter} onDragEnd={(e) => { handleOrwFavDragEnd(e); const blockClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', blockClick, { capture: true }), 200); }}>
                      <SortableContext items={favShows.map(s => s.url)} strategy={verticalListSortingStrategy}>
                        {favShows.map((show) => (
                          <SortableShowRow
                            key={show.url}
                            show={show}
                            imported={importedSourceUrls.has(show.url) || importedTitles.has(show.title.toLowerCase())}
                            active={selectedShow?.url === show.url}
                            isFav={true}
                            onSelect={() => void handleSelectShow(show)}
                            onToggleFavorite={() => void toggleFavorite("oldradioworld", show.url, { title: show.title, url: show.url })}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                  {nonFavShows.map((show) => {
                    const imported = importedSourceUrls.has(show.url) || importedTitles.has(show.title.toLowerCase());
                    const active = selectedShow?.url === show.url;
                    return (
                      <button
                        key={show.url}
                        onClick={() => void handleSelectShow(show)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group ${
                          active ? "bg-primary/10 text-primary" : "hover:bg-accent/40 text-foreground"
                        }`}
                      >
                        {imported ? (
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-green-500"}`} />
                        ) : (
                          <Radio className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        )}
                        <span className="flex-1 text-sm font-medium truncate">{show.title}</span>
                        {imported && <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 shrink-0">Imported</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); void toggleFavorite("oldradioworld", show.url, { title: show.title, url: show.url }); }}
                          className="shrink-0 p-1 rounded transition-colors hover:bg-white/10 text-muted-foreground/30 opacity-0 group-hover:opacity-100"
                          title="Add to favorites"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${active ? "rotate-90 text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground"}`} />
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {!orwLoading && orwCatalog && (
              <p className="text-center text-xs text-muted-foreground/50 py-4">
                {filteredShows.length} show{filteredShows.length !== 1 ? "s" : ""}
                {search ? ` matching "${search}"` : " in catalog"}
                {" · "}Old Radio World
              </p>
            )}
          </div>{/* end show list */}
          </div>{/* end inner scroll */}
        </div>
      )}
    </div>
  );
}
