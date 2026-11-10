import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { shuffle } from "@/lib/jigsawShapes";
import { ArrowLeft, Trophy, RotateCcw, X } from "lucide-react";

type SpeedSortItem = { name: string; bucket: "a" | "b" };
type SpeedSortGame = {
  id: number;
  title: string;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
  bucketA: string;
  bucketB: string;
  items: SpeedSortItem[];
};

// Harder difficulties give you less time per item rather than more items --
// the pressure is the game.
const SPEED_SORT_DIFFICULTY = {
  Easy:   { timePerItem: 4000 },
  Medium: { timePerItem: 3000 },
  Hard:   { timePerItem: 2000 },
} as const;

// Two-bucket sorting against a clock, ported from the hunt-link-quest Base44
// project. Logic unchanged; the shell got the usual swap, and lodash's shuffle
// is replaced by the one already here.
export default function SpeedSortPlay() {
  const [, params] = useRoute("/speedsort/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const { data: game } = useQuery<SpeedSortGame>({
    queryKey: ["speedsort-game", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/speedsort-games/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load that game");
      return res.json();
    },
  });

  const [order, setOrder] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timePct, setTimePct] = useState(100);
  const [showResult, setShowResult] = useState(false);
  // Guards against a second answer landing in the 250ms gap before the next
  // item appears, and against the timer firing on an item already answered.
  const answeredRef = useRef(false);

  const back = () => setLocation("/games-vault");

  const items = game?.items ?? [];
  const timePerItem = (SPEED_SORT_DIFFICULTY[game?.difficulty ?? "Easy"] ?? SPEED_SORT_DIFFICULTY.Easy).timePerItem;
  const complete = order.length > 0 && currentIndex >= order.length;

  const setupRound = (g: SpeedSortGame) => {
    setOrder(shuffle((g.items ?? []).map((_, i) => i)));
    setCurrentIndex(0);
    setScore(0);
    setMistakes(0);
    setStreak(0);
    setBestStreak(0);
    answeredRef.current = false;
  };

  useEffect(() => {
    if (game) setupRound(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => {
    if (!complete) { setShowResult(false); return; }
    const t = setTimeout(() => setShowResult(true), 400);
    return () => clearTimeout(t);
  }, [complete]);

  // null means the clock ran out -- counted as a miss, same as a wrong answer.
  const handleAnswer = (bucket: "a" | "b" | null) => {
    if (answeredRef.current || complete) return;
    answeredRef.current = true;
    const item = items[order[currentIndex]];
    if (bucket && item && bucket === item.bucket) {
      setScore((s) => s + 1);
      setStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
    } else {
      setMistakes((m) => m + 1);
      setStreak(0);
    }
    setTimeout(() => {
      answeredRef.current = false;
      setCurrentIndex((i) => i + 1);
    }, 250);
  };

  useEffect(() => {
    if (complete || !game || order.length === 0) return;
    const start = Date.now();
    setTimePct(100);
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / timePerItem) * 100);
      setTimePct(pct);
      if (pct <= 0) {
        clearInterval(interval);
        handleAnswer(null);
      }
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, game, complete, order.length]);

  if (!game) {
    return <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">Loading…</div>;
  }

  const currentItem = !complete ? items[order[currentIndex]] : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-3 md:px-10">
        <button onClick={back} className="mb-3 flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-bold text-white">{game.title}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">Score {score}</span>
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">Streak {streak}</span>
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">{mistakes} misses</span>
            <Button size="sm" variant="outline" onClick={() => setupRound(game)} className="border-white/10 bg-transparent text-white hover:bg-white/5">
              <RotateCcw className="mr-1 h-4 w-4" /> Restart
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        {currentItem && (
          <>
            <p className="text-sm text-white/40">Item {currentIndex + 1} of {order.length}</p>
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[#3B82F6] transition-[width] duration-75 ease-linear" style={{ width: `${timePct}%` }} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#1A1A1A] px-10 py-8 text-center">
              <span className="text-3xl font-bold text-white">{currentItem.name}</span>
            </div>
            <div className="flex w-full max-w-md gap-4">
              <button
                onClick={() => handleAnswer("a")}
                className="flex-1 rounded-xl border border-[#3B82F6]/40 bg-[#1E293B] px-4 py-6 text-lg font-semibold text-white transition hover:bg-[#3B82F6]/30"
              >
                {game.bucketA}
              </button>
              <button
                onClick={() => handleAnswer("b")}
                className="flex-1 rounded-xl border border-[#D4AF37]/40 bg-[#1E293B] px-4 py-6 text-lg font-semibold text-white transition hover:bg-[#D4AF37]/30"
              >
                {game.bucketB}
              </button>
            </div>
          </>
        )}
      </div>

      {showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-8 text-center">
            <button onClick={back} className="absolute right-4 top-4 text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Trophy className="mx-auto mb-4 h-14 w-14 text-[#D4AF37]" />
            <h2 className="text-2xl font-bold text-white">Round complete!</h2>
            <p className="mt-2 text-white/60">
              {score} of {order.length} correct, best streak {bestStreak}.
            </p>
            <div className="mt-6 flex gap-2">
              <Button onClick={() => setupRound(game)} variant="outline" className="flex-1 border-white/10 bg-transparent text-white hover:bg-white/5">
                <RotateCcw className="mr-1 h-4 w-4" /> Play again
              </Button>
              <Button onClick={back} className="flex-1 bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90">
                More games
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
