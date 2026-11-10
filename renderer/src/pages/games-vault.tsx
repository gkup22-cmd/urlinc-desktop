import { useLocation } from "wouter";
import { ArrowLeft, Key } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const VAULT_GAMES = [
  {
    id: "puzzle",
    emoji: "🧩",
    title: "Jigsaw Puzzles",
    tagline: "Piece it all together",
    description: "Custom photo jigsaw puzzles at various difficulty levels.",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    titleColor: "text-emerald-400",
  },
  {
    id: "seek-find",
    emoji: "🔍",
    title: "Seek & Find",
    tagline: "Hunt for hidden objects",
    description: "Scan real photos for hidden items before time runs out.",
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    titleColor: "text-sky-400",
  },
  {
    id: "slide",
    emoji: "🎛️",
    title: "Sliding Puzzle",
    tagline: "Slide your way to the solution",
    description: "Classic tile-sliding challenge using your own photos.",
    border: "border-orange-500/30",
    bg: "bg-orange-500/10",
    titleColor: "text-orange-400",
  },
  {
    id: "memory",
    emoji: "🃏",
    title: "Memory Match",
    tagline: "Flip and match the pairs",
    description: "Find matching cards before the clock runs out.",
    border: "border-pink-500/30",
    bg: "bg-pink-500/10",
    titleColor: "text-pink-400",
  },
  {
    id: "word-search",
    emoji: "🔤",
    title: "Word Search",
    tagline: "Find every hidden word",
    description: "Letters in every direction — find them all to win.",
    border: "border-indigo-500/30",
    bg: "bg-indigo-500/10",
    titleColor: "text-indigo-400",
  },
  {
    id: "speedsort",
    emoji: "⚡",
    title: "Speed Sort",
    tagline: "Sort them before the clock runs out",
    description: "Two buckets. A stack of items. A few seconds each. How fast are you?",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/10",
    titleColor: "text-cyan-400",
  },
  {
    id: "caption-duel",
    emoji: "📸",
    title: "Caption Duel",
    tagline: "Send a photo — dare someone to caption it",
    description: "Pick the perfect shot and challenge a friend. First caption wins the duel.",
    border: "border-purple-500/30",
    bg: "bg-purple-500/10",
    titleColor: "text-purple-400",
  },
  {
    id: "movie-bracket",
    emoji: "🎬",
    title: "Movie Night Bracket",
    tagline: "Eliminate until one survives",
    description: "Nominate movies, take turns cutting them — last title standing is tonight's pick.",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    titleColor: "text-amber-400",
  },
] as const;

// Speed levels: index 0 = slowest, 4 = fastest
const SPEED_TICKS = [220, 130, 70, 38, 18] as const;

const SNAKE_COLORS = [
  { head: "#4ade80", body: "#86efac", accent: "accent-green-400"  },
  { head: "#60a5fa", body: "#93c5fd", accent: "accent-blue-400"   },
  { head: "#fbbf24", body: "#fde68a", accent: "accent-amber-400"  },
  { head: "#c084fc", body: "#e9d5ff", accent: "accent-purple-400" },
] as const;

// --- Ambient decorative snake -------------------------------------------
const CELL = 16;
const LEN  = 18;

