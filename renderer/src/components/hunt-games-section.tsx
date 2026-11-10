import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type HuntGame = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string;
  difficulty: string;
  items: { name: string }[];
};

// Seek-and-find games on My Vault's Games tab, listed alongside the jigsaw
// puzzles. Creation lives on its own page rather than a dialog: tracing shapes
// needs the picture as large as possible, which a modal can't give it.
export function HuntGamesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data } = useQuery<{ items: HuntGame[] }>({
    queryKey: ["hunt-games"],
    queryFn: async () => {
      const res = await fetch("/api/hunt-games", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load hunts");
      return res.json();
    },
  });

  const hunts = data?.items ?? [];

  const remove = async (id: number, name: string) => {
    if (!window.confirm("Delete this? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/hunt-games/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: ["hunt-games"] });
      toast({ title: `Removed "${name}"` });
    } catch (err) {
      toast({ title: "Couldn't remove that hunt", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Search className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Seek &amp; Find
        </h2>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setLocation("/hunt/new")}>
          <Plus className="w-3.5 h-3.5" /> Create Hunt
        </Button>
      </div>

      {hunts.length === 0 ? (
        <button
          onClick={() => setLocation("/hunt/new")}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed border-border bg-card/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <Search className="w-8 h-8 opacity-30" />
          <p className="text-sm">Hide things in a picture for someone to find.</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {hunts.map((h) => (
            <div key={h.id} className="relative group">
              <Link
                href={`/hunt/${h.id}`}
                className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
              >
                <div className="aspect-video overflow-hidden bg-muted">
                  <img src={h.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{h.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {h.difficulty} · {h.items?.length ?? 0} to find
                  </p>
                </div>
              </Link>
              <button
                onClick={() => void remove(h.id, h.title)}
                title="Remove hunt"
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
