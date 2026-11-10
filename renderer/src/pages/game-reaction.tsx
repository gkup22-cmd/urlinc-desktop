import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

type Status = "idle" | "waiting" | "ready" | "clicked" | "tooSoon";

// Ported from the hunt-link-quest Base44 project, logic unchanged apart from
// clearing the pending timer on unmount -- without that, leaving the page mid
// countdown left a timer to fire against a gone component.
export default function ReactionTest() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>("idle");
  const [reactionMs, setReactionMs] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyAtRef = useRef(0);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const start = () => {
    setStatus("waiting");
    setReactionMs(null);
    // Randomised so the wait can't be anticipated -- a fixed delay would just
    // be testing rhythm rather than reaction.
    const delay = 1500 + Math.random() * 2500;
    timeoutRef.current = setTimeout(() => {
      readyAtRef.current = Date.now();
      setStatus("ready");
    }, delay);
  };

  const handleClick = () => {
    if (status === "idle" || status === "clicked" || status === "tooSoon") {
      start();
      return;
    }
    if (status === "waiting") {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStatus("tooSoon");
      return;
    }
    if (status === "ready") {
      const ms = Date.now() - readyAtRef.current;
      setReactionMs(ms);
      setBest((b) => (b === null ? ms : Math.min(b, ms)));
      setStatus("clicked");
    }
  };

  const boxClasses = {
    idle: "bg-[#1E293B]",
    waiting: "bg-red-700",
    ready: "bg-green-600",
    clicked: "bg-[#1E293B]",
    tooSoon: "bg-yellow-700",
  }[status];

  const label = {
    idle: "Click to start",
    waiting: "Wait for green…",
    ready: "Click now!",
    clicked: `Reaction time: ${reactionMs}ms — click to try again`,
    tooSoon: "Too soon! Click to try again",
  }[status];

  return (
    <div className="min-h-screen bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-4 md:px-10">
        <button onClick={() => setLocation("/photos?tab=games")} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="flex flex-col items-center justify-center gap-6 p-6 pt-12">
        <h1 className="text-2xl font-bold text-white">Reaction Test</h1>
        {best !== null && (
          <span className="rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">Best: {best}ms</span>
        )}
        <button
          onClick={handleClick}
          className={`flex h-64 w-full max-w-md items-center justify-center rounded-2xl border border-white/10 text-center text-lg font-semibold text-white transition ${boxClasses}`}
        >
          {label}
        </button>
      </main>
    </div>
  );
}
