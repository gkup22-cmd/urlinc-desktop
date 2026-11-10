import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";

// Ported from the hunt-link-quest Base44 project. Logic unchanged apart from
// a cancellation guard: playSequence awaits between flashes, so leaving the
// page mid-pattern previously kept setting state on a component that had gone.
const COLORS = [
  { id: 0, base: "bg-green-700",  lit: "bg-green-400" },
  { id: 1, base: "bg-red-700",    lit: "bg-red-400" },
  { id: 2, base: "bg-yellow-600", lit: "bg-yellow-300" },
  { id: 3, base: "bg-blue-700",   lit: "bg-blue-400" },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SimonSays() {
  const [, setLocation] = useLocation();
  const [sequence, setSequence] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const playerIndexRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => () => { aliveRef.current = false; }, []);

  const playSequence = async (seq: number[]) => {
    setIsPlaying(true);
    await delay(500);
    for (const colorId of seq) {
      if (!aliveRef.current) return;
      setActive(colorId);
      await delay(500);
      if (!aliveRef.current) return;
      setActive(null);
      await delay(200);
    }
    if (!aliveRef.current) return;
    setIsPlaying(false);
    playerIndexRef.current = 0;
  };

  const start = () => {
    setGameOver(false);
    setRound(1);
    playerIndexRef.current = 0;
    const first = [Math.floor(Math.random() * 4)];
    setSequence(first);
    void playSequence(first);
  };

  const handleClick = (colorId: number) => {
    if (isPlaying || gameOver || sequence.length === 0) return;
    if (colorId !== sequence[playerIndexRef.current]) {
      setGameOver(true);
      return;
    }
    playerIndexRef.current += 1;
    if (playerIndexRef.current === sequence.length) {
      const next = [...sequence, Math.floor(Math.random() * 4)];
      setSequence(next);
      setRound((r) => r + 1);
      setTimeout(() => void playSequence(next), 600);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={() => setLocation("/photos?tab=games")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="flex flex-col items-center justify-center gap-6 p-6 pt-12">
        <h1 className="text-2xl font-bold text-white">Simon Says</h1>

        {gameOver ? (
          <p className="text-lg text-[#D4AF37]">Game over — you reached round {round}!</p>
        ) : sequence.length > 0 ? (
          <p className="text-white/60">Round {round} {isPlaying ? "— watch closely…" : "— your turn"}</p>
        ) : (
          <p className="text-white/60">Watch the pattern, then repeat it.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => handleClick(c.id)}
              disabled={isPlaying || gameOver || sequence.length === 0}
              aria-label={`Pad ${c.id + 1}`}
              className={`h-28 w-28 rounded-xl border border-white/10 transition disabled:cursor-not-allowed ${
                active === c.id ? c.lit : c.base
              }`}
            />
          ))}
        </div>

        <Button onClick={start} className="bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90">
          <RotateCcw className="mr-1 h-4 w-4" /> {sequence.length === 0 ? "Start Game" : "Restart"}
        </Button>
      </main>
    </div>
  );
}
