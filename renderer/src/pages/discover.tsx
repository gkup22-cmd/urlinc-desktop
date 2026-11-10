import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useLocation } from "wouter";
import { Search, Globe, Film, Headphones, ShoppingBag, ExternalLink, Bookmark, BookmarkCheck, Loader2, Sparkles, Clock, Users, FolderOpen, ChevronRight, UserPlus, Check, Telescope, X, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";

interface DiscoverResult {
  title: string;
  url: string;
  description: string;
  type: "website" | "video" | "music" | "product";
  source: string;
}

interface DiscoverResponse {
  summary: string;
  results: DiscoverResult[];
  cached?: boolean;
}

const TYPE_CONFIG = {
  video:   { label: "Videos",   Icon: Film,        color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20"   },
  music:   { label: "Music",    Icon: Headphones,  color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  product: { label: "Products", Icon: ShoppingBag, color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20"  },
  website: { label: "Websites", Icon: Globe,       color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20"   },
};

const TYPE_ORDER: DiscoverResult["type"][] = ["video", "music", "product", "website"];

function ytThumb(url: string): string | null {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("v") ||
      (u.hostname === "youtu.be" ? u.pathname.slice(1) : null);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  } catch { return null; }
}

function ResultCard({
  result, saved, onSave,
}: {
  result: DiscoverResult; saved: boolean; onSave: () => void;
}) {
  const cfg = TYPE_CONFIG[result.type] ?? TYPE_CONFIG.website;
  const thumb = result.type === "video" ? ytThumb(result.url) : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition-colors">
      {thumb && (
        <div className="aspect-video bg-black shrink-0 overflow-hidden">
          <img src={thumb} alt={result.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug line-clamp-2 flex-1">{result.title}</p>
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {result.source}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{result.description}</p>
        <div className="mt-auto flex gap-1.5 pt-1">
          <a
            href={result.url} target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Open
          </a>
          <button
            onClick={onSave} disabled={saved}
            className={`flex-1 flex items-center gap-1.5 justify-center text-xs px-2 py-1.5 rounded-lg border transition-colors ${
              saved
                ? "bg-primary/20 text-primary border-primary/30 cursor-default"
                : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
            }`}
          >
            {saved ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SavedCollection {
  id: number;
  query: string;
  slug: string;
  summary: string;
  createdAt: string;
  itemCount: number;
}

interface FriendSuggestion {
  userId: string;
  displayName: string;
  sharedCount: number;
  sharedTopics: string[];
  friendStatus: "pending" | "accepted" | null;
}

const RECENT_KEY = "urlinc_discover_recent";
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(q: string) {
  try {
    const prev = loadRecent().filter(x => x !== q);
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, 8)));
  } catch { /* ignore */ }
}
function deleteRecent(q: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(loadRecent().filter(x => x !== q)));
  } catch { /* ignore */ }
}

function CollectionRow({
  collection,
  onDeleted,
  onRenamed,
}: {
  collection: SavedCollection;
  onDeleted: (id: number) => void;
  onRenamed: (id: number, newQuery: string) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(collection.query);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function handleRename() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === collection.query) { setEditing(false); setEditValue(collection.query); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/discover/collections/${collection.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (res.ok) { onRenamed(collection.id, trimmed); setEditing(false); toast({ title: "Renamed" }); }
      else { toast({ title: "Rename failed", variant: "destructive" }); }
    } catch { toast({ title: "Rename failed", variant: "destructive" }); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/discover/collections/${collection.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { onDeleted(collection.id); toast({ title: "Collection deleted" }); }
      else { toast({ title: "Delete failed", variant: "destructive" }); }
    } catch { toast({ title: "Delete failed", variant: "destructive" }); }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-primary/40">
        <Telescope className="w-4 h-4 text-primary shrink-0" />
        <input
          ref={inputRef}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void handleRename(); if (e.key === "Escape") { setEditing(false); setEditValue(collection.query); } }}
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <button onClick={() => void handleRename()} disabled={saving} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </button>
        <button onClick={() => { setEditing(false); setEditValue(collection.query); }} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors group">
      <Telescope className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      <a href={`/discover/topic/${collection.id}`} className="text-sm font-medium flex-1 capitalize truncate group-hover:text-primary transition-colors">
        {collection.query}
      </a>
      <span className="text-xs text-muted-foreground shrink-0">{collection.itemCount} saved</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Rename">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => void handleDelete()} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <a href={`/discover/topic/${collection.id}`} className="shrink-0">
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
      </a>
    </div>
  );
}

export function DiscoverContent({ initialQuery }: { initialQuery?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<string[]>([]);
  const [userCount, setUserCount] = useState<number>(0);
  const [savingAll, setSavingAll] = useState(false);
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRecent(loadRecent()); }, []);

  useEffect(() => {
    fetch("/api/discover/friend-suggestions", { credentials: "include" })
      .then(r => r.json())
      .then((data: FriendSuggestion[]) => setSuggestions(data))
      .catch(() => {});
    fetch("/api/discover/collections", { credentials: "include" })
      .then(r => r.json())
      .then((data: SavedCollection[]) => setCollections(data))
      .catch(() => {});
  }, []);

  // Auto-search if initialQuery provided
  useEffect(() => {
    if (initialQuery?.trim()) search(initialQuery.trim());
  }, [initialQuery]);

  async function fetchUserCount(q: string) {
    try {
      const res = await fetch(`/api/discover/topic-count?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const data = await res.json() as { count: number };
      setUserCount(data.count ?? 0);
    } catch { setUserCount(0); }
  }

  async function search(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSaved(new Set());
    setCollectionId(null);
    setUserCount(0);
    fetchUserCount(trimmed);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      let json: (DiscoverResponse & { error?: string }) | null = null;
      try { json = await res.json() as DiscoverResponse & { error?: string }; } catch { /* non-JSON */ }
      if (!res.ok) { setError(json?.error ?? `Search failed (${res.status})`); return; }
      if (!json) { setError("Search failed (empty response)"); return; }
      setData(json);
      saveRecent(trimmed);
      setRecent(loadRecent());
    } catch {
      setError("Could not reach the search service.");
    } finally {
      setLoading(false);
    }
  }

  async function saveResult(result: DiscoverResult) {
    const key = result.url;
    if (saved.has(key)) return;
    try {
      const stationId = result.url.replace(/[^a-zA-Z0-9]/g, "_").slice(-100);
      const res = await fetch("/api/radio-favorites", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "wish-list",
          stationId,
          stationData: { title: result.title, sourceUrl: result.url, description: result.description, type: result.type },
        }),
      });
      if (res.ok) {
        setSaved(prev => new Set([...prev, key]));
        toast({ title: "Saved to Wish List", description: result.title.slice(0, 60) });
      } else {
        toast({ title: "Save failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  async function connect(userId: string) {
    try {
      const res = await fetch(`/api/discover/connect/${userId}`, { method: "POST", credentials: "include" });
      if (res.ok || res.status === 400) {
        setConnected(prev => new Set([...prev, userId]));
        toast({ title: "Friend request sent!" });
      }
    } catch {
      toast({ title: "Could not send request", variant: "destructive" });
    }
  }

  async function saveAllToCollection(): Promise<number | null> {
    if (!data || !query.trim()) return null;
    setSavingAll(true);
    try {
      const res = await fetch("/api/discover/collections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), summary: data.summary, items: data.results }),
      });
      const json = await res.json() as { id?: number; slug?: string; error?: string };
      if (res.ok && json.id) {
        setCollectionId(json.id);
        setSaved(new Set(data.results.map(r => r.url)));
        toast({ title: "Collection saved!", description: `"${query.trim()}" added to your topic collections.` });
        return json.id;
      } else {
        toast({ title: "Save failed", description: json.error, variant: "destructive" });
        return null;
      }
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
      return null;
    } finally {
      setSavingAll(false);
    }
  }

  async function diveDeeper() {
    if (collectionId) { setLocation(`/discover/topic/${collectionId}`); return; }
    const id = await saveAllToCollection();
    if (id) setLocation(`/discover/topic/${id}`);
  }

  const grouped = data
    ? TYPE_ORDER.reduce<Record<string, DiscoverResult[]>>((acc, t) => {
        const items = data.results.filter(r => r.type === t);
        if (items.length) acc[t] = items;
        return acc;
      }, {})
    : {};

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-medium uppercase tracking-widest">Discover</span>
        </div>
        <h1 className="text-3xl font-bold">Search any interest.</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Type anything you're curious about — carbon fiber, tiny houses, velomobiles — and we'll surface the best resources to explore and save.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={e => { e.preventDefault(); search(query); }} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search any interest — tiny houses, drones, velomobiles…"
            className="w-full pl-9 pr-4 py-3 rounded-xl bg-card border border-border focus:border-primary focus:outline-none text-sm transition-colors"
          />
        </div>
        <button
          type="submit" disabled={loading || !query.trim()}
          className="px-5 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Discover
        </button>
      </form>

      {/* User count nudge */}
      {userCount > 0 && !loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5 text-primary" />
          <span><span className="text-foreground font-medium">{userCount}</span> other URLinc {userCount === 1 ? "user has" : "users have"} explored this topic</span>
        </div>
      )}

      {/* Recent searches */}
      {!data && !loading && recent.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Recent searches
          </p>
          <div className="flex flex-wrap gap-2">
            {recent.map(r => (
              <span key={r} className="group relative flex items-center gap-0 rounded-full bg-muted border border-border overflow-hidden">
                <button
                  onClick={() => { setQuery(r); search(r); }}
                  className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {r}
                </button>
                <button
                  onClick={() => { deleteRecent(r); setRecent(loadRecent()); }}
                  className="text-xs pr-2 pl-0.5 py-1.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Remove "${r}"`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Saved collections (idle state) */}
      {!data && !loading && collections.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FolderOpen className="w-3 h-3" /> My interests
          </p>
          <div className="flex flex-col gap-1.5">
            {collections.map(c => (
              <CollectionRow
                key={c.id}
                collection={c}
                onDeleted={(id) => setCollections(prev => prev.filter(x => x.id !== id))}
                onRenamed={(id, newQuery) => setCollections(prev => prev.map(x => x.id === id ? { ...x, query: newQuery } : x))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Friend suggestions (idle state) */}
      {!data && !loading && suggestions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3 h-3 text-primary" /> People with similar interests
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map(s => {
              const alreadyConnected = connected.has(s.userId) || s.friendStatus === "pending" || s.friendStatus === "accepted";
              return (
                <div key={s.userId} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{s.displayName[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.sharedTopics.slice(0, 2).join(", ")}
                      {s.sharedCount > 2 ? ` +${s.sharedCount - 2} more` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => !alreadyConnected && connect(s.userId)}
                    disabled={alreadyConnected}
                    className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      alreadyConnected
                        ? "bg-primary/10 text-primary border-primary/20 cursor-default"
                        : "bg-muted/50 hover:bg-primary/10 text-muted-foreground hover:text-primary border-border hover:border-primary/30"
                    }`}
                  >
                    {alreadyConnected
                      ? <><Check className="w-3 h-3" /> {s.friendStatus === "accepted" ? "Friends" : "Requested"}</>
                      : <><UserPlus className="w-3 h-3" /> Connect</>
                    }
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">Searching the web…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-8">
          {/* Summary + actions */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">About this topic</p>
              <p className="text-sm leading-relaxed">{data.summary}</p>
              <p className="text-xs text-muted-foreground pt-1">
                {data.results.length} resource{data.results.length !== 1 ? "s" : ""} found
                {data.cached ? " · cached result" : ""}
              </p>
            </div>

            {/* Save all / Dive deeper */}
            <div className="flex flex-wrap gap-2 pt-1">
              {collectionId ? (
                <button
                  disabled
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground border border-border cursor-default"
                >
                  <Check className="w-3.5 h-3.5" /> Collection saved
                </button>
              ) : (
                <button
                  onClick={saveAllToCollection}
                  disabled={savingAll}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                >
                  {savingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                  Save all to collection
                </button>
              )}
              <button
                onClick={diveDeeper}
                disabled={savingAll}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" /> Dive deeper <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Grouped results */}
          {TYPE_ORDER.filter(t => grouped[t]).map(type => {
            const cfg = TYPE_CONFIG[type];
            const Icon = cfg.Icon;
            return (
              <div key={type} className="space-y-3">
                <div className={`flex items-center gap-2 ${cfg.color}`}>
                  <Icon className="w-4 h-4" />
                  <h2 className="font-semibold text-sm">{cfg.label}</h2>
                  <span className="text-xs text-muted-foreground">({grouped[type].length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped[type].map(result => (
                    <ResultCard
                      key={result.url}
                      result={result}
                      saved={saved.has(result.url)}
                      onSave={() => saveResult(result)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* New search */}
          <div className="text-center pt-4">
            <button
              onClick={() => { setData(null); setQuery(""); setCollectionId(null); inputRef.current?.focus(); }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              New search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiscoverPage() {
  return <Layout><DiscoverContent /></Layout>;
}
