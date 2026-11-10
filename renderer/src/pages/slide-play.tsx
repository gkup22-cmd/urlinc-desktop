import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import SlidingTile from "@/components/sliding-tile";
import { shuffleSlidingBoard, getNeighbors, isSolved } from "@/lib/slidingPuzzle";
import { ArrowLeft, Trophy, RotateCcw, X, Maximize, Minimize, Sparkles } from "lucide-react";

type SlideGame = {
  id: number;
  title: string;
  imageUrl: string;
  rows: number;
  cols: number;
};

// Sliding-tile play surface, ported from the hunt-link-quest Base44 project.
// Board logic unchanged; the shell got the usual swap -- wouter for
// react-router, react-query for the entity fetch.
export default function SlidePlay() {
  const [, params] = useRoute("/slide/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const { data: game } = useQuery<SlideGame>({
    queryKey: ["slide-game", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/slide-games/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load that puzzle");
      return res.json();
    },
  });

  const [order, setOrder] = useState<number[]>([]);
  const [emptyPos, setEmptyPos] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [showResult, setShowResult] = useState(false);
  // Every blank position since the shuffle. Reversed, it's a guaranteed path
  // back to solved -- which is what Solve walks, rather than trying to
  // actually solve a 15-puzzle.
  const trailRef = useRef<number[]>([]);
  const aliveRef = useRef(true);

  useEffect(() => () => { aliveRef.current = false; }, []);

  const back = () => setLocation("/games-vault");

  const rows = game && Number(game.rows) > 0 ? Number(game.rows) : 1;
  const cols = game && Number(game.cols) > 0 ? Number(game.cols) : 1;
  const total = rows * cols;
  const complete = order.length > 0 && isSolved(order);

  // Delayed so the final tile is seen sliding into place before the dialog.
  useEffect(() => {
    if (!complete) { setShowResult(false); return; }
    const timer = setTimeout(() => setShowResult(true), 2500);
    return () => clearTimeout(timer);
  }, [complete]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (pageRef.current) {
      void pageRef.current.requestFullscreen();
    }
  };

  useEffect(() => {
    if (!game?.imageUrl) return;
    const img = new Image();
    img.onload = () => setImgAspect(img.naturalWidth / img.naturalHeight);
    img.src = game.imageUrl;
  }, [game?.imageUrl]);

  const shuffle = () => {
    if (!game) return;
    const { order: newOrder, emptyPos: newEmpty, trail } = shuffleSlidingBoard(rows, cols);
    setOrder(newOrder);
    setEmptyPos(newEmpty);
    setMoves(0);
    trailRef.current = trail;
  };

  useEffect(() => {
    if (!game) return;
    shuffle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const aspect = imgAspect || cols / rows;
    const recompute = () => {
      const { width: cw, height: ch } = el.getBoundingClientRect();
      if (!cw || !ch) return;
      let width = cw;
      let height = width / aspect;
      if (height > ch) {
        height = ch;
        width = height * aspect;
      }
      setBoardSize({ width, height });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgAspect, cols, rows]);

  if (!game) {
    return <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">Loading…</div>;
  }

  const { imageUrl, title } = game;

  const onTileClick = (pos: number) => {
    if (complete || isSolving || emptyPos === null) return;
    const neighbors = getNeighbors(emptyPos, rows, cols);
    if (!neighbors.includes(pos)) return;
    const next = [...order];
    [next[pos], next[emptyPos]] = [next[emptyPos], next[pos]];
    setOrder(next);
    setEmptyPos(pos);
    setMoves((m) => m + 1);
    trailRef.current = [...trailRef.current, pos];
  };

  const solve = async () => {
    if (isSolving || complete || emptyPos === null) return;
    const clicks = trailRef.current.slice(0, -1).reverse();
    if (clicks.length === 0) return;
    setIsSolving(true);
    let curOrder = [...order];
    let curEmpty = emptyPos;
    for (const clickPos of clicks) {
      await new Promise((r) => setTimeout(r, 90));
      if (!aliveRef.current) return;
      [curOrder[clickPos], curOrder[curEmpty]] = [curOrder[curEmpty], curOrder[clickPos]];
      curEmpty = clickPos;
      curOrder = [...curOrder];
      setOrder(curOrder);
      setEmptyPos(curEmpty);
      setMoves((m) => m + 1);
    }
    trailRef.current = [total - 1];
    setIsSolving(false);
  };

  const tileW = (boardSize.width || 0) / cols;
  const tileH = (boardSize.height || 0) / rows;

  return (
    <div ref={pageRef} className="flex h-screen flex-col overflow-hidden bg-[#121212] text-[#E0E0E0]">
      <div className="shrink-0 border-b border-white/5 px-6 py-2 md:px-10">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={back} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Games
          </button>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <span className="ml-auto rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">{moves} moves</span>
          <Button size="sm" variant="outline" onClick={shuffle} disabled={isSolving} className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <RotateCcw className="mr-1 h-4 w-4" /> Restart
          </Button>
          <Button size="sm" variant="outline" onClick={() => void solve()} disabled={isSolving || complete} className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <Sparkles className="mr-1 h-4 w-4" /> {isSolving ? "Solving…" : "Solve"}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleFullscreen} className="border-white/10 bg-transparent text-white hover:bg-white/5">
            {isFullscreen ? <Minimize className="mr-1 h-4 w-4" /> : <Maximize className="mr-1 h-4 w-4" />}
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center p-2 md:p-4">
        <div
          className="relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/50"
          style={{
            boxSizing: "content-box",
            width: boardSize.width || "100%",
            height: boardSize.height || "100%",
          }}
        >
          {order.map((pieceId, pos) => {
            // The highest id is the blank -- hidden during play, revealed on solve.
            if (pieceId === total - 1 && !complete) return null;
            const row = Math.floor(pos / cols);
            const col = pos % cols;
            return (
              <SlidingTile
                key={pieceId}
                pieceId={pieceId}
                rows={rows}
                cols={cols}
                imageUrl={imageUrl}
                onClick={() => onTileClick(pos)}
                style={{ left: col * tileW, top: row * tileH, width: tileW, height: tileH }}
              />
            );
          })}
        </div>
      </div>

      {showResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-8 text-center">
            <button onClick={back} className="absolute right-4 top-4 text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Trophy className="mx-auto mb-4 h-14 w-14 text-[#D4AF37]" />
            <h2 className="text-2xl font-bold text-white">Solved!</h2>
            <p className="mt-2 text-white/60">You solved it in {moves} moves.</p>
            <div className="mt-6 flex gap-2">
              <Button onClick={shuffle} variant="outline" className="flex-1 border-white/10 bg-transparent text-white hover:bg-white/5">
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
