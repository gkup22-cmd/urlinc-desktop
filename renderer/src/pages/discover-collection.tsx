import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Globe, Film, Headphones, ShoppingBag, ExternalLink, Trash2, Loader2, ArrowLeft, Sparkles, Telescope, ChevronRight, Users, UserPlus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FriendSuggestion {
  userId: string;
  displayName: string;
  sharedCount: number;
  sharedTopics: string[];
  friendStatus: "pending" | "accepted" | null;
}

interface CollectionItem {
  id: number;
  title: string;
  url: string;
  description: string;
  type: "website" | "video" | "music" | "product";
  source: string;
  createdAt: string;
}

interface Collection {
  id: number;
  query: string;
  slug: string;
  summary: string;
  createdAt: string;
  items: CollectionItem[];
}

interface RelatedTopic {
  title: string;
  description: string;
}

const TYPE_CONFIG = {
  video:   { label: "Videos",   Icon: Film,        color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20"   },
  music:   { label: "Music",    Icon: Headphones,  color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  product: { label: "Products", Icon: ShoppingBag, color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20"  },
  website: { label: "Websites", Icon: Globe,       color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20"   },
};

const TYPE_ORDER: CollectionItem["type"][] = ["video", "music", "product", "website"];

export default function DiscoverCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<RelatedTopic[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [connected, setConnected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/discover/collections/${id}`, { credentials: "include" })
      .then(r => r.json())
      .then((data: Collection) => { setCollection(data); setLoading(false); })
      .catch(() => { toast({ title: "Failed to load collection", variant: "destructive" }); setLoading(false); });
  }, [id]);

  useEffect(() => {
    fetch("/api/discover/friend-suggestions", { credentials: "include" })
      .then(r => r.json())
      .then((data: FriendSuggestion[]) => setSuggestions(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!collection) return;
    setRelatedLoading(true);
    fetch("/api/discover/related", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: collection.query }),
    })
      .then(r => r.json())
      .then((data: { related?: RelatedTopic[] }) => { setRelated(data.related ?? []); setRelatedLoading(false); })
      .catch(() => setRelatedLoading(false));
  }, [collection?.id]);

  async function connect(userId: string) {
    try {
      await fetch(`/api/discover/connect/${userId}`, { method: "POST", credentials: "include" });
      setConnected(prev => new Set([...prev, userId]));
      toast({ title: "Friend request sent!" });
    } catch {
      toast({ title: "Could not send request", variant: "destructive" });
    }
  }

  async function removeItem(itemId: number) {
    if (!collection) return;
    const res = await fetch(`/api/discover/collections/${collection.id}/items/${itemId}`, {
      method: "DELETE", credentials: "include",
    });
    if (res.ok) {
      setCollection(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId) } : prev);
    }
  }

  function diveInto(topic: RelatedTopic) {
    setLocation(`/wish-list?tab=discover&q=${encodeURIComponent(topic.title)}`);
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!collection) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-20 text-center text-muted-foreground">
          Collection not found.
        </div>
      </Layout>
    );
  }

  const grouped = TYPE_ORDER.reduce<Record<string, CollectionItem[]>>((acc, t) => {
    const items = collection.items.filter(i => i.type === t);
    if (items.length) acc[t] = items;
    return acc;
  }, {});

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Back */}
        <button
          onClick={() => setLocation("/wish-list?tab=discover")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Discover
        </button>

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary text-xs font-medium uppercase tracking-widest">
            <Telescope className="w-4 h-4" /> Topic Collection
          </div>
          <h1 className="text-3xl font-bold capitalize">{collection.query}</h1>
          {collection.summary && (
            <p className="text-muted-foreground leading-relaxed">{collection.summary}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {collection.items.length} saved resource{collection.items.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Items grouped by type */}
        {collection.items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-10 text-center">No saved resources yet.</p>
        ) : (
          <div className="space-y-8">
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
                  <div className="space-y-2">
                    {grouped[type].map(item => (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <p className="text-sm font-semibold leading-snug flex-1">{item.title}</p>
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                              {item.source}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{item.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Related interests */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Related interests
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Branch into more specific niches</p>
            </div>
          </div>

          {relatedLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-2 bg-muted rounded w-full" />
                  <div className="h-2 bg-muted rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : related.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((topic, i) => (
                <button
                  key={i}
                  onClick={() => diveInto(topic)}
                  className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">{topic.title}</p>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{topic.description}</p>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {/* People with similar interests */}
        {suggestions.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3 h-3 text-primary" /> People exploring similar topics
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
      </div>
    </Layout>
  );
}
