import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Puzzle, Plus, Loader2, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { uploadFile } from "@/lib/upload";
import { useToast } from "@/hooks/use-toast";

type PuzzleGame = {
  id: number;
  title: string;
  imageUrl: string;
  difficulty: string;
  rows: number;
  cols: number;
};

const DIFFICULTIES = [
  { value: "Easy",   label: "Easy — 3×3" },
  { value: "Medium", label: "Medium — 4×4" },
  { value: "Hard",   label: "Hard — 5×5" },
  { value: "Expert", label: "Expert — 6×6" },
] as const;

// Playable jigsaw puzzles, above the external game-source tiles on My Vault's
// Games tab. Any picture becomes a puzzle: the board is cut from it at play
// time, so adding one is just a title, an image and a difficulty.
export function PuzzleGamesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [difficulty, setDifficulty] = useState<string>("Easy");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<{ items: PuzzleGame[] }>({
    queryKey: ["puzzle-games"],
    queryFn: async () => {
      const res = await fetch("/api/puzzle-games", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load puzzles");
      return res.json();
    },
  });

  const puzzles = data?.items ?? [];

  const reset = () => { setTitle(""); setImageUrl(""); setDifficulty("Easy"); };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setImageUrl(await uploadFile(file));
    } catch (err) {
      toast({ title: "Couldn't upload that image", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/puzzle-games", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), imageUrl: imageUrl.trim(), difficulty }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: ["puzzle-games"] });
      toast({ title: "Puzzle added" });
      setOpen(false);
      reset();
    } catch (err) {
      toast({ title: "Couldn't add that puzzle", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number, name: string) => {
    if (!window.confirm("Delete this? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/puzzle-games/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: ["puzzle-games"] });
      toast({ title: `Removed "${name}"` });
    } catch (err) {
      toast({ title: "Couldn't remove that puzzle", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Puzzle className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Jigsaw Puzzles
        </h2>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Puzzle
        </Button>
      </div>

      {puzzles.length === 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed border-border bg-card/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <Puzzle className="w-8 h-8 opacity-30" />
          <p className="text-sm">Turn any picture into a jigsaw puzzle.</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {puzzles.map((p) => (
            <div key={p.id} className="relative group">
              <Link
                href={`/puzzle/${p.id}`}
                className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
              >
                <div className="aspect-video overflow-hidden bg-muted">
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.difficulty} · {p.rows}×{p.cols}</p>
                </div>
              </Link>
              <button
                onClick={() => void remove(p.id, p.title)}
                title="Remove puzzle"
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        {/* Capped and internally scrollable. The image preview makes this
            dialog taller than the viewport, and without a scroll region the
            growth pushes the title off the top and the buttons off the
            bottom -- leaving no way to finish or cancel. Header and footer
            stay pinned; only the fields scroll. */}
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add a puzzle</DialogTitle>
            <DialogDescription>
              Any picture works. It gets cut into pieces when you play, so nothing is altered.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="puzzle-title">Title</Label>
              <Input id="puzzle-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Family at the lake" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="puzzle-image">Image</Label>
              <div className="flex gap-2">
                <Input
                  id="puzzle-image"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Paste an image URL, or upload one"
                />
                <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
              </div>
              {/* Contained rather than aspect-video: these are arbitrary
                  pictures, and a tall one blew the dialog past the viewport.
                  This only needs to confirm the right image loaded. */}
              {imageUrl && (
                <div className="mt-2 h-40 w-full overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
                  <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <div className="grid grid-cols-2 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDifficulty(d.value)}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      difficulty === d.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!title.trim() || !imageUrl.trim() || saving} onClick={() => void save()}>
              {saving ? "Adding…" : "Add puzzle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFileChosen(e)} />
    </div>
  );
}
