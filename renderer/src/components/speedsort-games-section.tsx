import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Split, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type SpeedSortGame = {
  id: number;
  title: string;
  topic: string;
  difficulty: string;
  bucketA: string;
  bucketB: string;
  items: { name: string; bucket: "a" | "b" }[];
};

const DIFFICULTIES = [
  { value: "Easy",   label: "Easy · 4s" },
  { value: "Medium", label: "Medium · 3s" },
  { value: "Hard",   label: "Hard · 2s" },
] as const;

export function SpeedSortGamesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<string>("Easy");
  const [bucketA, setBucketA] = useState("");
  const [bucketB, setBucketB] = useState("");
  const [listA, setListA] = useState("");
  const [listB, setListB] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<{ items: SpeedSortGame[] }>({
    queryKey: ["speedsort-games"],
    queryFn: async () => {
      const res = await fetch("/api/speedsort-games", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load games");
      return res.json();
    },
  });

  const games = data?.items ?? [];
  const reset = () => {
    setTitle(""); setTopic(""); setDifficulty("Easy");
    setBucketA(""); setBucketB(""); setListA(""); setListB("");
  };

  const autoGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/speedsort-generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Generation failed");
      const data = (await res.json()) as {
        title: string; bucketA: string; bucketB: string; itemsA: string[]; itemsB: string[];
      };
      setTitle(data.title);
      setBucketA(data.bucketA);
      setBucketB(data.bucketB);
      setListA(data.itemsA.join("\n"));
      setListB(data.itemsB.join("\n"));
    } catch (err) {
      toast({ title: "Couldn't auto-generate", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // One item per line, so multi-word entries stay intact -- splitting on
  // commas would break "Top Gun, Maverick" into two.
  const parseList = (text: string) =>
    text.split("\n").map((l) => l.trim()).filter(Boolean);

  const itemsA = parseList(listA);
  const itemsB = parseList(listB);
  const canSave = !!title.trim() && !!bucketA.trim() && !!bucketB.trim()
    && itemsA.length > 0 && itemsB.length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const items = [
        ...itemsA.map((name) => ({ name, bucket: "a" as const })),
        ...itemsB.map((name) => ({ name, bucket: "b" as const })),
      ];
      const res = await fetch("/api/speedsort-games", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          topic: topic.trim() || "General",
          difficulty,
          bucketA: bucketA.trim(),
          bucketB: bucketB.trim(),
          items,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: ["speedsort-games"] });
      toast({ title: "Speed sort added" });
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
      const res = await fetch(`/api/speedsort-games/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: ["speedsort-games"] });
      toast({ title: `Removed "${name}"` });
    } catch (err) {
      toast({ title: "Couldn't remove that game", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Split className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Speed Sort
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
          <Split className="w-8 h-8 opacity-30" />
          <p className="text-sm">This or that — sort them before the clock runs out.</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {games.map((g) => (
            <div key={g.id} className="relative group">
              <Link
                href={`/speedsort/${g.id}`}
                className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
              >
                {/* The two bucket names are the cover art -- they say what the
                    game actually asks better than any picture would. */}
                <div className="aspect-video flex flex-col items-center justify-center gap-1 bg-muted/40 px-2 text-center">
                  <span className="text-xs font-semibold text-[#3B82F6] truncate max-w-full">{g.bucketA}</span>
                  <span className="text-[10px] text-muted-foreground">or</span>
                  <span className="text-xs font-semibold text-[#D4AF37] truncate max-w-full">{g.bucketB}</span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{g.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.difficulty} · {g.items?.length ?? 0} items</p>
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
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add a speed sort</DialogTitle>
            <DialogDescription>
              Name two categories, then list what belongs in each. Players get a few seconds per item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="space-y-1.5">
              <Label>Auto-generate</Label>
              <div className="flex gap-2">
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Topic hint — e.g. space, animals, movies (optional)"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={generating}
                  onClick={() => void autoGenerate()}
                  className="shrink-0 gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {generating ? "Generating…" : "Generate"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">AI fills in everything. You can still edit after.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ss-title">Title</Label>
              <Input id="ss-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fruit or vegetable?" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ss-a">First category</Label>
                <Input id="ss-a" value={bucketA} onChange={(e) => setBucketA(e.target.value)} placeholder="Fruit" />
                <Textarea
                  value={listA}
                  onChange={(e) => setListA(e.target.value)}
                  placeholder={"One per line\napple\nbanana"}
                  className="h-32 resize-none"
                />
                <p className="text-xs text-muted-foreground">{itemsA.length} item{itemsA.length === 1 ? "" : "s"}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ss-b">Second category</Label>
                <Input id="ss-b" value={bucketB} onChange={(e) => setBucketB(e.target.value)} placeholder="Vegetable" />
                <Textarea
                  value={listB}
                  onChange={(e) => setListB(e.target.value)}
                  placeholder={"One per line\ncarrot\nbroccoli"}
                  className="h-32 resize-none"
                />
                <p className="text-xs text-muted-foreground">{itemsB.length} item{itemsB.length === 1 ? "" : "s"}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button key={d.value} type="button" onClick={() => setDifficulty(d.value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      difficulty === d.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Harder gives less time per item, not more items.</p>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!canSave || saving} onClick={() => void save()}>
              {saving ? "Adding…" : "Add game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
