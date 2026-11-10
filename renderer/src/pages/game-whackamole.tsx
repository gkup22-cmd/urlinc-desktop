import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";

// Ported from the hunt-link-quest Base44 project, logic unchanged. Both
// intervals already clean up on unmount, so nothing needed guarding here.
const HOLE_COUNT = 9;
const GAME_SECONDS = 30;

export default function WhackAMole() {
  const [, setLocation] = useLocation();
  const [active, setActive] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [running, setRunning] = useState(false);
  // Stops one mole being hit repeatedly in the moment before it moves.
  const justHitRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const moleInterval = setInterval(() => {
      setActive(Math.floor(Math.random() * HOLE_COUNT));
      justHitRef.current = false;
    }, 800);
    return () => clearInterval(moleInterval);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          setRunning(false);
          setActive(null);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const start = () => {
    setScore(0);
    setTimeLeft(GAME_SECONDS);
    setActive(null);
    setRunning(true);
  };

  const whack = (i: number) => {
    if (!running || i !== active || justHitRef.current) return;
    justHitRef.current = true;
    setScore((s) => s + 1);
    setActive(null);
  };

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={() => setLocation("/photos?tab=games")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="flex flex-col items-center justify-center gap-6 p-6 pt-12">
        <h1 className="text-2xl font-bold text-white">Whack-a-Mole</h1>

        <div className="flex gap-4 text-sm">
          <span className="rounded-full bg-[#1E293B] px-3 py-1 text-white/80">Score {score}</span>
          <span className="rounded-full bg-[#1E293B] px-3 py-1 text-white/80">Time {timeLeft}s</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: HOLE_COUNT }).map((_, i) => (
            <button
              key={i}
              onClick={() => whack(i)}
              aria-label={`Hole ${i + 1}`}
              className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-[#1A1A1A]"
            >
              {active === i && running && (
                <div className="h-14 w-14 rounded-full bg-[#D4AF37] shadow-lg shadow-[#D4AF37]/30" />
              )}
            </button>
          ))}
        </div>

        {!running && timeLeft === 0 && (
          <p className="text-lg text-[#D4AF37]">Final score: {score}</p>
        )}

        <Button onClick={start} className="bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90">
          <RotateCcw className="mr-1 h-4 w-4" /> {running ? "Restart" : "Start Game"}
        </Button>
      </main>
    </div>
  );
}
