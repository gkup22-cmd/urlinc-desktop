import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, X as XIcon, Circle, Film } from "lucide-react";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

const WARGAMES_DIALOGUE = [
  { speaker: "Stephen Falken", line: "Did you ever play tic-tac-toe?" },
  { speaker: "Jennifer", line: "Yeah, of course." },
  { speaker: "Stephen Falken", line: "But you don't anymore." },
  { speaker: "Jennifer", line: "No." },
  { speaker: "Stephen Falken", line: "Why?" },
  { speaker: "Jennifer", line: "Because it's a boring game. It's always a tie." },
  {
    speaker: "Stephen Falken",
    line: "Exactly. There's no way to win. The game itself is pointless! But back at the war room, they believe you can win a nuclear war. That there can be \"acceptable losses.\"",
  },
];

export default function TicTacToe() {
  const [, setLocation] = useLocation();
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");

  const winner = getWinner(board);
  const isDraw = !winner && board.every((c) => c);

  const play = (i: number) => {
    if (board[i] || winner) return;
    const next = [...board];
    next[i] = turn;
    setBoard(next);
    setTurn(turn === "X" ? "O" : "X");
  };

  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn("X");
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={() => setLocation("/photos?tab=games")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="flex flex-col items-center justify-center gap-6 p-6 pt-12">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-white">Tic-Tac-Toe</h1>
          <p className="text-xs text-white/30 flex items-center justify-center gap-1">
            <Film className="h-3 w-3" /> Two players, one grid — inspired by <em>WarGames</em> (1983)
          </p>
        </div>

        {winner ? (
          <p className="text-lg text-[#D4AF37]">{winner} wins!</p>
        ) : isDraw ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-lg text-white/60">It&apos;s a draw.</p>

            {/* WarGames dialogue card */}
            <div className="max-w-sm w-full rounded-xl border border-white/8 bg-[#1A1A1A] p-5 space-y-3">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-white/30 mb-4">
                WarGames · 1983
              </p>
              {WARGAMES_DIALOGUE.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-xs font-semibold text-white/40 w-28 shrink-0 pt-0.5 leading-tight">
                    {d.speaker}
                  </span>
                  <span className={`text-sm leading-snug ${i === WARGAMES_DIALOGUE.length - 1 ? "text-[#D4AF37]/90 italic" : "text-white/70"}`}>
                    {d.line}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-white/60">
            Turn: <span className="font-semibold text-white">{turn}</span>
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {board.map((cell, i) => (
            <button
              key={i}
              onClick={() => play(i)}
              className="flex h-24 w-24 items-center justify-center rounded-xl border border-white/10 bg-[#1A1A1A] transition hover:bg-white/5"
            >
              {cell === "X" && <XIcon className="h-10 w-10 text-[#3B82F6]" />}
              {cell === "O" && <Circle className="h-9 w-9 text-[#D4AF37]" />}
            </button>
          ))}
        </div>

        <Button onClick={reset} variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/5">
          <RotateCcw className="mr-1 h-4 w-4" /> New Game
        </Button>
      </main>
    </div>
  );
}
