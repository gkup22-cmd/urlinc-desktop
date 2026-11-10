import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";

// 15 positions laid out in a triangle:
//          0
//         1 2
//        3 4 5
//       6 7 8 9
//     10 11 12 13 14
// Start: top hole empty, everything else filled.
const INITIAL_PEGS: boolean[] = Array.from({ length: 15 }, (_, i) => i !== 0);

// All valid (from, over, to) jump triples, one per direction × each line.
const JUMPS: [number, number, number][] = [
  // horizontal
  [3,4,5], [5,4,3],
  [6,7,8], [8,7,6], [7,8,9], [9,8,7],
  [10,11,12], [12,11,10], [11,12,13], [13,12,11], [12,13,14], [14,13,12],
  // down-left diagonal (col index constant as row grows)
  [0,1,3], [3,1,0], [1,3,6], [6,3,1], [2,4,7], [7,4,2],
  [3,6,10], [10,6,3], [4,7,11], [11,7,4], [5,8,12], [12,8,5],
  // down-right diagonal (col index grows with row)
  [0,2,5], [5,2,0], [1,4,8], [8,4,1], [2,5,9], [9,5,2],
  [3,7,12], [12,7,3], [4,8,13], [13,8,4], [5,9,14], [14,9,5],
];

const ROW_POSITIONS = [
  [0],
  [1, 2],
  [3, 4, 5],
  [6, 7, 8, 9],
  [10, 11, 12, 13, 14],
];

function jumpsFrom(pegs: boolean[], from: number) {
  return JUMPS.filter(([f, o, t]) => f === from && pegs[f] && pegs[o] && !pegs[t]);
}

function allValidJumps(pegs: boolean[]) {
  return JUMPS.filter(([f, o, t]) => pegs[f] && pegs[o] && !pegs[t]);
}

export default function GamePegSolitaire() {
  const [, setLocation] = useLocation();
  const [pegs, setPegs] = useState<boolean[]>(INITIAL_PEGS);
  const [selected, setSelected] = useState<number | null>(null);
  const [moveCount, setMoveCount] = useState(0);

  const restart = () => {
    setPegs([...INITIAL_PEGS]);
    setSelected(null);
    setMoveCount(0);
  };

  const pegCount = pegs.filter(Boolean).length;
  const valid = allValidJumps(pegs);
  const gameOver = valid.length === 0;
  const won = gameOver && pegCount === 1;

  const destinations = selected !== null
    ? jumpsFrom(pegs, selected).map(([,, t]) => t)
    : [];

  const handleClick = useCallback((pos: number) => {
    if (gameOver) return;

    if (selected === null) {
      if (pegs[pos] && jumpsFrom(pegs, pos).length > 0) setSelected(pos);
      return;
    }

    if (pos === selected) { setSelected(null); return; }

    // Valid jump landing?
    const jump = JUMPS.find(([f, o, t]) => f === selected && t === pos && pegs[f] && pegs[o] && !pegs[t]);
    if (jump) {
      const [f, o, t] = jump;
      setPegs(prev => {
        const next = [...prev];
        next[f] = false; next[o] = false; next[t] = true;
        return next;
      });
      setSelected(null);
      setMoveCount(m => m + 1);
      return;
    }

    // Reselect another peg
    if (pegs[pos] && jumpsFrom(pegs, pos).length > 0) {
      setSelected(pos);
    } else {
      setSelected(null);
    }
  }, [pegs, selected, gameOver]);

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button
          onClick={() => setLocation("/photos?tab=games")}
          className="flex items-center gap-1 text-sm text-white/50 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="flex flex-col items-center gap-6 p-6 pt-10">
        <h1 className="text-2xl font-bold text-white">Peg Solitaire</h1>
        <p className="max-w-sm text-center text-sm text-white/50">
          Jump a peg over a neighbor into an empty hole to remove it. The goal: end with only one peg left.
        </p>

        <div className="flex gap-3">
          <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">
            {pegCount} {pegCount === 1 ? "peg" : "pegs"} left
          </span>
          <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">
            {moveCount} {moveCount === 1 ? "move" : "moves"}
          </span>
        </div>

        {won && (
          <p className="text-lg font-bold text-[#D4AF37]">🎉 You did it! One peg remaining!</p>
        )}
        {gameOver && !won && (
          <p className="text-base text-white/50">No moves left — {pegCount} pegs remaining.</p>
        )}

        <div className="flex flex-col items-center gap-2 py-4 select-none">
          {ROW_POSITIONS.map((positions, rowIdx) => (
            <div key={rowIdx} className="flex gap-2">
              {positions.map((pos) => {
                const isPeg = pegs[pos];
                const isSel = selected === pos;
                const isTarget = destinations.includes(pos);
                const canSelect = isPeg && jumpsFrom(pegs, pos).length > 0;

                let cls = "w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 transition-all duration-150 ";
                if (isPeg) {
                  if (isSel) {
                    cls += "bg-[#D4AF37] border-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.8)] scale-110 cursor-pointer";
                  } else if (canSelect) {
                    cls += "bg-[#7B4A28] border-[#9B6A48] hover:border-[#D4AF37] hover:scale-105 cursor-pointer";
                  } else {
                    cls += "bg-[#5A3820] border-[#7A5840] cursor-not-allowed opacity-60";
                  }
                } else if (isTarget) {
                  cls += "bg-[#D4AF37]/20 border-[#D4AF37]/80 animate-pulse cursor-pointer";
                } else {
                  cls += "bg-white/5 border-white/10 cursor-default";
                }

                return (
                  <button
                    key={pos}
                    onClick={() => handleClick(pos)}
                    className={cls}
                    aria-label={isPeg ? `Peg ${pos}` : `Empty hole ${pos}`}
                    disabled={!isPeg && !isTarget}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {selected !== null && (
          <p className="text-xs text-white/40">
            Click a glowing hole to jump, or click another peg to reselect.
          </p>
        )}

        <Button onClick={restart} className="bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90">
          <RotateCcw className="mr-1 h-4 w-4" /> New Game
        </Button>
      </main>
    </div>
  );
}
