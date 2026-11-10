import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ImageRegions from "@/components/hunt-image-regions";
import { type HuntItem, type Polygon } from "@/lib/polygon";
import { uploadFile } from "@/lib/upload";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Upload, Loader2, Plus, Trash2, Undo2, Check, MousePointerClick,
} from "lucide-react";

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert"] as const;

// Authoring surface for a seek-and-find game.
//
// You upload a picture, name the things to find, and trace a shape around each
// one by clicking its outline. Everything is stored normalized (0..1), so a
// hunt traced here plays correctly at any screen size.
//
// The Base44 original also had AI buttons here -- generate the scene, detect
// the objects. Those are omitted rather than stubbed: they need an API key and
// a server route that don't exist yet, and tracing by hand works today. If
// they're added later they write into this same shape.
export default function HuntBuilder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [difficulty, setDifficulty] = useState<string>("Medium");
  const [items, setItems] = useState<HuntItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [drawingPoints, setDrawingPoints] = useState<Polygon>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const back = () => setLocation("/photos?tab=games");

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

  const addItem = () => {
    setItems((prev) => [...prev, { name: "", regions: [] }]);
    setActiveIndex(items.length);
    setDrawingPoints([]);
  };

  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
    if (activeIndex === i) { setActiveIndex(-1); setDrawingPoints([]); }
  };

  const renameItem = (i: number, name: string) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, name } : it)));
  };

  // Clicks land as polygon vertices for whichever item is being traced.
  const onCanvasClick = (x: number, y: number) => {
    if (activeIndex < 0) return;
    setDrawingPoints((prev) => [...prev, { x, y }]);
  };

  const finishRegion = () => {
    if (activeIndex < 0 || drawingPoints.length < 3) return;
    setItems((prev) => prev.map((it, idx) =>
      idx === activeIndex ? { ...it, regions: [...(it.regions ?? []), drawingPoints] } : it,
    ));
    setDrawingPoints([]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim(),
        difficulty,
        items: items.map((it) => ({ name: it.name.trim(), regions: it.regions ?? [] })),
      };
      const res = await fetch("/api/hunt-games", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: ["hunt-games"] });
      toast({ title: "Hunt saved" });
      back();
    } catch (err) {
      toast({ title: "Couldn't save that hunt", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Every item needs a name and at least one traced region, which is also what
  // the server enforces -- an item with neither can never be found.
  const readyItems = items.filter((it) => it.name.trim() && (it.regions?.length ?? 0) > 0);
  const canSave = !!title.trim() && !!imageUrl.trim() && readyItems.length === items.length && items.length > 0;

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={back} className="mb-3 flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold text-white">Create a seek-and-find</h1>
          <Button className="ml-auto bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90" disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save hunt"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 px-6 py-6 md:px-10 lg:grid-cols-[1fr_340px]">
        <div>
          {imageUrl ? (
            <ImageRegions
              imageUrl={imageUrl}
              mode="draw"
              items={items}
              activeIndex={activeIndex}
              drawingPoints={drawingPoints}
              onCanvasClick={onCanvasClick}
            />
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/30 text-white/40 hover:border-[#3B82F6]/50 hover:text-white/70"
            >
              {uploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
              <p className="text-sm">Upload the picture people will search</p>
            </button>
          )}

          {imageUrl && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="border-white/10 bg-transparent text-white hover:bg-white/5">
                {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Replace image
              </Button>
              {activeIndex >= 0 && (
                <>
                  <span className="flex items-center gap-1.5 text-sm text-white/50">
                    <MousePointerClick className="h-4 w-4" />
                    Click around “{items[activeIndex]?.name || "this item"}” — {drawingPoints.length} point{drawingPoints.length === 1 ? "" : "s"}
                  </span>
                  <Button size="sm" variant="outline" disabled={!drawingPoints.length}
                    onClick={() => setDrawingPoints((p) => p.slice(0, -1))}
                    className="border-white/10 bg-transparent text-white hover:bg-white/5">
                    <Undo2 className="mr-1 h-4 w-4" /> Undo point
                  </Button>
                  <Button size="sm" disabled={drawingPoints.length < 3} onClick={finishRegion}
                    className="bg-[#22C55E] text-black hover:bg-[#22C55E]/90">
                    <Check className="mr-1 h-4 w-4" /> Finish shape
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hunt-title">Title</Label>
            <Input id="hunt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Moat Floor Mystery" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hunt-desc">Description</Label>
            <Input id="hunt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — sets the scene" />
          </div>
          <div className="space-y-1.5">
            <Label>Difficulty</Label>
            <div className="grid grid-cols-2 gap-2">
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" onClick={() => setDifficulty(d)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    difficulty === d ? "border-[#3B82F6] bg-[#3B82F6]/10 text-[#3B82F6]" : "border-white/10 text-white/50 hover:text-white"
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1A1A1A] p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">Things to find</h3>
              <Button size="sm" variant="outline" className="ml-auto border-white/10 bg-transparent text-white hover:bg-white/5"
                disabled={!imageUrl} onClick={addItem}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>

            {items.length === 0 && (
              <p className="text-sm text-white/30">
                {imageUrl ? "Add an item, then click around it on the picture to trace its shape." : "Upload a picture first."}
              </p>
            )}

            <div className="space-y-2">
              {items.map((item, i) => {
                const regionCount = item.regions?.length ?? 0;
                const isActive = i === activeIndex;
                return (
                  <div key={i} className={`rounded-lg border p-2 ${isActive ? "border-[#3B82F6] bg-[#3B82F6]/5" : "border-white/10"}`}>
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.name}
                        onChange={(e) => renameItem(i, e.target.value)}
                        placeholder="Rusted helmet"
                        className="h-8"
                      />
                      <button onClick={() => removeItem(i)} title="Remove item" className="p-1 text-white/40 hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Button size="sm" variant={isActive ? "default" : "outline"}
                        onClick={() => { setActiveIndex(isActive ? -1 : i); setDrawingPoints([]); }}
                        className={isActive ? "bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90" : "border-white/10 bg-transparent text-white hover:bg-white/5"}>
                        {isActive ? "Tracing…" : regionCount ? "Trace another" : "Trace it"}
                      </Button>
                      <span className={`text-xs ${regionCount ? "text-[#22C55E]" : "text-white/30"}`}>
                        {regionCount ? `${regionCount} shape${regionCount === 1 ? "" : "s"}` : "no shape yet"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {items.length > 0 && !canSave && (
              <p className="mt-3 text-xs text-white/40">
                Every item needs a name and at least one traced shape before this can be saved.
              </p>
            )}
          </div>
        </aside>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFileChosen(e)} />
    </div>
  );
}