function VaultSnake({
  mainRef,
  tickMs,
  headColor,
  bodyColor,
}: {
  mainRef: React.RefObject<HTMLElement>;
  tickMs: number;
  headColor: string;
  bodyColor: string;
}) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const tickRef      = useRef(tickMs);
  const headColorRef = useRef(headColor);
  const bodyColorRef = useRef(bodyColor);
  const loopTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { tickRef.current      = tickMs;     }, [tickMs]);
  useEffect(() => { headColorRef.current = headColor;  }, [headColor]);
  useEffect(() => { bodyColorRef.current = bodyColor;  }, [bodyColor]);

  useEffect(() => {
    const setup = setTimeout(() => {
      const canvas = canvasRef.current;
      const main   = mainRef.current;
      if (!canvas || !main) return;

      const rect = main.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      canvas.width  = W;
      canvas.height = H;

      const ctx  = canvas.getContext("2d")!;
      const COLS = Math.floor(W / CELL);
      const ROWS = Math.floor(H / CELL);

      // Build walkable grid + collect card rects for clipping
      const blocked   = new Uint8Array(COLS * ROWS);
      const cardRects: { x: number; y: number; w: number; h: number }[] = [];

      main.querySelectorAll("[data-vault-card]").forEach((el) => {
        const cr = el.getBoundingClientRect();
        const lx = cr.left - rect.left;
        const ly = cr.top  - rect.top;
        cardRects.push({ x: lx, y: ly, w: cr.width, h: cr.height });

        // Mark cells covered by this card as blocked (3 px shrink keeps gutter cells free)
        const c0 = Math.ceil ((lx + 3) / CELL);
        const r0 = Math.ceil ((ly + 3) / CELL);
        const c1 = Math.floor((lx + cr.width  - 3) / CELL);
        const r1 = Math.floor((ly + cr.height - 3) / CELL);
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++)
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS)
              blocked[r * COLS + c] = 1;
      });

      const walkable = (c: number, r: number) =>
        c >= 0 && c < COLS && r >= 0 && r < ROWS && !blocked[r * COLS + c];

      // Find a walkable start
      let sx = 0, sy = 0;
      outer:
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (walkable(c, r)) { sx = c; sy = r; break outer; }

      let body: [number, number][] = Array.from({ length: LEN }, () => [sx, sy]);
      let dx = 1, dy = 0;

      // Clip region builder: full canvas minus card areas (even-odd rule)
      function buildClip() {
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        cardRects.forEach(({ x, y, w, h }) => ctx.rect(x, y, w, h));
      }

      function step() {
        const [hx, hy] = body[0];
        const fwd = walkable(hx + dx, hy + dy);

        if (fwd && Math.random() > 0.18) {
          body = [[hx + dx, hy + dy], ...body.slice(0, LEN - 1)];
          return;
        }

        const dirs = ([
          [1, 0], [-1, 0], [0, 1], [0, -1],
        ] as [number, number][]).filter(
          ([a, b]) => !(a === -dx && b === -dy) && walkable(hx + a, hy + b),
        );

        if (dirs.length) {
          const fwdDir = dirs.find(([a, b]) => a === dx && b === dy);
          const turns  = dirs.filter(([a, b]) => !(a === dx && b === dy));
          const [ndx, ndy] =
            !fwd || Math.random() < 0.35
              ? turns.length
                ? turns[Math.floor(Math.random() * turns.length)]
                : dirs[0]
              : fwdDir ?? dirs[0];
          dx = ndx; dy = ndy;
          body = [[hx + dx, hy + dy], ...body.slice(0, LEN - 1)];
        } else {
          dx = -dx; dy = -dy;
          if (walkable(hx + dx, hy + dy))
            body = [[hx + dx, hy + dy], ...body.slice(0, LEN - 1)];
        }
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);

        // Clip: only paint in the gutters — cards are explicitly cut out
        ctx.save();
        buildClip();
        ctx.clip("evenodd");

        body.forEach(([x, y], i) => {
          const t = 1 - i / LEN;
          const r = (CELL / 2 - 1) * (0.5 + 0.5 * t);
          ctx.globalAlpha = 0.12 + t * 0.55;
          ctx.fillStyle   = i === 0 ? headColorRef.current : bodyColorRef.current;
          ctx.beginPath();
          ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, r, 0, Math.PI * 2);
          ctx.fill();
        });

        // Eyes on the head
        const [hx, hy] = body[0];
        const cx = hx * CELL + CELL / 2;
        const cy = hy * CELL + CELL / 2;
        ctx.fillStyle   = "#fff";
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(cx + dx * 3 + dy * 2, cy + dy * 3 - dx * 2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + dx * 3 - dy * 2, cy + dy * 3 + dx * 2, 1.5, 0, Math.PI * 2); ctx.fill();

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Recursive setTimeout reads tickRef each iteration → speed changes instantly
      function loop() {
        step();
        draw();
        loopTimer.current = setTimeout(loop, tickRef.current);
      }
      loop();
    }, 250);

    return () => {
      clearTimeout(setup);
      if (loopTimer.current) clearTimeout(loopTimer.current);
    };
  }, []); // intentionally empty — speed handled via tickRef

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0, marginTop: 0 }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
// -------------------------------------------------------------------------

