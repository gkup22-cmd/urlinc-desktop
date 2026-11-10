import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import MemoryCard from "@/components/memory-card";
import {
  MEMORY_THEMES, MEMORY_DIFFICULTY,
  type MemoryTheme, type MemoryDifficulty,
} from "@/lib/memoryThemes";
import { shuffle } from "@/lib/jigsawShapes";
import { formatTime } from "@/lib/polygon";
import { ArrowLeft, Trophy, RotateCcw, X } from "lucide-react";

type MemoryGame = {
  id: number;
  title: string;
  theme: MemoryTheme;
  difficulty: MemoryDifficulty;
};

type Card = { id: number; emoji: string };

// Matching-pairs play surface, ported from the hunt-link-quest Base44 project.
// Game logic is unchanged; the shell differs -- wouter for react-router,
// react-query for the entity fetch, and the existing shuffle/formatTime
// helpers instead of lodash and a local copy.
export default function MemoryPlay() {
  const [, params] = useRoute("/memory/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const { data: game } = useQuery<MemoryGame>({
    queryKey: ["memory-game", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/memory-games/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load that game");
      return res.json();
    },
  });

  const [cards, setCards] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);
  // A ref rather than state: it gates clicks during the reveal delay and must
  // take effect immediately, not on the next render.
  const lockRef = useRef(false);

  const back = () => setLocation("/games-vault");
  const complete = cards.length > 0 && matched.length === cards.length;

  const setupBoard = (g: MemoryGame) => {
    const { pairs } = MEMORY_DIFFICULTY[g.difficulty] ?? MEMORY_DIFFICULTY.Easy;
    const emojis = (MEMORY_THEMES[g.theme] ?? MEMORY_THEMES.Animals).slice(0, pairs);
    const deck = shuffle(
      [...emojis, ...emojis].map((emoji, i) => ({ id: i, emoji })),
    );
    setCards(deck);
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setSeconds(0);
    setShowResult(false);
    lockRef.current = false;
  };

  useEffect(() => {
    if (game) setupBoard(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => {
    if (complete || cards.length === 0) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [complete, cards.length]);

  // Small delay before the trophy so the last pair is seen turning green
  // rather than being covered the instant it matches.
  useEffect(() => {
    if (!complete) { setShowResult(false); return; }
    const t = setTimeout(() => setShowResult(true), 800);
    return () => clearTimeout(t);
  }, [complete]);

  if (!game) {
    return <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">Loading…</div>;
  }

  const { cols } = MEMORY_DIFFICULTY[game.difficulty] ?? MEMORY_DIFFICULTY.Easy;

  const onCardClick = (idx: number) => {
    if (lockRef.current) return;
    if (flipped.includes(idx) || matched.includes(idx)) return;
    if (flipped.length === 2) return;

    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length !== 2) return;

    lockRef.current = true;
    setMoves((m) => m + 1);
    const [a, b] = next;
    if (cards[a].emoji === cards[b].emoji) {
      setTimeout(() => {
        setMatched((prev) => [...prev, a, b]);
        setFlipped([]);
        lockRef.current = false;
      }, 400);
    } else {
      // Long enough to register both faces before they turn back.
      setTimeout(() => {
        setFlipped([]);
        lockRef.current = false;
      }, 900);
    }
  };

  const pairsFound = matched.length / 2;
  const totalPairs = cards.length / 2;

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={back} className="mb-3 flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{game.title}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">{formatTime(seconds)}</span>
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">
              {pairsFound}/{totalPairs} pairs
            </span>
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">{moves} moves</span>
            <Button size="sm" variant="outline" onClick={() => setupBoard(game)}
              className="border-white/10 bg-transparent text-white hover:bg-white/5">
              <RotateCcw className="mr-1 h-4 w-4" /> Restart
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cards.map((card, i) => (
            <MemoryCard
              key={card.id}
              emoji={card.emoji}
              flipped={flipped.includes(i)}
              matched={matched.includes(i)}
              onClick={() => onCardClick(i)}
            />
          ))}
        </div>
      </div>

      {showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-8 text-center">
            <button onClick={back} className="absolute right-4 top-4 text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Trophy className="mx-auto mb-4 h-14 w-14 text-[#D4AF37]" />
            <h2 className="text-2xl font-bold text-white">All matched!</h2>
            <p className="mt-2 text-white/60">You found all {totalPairs} pairs.</p>
            <div className="mt-4 flex justify-center gap-6 text-sm">
              <div>
                <div className="text-lg font-bold text-white">{formatTime(seconds)}</div>
                <div className="text-white/40">Time</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white">{moves}</div>
                <div className="text-white/40">Moves</div>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <Button onClick={() => setupBoard(game)} variant="outline"
                className="flex-1 border-white/10 bg-transparent text-white hover:bg-white/5">
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
