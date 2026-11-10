import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { computePath, cellsToWord, type Cell } from "@/lib/wordSearch";
import { formatTime } from "@/lib/polygon";
import { ArrowLeft, Trophy, RotateCcw, X, Check } from "lucide-react";

type WordSearchGame = {
  id: number;
  title: string;
  category: string;
  size: number;
  words: string[];
  grid: string[];
};

const cellKey = (row: number, col: number) => `${row}-${col}`;

// Word search play surface, ported from the hunt-link-quest Base44 project.
// Selection works by dragging from the first letter to the last; the path is
// only ever a straight line, so a diagonal drag snaps to the diagonal rather
// than following the mouse exactly.
export default function WordSearchPlay() {
  const [, params] = useRoute("/wordsearch/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const bracketId = new URLSearchParams(window.location.search).get("bracketId");
  const isBracketMode = id === "bracket";
  const back = () => setLocation(bracketId ? `/movie-bracket/${bracketId}` : "/games-vault");

  const { data: game } = useQuery<WordSearchGame>({
    queryKey: ["wordsearch-game", id, bracketId],
    enabled: !!id,
    queryFn: async () => {
      if (isBracketMode) {
        if (!bracketId) throw new Error("No bracket ID for bracket word search");
        const res = await fetch(`/api/movie-brackets/${bracketId}/challenge-wordsearch`, { credentials: "include" });
        if (!res.ok) throw new Error("Could not load word search for this bracket");
        return res.json();
      }
      const res = await fetch(`/api/wordsearch-games/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load that game");
      return res.json();
    },
  });

  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundCells, setFoundCells] = useState<string[]>([]);
  const [startCell, setStartCell] = useState<Cell | null>(null);
  const [currentPath, setCurrentPath] = useState<Cell[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const selectingRef = useRef(false);
  const bracketResultPosted = useRef(false);

  const words = game?.words ?? [];
  const grid = game?.grid ?? [];
  const complete = words.length > 0 && foundWords.length === words.length;

  useEffect(() => {
    if (complete || !game) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [complete, game]);

  useEffect(() => {
    if (!complete) { setShowResult(false); return; }
    const t = setTimeout(() => setShowResult(true), 600);
    return () => clearTimeout(t);
  }, [complete]);

  useEffect(() => {
    if (!complete || !bracketId || bracketResultPosted.current) return;
    bracketResultPosted.current = true;
    void fetch(`/api/movie-brackets/${bracketId}/puzzle-result`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "wordsearch", completed: true, timeMs: seconds * 1000 }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // Finishing on window mouseup rather than the grid's own handler means
  // releasing outside the board still ends the drag instead of leaving a
  // selection stuck to the cursor.
  useEffect(() => {
    const onUp = () => {
      if (!selectingRef.current) return;
      selectingRef.current = false;
      setCurrentPath((path) => {
        if (path.length > 1) {
          const word = cellsToWord(grid, path);
          const reversed = word.split("").reverse().join("");
          setFoundWords((prevFound) => {
            const match = words.find((w) => (w === word || w === reversed) && !prevFound.includes(w));
            setAttempts((a) => a + 1);
            if (match) {
              setFoundCells((prev) => [...prev, ...path.map((c) => cellKey(c.row, c.col))]);
              return [...prevFound, match];
            }
            return prevFound;
          });
        }
        return [];
      });
      setStartCell(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [grid, words]);

  const reset = () => {
    setFoundWords([]);
    setFoundCells([]);
    selectingRef.current = false;
    setStartCell(null);
    setCurrentPath([]);
    setAttempts(0);
    setSeconds(0);
  };

  if (!game) {
    return <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">Loading…</div>;
  }

  const beginSelection = (row: number, col: number) => {
    if (complete) return;
    selectingRef.current = true;
    setStartCell({ row, col });
    setCurrentPath([{ row, col }]);
  };

  const extendSelection = (row: number, col: number) => {
    if (!selectingRef.current || !startCell) return;
    const path = computePath(startCell, { row, col });
    if (path) setCurrentPath(path);
  };

  const pathKeys = currentPath.map((c) => cellKey(c.row, c.col));
  const accuracy = attempts === 0 ? 100 : Math.round((foundWords.length / attempts) * 100);

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-3 md:px-10">
        <button onClick={back} className="mb-3 flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{game.title}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">{formatTime(seconds)}</span>
            <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">
              {foundWords.length}/{words.length} found
            </span>
            <Button size="sm" variant="outline" onClick={reset}
              className="border-white/10 bg-transparent text-white hover:bg-white/5">
              <RotateCcw className="mr-1 h-4 w-4" /> Restart
            </Button>
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-6 px-6 py-6 md:px-10 lg:grid-cols-[1fr_260px]">
        <div className="flex items-start justify-center">
          <div
            className="inline-grid select-none gap-0.5 rounded-xl border border-white/10 bg-black/40 p-2"
            style={{ gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))` }}
            onMouseLeave={() => { /* drag continues; window mouseup ends it */ }}
          >
            {grid.map((rowStr, row) =>
              rowStr.split("").map((letter, col) => {
                const key = cellKey(row, col);
                const isFound = foundCells.includes(key);
                const inPath = pathKeys.includes(key);
                return (
                  <div
                    key={key}
                    data-row={row}
                    data-col={col}
                    onMouseDown={() => beginSelection(row, col)}
                    onMouseEnter={() => extendSelection(row, col)}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded text-xs font-bold transition-colors sm:h-8 sm:w-8 sm:text-sm ${
                      isFound
                        ? "bg-[#22C55E]/30 text-white"
                        : inPath
                          ? "bg-[#3B82F6]/60 text-white"
                          : "text-white/70 hover:bg-white/5"
                    }`}
                  >
                    {letter}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        <aside className="space-y-2 rounded-xl border border-white/10 bg-[#1A1A1A] p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">
            Find these
          </h3>
          {words.map((w) => {
            const isFound = foundWords.includes(w);
            return (
              <div
                key={w}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
                  isFound ? "bg-[#22C55E]/15 text-white line-through" : "bg-[#121212] text-white/70"
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isFound ? "border-[#22C55E] bg-[#22C55E] text-black" : "border-white/20"}`}>
                  {isFound && <Check className="h-2.5 w-2.5" />}
                </span>
                {w}
              </div>
            );
          })}
          {attempts > 0 && (
            <p className="pt-2 text-xs text-white/30">Accuracy {accuracy}%</p>
          )}
        </aside>
      </div>

      {showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-8 text-center">
            <button onClick={back} className="absolute right-4 top-4 text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Trophy className="mx-auto mb-4 h-14 w-14 text-[#D4AF37]" />
            <h2 className="text-2xl font-bold text-white">All found!</h2>
            <p className="mt-2 text-white/60">You found all {words.length} words.</p>
            <div className="mt-4 flex justify-center gap-6 text-sm">
              <div>
                <div className="text-lg font-bold text-white">{formatTime(seconds)}</div>
                <div className="text-white/40">Time</div>
              </div>
              <div>
                <div className="text-lg font-bold text-white">{accuracy}%</div>
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
  );
}
