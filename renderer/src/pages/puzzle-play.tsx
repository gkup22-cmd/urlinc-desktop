import { useState, useEffect, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import PuzzlePiece from "@/components/puzzle-piece";
import {
  TAB, generateJigsawEdges, hashSeed, buildPieceIds, shuffle,
  DIFFICULTY_GRID, type Difficulty,
} from "@/lib/jigsawShapes";
import { ArrowLeft, Trophy, RotateCcw, X, Maximize, Minimize, Sun, Eye, EyeOff, Layers } from "lucide-react";

type PuzzleGame = {
  id: number;
  title: string;
  imageUrl: string;
  difficulty: Difficulty;
  rows: number;
  cols: number;
};

const DIFFICULTIES = Object.keys(DIFFICULTY_GRID) as Difficulty[];

// Full-screen jigsaw play surface, ported from the hunt-link-quest Base44
// project. The board, tray, drag handling and completion dialog are unchanged;
// what differs is the shell -- react-router's useParams/useNavigate become
// wouter's useRoute/useLocation, and the single Base44 entity fetch becomes a
// react-query call against /api/puzzle-games/:id.
//
// Deliberately renders without the app Layout: the puzzle wants the whole
// viewport, and a sidebar beside a drag-and-drop board is a hazard rather than
// a convenience.
export default function PuzzlePlay() {
  const [, params] = useRoute("/puzzle/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const bracketId = new URLSearchParams(window.location.search).get("bracketId");
  const isBracketMode = id === "bracket";

  const { data: game, isError, error } = useQuery<PuzzleGame>({
    queryKey: ["puzzle-game", id, bracketId],
    enabled: !!id,
    retry: false,
    queryFn: async () => {
      if (isBracketMode) {
        const res = await fetch(`/api/movie-brackets/${bracketId}/challenge-puzzle`, { credentials: "include" });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`${res.status}: ${body}`);
        }
        return res.json();
      }
      const res = await fetch(`/api/puzzle-games/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load that puzzle");
      return res.json();
    },
  });

  const [placedIds, setPlacedIds] = useState<Set<number>>(new Set());
  const [trayIds, setTrayIds] = useState<number[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const bracketResultPosted = useRef(false);
  const back = () => setLocation(bracketId ? `/movie-bracket/${bracketId}` : "/games-vault");

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

  // Re-cutting the same picture at another size is a per-session choice, not
  // an edit -- changing it here doesn't rewrite the saved puzzle, so the level
  // it was created at is still what it opens at next time.
  const [levelOverride, setLevelOverride] = useState<Difficulty | null>(null);
  const [brightness, setBrightness] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem("puzzle-prefs") ?? "{}").brightness ?? 1; } catch { return 1; }
  });
  // guideOpacity: 0 = guide fully hidden, 1 = guide at full brightness.
  // Default 0.4 gives a faint but readable ghost behind the board.
  const [guideOpacity, setGuideOpacity] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem("puzzle-prefs") ?? "{}").guideOpacity ?? 0.4; } catch { return 0.4; }
  });
  // The faded picture behind the board is a hint. Expert is where you're
  // least likely to want one, so it starts off there -- but it stays a
  // toggle, since "hardest" and "no help at all" aren't the same choice.
  const [ghostOverride, setGhostOverride] = useState<boolean | null>(null);
  const grid = levelOverride ? DIFFICULTY_GRID[levelOverride] : null;
  const rows = grid ? grid.rows : game && Number(game.rows) > 0 ? Number(game.rows) : 1;
  const cols = grid ? grid.cols : game && Number(game.cols) > 0 ? Number(game.cols) : 1;
  const activeLevel: Difficulty | null = levelOverride ?? game?.difficulty ?? null;
  const showGhost = ghostOverride ?? activeLevel !== "Expert";

  useEffect(() => {
    if (!game?.imageUrl) return;
    const img = new Image();
    img.onload = () => setImgAspect(img.naturalWidth / img.naturalHeight);
    img.src = game.imageUrl;
  }, [game?.imageUrl]);

  // Rebuild the board during render rather than in an effect.
  //
  // An effect runs after the render that changed rows/cols, so for one frame
  // the grid was already the new size while the tray still held the old piece
  // ids. Shrinking 4x4 to 3x3 then asked for piece 15 of a 9-piece board,
  // which resolved to row 5 of a 3-row grid, read undefined out of the edge
  // table and took the whole page down. Growing never crashed, because every
  // old id is still valid in a bigger grid -- hence it only ever broke going
  // down. Setting state during render is React's documented way to reset
  // state when a value changes, and it lands before anything is drawn.
  const gridKey = `${game?.id ?? "none"}:${rows}x${cols}`;
  const [builtFor, setBuiltFor] = useState<string | null>(null);
  if (game && builtFor !== gridKey) {
    setBuiltFor(gridKey);
    setTrayIds(shuffle(buildPieceIds(rows, cols)));
    setPlacedIds(new Set());
  }

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
      // Snap each cell to a whole number of pixels that also survives the
      // piece overhang.
      //
      // Every piece draws the whole picture and windows onto its own cell, so
      // all cells must agree about where the image sits. A board sized to the
      // picture's aspect gives fractional cells -- 965px across 6 columns is
      // 160.83 -- and the browser rounds each independently, so neighbours
      // land a fraction of a pixel apart. Invisible on a photo, obvious on a
      // straight line, which is why a cinema marquee showed it up.
      //
      // Integer cells alone aren't enough: a piece is drawn at 1 + 2*TAB of
      // its cell so its tabs can overhang, and 140% of an integer is usually
      // fractional again. Snapping to a multiple of 1/TAB (5) makes both the
      // cell and the overhang whole. That the artefact came and went as the
      // difficulty changed is the giveaway -- some grids happen to divide
      // cleanly, others don't.
      const step = Math.round(1 / TAB);
      const cellW = Math.max(step, Math.floor(width / cols / step) * step);
      const cellH = Math.max(step, Math.floor(height / rows / step) * step);
      setBoardSize({ width: cellW * cols, height: cellH * rows });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgAspect, cols, rows]);

  // Seeded from the puzzle's id so the same board always cuts the same way.
  const edges = useMemo(() => {
    if (!game) return null;
    return generateJigsawEdges(rows, cols, hashSeed(game.id));
  }, [game, rows, cols]);

  // Persist display preferences so they survive page reloads and future puzzles.
  useEffect(() => {
    try { localStorage.setItem("puzzle-prefs", JSON.stringify({ brightness, guideOpacity })); } catch { /* storage unavailable */ }
  }, [brightness, guideOpacity]);

  // Compute complete before any early returns so the useEffect below is
  // always called unconditionally — React's rules of hooks require every hook
  // to be called on every render regardless of loading/error state.
  const total = rows * cols;
  const complete = placedIds.size === total;

  useEffect(() => {
    if (!complete || !bracketId || bracketResultPosted.current) return;
    bracketResultPosted.current = true;
    void fetch(`/api/movie-brackets/${bracketId}/puzzle-result`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "puzzle", completed: true, timeMs: null }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  if (isError) {
    const errMsg = (error as Error | null)?.message ?? "Unknown error";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-8 text-center text-black">
        <span className="text-5xl">🧩</span>
        <h2 className="text-xl font-bold">Puzzle failed to load</h2>
        <p className="max-w-xs text-sm text-black/60">{errMsg}</p>
        <button onClick={back} className="rounded-lg bg-black px-6 py-2 text-sm text-white hover:bg-black/80">Go back</button>
      </div>
    );
  }

  if (!game || !edges) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white p-8 text-center text-black">
        <span className="text-5xl">🧩</span>
        <p className="text-lg font-semibold">Loading puzzle…</p>
      </div>
    );
  }

  const { imageUrl, title } = game;
  const cellAspect = imgAspect ? (imgAspect * rows) / cols : 1;
  const TRAY_H = 76;
  const TRAY_W = Math.max(40, Math.min(160, TRAY_H * cellAspect));

  const onPieceDown = (pid: number, e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — some environments report no active pointer yet
    }
    setDragId(pid);
    setDragPos({ x: e.clientX, y: e.clientY });
  };
  const onPieceMove = (pid: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (dragId !== pid) return;
    setDragPos({ x: e.clientX, y: e.clientY });
  };
  const onPieceUp = (pid: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (dragId !== pid) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slot = el?.closest<HTMLElement>("[data-slot-index]");
    const slotIndex = slot ? Number(slot.dataset.slotIndex) : null;
    if (slotIndex === pid && !placedIds.has(pid)) {
      setPlacedIds((prev) => new Set(prev).add(pid));
      setTrayIds((prev) => prev.filter((p) => p !== pid));
    }
    setDragId(null);
  };

  const reset = () => {
    setTrayIds(shuffle(buildPieceIds(rows, cols)));
    setPlacedIds(new Set());
  };

  const displayControls = (
    <>
      <label className="flex items-center gap-1.5 text-white/50" title="Brightness of the puzzle artwork">
        <Sun className="h-4 w-4 shrink-0" />
        <input
          type="range" min={0.6} max={2} step={0.05}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="w-20 accent-white/70"
        />
      </label>
      <Button
        size="sm" variant="outline"
        onClick={() => setGhostOverride(!showGhost)}
        title={showGhost ? "Hide the picture behind the board" : "Show the picture behind the board"}
        className="border-white/10 bg-transparent text-white hover:bg-white/5"
      >
        {showGhost ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
        Guide
      </Button>
      {showGhost && (
        <label className="flex items-center gap-1.5 text-white/50" title="Guide image brightness">
          <Layers className="h-4 w-4 shrink-0" />
          <input
            type="range" min={0} max={1} step={0.05}
            value={guideOpacity}
            onChange={(e) => setGuideOpacity(Number(e.target.value))}
            className="w-20 accent-white/70"
          />
        </label>
      )}
    </>
  );

  // Changing level rebuilds the board through the effect above.
  const levelPicker = (
    <select
      value={activeLevel ?? ""}
      onChange={(e) => setLevelOverride(e.target.value as Difficulty)}
      className="rounded-md border border-white/10 bg-[#1A1A1A] px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
      title="Change difficulty -- re-cuts this picture, without changing the saved puzzle"
    >
      {DIFFICULTIES.map((d) => (
        <option key={d} value={d}>
          {d} — {DIFFICULTY_GRID[d].rows}×{DIFFICULTY_GRID[d].cols}
        </option>
      ))}
    </select>
  );

  return (
    <div ref={pageRef} className="flex h-screen flex-col overflow-hidden bg-[#121212] text-[#E0E0E0]">
      <div className="shrink-0 border-b border-white/5 px-6 py-2 md:px-10">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={back} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to Games
          </button>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <span className="ml-auto rounded-full bg-[#1E293B] px-3 py-1 text-sm text-white/80">
            {placedIds.size}/{total} placed
          </span>
          {levelPicker}
          {displayControls}
          <Button size="sm" variant="outline" onClick={reset} className="border-white/10 bg-transparent text-white hover:bg-white/5">
            <RotateCcw className="mr-1 h-4 w-4" /> Restart
          </Button>
          <Button size="sm" variant="outline" onClick={toggleFullscreen} className="border-white/10 bg-transparent text-white hover:bg-white/5">
            {isFullscreen ? <Minimize className="mr-1 h-4 w-4" /> : <Maximize className="mr-1 h-4 w-4" />}
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col-reverse gap-2 p-2 md:p-4 lg:flex-row">
        <aside className="flex max-h-44 shrink-0 flex-wrap content-start gap-2 overflow-y-auto rounded-xl border border-white/10 bg-[#1A1A1A] p-3 sm:max-h-52 lg:h-full lg:max-h-none lg:w-56">
          {trayIds.length === 0 && !complete && (
            <p className="w-full self-center text-center text-sm text-white/30">All pieces placed!</p>
          )}
          {trayIds.map((pid) => (
            <div
              key={pid}
              style={{ width: TRAY_W, height: TRAY_H, margin: `${TRAY_H * TAB}px ${TRAY_W * TAB}px` }}
              className="relative"
            >
              <PuzzlePiece
                id={pid}
                rows={rows}
                cols={cols}
                imageUrl={imageUrl}
                edges={edges}
                brightness={brightness}
                className={dragId === pid ? "opacity-0" : ""}
                onPointerDown={(e) => onPieceDown(pid, e)}
                onPointerMove={(e) => onPieceMove(pid, e)}
                onPointerUp={(e) => onPieceUp(pid, e)}
              />
            </div>
          ))}
        </aside>

        <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center">
          <div
            ref={boardRef}
            className="relative grid overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/50"
            style={{
              // content-box so the 1px border sits outside the measurement.
              // Tailwind's default border-box takes the border out of the
              // width, leaving the grid (width - 2) to divide among the
              // columns -- fractional again, which undid the snapping and
              // showed up worst at the left and right edges where the
              // rounding error is largest.
              boxSizing: "content-box",
              width: boardSize.width || "100%",
              height: boardSize.height || "100%",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              backgroundImage: showGhost ? `url(${imageUrl})` : undefined,
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
            }}
          >
            <div
              className="absolute inset-0 bg-black"
              style={{ opacity: showGhost ? 1 - guideOpacity : 1 }}
            />
            {placedIds.size === 0 && (
              <div className="absolute inset-0 z-10 flex items-end justify-center pb-4 pointer-events-none">
                <p className="rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black shadow-lg">
                  👇 Drag pieces from the tray below
                </p>
              </div>
            )}
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} data-slot-index={i} className="relative border border-white/5">
                {placedIds.has(i) && (
                  <PuzzlePiece id={i} rows={rows} cols={cols} imageUrl={imageUrl} edges={edges} brightness={brightness} locked />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {dragId !== null && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: dragPos.x - TRAY_W / 2, top: dragPos.y - TRAY_H / 2, width: TRAY_W, height: TRAY_H }}
        >
          <PuzzlePiece id={dragId} rows={rows} cols={cols} imageUrl={imageUrl} edges={edges} brightness={brightness} dragging />
        </div>
      )}

      {complete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-8 text-center">
            <button onClick={back} className="absolute right-4 top-4 text-white/40 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <Trophy className="mx-auto mb-4 h-14 w-14 text-[#D4AF37]" />
            <h2 className="text-2xl font-bold text-white">Puzzle complete!</h2>
            <p className="mt-2 text-white/60">You placed all {total} pieces.</p>
            <div className="mt-5 text-left">
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-white/40">
                Play again at
              </label>
              {levelPicker}
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={reset} variant="outline" className="flex-1 border-white/10 bg-transparent text-white hover:bg-white/5">
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
