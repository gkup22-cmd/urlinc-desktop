import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import { emptyGrid, addRandomTile, move, canMove, type Direction } from "@/lib/game2048";

// Ported from the hunt-link-quest Base44 project, logic unchanged.
const TILE_COLORS: Record<number, string> = {
  0: "bg-white/5 text-transparent",
  2: "bg-[#1E293B] text-white",
  4: "bg-[#25324a] text-white",
  8: "bg-[#3B82F6]/60 text-white",
  16: "bg-[#3B82F6]/80 text-white",
  32: "bg-[#3B82F6] text-white",
  64: "bg-[#2563EB] text-white",
  128: "bg-[#D4AF37]/60 text-black",
  256: "bg-[#D4AF37]/80 text-black",
  512: "bg-[#D4AF37] text-black",
  1024: "bg-[#D4AF37] text-black",
  2048: "bg-[#D4AF37] text-black",
};

export default function Game2048() {
  const [, setLocation] = useLocation();
  const [grid, setGrid] = useState(() => addRandomTile(addRandomTile(emptyGrid())));
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);

  const handleMove = useCallback((direction: Direction) => {
    setGrid((prev) => {
      if (over) return prev;
      const { grid: nextGrid, scoreGained, moved } = move(prev, direction);
      if (!moved) return prev;
      const withTile = addRandomTile(nextGrid);
      setScore((s) => s + scoreGained);
      if (!canMove(withTile)) setOver(true);
      return withTile;
    });
  }, [over]);

  // preventDefault stops the arrow keys scrolling the page under the board.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      };
      if (map[e.key]) {
        e.preventDefault();
        handleMove(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMove]);

  const restart = () => {
    setGrid(addRandomTile(addRandomTile(emptyGrid())));
    setScore(0);
    setOver(false);
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={() => setLocation("/photos?tab=games")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="flex flex-col items-center justify-center gap-6 p-6 pt-10">
        <h1 className="text-2xl font-bold text-white">2048</h1>
        <p className="max-w-md text-center text-sm text-white/50">
          Use your arrow keys (or the buttons below) to slide all tiles at once. When two tiles with the same
          number touch, they merge into one with double the value. Keep merging to reach the 2048 tile — the
          game ends when the board is full and no more moves are possible.
        </p>
        <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">Score {score}</span>

        {over && <p className="text-lg text-[#D4AF37]">Game over!</p>}

        <div className="grid grid-cols-4 gap-2 rounded-xl bg-black/40 p-2">
          {grid.flat().map((v, i) => (
            <div
              key={i}
              className={`flex h-16 w-16 items-center justify-center rounded-lg text-lg font-bold sm:h-20 sm:w-20 sm:text-xl ${TILE_COLORS[v] || "bg-[#D4AF37] text-black"}`}
            >
              {v !== 0 ? v : ""}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div />
          <Button variant="outline" size="icon" onClick={() => handleMove("up")} aria-label="Up" className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <div />
          <Button variant="outline" size="icon" onClick={() => handleMove("left")} aria-label="Left" className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleMove("down")} aria-label="Down" className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => handleMove("right")} aria-label="Right" className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <Button onClick={restart} className="bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90">
          <RotateCcw className="mr-1 h-4 w-4" /> Restart
        </Button>
      </main>
    </div>
  );
}
