import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Brain, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MEMORY_THEMES, MEMORY_DIFFICULTY, MEMORY_THEME_NAMES, MEMORY_DIFFICULTY_NAMES,
} from "@/lib/memoryThemes";
import { useToast } from "@/hooks/use-toast";

type MemoryGame = {
  id: number;
  title: string;
  theme: keyof typeof MEMORY_THEMES;
  difficulty: keyof typeof MEMORY_DIFFICULTY;
};

// Matching-pairs games on My Vault's Games tab. Creation is a dialog rather
// than its own page: a memory game is three fields and needs no artwork.
export function MemoryGamesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState<string>("Animals");
  const [difficulty, setDifficulty] = useState<string>("Easy");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<{ items: MemoryGame[] }>({
    queryKey: ["memory-games"],
    queryFn: async () => {
      const res = await fetch("/api/memory-games", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load games");
      return res.json();
    },
  });

  const games = data?.items ?? [];
  const reset = () => { setTitle(""); setTheme("Animals"); setDifficulty("Easy"); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/memory-games", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), theme, difficulty }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: ["memory-games"] });
      toast({ title: "Game added" });
      setOpen(false);
      reset();
    } catch (err) {
      toast({ title: "Couldn't add that game", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number, name: string) => {
    if (!window.confirm("Delete this? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/memory-games/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: ["memory-games"] });
      toast({ title: `Removed "${name}"` });
    } catch (err) {
      toast({ title: "Couldn't remove that game", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Memory Match
        </h2>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Game
        </Button>
      </div>

      {games.length === 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed border-border bg-card/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <Brain className="w-8 h-8 opacity-30" />
          <p className="text-sm">Match the pairs. Pick a theme and play.</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {games.map((g) => {
            const faces = MEMORY_THEMES[g.theme] ?? MEMORY_THEMES.Animals;
            const pairs = (MEMORY_DIFFICULTY[g.difficulty] ?? MEMORY_DIFFICULTY.Easy).pairs;
            return (
              <div key={g.id} className="relative group">
                <Link
                  href={`/memory/${g.id}`}
                  className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
                >
                  {/* A few of the theme's own faces stand in for cover art, so
                      a game with no image still reads as itself at a glance. */}
                  <div className="aspect-video flex items-center justify-center gap-1 bg-muted/40 text-2xl">
                    {faces.slice(0, 4).map((f, i) => <span key={i}>{f}</span>)}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{g.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{g.theme} · {pairs} pairs</p>
                  </div>
                </Link>
                <button
                  onClick={() => void remove(g.id, g.title)}
                  title="Remove game"
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add a memory game</DialogTitle>
            <DialogDescription>Cards are shuffled fresh every time it's played.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="memory-title">Title</Label>
              <Input id="memory-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Animal match" />
            </div>

            <div className="space-y-1.5">
              <Label>Theme</Label>
              <div className="grid grid-cols-2 gap-2">
                {MEMORY_THEME_NAMES.map((t) => (
                  <button key={t} type="button" onClick={() => setTheme(t)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      theme === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    <span className="text-base">{MEMORY_THEMES[t][0]}</span> {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <div className="grid grid-cols-3 gap-2">
                {MEMORY_DIFFICULTY_NAMES.map((d) => (
                  <button key={d} type="button" onClick={() => setDifficulty(d)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      difficulty === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {d} · {MEMORY_DIFFICULTY[d].pairs}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!title.trim() || saving} onClick={() => void save()}>
              {saving ? "Adding…" : "Add game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
