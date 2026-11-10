import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useListMusicDirectories, useCreateMusicDirectory, useCreateMusic, getGetMusicCountQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Music2, FolderPlus, ArrowLeft, Link2, Radio, PenLine,
  Loader2, Search, Sparkles, Tv as Youtube, Check, ExternalLink,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Tab = "link" | "radio" | "manual";

interface ArchiveTrack {
  name: string;
  title: string;
  format: string;
  durationSeconds: number | null;
  url: string;
}

interface FetchedMeta {
  title: string | null;
  artist: string | null;
  coverUrl: string | null;
  durationSeconds: number | null;
  directUrl?: string | null;
  preselectedTitle?: string | null;
  tracks?: ArchiveTrack[];
  source: string;
}

interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  logo: string | null;
  genre: string | null;
  country: string | null;
  bitrate: number | null;
}

const SOURCE_LABELS: Record<string, string> = {
  soundcloud: "SoundCloud",
  mixcloud: "Mixcloud",
  bandcamp: "Bandcamp",
  youtube: "YouTube",
  archive: "Archive.org",
  freemusicarchive: "Free Music Archive",
  jamendo: "Jamendo",
};

const SOURCE_COLORS: Record<string, string> = {
  soundcloud: "text-orange-500",
  mixcloud: "text-blue-500",
  bandcamp: "text-teal-500",
  youtube: "text-red-500",
  archive: "text-sky-500",
  freemusicarchive: "text-green-500",
  jamendo: "text-purple-500",
};

const STREAMING_SERVICES = [
  { name: "YouTube Music", url: "https://music.youtube.com", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", ring: "hover:ring-red-400/40" },
  { name: "SoundCloud",    url: "https://soundcloud.com",    dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", ring: "hover:ring-orange-400/40" },
  { name: "Mixcloud",      url: "https://www.mixcloud.com",  dot: "bg-blue-500",  text: "text-blue-600 dark:text-blue-400", ring: "hover:ring-blue-400/40" },
  { name: "Bandcamp",      url: "https://bandcamp.com",      dot: "bg-teal-500",  text: "text-teal-600 dark:text-teal-400", ring: "hover:ring-teal-400/40" },
  { name: "Spotify",       url: "https://open.spotify.com",  dot: "bg-green-500", text: "text-green-600 dark:text-green-400", ring: "hover:ring-green-400/40" },
  { name: "Radio Browser", url: "https://www.radio-browser.info", dot: "bg-purple-500", text: "text-purple-600 dark:text-purple-400", ring: "hover:ring-purple-400/40" },
];

// Sources with direct audio URLs — Fetch Info works for these
const DIRECT_SOURCES = [
  { name: "Archive.org",        url: "https://archive.org/details/audio", dot: "bg-sky-500",    text: "text-sky-600 dark:text-sky-400",    ring: "hover:ring-sky-400/40" },
  { name: "Free Music Archive", url: "https://freemusicarchive.org",       dot: "bg-green-600",  text: "text-green-700 dark:text-green-400", ring: "hover:ring-green-400/40" },
  { name: "Jamendo",            url: "https://www.jamendo.com",            dot: "bg-purple-500", text: "text-purple-600 dark:text-purple-400", ring: "hover:ring-purple-400/40" },
];

function detectSource(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "soundcloud.com") return "soundcloud";
    if (host === "mixcloud.com") return "mixcloud";
    if (host.endsWith(".bandcamp.com") || host === "bandcamp.com") return "bandcamp";
    if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") return "youtube";
    if (host === "archive.org") return "archive";
    if (host === "freemusicarchive.org") return "freemusicarchive";
    if (host === "jamendo.com") return "jamendo";
  } catch { /* */ }
  return "unknown";
}

