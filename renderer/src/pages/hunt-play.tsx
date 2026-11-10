import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import ImageRegions from "@/components/hunt-image-regions";
import {
  pointInAnyPolygon, getRegions, normalizeRegions, formatTime, type HuntItem,
} from "@/lib/polygon";
import {
  ArrowLeft, Check, Clock, Trophy, RotateCcw, X, Maximize, Minimize, Lightbulb,
} from "lucide-react";

const HINT_PENALTY_SECONDS = 15;

type HuntGame = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string;
  difficulty: string;
  items: HuntItem[];
};

// Seek-and-find play surface, ported from the hunt-link-quest Base44 project.
// The timer, hit testing, hint and completion flow are unchanged; the shell
// differs -- react-router became wouter, and the Base44 entity fetch became a
// react-query call. The Reimagine dialog is dropped: it was a Base44 AI
// feature with nothing behind it here.
export default function HuntPlay() {
  const [, params] = useRoute("/hunt/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const { data: game } = useQuery<HuntGame>({
    queryKey: ["hunt-game", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/hunt-games/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load that hunt");
      return res.json();
    },
  });

  const [found, setFound] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const [flash, setFlash] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [hintIndex, setHintIndex] = useState(-1);
  const bracketResultPosted = useRef(false);

  const bracketId = new URLSearchParams(window.location.search).get("bracketId");
  const back = () => setLocation(bracketId ? `/movie-bracket/${bracketId}` : "/games-vault");

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (containerRef.current) {
      void containerRef.current.requestFullscreen();
    }
  };

  const allFound = !!game && found.size === game.items.length;

  useEffect(() => {
    if (!allFound || !bracketId || bracketResultPosted.current) return;
    bracketResultPosted.current = true;
    void fetch(`/api/movie-brackets/${bracketId}/puzzle-result`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "hunt", completed: true, timeMs: seconds * 1000 }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFound]);

  useEffect(() => {
    if (!started || allFound) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [started, allFound]);

  if (!game) {
    return <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">Loading…</div>;
  }

  const onClick = (x: number, y: number) => {
    if (allFound) return;
    if (!started) setStarted(true);
    for (let i = 0; i < game.items.length; i++) {
      if (found.has(i)) continue;
      const regions = dims
        ? normalizeRegions(getRegions(game.items[i]), dims.w, dims.h)
        : getRegions(game.items[i]);
      if (pointInAnyPolygon([x, y], regions)) {
        const next = new Set(found);
        next.add(i);
        setFound(next);
        return;
      }
    }
    setMisses((m) => m + 1);
    setFlash(true);
    setTimeout(() => setFlash(false), 250);
  };

  const reset = () => {
    setFound(new Set());
    setMisses(0);
    setSeconds(0);
    setStarted(false);
    setHintIndex(-1);
  };

  // Costs time rather than being unlimited, so it stays a trade rather than a
  // way to skip the game.
  const useHint = () => {
    if (allFound) return;
    const unfound = game.items.map((_, i) => i).filter((i) => !found.has(i));
    if (unfound.length === 0) return;
    if (!started) setStarted(true);
    const pick = unfound[Math.floor(Math.random() * unfound.length)];
    setSeconds((s) => s + HINT_PENALTY_SECONDS);
    setHintIndex(pick);
    setTimeout(() => setHintIndex(-1), 3000);
  };

  const accuracy = () => {
    const total = found.size + misses;
    return total === 0 ? 100 : Math.round((found.size / total) * 100);
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={back} className="mb-3 flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{game.title}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">
              <Clock className="h-4 w-4 text-[#3B82F6]" /> {formatTime(seconds)}
            </span>
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">
              Found {found.size}/{game.items.length}
            </span>
            <Button size="sm" variant="outline" onClick={useHint} disabled={allFound}
              className="border-white/10 bg-transparent text-white hover:bg-white/5">
              <Lightbulb className="mr-1 h-4 w-4 text-[#D4AF37]" /> Hint (+{HINT_PENALTY_SECONDS}s)
            </Button>
            <Button size="sm" variant="outline" onClick={reset}
              className="border-white/10 bg-transparent text-white hover:bg-white/5">
              <RotateCcw className="mr-1 h-4 w-4" /> Restart
            </Button>
            <Button size="sm" variant="outline" onClick={toggleFullscreen}
              className="border-white/10 bg-transparent text-white hover:bg-white/5">
              {isFullscreen ? <Minimize className="mr-1 h-4 w-4" /> : <Maximize className="mr-1 h-4 w-4" />}
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Button>
          </div>
        </div>
        {game.description && !isFullscreen && (
          <p className="mt-2 max-w-3xl text-sm text-white/50">{game.description}</p>
        )}
      </div>

      <div
        ref={containerRef}
        className={
          isFullscreen
            ? "flex h-full w-full flex-col gap-4 bg-[#121212] p-6 lg:flex-row"
            : "grid gap-6 px-6 py-6 md:px-10 lg:grid-cols-[1fr_300px]"
        }
      >
        <div className={`rounded-xl transition ${flash ? "ring-2 ring-red-500/60" : ""} ${isFullscreen ? "flex min-h-0 flex-1 items-center justify-center" : ""}`}>
          <ImageRegions
            imageUrl={game.imageUrl}
            mode="play"
            items={game.items}
            foundIndices={found}
            onCanvasClick={onClick}
            onDims={setDims}
            fullscreen={isFullscreen}
            hintIndex={hintIndex}
          />
        </div>

        <aside className={`space-y-2 rounded-xl border border-white/10 bg-[#1A1A1A] p-4 ${isFullscreen ? "w-full shrink-0 overflow-y-auto lg:w-[300px]" : ""}`}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">Find these</h3>
          {game.items.map((item, i) => {
            const isFound = found.has(i);
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  isFound ? "bg-[#22C55E]/15 text-white line-through" : "bg-[#121212] text-white/70"
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isFound ? "border-[#22C55E] bg-[#22C55E] text-black" : "border-white/20"}`}>
                  {isFound && <Check className="h-3 w-3" />}
                </span>
                {item.name}
              </div>
            );
          })}
          {misses > 0 && (
            <p className="pt-2 text-xs text-white/30">Misses: {misses} · Accuracy {accuracy()}%</p>
          )}
        </aside>

        {allFound && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="relative w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-8 text-center">
              <button onClick={back} className="absolute right-4 top-4 text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
              <Trophy className="mx-auto mb-4 h-14 w-14 text-[#D4AF37]" />
              <h2 className="text-2xl font-bold text-white">Hunt complete!</h2>
              <p className="mt-2 text-white/60">You found all {game.items.length} items.</p>
              <div className="mt-4 flex justify-center gap-6 text-sm">
                <div>
                  <div className="text-lg font-bold text-white">{formatTime(seconds)}</div>
                  <div className="text-white/40">Time</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{accuracy()}%</div>
                  <div className="text-white/40">Accuracy</div>
                </div>
              </div>
              <div className="mt-6 flex gap-2">
                <Button onClick={reset} variant="outline"
                  className="flex-1 border-white/10 bg-transparent text-white hover:bg-white/5">
                  <RotateCcw className="mr-1 h-4 w-4" /> Play again
                </Button>
                {bracketId ? (
                  <Button onClick={back} className="flex-1 bg-amber-600 text-white hover:bg-amber-500">
                    Back to Movie Night
                  </Button>
                ) : (
                  <Button onClick={back} className="flex-1 bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90">
                    More games
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
