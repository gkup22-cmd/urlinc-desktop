import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { LetterText, Plus, Trash2, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { generateWordSearchGrid, WORD_SEARCH_SIZES, type WordSearchDifficulty } from "@/lib/wordSearch";
import { useToast } from "@/hooks/use-toast";

type WordSearchGame = {
  id: number;
  title: string;
  category: string;
  difficulty: string;
  size: number;
  words: string[];
};

const DIFFICULTIES: WordSearchDifficulty[] = ["Easy", "Medium", "Hard"];

export function WordSearchGamesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState<WordSearchDifficulty>("Easy");
  const [wordsText, setWordsText] = useState("");
  const [storyText, setStoryText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<{ items: WordSearchGame[] }>({
    queryKey: ["wordsearch-games"],
    queryFn: async () => {
      const res = await fetch("/api/wordsearch-games", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load games");
      return res.json();
    },
  });

  const games = data?.items ?? [];
  const reset = () => { setTitle(""); setCategory(""); setDifficulty("Easy"); setWordsText(""); setStoryText(""); };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setStoryText(reader.result as string);
    reader.readAsText(file);
  };

  const extractWords = async () => {
    if (!storyText.trim()) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/wordsearch-extract", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: storyText }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Extraction failed");
      const data = (await res.json()) as { title: string; words: string[] };
      if (data.words.length > 0) setWordsText(data.words.join(", "));
      if (data.title && !title.trim()) setTitle(data.title);
      toast({ title: `Extracted ${data.words.length} words from your story` });
    } catch (err) {
      toast({ title: "Couldn't extract words", description: (err as Error).message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  // Split on anything that isn't a letter, so a list can be pasted however it
  // happens to be punctuated -- commas, new lines, or straight out of a story.
  const parsedWords = Array.from(new Set(
    wordsText.toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 3),
  ));

  const size = WORD_SEARCH_SIZES[difficulty];
  const tooLong = parsedWords.filter((w) => w.length > size);

  const save = async () => {
    setSaving(true);
    try {
      // Generated here, then stored, so every player gets the same puzzle --
      // regenerating on load would make times and scores meaningless.
      const { grid, placedWords } = generateWordSearchGrid(parsedWords, size);
      if (placedWords.length === 0) throw new Error("None of those words would fit — try shorter ones or a bigger grid");

      const res = await fetch("/api/wordsearch-games", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim() || "General",
          difficulty,
          size,
          // The placed list, not the requested one: anything that wouldn't fit
          // was dropped, and listing it would make the game unwinnable.
          words: placedWords,
          grid,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: ["wordsearch-games"] });

      const dropped = parsedWords.length - placedWords.length;
      toast({
        title: "Word search added",
        description: dropped > 0 ? `${dropped} word${dropped === 1 ? "" : "s"} wouldn't fit and ${dropped === 1 ? "was" : "were"} left out.` : undefined,
      });
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
      const res = await fetch(`/api/wordsearch-games/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: ["wordsearch-games"] });
      toast({ title: `Removed "${name}"` });
    } catch (err) {
      toast({ title: "Couldn't remove that game", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <LetterText className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Word Search
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
          <LetterText className="w-8 h-8 opacity-30" />
          <p className="text-sm">Hide a list of words in a grid — paste them from a story.</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {games.map((g) => (
            <div key={g.id} className="relative group">
              <Link
                href={`/wordsearch/${g.id}`}
                className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
              >
                {/* A scatter of the game's own letters stands in for cover art. */}
                <div className="aspect-video flex items-center justify-center gap-1 bg-muted/40 font-bold tracking-widest text-lg text-muted-foreground">
                  {(g.words[0] ?? "WORDS").slice(0, 6).split("").map((ch, i) => (
                    <span key={i} className={i % 2 ? "text-primary/70" : ""}>{ch}</span>
                  ))}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{g.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {g.category} · {g.words.length} words · {g.size}×{g.size}
                  </p>
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
            <DialogTitle>Add a word search</DialogTitle>
            <DialogDescription>
              Paste or type the words to hide. Commas, spaces and new lines all work, so a list
              straight out of a story is fine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="ws-title">Title</Label>
              <Input id="ws-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Knight in Rusty Armour" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-category">Category</Label>
              <Input id="ws-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optional — e.g. Bedtime stories" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>From a story</Label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Upload className="w-3 h-3" /> Upload .txt
                </button>
              </div>
              <Textarea
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
                placeholder="Paste a story here and let AI pick the best words for the puzzle…"
                className="h-24 resize-none text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!storyText.trim() || extracting}
                onClick={() => void extractWords()}
                className="w-full gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {extracting ? "Extracting…" : "Extract words from story"}
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-words">Words</Label>
              <Textarea
                id="ws-words"
                value={wordsText}
                onChange={(e) => setWordsText(e.target.value)}
                placeholder="knight, bear, castle, courage, kindness, princess"
                className="h-28 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {parsedWords.length} usable word{parsedWords.length === 1 ? "" : "s"} · under 3 letters ignored
                {tooLong.length > 0 && ` · ${tooLong.length} too long for a ${size}×${size} grid`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button key={d} type="button" onClick={() => setDifficulty(d)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      difficulty === d ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {d} · {WORD_SEARCH_SIZES[d]}×{WORD_SEARCH_SIZES[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!title.trim() || parsedWords.length === 0 || saving} onClick={() => void save()}>
              {saving ? "Adding…" : "Add game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <input ref={fileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={onFileChosen} />
    </div>
  );
}