export default function AddMusicPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("link");

  // shared form state
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [selectedDirId, setSelectedDirId] = useState<string>("none");
  const [newDirName, setNewDirName] = useState("");
  const [showNewDir, setShowNewDir] = useState(false);
  const [saving, setSaving] = useState(false);

  // link tab
  const [linkUrl, setLinkUrl] = useState("");
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [fetchedMeta, setFetchedMeta] = useState<FetchedMeta | null>(null);
  const [selectedArchiveTracks, setSelectedArchiveTracks] = useState<Set<string>>(new Set());
  const [importingBatch, setImportingBatch] = useState(false);
  const detectedSource = linkUrl ? detectSource(linkUrl) : "unknown";

  // Computed values for the archive track picker
  const archiveTrackList = fetchedMeta?.tracks ?? [];
  const allArchiveSelected = archiveTrackList.length > 0 && archiveTrackList.every((t) => selectedArchiveTracks.has(t.url));
  const someArchiveSelected = selectedArchiveTracks.size > 0 && !allArchiveSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someArchiveSelected;
  }, [someArchiveSelected]);

  // radio tab
  const [radioQuery, setRadioQuery] = useState("");
  const [radioResults, setRadioResults] = useState<RadioStation[]>([]);
  const [searchingRadio, setSearchingRadio] = useState(false);
  const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
  const radioSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();
  const { data: dirs, refetch: refetchDirs } = useListMusicDirectories();
  const createDir = useCreateMusicDirectory();
  const createMusic = useCreateMusic();

  const handleFetchMeta = async () => {
    if (!linkUrl.trim()) return;
    setFetchingMeta(true);
    setFetchedMeta(null);
    setSelectedArchiveTracks(new Set());
    try {
      const res = await fetch("/api/music/fetch-meta", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: "Fetch failed", description: err.error ?? "Could not retrieve metadata.", variant: "destructive" });
        return;
      }
      const meta = await res.json() as FetchedMeta;
      setFetchedMeta(meta);
      if (meta.title) setTitle(meta.preselectedTitle ?? meta.title);
      if (meta.artist) setArtist(meta.artist);
      if (meta.coverUrl) setCoverImageUrl(meta.coverUrl);
      if (meta.durationSeconds) setDurationSeconds(String(meta.durationSeconds));
      // Use the direct playable URL when available (e.g. archive.org MP3), otherwise the page URL
      setAudioUrl(meta.directUrl ?? linkUrl.trim());
      // Pre-select the archive track if one was identified
      if (meta.directUrl && meta.tracks?.length) {
        const pre = meta.tracks.find((t) => t.url === meta.directUrl);
        if (pre) setSelectedArchiveTracks(new Set([pre.url]));
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setFetchingMeta(false);
    }
  };

  const handleToggleArchiveTrack = (track: ArchiveTrack) => {
    setSelectedArchiveTracks((prev) => {
      const next = new Set(prev);
      if (next.has(track.url)) {
        next.delete(track.url);
      } else {
        next.add(track.url);
        // Populate form fields when first (or only) track is selected
        if (next.size === 1) {
          setAudioUrl(track.url);
          setTitle(track.title);
          if (track.durationSeconds) setDurationSeconds(String(track.durationSeconds));
        }
      }
      return next;
    });
  };

  const handleToggleAllArchiveTracks = () => {
    if (allArchiveSelected) {
      setSelectedArchiveTracks(new Set());
    } else {
      setSelectedArchiveTracks(new Set(archiveTrackList.map((t) => t.url)));
    }
  };

  const handleImportSelectedTracks = async () => {
    const toImport = archiveTrackList.filter((t) => selectedArchiveTracks.has(t.url));
    if (toImport.length === 0) return;
    setImportingBatch(true);
    let added = 0;
    try {
      const dirId = selectedDirId !== "none" ? parseInt(selectedDirId, 10) : undefined;
      for (const track of toImport) {
        await createMusic.mutateAsync({
          data: {
            title: track.title,
            artist: artist.trim() || undefined,
            audioUrl: track.url,
            coverImageUrl: coverImageUrl.trim() || undefined,
            durationSeconds: track.durationSeconds ?? undefined,
            directoryId: dirId,
          },
        });
        added++;
      }
      void queryClient.invalidateQueries({ queryKey: getGetMusicCountQueryKey() });
      toast({ title: `Added ${added} track${added !== 1 ? "s" : ""}!` });
      setLocation("/music");
    } catch {
      toast({ title: `Added ${added} of ${toImport.length} tracks`, description: "Some tracks could not be added.", variant: "destructive" });
    } finally {
      setImportingBatch(false);
    }
  };

  const handleRadioSearch = async (q: string) => {
    if (!q.trim()) { setRadioResults([]); return; }
    setSearchingRadio(true);
    try {
      const res = await fetch(`/api/music/radio-search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const data = await res.json() as { stations: RadioStation[] };
      setRadioResults(data.stations ?? []);
    } catch {
      setRadioResults([]);
    } finally {
      setSearchingRadio(false);
    }
  };

  const onRadioQueryChange = (q: string) => {
    setRadioQuery(q);
    if (radioSearchRef.current) clearTimeout(radioSearchRef.current);
    radioSearchRef.current = setTimeout(() => { void handleRadioSearch(q); }, 400);
  };

  const selectStation = (s: RadioStation) => {
    setSelectedStation(s);
    setTitle(s.name);
    setArtist(s.genre ?? "");
    setAudioUrl(s.streamUrl);
    setCoverImageUrl(s.logo ?? "");
    setDurationSeconds("");
  };

  const handleCreateDir = async () => {
    if (!newDirName.trim()) return;
    try {
      const dir = await createDir.mutateAsync({ data: { name: newDirName.trim() } });
      setNewDirName("");
      setShowNewDir(false);
      void refetchDirs();
      setSelectedDirId(String(dir.id));
      toast({ title: `Folder "${dir.name}" created` });
    } catch {
      toast({ title: "Failed to create folder", variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !audioUrl.trim()) {
      toast({ title: "Title and stream URL are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const dirId = selectedDirId !== "none" ? parseInt(selectedDirId, 10) : undefined;
      const dur = durationSeconds.trim() ? parseInt(durationSeconds, 10) : undefined;
      await createMusic.mutateAsync({
        data: {
          title: title.trim(),
          artist: artist.trim() || undefined,
          audioUrl: audioUrl.trim(),
          coverImageUrl: coverImageUrl.trim() || undefined,
          durationSeconds: dur,
          directoryId: dirId,
        },
      });
      void queryClient.invalidateQueries({ queryKey: getGetMusicCountQueryKey() });
      toast({ title: "Track added!" });
      setLocation("/music");
    } catch {
      toast({ title: "Failed to add track", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "link", label: "Paste Link", icon: Link2 },
    { id: "radio", label: "Radio Station", icon: Radio },
    { id: "manual", label: "Manual", icon: PenLine },
  ];

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={() => setLocation("/music")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Music2 className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Add Track</h1>
        </div>

        {/* Source launchers */}
        <div className="mb-5 p-3 bg-muted/40 border border-border rounded-xl space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Streaming (paste URL to save)
            </p>
            <div className="flex flex-wrap gap-2">
              {STREAMING_SERVICES.map((svc) => (
                <a
                  key={svc.name}
                  href={svc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs font-medium transition-all hover:shadow-sm hover:ring-2 ring-transparent ${svc.ring} ${svc.text}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${svc.dot}`} />
                  {svc.name}
                  <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Direct MP3 (paste URL → Fetch Info auto-fills)
            </p>
            <div className="flex flex-wrap gap-2">
              {DIRECT_SOURCES.map((svc) => (
                <a
                  key={svc.name}
                  href={svc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs font-medium transition-all hover:shadow-sm hover:ring-2 ring-transparent ${svc.ring} ${svc.text}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${svc.dot}`} />
                  {svc.name}
                  <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Paste Link tab */}
        {tab === "link" && (
          <div className="mb-6 space-y-3">
            <div>
              <Label className="mb-1.5 block">Paste a streaming link</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={linkUrl}
                    onChange={(e) => { setLinkUrl(e.target.value); setAudioUrl(e.target.value); setFetchedMeta(null); setSelectedArchiveTracks(new Set()); }}
                    placeholder="https://soundcloud.com/artist/track"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleFetchMeta(); } }}
                  />
                  {detectedSource !== "unknown" && (
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold ${SOURCE_COLORS[detectedSource] ?? ""}`}>
                      {SOURCE_LABELS[detectedSource]}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={() => void handleFetchMeta()}
                  disabled={fetchingMeta || !linkUrl.trim() || detectedSource === "unknown"}
                  className="gap-1.5 shrink-0"
                >
                  {fetchingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Fetch Info
                </Button>
              </div>
              {detectedSource === "unknown" && linkUrl.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  URL not recognized — supported: YouTube, SoundCloud, Mixcloud, Bandcamp, Archive.org, Free Music Archive, Jamendo.
                </p>
              )}
              {detectedSource === "archive" && (
                <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">
                  Archive.org — paste any page URL and we'll find the audio automatically.
                </p>
              )}
            </div>

            {fetchedMeta && fetchedMeta.source !== "unknown" && (
              <div className="flex gap-3 p-3 bg-muted/40 border border-border rounded-lg">
                {fetchedMeta.coverUrl && (
                  <img src={fetchedMeta.coverUrl} alt="" className="w-14 h-14 rounded object-cover shrink-0" />
                )}
                {detectedSource === "youtube" && !fetchedMeta.coverUrl && (
                  <div className="w-14 h-14 rounded bg-red-500/10 flex items-center justify-center shrink-0">
                    <Youtube className="w-6 h-6 text-red-500" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{fetchedMeta.title ?? "—"}</p>
                  <p className="text-sm text-muted-foreground truncate">{fetchedMeta.artist ?? ""}</p>
                  {!fetchedMeta.tracks?.length && fetchedMeta.durationSeconds && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Math.floor(fetchedMeta.durationSeconds / 60)}:{String(fetchedMeta.durationSeconds % 60).padStart(2, "0")}
                    </p>
                  )}
                  {(!fetchedMeta.tracks || fetchedMeta.tracks.length <= 1) && (
                    <p className="text-[11px] text-green-600 dark:text-green-400 font-medium mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Fields filled below
                    </p>
                  )}
                  {fetchedMeta.tracks && fetchedMeta.tracks.length > 1 && (
                    <p className="text-[11px] text-sky-600 dark:text-sky-400 font-medium mt-1">
                      {fetchedMeta.tracks.length} tracks found — select one below
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Archive.org track picker */}
            {fetchedMeta?.tracks && fetchedMeta.tracks.length > 1 && (
              <div className="border border-border rounded-lg overflow-hidden">
                {/* Select All header */}
                <label className="flex items-center gap-3 px-3 py-2 bg-muted/60 border-b border-border cursor-pointer hover:bg-muted/80 transition-colors">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allArchiveSelected}
                    onChange={handleToggleAllArchiveTracks}
                    className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-foreground">
                    Select All
                    <span className="text-muted-foreground font-normal ml-1">({fetchedMeta.tracks.length} tracks)</span>
                  </span>
                  {selectedArchiveTracks.size > 0 && (
                    <span className="ml-auto text-[11px] font-medium text-sky-600 dark:text-sky-400">
                      {selectedArchiveTracks.size} selected
                    </span>
                  )}
                </label>

                {/* Track rows */}
                <div className="max-h-52 overflow-y-auto divide-y divide-border/50">
                  {fetchedMeta.tracks.map((track) => {
                    const checked = selectedArchiveTracks.has(track.url);
                    const mins = track.durationSeconds ? Math.floor(track.durationSeconds / 60) : null;
                    const secs = track.durationSeconds ? track.durationSeconds % 60 : null;
                    return (
                      <label
                        key={track.url}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-accent/50 ${checked ? "bg-sky-500/10" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleArchiveTrack(track)}
                          className="w-4 h-4 rounded accent-sky-500 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{track.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {track.format}
                            {mins !== null && secs !== null && ` · ${mins}:${String(secs).padStart(2, "0")}`}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Import selected button */}
                {selectedArchiveTracks.size > 0 && (
                  <div className="px-3 py-2 border-t border-border bg-muted/40">
                    <Button
                      type="button"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => void handleImportSelectedTracks()}
                      disabled={importingBatch}
                    >
                      {importingBatch
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                        : `Import ${selectedArchiveTracks.size} track${selectedArchiveTracks.size !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Radio Station tab */}
        {tab === "radio" && (
          <div className="mb-6 space-y-3">
            <div>
              <Label className="mb-1.5 block">Search internet radio stations</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="e.g. BBC Radio 1, KEXP, Jazz FM…"
                  value={radioQuery}
                  onChange={(e) => onRadioQueryChange(e.target.value)}
                />
                {searchingRadio && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            {radioResults.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {radioResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectStation(s)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border last:border-0 ${
                      selectedStation?.id === s.id ? "bg-primary/5" : ""
                    }`}
                  >
                    {s.logo ? (
                      <img src={s.logo} alt="" className="w-9 h-9 rounded object-cover shrink-0 bg-muted" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-9 h-9 rounded bg-muted flex items-center justify-center shrink-0">
                        <Radio className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[s.genre, s.country, s.bitrate ? `${s.bitrate} kbps` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {selectedStation?.id === s.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {radioQuery.trim() && !searchingRadio && radioResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No stations found for "{radioQuery}"</p>
            )}

            {selectedStation && (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                <Check className="w-3 h-3" /> {selectedStation.name} selected — fields filled below
              </p>
            )}
          </div>
        )}

        {/* Manual tab hint */}
        {tab === "manual" && (
          <p className="text-xs text-muted-foreground mb-4">
            Enter the stream URL directly — a direct link from any service, a radio stream, or any publicly accessible audio URL.
          </p>
        )}

        {/* Shared form fields */}
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track or station name" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="artist">Artist / Genre</Label>
            <Input id="artist" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name or genre" />
          </div>

          <div className={`space-y-1.5 ${tab === "link" ? "hidden" : ""}`}>
            <Label htmlFor="audioUrl">Stream URL *</Label>
            <Input
              id="audioUrl"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              placeholder="https://soundcloud.com/artist/track"
              required
            />
            <p className="text-xs text-muted-foreground">
              Page URL from a supported service, a direct radio stream, or any public audio link.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coverImageUrl">Cover Image URL</Label>
            <Input id="coverImageUrl" value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://example.com/cover.jpg" />
            {coverImageUrl && (
              <img src={coverImageUrl} alt="cover preview" className="w-16 h-16 rounded object-cover mt-1" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="duration">Duration (seconds)</Label>
            <Input id="duration" value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} placeholder="e.g. 214" type="number" min={0} />
          </div>

          <div className="space-y-1.5">
            <Label>Folder</Label>
            <div className="flex gap-2">
              <Select value={selectedDirId} onValueChange={setSelectedDirId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="No folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder</SelectItem>
                  {(dirs ?? []).map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowNewDir((v) => !v)} title="New folder">
                <FolderPlus className="w-4 h-4" />
              </Button>
            </div>
            {showNewDir && (
              <div className="flex gap-2 mt-2">
                <Input
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  placeholder="New folder name"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateDir(); } }}
                  autoFocus
                />
                <Button type="button" variant="secondary" onClick={() => void handleCreateDir()}>Create</Button>
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding…</> : "Add Track"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/music")}>Cancel</Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