export default function GamesVault() {
  const [, setLocation] = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [speed, setSpeed] = useState(() => Number(localStorage.getItem("snake_speed") ?? "3") || 3);
  const [snakeOn, setSnakeOn] = useState(() => localStorage.getItem("snake_on") !== "false");
  const [colorIdx, setColorIdx] = useState(() => Number(localStorage.getItem("snake_color") ?? "0") || 0);

  const toggleSnake = () => {
    setSnakeOn((prev) => {
      const next = !prev;
      localStorage.setItem("snake_on", String(next));
      if (next) {
        setColorIdx((i) => {
          const n = (i + 1) % SNAKE_COLORS.length;
          localStorage.setItem("snake_color", String(n));
          return n;
        });
      }
      return next;
    });
  };

  const colors = SNAKE_COLORS[colorIdx];

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-3">
        <button
          onClick={() => setLocation("/photos?tab=games")}
          className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main
        ref={mainRef}
        className="relative mx-auto w-full max-w-4xl flex-1 px-6 py-14 space-y-12"
      >
        {snakeOn && (
          <VaultSnake
            mainRef={mainRef as React.RefObject<HTMLElement>}
            tickMs={SPEED_TICKS[speed - 1]}
            headColor={colors.head}
            bodyColor={colors.body}
          />
        )}

        <div className="relative z-10 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Key className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold tracking-widest uppercase text-amber-400">
              URLinc Games Vault
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">You found it.</h1>
          <p className="text-white/40 text-sm max-w-sm mx-auto leading-relaxed">
            Original games — made for us. Pick one and play.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {VAULT_GAMES.map((game) => (
            <button
              key={game.id}
              data-vault-card
              onClick={() => setLocation(`/games-vault/${game.id}`)}
              className={`text-left rounded-xl border p-6 space-y-2 hover:scale-[1.02] active:scale-[0.99] transition-transform ${game.bg} ${game.border}`}
            >
              <div className="text-4xl mb-3">{game.emoji}</div>
              <h2 className={`text-lg font-bold ${game.titleColor}`}>{game.title}</h2>
              <p className="text-xs font-medium text-white/60">{game.tagline}</p>
              <p className="text-xs text-white/35 leading-relaxed pt-1">{game.description}</p>
            </button>
          ))}
        </div>

        {/* Snake controls */}
        <div className="relative z-10 flex items-center justify-center gap-4 pb-2">
          <span className="text-base select-none" title="Slower">🐢</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={speed}
            onChange={(e) => { const v = Number(e.target.value); setSpeed(v); localStorage.setItem("snake_speed", String(v)); }}
            className={`w-28 cursor-pointer ${snakeOn ? colors.accent : "accent-white/20"}`}
            aria-label="Snake speed"
          />
          <span className="text-base select-none" title="Faster">⚡</span>

          <button
            onClick={toggleSnake}
            title={snakeOn ? "Turn snake off" : "Turn snake on (new color)"}
            className="ml-2 flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs transition-colors hover:border-white/30"
            style={{
              background: snakeOn ? `${colors.head}22` : "transparent",
              borderColor: snakeOn ? `${colors.head}55` : undefined,
            }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full transition-colors"
              style={{ background: snakeOn ? colors.head : "#ffffff22" }}
            />
            <span className="text-white/50">{snakeOn ? "on" : "off"}</span>
          </button>
        </div>
      </main>
    </div>
  );
}
