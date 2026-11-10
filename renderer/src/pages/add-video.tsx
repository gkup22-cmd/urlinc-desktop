import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateVideo, useGetVideoStats, getListVideosQueryKey, getGetVideoStatsQueryKey, getGetRecentVideosQueryKey, getGetVideoQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { detectPlatform, getVideoThumbnail, isPlexUrl } from "@/lib/youtube";
import { Loader2, Plus, Tv as Youtube, Video, Sparkles, ListVideo, CheckCircle2, Home, Play, Upload, Clipboard, ChevronDown, Search, X, Film } from "lucide-react";

type TmdbResult = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  overview: string;
  posterUrl: string | null;
  year: string;
};

async function searchTmdb(q: string): Promise<TmdbResult[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q.trim())}`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json() as { results?: TmdbResult[] };
  return data.results ?? [];
}

function extractTitleFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname;

    // Amazon: /Movie-Title/dp/ASIN → "Movie Title"
    if (host.includes("amazon.")) {
      const match = path.match(/^\/([^/]+)\/dp\//);
      if (match?.[1] && match[1].length > 3) {
        return decodeURIComponent(match[1]).replace(/-/g, " ").trim();
      }
    }

    // Generic: last non-numeric, non-short path segment
    const segments = path
      .split("/")
      .map((s) => decodeURIComponent(s).trim())
      .filter((s) => s.length > 3 && !/^\d+$/.test(s) && !/^[A-Z0-9]{8,}$/.test(s));
    const candidate = segments[segments.length - 1];
    if (candidate) {
      const clean = candidate
        .replace(/[-_]/g, " ")
        .replace(/\.(html?|aspx?)$/i, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (clean.length > 3 && clean.length < 80) return clean;
    }
    return null;
  } catch {
    return null;
  }
}

function CategorySelect({
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
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allCategories = [
    ...categories,
    ...localCategories.filter((c) => !categories.includes(c)),
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const confirm = () => {
    const name = draft.trim();
    if (!name) return;
    if (!allCategories.includes(name)) setLocalCategories((prev) => [...prev, name]);
    onChange(name);
    setCreating(false);
    setDraft("");
  };

  const cancel = () => { setCreating(false); setDraft(""); };

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="New category name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); confirm(); }
            if (e.key === "Escape") cancel();
          }}
        />
        <Button type="button" size="sm" onClick={confirm} disabled={!draft.trim()}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className={value && allCategories.includes(value) ? "text-foreground" : "text-muted-foreground"}>
          {value && allCategories.includes(value) ? value : "Select a category…"}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {allCategories.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">No categories yet</p>
            ) : (
              allCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`w-full flex items-center px-3 py-2 text-sm hover:bg-accent transition-colors text-left ${cat === value ? "bg-accent font-medium" : ""}`}
                  onClick={() => { onChange(cat); setOpen(false); }}
                >
                  {cat}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border" />
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left text-primary font-medium"
            onClick={() => { setOpen(false); setCreating(true); }}
          >
            <Plus className="w-4 h-4 shrink-0" />
            Create New Category
          </button>
        </div>
      )}
    </div>
  );
}

const formSchema = z.object({
  youtubeUrl: z.string().url("Must be a valid URL").min(1, "URL is required"),
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

async function fetchPrefill(url: string): Promise<{ title: string; description: string; thumbnailUrl: string }> {
  const res = await fetch(`/api/videos/prefill?url=${encodeURIComponent(url)}`, {
    credentials: "include",
  });
  if (!res.ok) return { title: "", description: "", thumbnailUrl: "" };
  return res.json() as Promise<{ title: string; description: string; thumbnailUrl: string }>;
}

function isSupportedPrefillUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "www.youtube.com" || u.hostname === "youtube.com" || u.hostname === "youtu.be";
  } catch {
    return false;
  }
}

function isDailymotionUrl(url: string): boolean {
  return /dailymotion\.com\/video\/|dai\.ly\//i.test(url);
}

function getPlaylistId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com" || u.hostname === "youtu.be") {
      return u.searchParams.get("list");
    }
    return null;
  } catch {
    return null;
  }
}

async function importPlaylist(url: string, category: string): Promise<{ imported: number; skipped: number }> {
  const res = await fetch("/api/videos/import-playlist", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, category }),
  });
  const data = await res.json() as { imported?: number; skipped?: number; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Import failed");
  return { imported: data.imported ?? 0, skipped: data.skipped ?? 0 };
}

export function AddVideo() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const createVideo = useCreateVideo();
  const { data: stats } = useGetVideoStats();

  // Fetch the user's Plex config so we can auto-assign the category when needed
  const { data: plexConfig } = useQuery<{ connected: boolean; autoPlexCategory?: boolean }>({
    queryKey: ["plex-config"],
    queryFn: () => fetch("/api/integrations/plex", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });
  const plexAutoCategory = plexConfig?.connected && (plexConfig.autoPlexCategory !== false);

  const existingCategories = (() => {
    const pinnedVideoCats: string[] = (() => {
      try { return JSON.parse(localStorage.getItem("vvm_pinned_video_cats") ?? "[]") as string[]; }
      catch { return []; }
    })();
    const cats = stats
      ? [...stats.byCategory].sort((a, b) => a.category.localeCompare(b.category)).map((c) => c.category)
      : [];
    const merged = [...new Set([...cats, ...pinnedVideoCats])].sort();
    // Always include "Plex" in the list when auto-category is on so it appears in the dropdown
    if (plexAutoCategory && !merged.includes("Plex")) merged.push("Plex");
    if (settings.defaultCategoryNewlyAdded && !merged.includes("Newly Added")) {
      return ["Newly Added", ...merged];
    }
    return merged;
  })();
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbPanelOpen, setTmdbPanelOpen] = useState(false);
  const [tmdbSelected, setTmdbSelected] = useState<TmdbResult | null>(null);
  const tmdbSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped?: number; category: string } | null>(null);
  const [singleResult, setSingleResult] = useState<{ id: number; title: string; category: string } | null>(null);
  const [playlistCategory, setPlaylistCategory] = useState(settings.defaultCategoryNewlyAdded ? "Newly Added" : "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      youtubeUrl: "",
      title: "",
      category: settings.defaultCategoryNewlyAdded ? "Newly Added" : "",
      description: "",
      thumbnailUrl: "",
      sourceUrl: "",
    },
  });

  const applyPrefill = (url: string) => {
    if (!isSupportedPrefillUrl(url) || getPlaylistId(url)) return;
    setIsFetchingMeta(true);
    fetchPrefill(url)
      .then(({ title, description, thumbnailUrl }) => {
        if (title && !form.getValues("title")) {
          form.setValue("title", title, { shouldValidate: true });
        }
        if (description && !form.getValues("description")) {
          form.setValue("description", description, { shouldValidate: true });
        }
        if (thumbnailUrl && !form.getValues("thumbnailUrl")) {
          form.setValue("thumbnailUrl", thumbnailUrl, { shouldValidate: true });
        }
        // Auto-assign "Plex" category when the setting is enabled
        if (plexAutoCategory && isPlexUrl(url) && !form.getValues("category")) {
          form.setValue("category", "Plex", { shouldValidate: true });
        }
      })
      .finally(() => setIsFetchingMeta(false));
  };

  const triggerTmdbSearch = useCallback((query: string) => {
    if (!query.trim() || tmdbSelected) return;
    if (tmdbSearchRef.current) clearTimeout(tmdbSearchRef.current);
    tmdbSearchRef.current = setTimeout(async () => {
      setTmdbLoading(true);
      try {
        const results = await searchTmdb(query);
        setTmdbResults(results);
        if (results.length > 0) setTmdbPanelOpen(true);
      } finally {
        setTmdbLoading(false);
      }
    }, 400);
  }, [tmdbSelected]);

  const applyTmdbResult = useCallback((result: TmdbResult) => {
    setTmdbSelected(result);
    setTmdbPanelOpen(false);
    setTmdbResults([]);
    form.setValue("title", result.title, { shouldValidate: true });
    if (result.overview) form.setValue("description", result.overview, { shouldValidate: true });
    if (result.posterUrl) form.setValue("thumbnailUrl", result.posterUrl, { shouldValidate: true });
  }, [form]);

  const clearTmdb = useCallback(() => {
    setTmdbSelected(null);
    setTmdbResults([]);
    setTmdbPanelOpen(false);
    form.setValue("title", "");
    form.setValue("description", "");
    form.setValue("thumbnailUrl", "");
  }, [form]);

  useEffect(() => {
    navigator.clipboard
      .readText()
      .then((text) => {
        const trimmed = text.trim();
        if (isYouTubeUrl(trimmed) && !form.getValues("youtubeUrl")) {
          form.setValue("youtubeUrl", trimmed, { shouldValidate: true });
          if (!getPlaylistId(trimmed)) applyPrefill(trimmed);
        }
      })
      .catch(() => {});
  }, []);

  const watchUrl = form.watch("youtubeUrl");
  const playlistId = getPlaylistId(watchUrl);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (isSupportedPrefillUrl(watchUrl) && !getPlaylistId(watchUrl)) {
        applyPrefill(watchUrl);
        // Auto-search TMDB using title extracted from the URL itself
        const extracted = extractTitleFromUrl(watchUrl);
        if (extracted) triggerTmdbSearch(extracted);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watchUrl, triggerTmdbSearch]);

  const watchThumbnail = form.watch("thumbnailUrl");
  const platform = detectPlatform(watchUrl);
  const previewThumbnail = getVideoThumbnail(watchUrl, watchThumbnail || null);
  const isFacebook = platform === "facebook";
  const isPlex     = platform === "plex";

  const thumbFileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleThumbnailFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      form.setValue("thumbnailUrl", dataUrl, { shouldValidate: true });
    } catch {
      toast({ title: "Failed to read file", variant: "destructive" });
    }
    e.target.value = "";
  }, [readFileAsDataUrl, form, toast]);

  const handleThumbnailPasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const dataUrl = await readFileAsDataUrl(new File([blob], "pasted", { type: imageType }));
          form.setValue("thumbnailUrl", dataUrl, { shouldValidate: true });
          return;
        }
      }
      toast({ title: "No image found in clipboard", variant: "destructive" });
    } catch {
      toast({ title: "Copy an image first, then click Paste", variant: "destructive" });
    }
  }, [readFileAsDataUrl, form, toast]);

  const handleImportPlaylist = async () => {
    setIsImportingPlaylist(true);
    try {
      const result = await importPlaylist(watchUrl, playlistCategory);
      setImportResult({ ...result, category: playlistCategory });
      queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsImportingPlaylist(false);
    }
  };

  const onSubmit = (data: FormValues) => {
    createVideo.mutate(
      { data: { ...data, thumbnailUrl: data.thumbnailUrl || undefined, sourceUrl: data.sourceUrl || undefined } },
      {
        onSuccess: (video) => {
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() });
          const chosenCategory = form.getValues("category");
          form.reset();
          setSingleResult({ id: video.id, title: video.title, category: chosenCategory });
          fetch(`/api/videos/${video.id}/fetch-description`, { method: "POST", credentials: "include" }).then(() => queryClient.invalidateQueries({ queryKey: getGetVideoQueryKey(video.id) }));
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: err instanceof Error ? err.message : "Failed to add video. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold">Add to Library</h1>
        </div>

        {/* URL field — always visible */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm mb-6">
          <Form {...form}>
            <FormField
              control={form.control}
              name="youtubeUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Video or Playlist URL</FormLabel>
                  <FormControl>
                    <div className="relative">
                      {isFacebook ? (
                        <Video className="absolute left-3 top-3 h-4 w-4 text-[#1877F2]" />
                      ) : (
                        <Youtube className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      )}
                      <Input
                        placeholder=""
                        className="pl-9"
                        data-testid="input-video-url"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  {playlistId && (
                    <p className="text-xs text-primary font-medium mt-1 flex items-center gap-1">
                      <ListVideo className="h-3.5 w-3.5" />
                      YouTube playlist detected
                    </p>
                  )}
                  {!playlistId && isFacebook && (
                    <p className="text-xs text-[#1877F2] font-medium mt-1">Facebook Reel / Video detected</p>
                  )}
                  {!playlistId && platform === "youtube" && (
                    <p className="text-xs text-primary font-medium mt-1">YouTube video detected</p>
                  )}
                  {!playlistId && platform === "vimeo" && (
                    <p className="text-xs text-sky-500 font-medium mt-1">Vimeo video detected</p>
                  )}
                  {!playlistId && platform === "dailymotion" && (
                    <p className="text-xs text-blue-500 font-medium mt-1">Dailymotion video detected</p>
                  )}
                  {!playlistId && isPlex && (
                    <p className="text-xs font-medium mt-1" style={{ color: "#E5A00D" }}>
                      Plex URL detected — fetching metadata from your server…
                      {!form.getValues("title") && " (check server console for details)"}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">Supported platforms — paste a URL from any of these</p>
            <div className="flex flex-wrap gap-2">
              {([
                { name: "YouTube", href: "https://www.youtube.com", className: "text-red-500" },
                { name: "Vimeo", href: "https://vimeo.com/explore", className: "text-sky-500" },
                { name: "Dailymotion", href: "https://www.dailymotion.com", className: "text-blue-500" },
                { name: "Facebook", href: "https://www.facebook.com/watch", className: "text-[#1877F2]" },
              ] as const).map(({ name, href, className }) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs font-medium px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70 transition-colors ${className}`}
                >
                  {name}
                </a>
              ))}
              <a
                href="https://www.pbs.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70 transition-colors text-sky-600 dark:text-sky-400"
              >
                PBS
              </a>
              {/* Plex — opens local server so user can copy a URL */}
              <a
                href="http://127.0.0.1:32400/web"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70 transition-colors"
                style={{ color: "#E5A00D" }}
              >
                Plex
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">
              <span style={{ color: "#E5A00D" }} className="font-medium">Plex tip:</span>{" "}
              For best results, copy the URL from your Plex server's address bar
              (e.g. <code className="text-[10px] bg-muted px-1 py-0.5 rounded">127.0.0.1:32400/web</code> or{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">app.plex.tv/web</code>)
              while viewing a specific movie or show, not from a TV app.
            </p>
          </div>
        </div>

        {/* Playlist import panel */}
        {playlistId && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {importResult ? (
              <div className="bg-card rounded-xl border border-border shadow-sm p-8 flex flex-col items-center gap-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold mb-1">
                    {importResult.imported} video{importResult.imported !== 1 ? "s" : ""} imported!
                  </h2>
                  {importResult.imported > 0 && (
                    <p className="text-muted-foreground text-sm max-w-sm">
                      Added to <span className="font-medium text-foreground">{importResult.category}</span> with titles, descriptions, and thumbnails.
                    </p>
                  )}
                  {(importResult.skipped ?? 0) > 0 && (
                    <p className="text-muted-foreground text-sm max-w-sm mt-1">
                      {importResult.skipped} video{importResult.skipped !== 1 ? "s were" : " was"} already in your library and {importResult.skipped !== 1 ? "were" : "was"} skipped.
                    </p>
                  )}
                </div>
                <div className="flex gap-3 mt-2 flex-wrap justify-center">
                  <Button onClick={() => setLocation(`/?category=${encodeURIComponent(importResult.category)}`)} size="lg">
                    <Play className="mr-2 h-4 w-4" />
                    Go to {importResult.category}
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => setLocation("/")}>
                    <Home className="mr-2 h-4 w-4" />
                    Library
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setImportResult(null);
                      form.setValue("youtubeUrl", "");
                      form.reset();
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Import Another
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-primary/30 shadow-sm p-6 flex flex-col gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                    <ListVideo className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1">Import Playlist</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      All videos will be imported with their title, description, and thumbnail. Choose a category below.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 opacity-70">
                      Playlist ID: <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">{playlistId}</code>
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Category</p>
                  <CategorySelect
                    value={playlistCategory}
                    onChange={setPlaylistCategory}
                    categories={existingCategories}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    size="lg"
                    onClick={handleImportPlaylist}
                    disabled={isImportingPlaylist || !playlistCategory.trim()}
                    className="min-w-40"
                  >
                    {isImportingPlaylist ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing…
                      </>
                    ) : (
                      <>
                        <ListVideo className="mr-2 h-4 w-4" />
                        Import Playlist
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Single-video success panel */}
        {singleResult && !playlistId && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-card rounded-xl border border-border shadow-sm p-8 flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <div>
                <h2 className="text-xl font-semibold mb-1">Video added!</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  <span className="font-medium text-foreground">"{singleResult.title}"</span> has been added to the <span className="font-medium text-foreground">{singleResult.category}</span> category.
                </p>
              </div>
              <div className="flex gap-3 mt-2 flex-wrap justify-center">
                <Button onClick={() => setLocation(`/video/${singleResult.id}`)} size="lg">
                  <Play className="mr-2 h-4 w-4" />
                  View Video
                </Button>
                <Button variant="outline" size="lg" onClick={() => setLocation(`/?category=${encodeURIComponent(singleResult.category)}`)}>
                  <Home className="mr-2 h-4 w-4" />
                  Go to {singleResult.category}
                </Button>
                <Button variant="outline" size="lg" onClick={() => setSingleResult(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Import Another
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TMDB results panel */}
        {!playlistId && !singleResult && tmdbPanelOpen && tmdbResults.length > 0 && (
          <div className="bg-card rounded-xl border border-primary/20 shadow-sm mb-6 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Film className="h-4 w-4 text-primary" />
                TMDB Suggestions
                {tmdbLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <button
                type="button"
                onClick={() => setTmdbPanelOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="divide-y divide-border/40">
              {tmdbResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => applyTmdbResult(result)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                >
                  {result.posterUrl ? (
                    <img
                      src={result.posterUrl}
                      alt={result.title}
                      className="w-10 h-14 object-cover rounded shrink-0 border border-border/50"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-10 h-14 rounded bg-muted flex items-center justify-center shrink-0">
                      <Film className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {result.title}
                      {result.year && <span className="text-muted-foreground font-normal ml-1">({result.year})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{result.mediaType === "tv" ? "TV Series" : "Movie"}</p>
                    {result.overview && (
                      <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">{result.overview}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TMDB selected indicator */}
        {!playlistId && !singleResult && tmdbSelected && (
          <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm truncate">
                <span className="text-muted-foreground">TMDB: </span>
                <span className="font-medium">{tmdbSelected.title}</span>
                {tmdbSelected.year && <span className="text-muted-foreground"> ({tmdbSelected.year})</span>}
              </span>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={clearTmdb} className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground h-7 px-2">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        )}

        {/* Single-video form — hidden when playlist mode active or after success */}
        {!playlistId && !singleResult && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
            <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            Title
                            {isFetchingMeta && (
                              <span className="inline-flex items-center gap-1 text-xs text-primary font-normal">
                                <Sparkles className="h-3 w-3 animate-pulse" />
                                Fetching…
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input placeholder="" data-testid="input-title" {...field} />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0 gap-1.5 px-3"
                                disabled={tmdbLoading || !field.value.trim()}
                                onClick={() => triggerTmdbSearch(field.value)}
                                title="Search TMDB for this title"
                              >
                                {tmdbLoading
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Search className="h-3.5 w-3.5" />
                                }
                                <span className="hidden sm:inline">TMDB</span>
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <CategorySelect
                              value={field.value}
                              onChange={field.onChange}
                              categories={existingCategories}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="thumbnailUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Thumbnail URL
                          {isFacebook && <span className="ml-1 text-xs text-amber-500 font-normal">(recommended for Facebook videos)</span>}
                          {!isFacebook && <span className="ml-1 text-xs text-muted-foreground font-normal">(optional — auto-set for YouTube)</span>}
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Input
                              placeholder=""
                              data-testid="input-thumbnail-url"
                              {...field}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => thumbFileInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent"
                              >
                                <Upload className="h-3.5 w-3.5" />
                                Upload file
                              </button>
                              <button
                                type="button"
                                onClick={handleThumbnailPasteFromClipboard}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent"
                              >
                                <Clipboard className="h-3.5 w-3.5" />
                                Paste image
                              </button>
                            </div>
                            <input
                              ref={thumbFileInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleThumbnailFileChange}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sourceUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source URL <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="" data-testid="input-source-url" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder=""
                            className="resize-none h-32"
                            data-testid="textarea-description"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createVideo.isPending} size="lg" className="w-full sm:w-auto" data-testid="button-add-video">
                      {createVideo.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Add to Library
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Preview</h3>
              <div className="aspect-video rounded-xl bg-muted border border-border/50 overflow-hidden relative shadow-inner">
                {previewThumbnail ? (
                  <img
                    src={previewThumbnail}
                    alt="Thumbnail preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : tmdbSelected?.posterUrl ? (
                  <img
                    src={tmdbSelected.posterUrl}
                    alt={tmdbSelected.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : isFacebook ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Video className="w-8 h-8 text-[#1877F2] opacity-60" />
                    <span className="text-xs font-medium text-center px-4 leading-relaxed">
                      Facebook video<br />
                      <span className="opacity-60">Add a thumbnail URL above to preview</span>
                    </span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Youtube className="w-8 h-8 opacity-20" />
                    <span className="text-xs font-medium">No video selected</span>
                  </div>
                )}
              </div>

              {form.watch("title") && (
                <div className="p-4 bg-card rounded-lg border border-border/50">
                  <h4 className="font-medium leading-tight mb-1">{form.watch("title")}</h4>
                  {form.watch("category") && (
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-foreground mt-2">
                      {form.watch("category")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}

export default AddVideo;
