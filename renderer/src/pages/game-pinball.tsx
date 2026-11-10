import { useEffect, useRef, useState, useCallback, Component, ReactNode } from "react";
import { useLocation } from "wouter";

// Error boundary — catches rendering crashes in the edit overlay or game canvas
// and shows a "Something went wrong" card instead of a blank page.
class PinballErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: "#ff007a", fontFamily: "monospace", background: "#0a0a0a", borderRadius: 12, margin: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Something went wrong in the table editor.</p>
          <p style={{ color: "#888", fontSize: 12 }}>{this.state.msg}</p>
          <button
            onClick={() => this.setState({ hasError: false, msg: "" })}
            style={{ marginTop: 16, padding: "8px 16px", background: "#ff007a22", border: "1px solid #ff007a", color: "#ff007a", borderRadius: 6, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Zap, Vault, Loader2, RotateCcw, ArrowLeft, SkipForward, ImagePlus, Maximize2, Minimize2, Eye, EyeOff, Move, Bookmark, FolderOpen, Trash2, Pencil, Check, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// Lazy-loaded game engine — plain JS, no framework deps
// @ts-ignore
import { PinballGame } from "@/game/engine";
// @ts-ignore
import { buildTable } from "@/lib/pinball-tableFactory";
import { MONSTER_MATINEE } from "@/lib/pinball-demo-tables";
import { savePart, removePart, deleteKit, loadKitAssets, generateKitId, listKitSlots } from "@/lib/pinball-parts-db";

interface GameState {
  started: boolean;
  gameOver: boolean;
  score: number;
  ballNum: number;
  totalBalls: number;
  combo: number;
  ballSave: boolean;
  balls: number;
  message: string | null;
  mission: { title: string; progress: number; need: number } | null;
}

interface CrawlData {
  episode: string;
  title: string;
  crawl: string[];
  speed: number;
}

// Crawl duration: 50 seconds (readable pace for 200-280 words)
const CRAWL_DURATION_MS = 50000;

// ── Physics element overlay ───────────────────────────────────────────────────
// Shows every element as a ghost shape. When editMode=true, bumpers/targets/
// saucers/rollovers gain drag handles so they can be repositioned live.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditOverlay({
  table,
  editMode = false,
  overrides = {},
  onMove,
  onDelete,
}: {
  table: any;             // eslint-disable-line @typescript-eslint/no-explicit-any
  editMode?: boolean;
  overrides?: Record<string, { x: number; y: number }>;
  onMove?: (key: string, x: number, y: number) => void;
  onDelete?: (key: string) => void;
}) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const bumpers   = Array.isArray(table.bumpers)    ? table.bumpers    : [];
  const targets   = Array.isArray(table.targets)    ? table.targets    : [];
  const rollovers = Array.isArray(table.rollovers)  ? table.rollovers  : [];
  const ramps     = Array.isArray(table.ramps)      ? table.ramps      : [];
  const rails     = Array.isArray(table.rails)      ? table.rails      : [];
  const saucers   = Array.isArray(table.saucers)    ? table.saucers    : [];
  const slingshots: Array<{ v?: number[][] }> = Array.isArray(table.slingshots) ? table.slingshots : [];
  const flippers  = table.flippers as { left?: { pivotX: number; pivotY: number; length?: number }; right?: { pivotX: number; pivotY: number; length?: number } } | null;

  const pathD = (pts: number[][]) =>
    pts.length >= 2 ? "M " + pts.map((pt) => `${pt[0]} ${pt[1]}`).join(" L ") : "";

  // Convert pointer client coords → SVG canvas space (0–500 × 0–900), clamped.
  const toSvg = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(35, Math.min(450, Math.round((e.clientX - rect.left) * 500 / rect.width))),
      y: Math.max(70, Math.min(710, Math.round((e.clientY - rect.top)  * 900 / rect.height))),
    };
  };

  const onElDown = (e: React.PointerEvent, key: string) => {
    if (!editMode) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = key;
    setDragging(key);
  };
  const onSvgMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !onMove) return;
    const { x, y } = toSvg(e);
    onMove(dragRef.current, x, y);
  };
  const onSvgUp = () => { dragRef.current = null; setDragging(null); };

  // Merge override position over the element's original position
  const pos = (key: string, el: { x: number; y: number }) => overrides[key] ?? el;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 500 900"
      preserveAspectRatio="none"
      style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
        pointerEvents: editMode ? "all" : "none",
        cursor: editMode ? (dragging ? "grabbing" : "crosshair") : "none",
        zIndex: editMode ? 25 : 1,
      }}
      onPointerMove={editMode ? onSvgMove : undefined}
      onPointerUp={editMode ? onSvgUp : undefined}
      onPointerCancel={editMode ? onSvgUp : undefined}
    >
      {/* Bumpers — cyan, draggable */}
      {bumpers.map((b: { x: number; y: number; r: number; label: string }, i: number) => {
        const p  = pos(`b${i}`, b);
        const hot = dragging === `b${i}`;
        return (
          <g key={`b${i}`} style={editMode ? { cursor: "grab" } : undefined}
            onPointerDown={editMode ? (e) => onElDown(e, `b${i}`) : undefined}>
            {editMode && <circle cx={p.x} cy={p.y} r={(b.r || 22) + 20} fill="transparent" />}
            {editMode && <circle cx={p.x} cy={p.y} r={(b.r || 22) + 16} fill="none" stroke="#00f0ff" strokeWidth="1" strokeDasharray="4 4" opacity={hot ? 0.9 : 0.4} />}
            <circle cx={p.x} cy={p.y} r={(b.r || 22) + 10} fill="#00f0ff" opacity={hot ? 0.22 : 0.10} />
            <circle cx={p.x} cy={p.y} r={(b.r || 22) + 3}  fill="none" stroke="#00f0ff" strokeWidth={hot ? 3.5 : 2.5} opacity="0.75" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#00f0ff" fontSize="9" fontWeight="bold" opacity="0.95">{b.label}</text>
          </g>
        );
      })}

      {/* Slingshots — amber triangles, draggable by centroid in edit mode */}
      {slingshots.map((s, i) => {
        const v = s.v;
        if (!v || v.length < 3) return null;
        // Centroid of the triangle
        const cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
        const cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
        const key = `sg${i}`;
        const p = overrides[key] ?? { x: cx, y: cy };
        const dx = p.x - cx;
        const dy = p.y - cy;
        const shiftedPts = v.map((pt: number[]) => [pt[0] + dx, pt[1] + dy]);
        const hot = dragging === key;
        return (
          <g key={key} style={editMode ? { cursor: "grab" } : undefined}
            onPointerDown={editMode ? (e) => onElDown(e, key) : undefined}>
            {editMode && <circle cx={p.x} cy={p.y} r={40} fill="transparent" />}
            <polygon
              points={shiftedPts.map((pt: number[]) => `${pt[0]},${pt[1]}`).join(" ")}
              fill="#ffaa00" opacity={hot ? 0.30 : 0.18}
              stroke="#ffaa00" strokeWidth={hot ? 3.5 : 2.5} strokeOpacity="0.8"
            />
            {editMode && <circle cx={p.x} cy={p.y} r={12} fill="#ffaa00" opacity={hot ? 0.55 : 0.30} />}
            {editMode && <circle cx={p.x} cy={p.y} r={12} fill="none" stroke="#ffaa00" strokeWidth="1.5" strokeDasharray="3 3" opacity={hot ? 1 : 0.6} />}
          </g>
        );
      })}

      {/* Targets — magenta, draggable */}
      {targets.map((t: { x: number; y: number; w: number; angle: number; label: string }, i: number) => {
        const p   = pos(`t${i}`, t);
        const hot = dragging === `t${i}`;
        const hw  = (t.w || 28) / 2;
        const deg = ((t.angle || 0) * 180 / Math.PI).toFixed(1);
        return (
          <g key={`t${i}`} transform={`translate(${p.x},${p.y}) rotate(${deg})`}
            style={editMode ? { cursor: "grab" } : undefined}
            onPointerDown={editMode ? (e) => onElDown(e, `t${i}`) : undefined}>
            {editMode && <rect x={-hw - 14} y={-22} width={(t.w || 28) + 28} height={44} fill="transparent" />}
            <rect x={-hw} y={-9} width={t.w || 28} height={18} fill="#ff007a" opacity={hot ? 0.35 : 0.20} rx="3" />
            <rect x={-hw} y={-9} width={t.w || 28} height={18} fill="none" stroke="#ff007a" strokeWidth={hot ? 3 : 2} opacity="0.75" rx="3" />
            <text x={0} y={4} textAnchor="middle" fill="#ff007a" fontSize="7" fontWeight="bold" opacity="0.9">{t.label}</text>
          </g>
        );
      })}

      {/* Rollovers — dashed white, draggable */}
      {rollovers.map((r: { x: number; y: number; label: string }, i: number) => {
        const p   = pos(`ro${i}`, r);
        const hot = dragging === `ro${i}`;
        return (
          <g key={`ro${i}`} style={editMode ? { cursor: "grab" } : undefined}
            onPointerDown={editMode ? (e) => onElDown(e, `ro${i}`) : undefined}>
            {editMode && <circle cx={p.x} cy={p.y} r={28} fill="transparent" />}
            <circle cx={p.x} cy={p.y} r={13} fill="none" stroke="#ffffff" strokeWidth={hot ? 2.5 : 1.5} opacity="0.5" strokeDasharray="3 3" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#ffffff" fontSize="7" opacity="0.7">{r.label}</text>
          </g>
        );
      })}

      {/* Saucers — purple, draggable */}
      {saucers.map((s: { x: number; y: number; label: string }, i: number) => {
        const p   = pos(`s${i}`, s);
        const hot = dragging === `s${i}`;
        return (
          <g key={`s${i}`} style={editMode ? { cursor: "grab" } : undefined}
            onPointerDown={editMode ? (e) => onElDown(e, `s${i}`) : undefined}>
            {editMode && <circle cx={p.x} cy={p.y} r={38} fill="transparent" />}
            <circle cx={p.x} cy={p.y} r={22} fill="#cc44ff" opacity={hot ? 0.22 : 0.12} />
            <circle cx={p.x} cy={p.y} r={22} fill="none" stroke="#cc44ff" strokeWidth={hot ? 3.5 : 2.5} opacity="0.75" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#cc44ff" fontSize="8" fontWeight="bold" opacity="0.9">{s.label}</text>
          </g>
        );
      })}

      {/* Ramps — dashed orange */}
      {ramps.map((r: { path?: number[][] }, i: number) => {
        const d = pathD(r.path || []);
        return d ? <path key={`ra${i}`} d={d} fill="none" stroke="#ff8800" strokeWidth="3" opacity="0.65" strokeDasharray="7 3" strokeLinecap="round" /> : null;
      })}

      {/* Rails — dashed green, deletable in edit mode */}
      {rails.map((r: { path?: number[][] }, i: number) => {
        const d = pathD(r.path || []);
        if (!d) return null;
        const pts = r.path || [];
        const mid = pts[Math.floor(pts.length / 2)] || pts[0] || [250, 450];
        return (
          <g key={`rl${i}`}>
            <path d={d} fill="none" stroke="#00ff88" strokeWidth="2" opacity="0.60" strokeDasharray="5 3" strokeLinecap="round" />
            {editMode && onDelete && (
              <>
                <path d={d} fill="none" stroke="transparent" strokeWidth="18" style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); onDelete(`rl${i}`); }} />
                <circle cx={mid[0]} cy={mid[1]} r={10} fill="#ff3333" opacity={0.85} style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); onDelete(`rl${i}`); }} />
                <text x={mid[0]} y={mid[1] + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" style={{ pointerEvents: "none" }}>×</text>
              </>
            )}
          </g>
        );
      })}

      {/* Flippers — pink pivot + arm */}
      {flippers?.left && (() => {
        const f = flippers.left!;
        const len = f.length ?? 72;
        return (
          <g key="fl" opacity="0.8">
            <circle cx={f.pivotX} cy={f.pivotY} r={5} fill="#ff007a" />
            <line x1={f.pivotX} y1={f.pivotY} x2={f.pivotX + len * 0.95} y2={f.pivotY - len * 0.22} stroke="#ff007a" strokeWidth="4" strokeLinecap="round" />
          </g>
        );
      })()}
      {flippers?.right && (() => {
        const f = flippers.right!;
        const len = f.length ?? 72;
        return (
          <g key="fr" opacity="0.8">
            <circle cx={f.pivotX} cy={f.pivotY} r={5} fill="#ff007a" />
            <line x1={f.pivotX} y1={f.pivotY} x2={f.pivotX - len * 0.95} y2={f.pivotY - len * 0.22} stroke="#ff007a" strokeWidth="4" strokeLinecap="round" />
          </g>
        );
      })()}

      {/* Legend / instruction bar */}
      <g transform="translate(8, 870)">
        <rect x={0} y={-11} width={484} height={16} fill="#000" opacity="0.55" rx="3" />
        {editMode ? (
          <text x={242} y={1} textAnchor="middle" fill="#ffd740" fontSize="7.5" letterSpacing="0.3">
            Drag bumpers · targets · saucers · rollovers — tap ✓ Apply to rebuild
          </text>
        ) : (
          [
            { col: "#00f0ff", label: "Bumper" },
            { col: "#ffaa00", label: "Sling" },
            { col: "#ff007a", label: "Target/Flipper" },
            { col: "#cc44ff", label: "Saucer" },
            { col: "#ff8800", label: "Ramp" },
            { col: "#00ff88", label: "Rail" },
          ].map((item, i) => (
            <g key={i} transform={`translate(${i * 82}, 0)`}>
              <circle cx={5} cy={0} r={4} fill={item.col} />
              <text x={12} y={4} fill={item.col} fontSize="7.5" fontWeight="bold">{item.label}</text>
            </g>
          ))
        )}
      </g>
    </svg>
  );
}

// ── Apron HUD ─────────────────────────────────────────────────────────────────
// Always-on SVG overlay in the bottom apron corners + drain during play.
// Uses the same 500×900 coordinate space as the canvas — no manual scaling.
function ApronHUD({ gameState }: { gameState: GameState }) {
  const score = (gameState.score || 0).toLocaleString();
  const combo = gameState.combo > 1 ? gameState.combo : null;
  const mission = gameState.mission;

  return (
    <svg viewBox="0 0 500 900" preserveAspectRatio="none"
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <defs>
        <linearGradient id="hgold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd87a" />
          <stop offset="50%" stopColor="#c8a050" />
          <stop offset="100%" stopColor="#7a5010" />
        </linearGradient>
      </defs>

      {/* ── LEFT CORNER — text with dark outline, no box ── */}
      <text x="16" y="800" fill="#c8a050" fontSize="6.5" fontWeight="700" letterSpacing="2" fontFamily="serif"
        stroke="#000" strokeWidth="3" paintOrder="stroke fill">UR · LINC</text>
      <text x="16" y="818" fill="#88c4dc" fontSize="8" letterSpacing="0.8" fontFamily="monospace"
        stroke="#000" strokeWidth="2.5" paintOrder="stroke fill">
        {`BALL ${gameState.ballNum}/${gameState.totalBalls}${gameState.ballSave ? " ⚡" : ""}`}
      </text>
      <text x="16" y="850" fill="url(#hgold)" fontSize="18" fontWeight="900" fontFamily="monospace"
        stroke="#000" strokeWidth="4" paintOrder="stroke fill"
        textLength="108" lengthAdjust="spacingAndGlyphs">{score}</text>
      <text x="16" y="866" fill="#2a2008" fontSize="5.5" letterSpacing="1.5" fontFamily="serif"
        stroke="#000" strokeWidth="2" paintOrder="stroke fill">PINBALL FORGE</text>

      {/* ── RIGHT CORNER — mission + tagline, no box ── */}
      <text x="452" y="800" textAnchor="end" fill="#c8a050" fontSize="6" fontWeight="700" letterSpacing="1.5" fontFamily="serif"
        stroke="#000" strokeWidth="3" paintOrder="stroke fill">TAYLER · MADE</text>
      <text x="452" y="818" textAnchor="end" fill="#d4b860" fontSize="7" letterSpacing="0.3"
        stroke="#000" strokeWidth="2.5" paintOrder="stroke fill" textLength="100" lengthAdjust="spacingAndGlyphs">
        {(mission?.title ?? "READY TO FLIP").toUpperCase().slice(0, 14)}
      </text>
      {mission && (
        <>
          <rect x="356" y="823" width="88" height="4" rx="2" fill="#000" fillOpacity="0.65" />
          <rect x="356" y="823" width={Math.max(2, Math.round(88 * mission.progress / Math.max(mission.need, 1)))} height="4" rx="2" fill="#c8a050" />
          <text x="452" y="837" textAnchor="end" fill="#7a5820" fontSize="6.5"
            stroke="#000" strokeWidth="2" paintOrder="stroke fill">{mission.progress} / {mission.need}</text>
        </>
      )}
      {combo ? (
        <text x="452" y="856" textAnchor="end" fill="#ff007a" fontSize="15" fontWeight="900"
          stroke="#000" strokeWidth="4" paintOrder="stroke fill">×{combo}</text>
      ) : (
        <text x="452" y="856" textAnchor="end" fill="#2a1e08" fontSize="5.5" letterSpacing="1.2"
          stroke="#000" strokeWidth="2" paintOrder="stroke fill">WWW.URLINC.US</text>
      )}

      {/* ── CENTER DRAIN PLATE — horizontal pill ── */}
      <rect x="200" y="869" width="100" height="22" rx="11" fill="#000" fillOpacity="0.70" />
      <rect x="200" y="869" width="100" height="22" rx="11" fill="none" stroke="#c8a050" strokeWidth="0.7" strokeOpacity="0.55" />
      <text x="250" y="879" textAnchor="middle" fill="url(#hgold)" fontSize="8.5" fontWeight="900" fontStyle="italic" fontFamily="serif"
        stroke="#000" strokeWidth="2" paintOrder="stroke fill">UR · Linc</text>
      <text x="250" y="887" textAnchor="middle" fill="#c8a050" fontSize="4" letterSpacing="2" fontFamily="serif" opacity="0.70">TAYLER·MADE</text>
    </svg>
  );
}

function StarWarsCrawl({ data, onSkip }: { data: CrawlData; onSkip: () => void }) {
  const [paused, setPaused] = useState(false);

  // Spacebar toggles pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      onClick={() => setPaused(p => !p)}
      style={{
        position: "fixed", inset: 0,
        background: "#000", overflow: "hidden",
        zIndex: 50, cursor: "pointer", userSelect: "none",
      }}
    >
      {/* Stars */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "55px 55px", opacity: 0.15 }} />

      {/* Top / bottom fades so text cleanly enters and exits */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, background: "linear-gradient(to bottom, #000, transparent)", zIndex: 3 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 140, background: "linear-gradient(to top, #000, transparent)", zIndex: 3 }} />

      {/* Scrolling text — pure vertical, no perspective tilt so every line is readable */}
      <style>{`
        @keyframes crawlScroll {
          from { transform: translateY(100vh); }
          to   { transform: translateY(-350vh); }
        }
      `}</style>
      <div
        onAnimationEnd={onSkip}
        style={{
          position: "absolute",
          left: "10%", right: "10%",
          top: 0,
          animationName: "crawlScroll",
          animationDuration: `${CRAWL_DURATION_MS}ms`,
          animationTimingFunction: "linear",
          animationFillMode: "forwards",
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        <div style={{ textAlign: "center", lineHeight: 2, paddingBottom: "60vh" }}>
          <p style={{ color: "#4fc3f7", fontSize: 14, letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: "1.8em" }}>
            {data.episode}
          </p>
          <h2 style={{ color: "#ffd740", fontSize: 30, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.4em", textShadow: "0 0 24px rgba(255,215,64,0.55)" }}>
            {data.title}
          </h2>
          {data.crawl.map((para, i) => (
            <p key={i} style={{ color: "#e0c97f", fontSize: 18, margin: "0 auto 2em", maxWidth: 680, lineHeight: 1.85 }}>
              {para}
            </p>
          ))}
          <p style={{ color: "#4fc3f7", fontSize: 12, letterSpacing: "0.25em", marginTop: "3em", opacity: 0.45 }}>
            ✦ ART LOADING IN THE BACKGROUND ✦
          </p>
        </div>
      </div>

      {/* Pause overlay */}
      {paused && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "#fff", fontSize: 18, letterSpacing: "0.35em", opacity: 0.75, zIndex: 10 }}>
          ⏸ PAUSED
        </div>
      )}

      {/* Brand label */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", color: "#ff007a", fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", textShadow: "0 0 8px rgba(255,0,122,0.6)", zIndex: 10 }}>
        Pinball Forge
      </div>

      {/* Skip button — stopPropagation so it doesn't also toggle pause */}
      <button
        onClick={(e) => { e.stopPropagation(); onSkip(); }}
        style={{ position: "absolute", bottom: 16, right: 16, zIndex: 10, display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "rgba(17,17,17,0.85)", color: "#9ca3af", fontSize: 12, border: "none", cursor: "pointer" }}
      >
        <SkipForward style={{ width: 12, height: 12 }} /> Skip to Game
      </button>

      {/* Pause hint */}
      <div style={{ position: "absolute", bottom: 20, left: 16, color: "#4b5563", fontSize: 11, zIndex: 10 }}>
        Click or Space to pause
      </div>
    </div>
  );
}

// ── Save / Load ──────────────────────────────────────────────────────────────
interface SavedTable {
  id: string;
  name: string;
  savedAt: number;
  // The full built table object — passed directly to PinballGame on reload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  artDataUrl: string | null;   // original art src (data URL) for re-applying
  artOffset: { x: number; y: number };
}

const SAVE_KEY = "urlinc_pinball_saved_v1";

// ── IndexedDB art store — keeps base64 PNGs out of the 5 MB localStorage cap ─
const IDB_NAME = "urlinc_pinball";
const IDB_STORE = "art";

function openArtDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveArtToIDB(id: string, dataUrl: string): Promise<void> {
  const db = await openArtDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function loadArtFromIDB(id: string): Promise<string | null> {
  try {
    const db = await openArtDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}
async function deleteArtFromIDB(id: string): Promise<void> {
  try {
    const db = await openArtDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

function loadSavedTables(): SavedTable[] {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch { return []; }
}
function persistSavedTables(tables: SavedTable[]): boolean {
  // Strip artDataUrl before writing — art lives in IndexedDB now.
  const stripped = tables.map(({ artDataUrl: _art, ...rest }) => ({ ...rest, artDataUrl: null }));
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(stripped)); return true; } catch { return false; }
}

// One-time migration: move artDataUrl values already in localStorage into IDB.
async function migrateArtToIDB(): Promise<void> {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const tables: SavedTable[] = JSON.parse(raw);
    let changed = false;
    for (const t of tables) {
      if (t.artDataUrl) {
        await saveArtToIDB(t.id, t.artDataUrl);
        t.artDataUrl = null;
        changed = true;
      }
    }
    if (changed) localStorage.setItem(SAVE_KEY, JSON.stringify(tables));
  } catch { /* ignore */ }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function GamePinball() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artInputRef = useRef<HTMLInputElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PinballGame | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pendingTableRef = useRef<{ spec: unknown; themeName: string } | null>(null);
  const pendingArtRef = useRef<Promise<string | null> | null>(null);
  // Set true when user skips crawl before the spec has arrived
  const pendingLaunchRef = useRef(false);
  // Stable ref to launchGame so async fetch handlers can call it
  const launchGameRef = useRef<(() => void) | null>(null);
  // Stores the built table so EditOverlay can read element positions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableRef = useRef<any>(null);
  // Stores the original loaded art image so we can re-render with a different pan offset
  const artImgRef = useRef<HTMLImageElement | null>(null);

  // Parts kit: in-memory image objects passed to the engine, and thumb URLs for the UI
  const partsRef = useRef<Record<string, HTMLImageElement>>({});
  // Each entry: slot name → blob URL for <img> thumbnail display
  const [partsThumbs, setPartsThumbs] = useState<Record<string, string>>({});
  // Stale-load guard: if the table changes while kit is loading async, discard result
  const kitLoadEpochRef = useRef(0);
  // File input for part uploads; uploadingSlotRef names the target slot
  const partsInputRef = useRef<HTMLInputElement>(null);
  const kitFolderInputRef = useRef<HTMLInputElement>(null);
  const kitZipInputRef = useRef<HTMLInputElement>(null);
  const uploadingSlotRef = useRef<string | null>(null);
  const [showPartsKit, setShowPartsKit] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");
  // Flipper image calibration: tilt = natural arm angle in the PNG (radians).
  // The renderer uses parts.flipMeta (if set) over the hard-coded FLIP constant.
  const flipMetaRef = useRef({ px: 75 / 512, py: 72 / 159, len: 430 / 512, tilt: 0.262 }); // default 15°
  const [flipTiltDeg, setFlipTiltDeg] = useState(15);
  const [ballSpeed, setBallSpeed] = useState(1.0);

  const [artOffset, setArtOffset] = useState({ x: 0, y: 0 });
  const [showPan, setShowPan] = useState(false);
  // Tracks the pointer start position + offset at drag start for real-time drag-to-pan
  const dragStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const [savedTables, setSavedTables] = useState<SavedTable[]>(() => loadSavedTables());
  useEffect(() => { void migrateArtToIDB(); }, []);

  const [theme, setTheme] = useState("");
  const [phase, setPhase] = useState<"idle" | "generating" | "crawl" | "playing">("idle");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [generatingMsg, setGeneratingMsg] = useState("Forging your table…");
  const [crawlData, setCrawlData] = useState<CrawlData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [artOnly, setArtOnly] = useState(false);
  const [editElements, setEditElements] = useState(false);
  const [elementOverrides, setElementOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [deletedElements, setDeletedElements] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["bumpers"]));
  const [laneCount, setLaneCount] = useState<null | 0 | 3 | 4 | 5>(null);
  const [laneWord, setLaneWord] = useState("");
  const [includeRamps, setIncludeRamps] = useState(true);
  const [includeRails, setIncludeRails] = useState(false);

  // --- keyboard controls ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!gameRef.current) return;
      const g = gameRef.current;
      const k = e.key.toLowerCase();
      // Left flipper: Z, ArrowLeft, Left Shift
      if (k === "z" || k === "arrowleft" || e.code === "ShiftLeft") {
        e.preventDefault();
        g.setFlipper("left", down);
      }
      // Right flipper: X, ArrowRight, Right Shift
      if (k === "x" || k === "arrowright" || e.code === "ShiftRight") {
        e.preventDefault();
        g.setFlipper("right", down);
      }
      if (k === " " || k === "enter") {
        e.preventDefault();
        g.setPlunger(down);
      }
    };
    const dn = (e: KeyboardEvent) => onKey(e, true);
    const up = (e: KeyboardEvent) => onKey(e, false);
    // Release all flippers if the window loses focus (OS dialog, sticky-keys
    // popup, alt-tab) so the keyup event can't get swallowed by the OS.
    const releaseAll = () => {
      const g = gameRef.current;
      if (!g) return;
      g.setFlipper("left",  false);
      g.setFlipper("right", false);
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseAll);
    };
  }, []);

  // --- gamepad controls ---
  useEffect(() => {
    // btn[4]=LB/L1, btn[6]=LT/L2 → left flipper
    // btn[5]=RB/R1, btn[7]=RT/R2 → right flipper
    // btn[0]=A/Cross, btn[1]=B/Circle → plunger
    const prev: Record<number, { left: boolean; right: boolean; plunger: boolean }> = {};
    let rafId = 0;
    const poll = () => {
      rafId = requestAnimationFrame(poll);
      const g = gameRef.current;
      if (!g) return;
      const pads = navigator.getGamepads?.() ?? [];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad) continue;
        const b = pad.buttons;
        const left    = (b[4]?.pressed || b[6]?.pressed) ?? false;
        const right   = (b[5]?.pressed || b[7]?.pressed) ?? false;
        const plunger = (b[0]?.pressed || b[1]?.pressed) ?? false;
        const p = prev[i] ?? { left: false, right: false, plunger: false };
        if (left    !== p.left)    g.setFlipper("left",  left);
        if (right   !== p.right)   g.setFlipper("right", right);
        if (plunger !== p.plunger) g.setPlunger(plunger);
        prev[i] = { left, right, plunger };
      }
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- cleanup on unmount ---
  useEffect(() => {
    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  // Track fullscreen state changes (e.g. user presses Escape)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      fullscreenRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggleArtOnly = useCallback(() => {
    setArtOnly((prev) => {
      const next = !prev;
      gameRef.current?.setHideElements(next);
      return next;
    });
  }, []);

  // Render img onto a 500×900 offscreen canvas with a pan offset and pass to engine.
  // Using an offscreen canvas means the engine/renderer need no changes — it treats
  // the canvas as an image source via drawImage() which accepts CanvasElement.
  const applyArtWithOffset = useCallback((img: HTMLImageElement, offset: { x: number; y: number }) => {
    if (!gameRef.current) return;
    const oc = document.createElement("canvas");
    oc.width = 500; oc.height = 900;
    const ctx = oc.getContext("2d");
    if (!ctx) return;
    // Cover the main playfield region (x=12 to x=452, width=440) not the full
    // 500px canvas. The rightmost 48px is the shooter lane channel and shouldn't
    // receive art — centering on the full canvas shifts everything left visually.
    const PFX = 12, PFW = 440;
    const scale = Math.max(PFW / (img.naturalWidth || PFW), 900 / (img.naturalHeight || 900));
    const sw = (img.naturalWidth || PFW) * scale;
    const sh = (img.naturalHeight || 900) * scale;
    ctx.drawImage(img, PFX + (PFW - sw) / 2 + offset.x, (900 - sh) / 2 + offset.y, sw, sh);
    // Always include the current parts kit so art re-uploads/pan ops don't clear it
    gameRef.current.setImages({ playfield: oc, parts: getPartsWithMeta() });
  }, []);

  // Apply a loaded art image to the running game.
  // If the src is not already a data URL (blob:, http:, /api/…), we bake it into
  // a canvas webp data URL immediately so saved tables survive page reloads.
  const applyArt = useCallback((imageUrl: string) => {
    if (!gameRef.current) return;
    const store = (img: HTMLImageElement) => {
      artImgRef.current = img;
      applyArtWithOffset(img, artOffset);
    };
    const bakeAndStore = (img: HTMLImageElement) => {
      if (img.src.startsWith("data:")) { store(img); return; }
      try {
        const cvs = document.createElement("canvas");
        cvs.width = 1000; cvs.height = 1800;
        const c = cvs.getContext("2d");
        if (c) {
          const r = Math.max(1000 / img.naturalWidth, 1800 / img.naturalHeight);
          c.drawImage(img, (1000 - img.naturalWidth * r) / 2, (1800 - img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r);
          const dataUrl = cvs.toDataURL("image/webp", 0.82);
          const baked = new Image();
          baked.onload = () => store(baked);
          baked.src = dataUrl;
          return;
        }
      } catch { /* CORS/canvas error — use raw src, save may not persist */ }
      store(img);
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => bakeAndStore(img);
    img.onerror = () => {
      const img2 = new Image();
      img2.onload = () => bakeAndStore(img2);
      img2.src = imageUrl;
    };
    img.src = imageUrl;
  // artOffset intentionally excluded — we want the current offset at load time only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyArtWithOffset]);

  // Re-render art whenever the pan offset changes
  useEffect(() => {
    if (artImgRef.current && gameRef.current) {
      applyArtWithOffset(artImgRef.current, artOffset);
    }
  }, [artOffset, applyArtWithOffset]);

  // Drag handlers for real-time art panning. Pointer coords → canvas space via
  // the displayed canvas width (canvas internal width is always 500px).
  const onPanPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      px: e.clientX, py: e.clientY,
      ox: artOffset.x, oy: artOffset.y,
    };
  }, [artOffset]);

  const onPanPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const scale = (canvasRef.current?.clientWidth ?? 500) / 500;
    const dx = (e.clientX - dragStartRef.current.px) / scale;
    const dy = (e.clientY - dragStartRef.current.py) / scale;
    setArtOffset({ x: dragStartRef.current.ox + dx, y: dragStartRef.current.oy + dy });
  }, []);

  const onPanPointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  // Load an image file chosen by the user and apply it as playfield art
  const handleArtFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (url) applyArt(url);
    };
    reader.readAsDataURL(file);
  }, [applyArt]);

  // Launch the actual game (called after crawl or on skip).
  // Must set phase to "playing" FIRST so React renders the canvas, then wait
  // two animation frames for the DOM to commit before grabbing canvasRef.
  // If spec isn't ready yet (user skipped during placeholder crawl), we flag
  // for auto-launch and briefly show "Completing your table…".
  const launchGame = useCallback(() => {
    const pending = pendingTableRef.current;
    if (!pending) {
      pendingLaunchRef.current = true;
      setGeneratingMsg("Completing your table…");
      setPhase("generating");
      return;
    }
    pendingTableRef.current = null;

    // Switch to playing phase — this mounts the <canvas> element
    setPhase("playing");

    const artPromise = pendingArtRef.current;
    pendingArtRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!canvasRef.current) return;
        gameRef.current?.destroy();
        const table = buildTable(pending.spec, { theme: pending.themeName });
        tableRef.current = table;
        const game = new PinballGame(canvasRef.current, table, {
          onState: (s: GameState) => setGameState(s),
          onGameOver: (score: number) => {
            toast({ title: "Game Over", description: `Final score: ${score.toLocaleString()}` });
          },
        });
        gameRef.current = game;

        if (artPromise) {
          artPromise.then((url) => { if (url) applyArt(url); });
        }
      });
    });
  }, [toast, applyArt]);

  // Keep launchGameRef current so async fetch handlers can trigger launch
  useEffect(() => { launchGameRef.current = launchGame; }, [launchGame]);

  // Helper: fire the art fetch for a known theme label
  const fetchArt = useCallback((label: string, artLaneCount?: null | 0 | 3 | 4 | 5) => {
    pendingArtRef.current = fetch("/api/pinball/generate-art", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, ...(artLaneCount !== undefined ? { laneCount: artLaneCount } : {}) }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { image_url?: string } | null) => d?.image_url ?? null)
      .catch(() => null);
  }, []);

  // --- generate from theme: story crawl starts in ~2s, spec loads in parallel ---
  const handleGenerate = useCallback(() => {
    if (!theme.trim()) return;
    const label = theme.trim();
    pendingLaunchRef.current = false;
    pendingTableRef.current = null;

    // Show placeholder crawl immediately
    setCrawlData({
      episode: "A universe is being forged…",
      title: label,
      crawl: ["The Pinball Forge is designing your playfield…"],
      speed: 0.6,
    });
    setPhase("crawl");

    // Fire art fetch in parallel
    fetchArt(label, laneCount);

    // Fire story-only request first — replaces placeholder in ~2-3s
    fetch("/api/pinball/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: label }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: { story: string; title: string }) => {
        if (data.story) {
          setCrawlData({ episode: "Now entering…", title: data.title || label, crawl: data.story.split(/\n+/).filter(Boolean), speed: 1 });
        }
      })
      .catch(() => { /* story fetch failed — placeholder stays, not fatal */ });

    // Fire full spec request in parallel; apply table when it arrives
    fetch("/api/pinball/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: label,
        ...(laneCount !== null ? { laneCount } : {}),
        ...(laneWord.trim() ? { laneWord: laneWord.trim().toUpperCase() } : {}),
        includeRamps,
        includeRails,
      }),
    })
      .then((r) => r.ok ? r.json() : r.text().then(txt => {
        let msg = `Server error (HTTP ${r.status})`;
        try { msg = (JSON.parse(txt) as { error?: string }).error || msg; } catch { /* HTML body */ }
        return Promise.reject(new Error(msg));
      }))
      .then((data: { spec: unknown; theme: string }) => {
        pendingTableRef.current = { spec: data.spec, themeName: data.theme };
        const table = buildTable(data.spec, { theme: data.theme });
        // Only replace crawl story if the story endpoint didn't already deliver one
        const specStory = table.story as CrawlData | undefined;
        if (specStory?.crawl?.length) setCrawlData(specStory);
        if (pendingLaunchRef.current) {
          pendingLaunchRef.current = false;
          launchGameRef.current?.();
        }
      })
      .catch((err: unknown) => {
        setPhase("idle");
        toast({ title: "Forge failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
      });
  }, [theme, fetchArt, toast]);

  // --- play the Monster Matinee demo table (spec already known, no API call) ---
  const handleDemo = useCallback(() => {
    pendingLaunchRef.current = false;
    pendingTableRef.current = { spec: MONSTER_MATINEE, themeName: "Monster Matinee" };
    const table = buildTable(MONSTER_MATINEE, { theme: "Monster Matinee" });
    setCrawlData(table.story as CrawlData);
    setPhase("crawl");
    pendingArtRef.current = fetch("/api/pinball/demo-art/monster-matinee")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { image_url?: string } | null) => data?.image_url ?? null)
      .catch(() => null);
  }, []);

  // --- generate from vault: crawl starts immediately, spec loads in background ---
  const handleFromVault = useCallback(() => {
    pendingLaunchRef.current = false;
    pendingTableRef.current = null;

    setCrawlData({
      episode: "Searching your vault…",
      title: "Your Story",
      crawl: [
        "The Forge is reading your saved links.",
        "A table is being designed from your world.",
        "Your story will appear in a moment.",
      ],
      speed: 1,
    });
    setPhase("crawl");

    fetch("/api/pinball/generate-from-vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.ok ? r.json() : r.text().then(txt => {
        let msg = `Server error (HTTP ${r.status})`;
        try { msg = (JSON.parse(txt) as { error?: string }).error || msg; } catch { /* HTML body */ }
        return Promise.reject(new Error(msg));
      }))
      .then((data: { spec: unknown; theme: string }) => {
        pendingTableRef.current = { spec: data.spec, themeName: data.theme };
        const table = buildTable(data.spec, { theme: data.theme });
        setCrawlData(table.story as CrawlData);
        fetchArt(data.theme);
        if (pendingLaunchRef.current) {
          pendingLaunchRef.current = false;
          launchGameRef.current?.();
        }
      })
      .catch((err: unknown) => {
        setPhase("idle");
        toast({ title: "Vault forge failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
      });
  }, [fetchArt, toast]);

  // --- touch controls ---
  const handleTouchLeft = (down: boolean) => gameRef.current?.setFlipper("left", down);
  const handleTouchRight = (down: boolean) => gameRef.current?.setFlipper("right", down);
  const handleTouchPlunger = (down: boolean) => gameRef.current?.setPlunger(down);

  const resetToIdle = () => {
    gameRef.current?.destroy();
    gameRef.current = null;
    pendingTableRef.current = null;
    pendingArtRef.current = null;
    pendingLaunchRef.current = false;
    artImgRef.current = null;
    tableRef.current = null;
    setPhase("idle");
    setGameState(null);
    setCrawlData(null);
    setArtOnly(false);
    setEditElements(false);
    setElementOverrides({});
    setDeletedElements(new Set());
    setBallSpeed(1.0);
    setArtOffset({ x: 0, y: 0 });
    setShowPan(false);
    setShowPartsKit(false);
    partsRef.current = {};
    setPartsThumbs({});
    kitLoadEpochRef.current++;
  };

  const handleElementMove = useCallback((key: string, x: number, y: number) => {
    setElementOverrides((prev) => ({ ...prev, [key]: { x, y } }));
  }, []);

  const handleElementDelete = useCallback((key: string) => {
    setDeletedElements((prev) => new Set([...prev, key]));
  }, []);

  const applyElementEdits = useCallback(() => {
    const t = tableRef.current;
    const hasChanges = Object.keys(elementOverrides).length > 0 || deletedElements.size > 0;
    if (!t || !hasChanges) { setEditElements(false); return; }
    // Remove deleted rails
    if (t.rails && deletedElements.size > 0) {
      t.rails = t.rails.filter((_: unknown, i: number) => !deletedElements.has(`rl${i}`));
    }
    // Patch positions into the live table object
    for (const [key, pos] of Object.entries(elementOverrides)) {
      if (key.startsWith("b")) {
        const i = parseInt(key.slice(1));
        if (t.bumpers?.[i]) { t.bumpers[i].x = pos.x; t.bumpers[i].y = pos.y; }
      } else if (key.startsWith("t")) {
        const i = parseInt(key.slice(1));
        if (t.targets?.[i]) { t.targets[i].x = pos.x; t.targets[i].y = pos.y; }
      } else if (key.startsWith("ro")) {
        const i = parseInt(key.slice(2));
        if (t.rollovers?.[i]) { t.rollovers[i].x = pos.x; t.rollovers[i].y = pos.y; }
      } else if (key.startsWith("sg")) {
        const i = parseInt(key.slice(2));
        const sling = t.slingshots?.[i];
        if (sling?.v && Array.isArray(sling.v)) {
          const verts = sling.v as number[][];
          const origCx = verts.reduce((sum: number, p: number[]) => sum + p[0], 0) / verts.length;
          const origCy = verts.reduce((sum: number, p: number[]) => sum + p[1], 0) / verts.length;
          // Clamp: slingshots should stay within ±80px of origin to avoid ball traps
          const clampedX = Math.max(origCx - 80, Math.min(origCx + 80, pos.x));
          const clampedY = Math.max(origCy - 80, Math.min(origCy + 80, pos.y));
          const ddx = clampedX - origCx;
          const ddy = clampedY - origCy;
          sling.v = verts.map((p: number[]) => [p[0] + ddx, p[1] + ddy]);
        }
      } else if (key.startsWith("s")) {
        const i = parseInt(key.slice(1));
        if (t.saucers?.[i]) { t.saucers[i].x = pos.x; t.saucers[i].y = pos.y; }
      }
    }
    // Restart engine with patched table
    if (gameRef.current && canvasRef.current) {
      gameRef.current.destroy();
      const g = new PinballGame(canvasRef.current, t, (s: GameState) => setGameState({ ...s }));
      gameRef.current = g;
      if (artImgRef.current) applyArtWithOffset(artImgRef.current, artOffset);
    }
    setElementOverrides({});
    setDeletedElements(new Set());
    setEditElements(false);
    const removed = [...deletedElements].filter((k) => k.startsWith("rl")).length;
    toast({ title: "Layout applied", description: removed > 0 ? `${removed} rail(s) removed. Physics updated.` : "Physics updated with new positions." });
  }, [elementOverrides, deletedElements, artOffset, applyArtWithOffset, toast]);

  // ── Parts Kit ────────────────────────────────────────────────────────────────

  /** Ensure the live table has a kit ID, generating one if missing. */
  const ensureKitId = useCallback((): string => {
    const t = tableRef.current;
    if (!t) return generateKitId();
    if (!t.parts_kit_id) t.parts_kit_id = generateKitId();
    return t.parts_kit_id as string;
  }, []);

  /** Load all blobs for kitId, apply to engine, update thumbnail state.
   *  Epoch guard: discards result if the table changed during the async work. */
  const loadAndApplyPartsKit = useCallback(async (kitId: string) => {
    if (!kitId) return;
    const epoch = ++kitLoadEpochRef.current;
    try {
      const { images, thumbUrls } = await loadKitAssets(kitId);
      if (kitLoadEpochRef.current !== epoch) return; // table changed — discard
      partsRef.current = images;
      setPartsThumbs(thumbUrls);
      // Warn if a flipper PNG appears to have an opaque (non-transparent) background.
      // Sample the four corners: if 3+ are opaque and near-white, it's almost certainly
      // a solid background that will look wrong in the game.
      for (const slot of ["flipper_left", "flipper_right"] as const) {
        const fi = (images as Record<string, HTMLImageElement | undefined>)[slot];
        if (!fi) continue;
        try {
          const fc = document.createElement("canvas");
          fc.width = fi.naturalWidth; fc.height = fi.naturalHeight;
          const fx = fc.getContext("2d");
          if (!fx) continue;
          fx.drawImage(fi, 0, 0);
          const pts = [[5,5],[fi.naturalWidth-5,5],[5,fi.naturalHeight-5],[fi.naturalWidth-5,fi.naturalHeight-5]];
          const opaqueWhite = pts.filter(([px,py]) => {
            const d = fx.getImageData(px, py, 1, 1).data;
            return d[3] > 200 && d[0] > 200 && d[1] > 200 && d[2] > 200;
          }).length;
          if (opaqueWhite >= 3) {
            toast({ title: `${slot === "flipper_left" ? "Left" : "Right"} flipper has a solid background`, description: "The PNG corners look opaque white — ask ChatGPT to export it with a transparent background.", variant: "destructive" });
          }
        } catch { /* CORS or canvas error — skip check */ }
      }
      // Restore saved flipper calibration for this kit
      try {
        const raw = localStorage.getItem(`pinball_flipMeta_${kitId}`);
        if (raw) {
          const saved = JSON.parse(raw) as typeof flipMetaRef.current;
          flipMetaRef.current = saved;
          setFlipTiltDeg(+(saved.tilt * 180 / Math.PI).toFixed(1));
        }
      } catch { /* ignore */ }
      // Apply to running engine; applyArtWithOffset will also thread parts on next
      // art re-render, but we update setImages directly here so it takes effect now.
      if (gameRef.current) {
        const imgs = gameRef.current.images || {};
        gameRef.current.setImages({ ...imgs, parts: getPartsWithMeta() });
        gameRef.current.rebuildStatic();
      }
    } catch (err) {
      if (kitLoadEpochRef.current !== epoch) return;
      toast({
        title: "Parts kit load failed",
        description: err instanceof Error ? err.message : "Unknown error loading parts kit.",
        variant: "destructive",
      });
    }
  }, [toast]);

  /** Handle a file chosen via the parts upload input. */
  const handlePartUpload = useCallback(async (file: File) => {
    const slot = uploadingSlotRef.current;
    if (!slot || !file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload a PNG, WebP, or other image file.", variant: "destructive" });
      return;
    }
    try {
      const kitId = ensureKitId();
      await savePart(kitId, slot, file);
      // Reload the whole kit so all in-memory images + thumbs stay consistent
      await loadAndApplyPartsKit(kitId);
    } catch (err) {
      toast({
        title: `Upload failed for "${slot}"`,
        description: err instanceof Error ? err.message : "Storage error.",
        variant: "destructive",
      });
    }
  }, [ensureKitId, loadAndApplyPartsKit, toast]);

  /** Upload all image files from a folder, auto-mapping by filename → slot. */
  const KNOWN_SLOTS = [
    "bumper_base", "bumper_cap", "bumper_cap_lit",
    "flipper_left", "flipper_right",
    "slingshot", "rail", "rail_post",
    "target_drop", "target_flag", "target_shield", "target_gem",
    "saucer", "apron_left", "apron_right",
  ];
  const handleKitFolderUpload = useCallback(async (files: FileList) => {
    const kitId = ensureKitId();
    let matched = 0;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const slug = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[\s-]+/g, "_");
      if (!KNOWN_SLOTS.includes(slug)) continue;
      try {
        await savePart(kitId, slug, file);
        matched++;
      } catch (err) {
        errors.push(slug);
      }
    }
    if (matched > 0) await loadAndApplyPartsKit(kitId);
    if (matched === 0 && errors.length === 0) {
      toast({ title: "No slots matched", description: `Name your images after slot names (e.g. bumper_cap.png, flipper_left.png).`, variant: "destructive" });
    } else {
      toast({
        title: `Kit loaded — ${matched} slot${matched !== 1 ? "s" : ""} applied`,
        description: errors.length > 0 ? `Failed: ${errors.join(", ")}` : "All matched slots uploaded successfully.",
        variant: errors.length > 0 ? "destructive" : "default",
      });
    }
  }, [ensureKitId, loadAndApplyPartsKit, toast]);

  /** Parse a zip file in the browser and return a map of filename → Uint8Array. */
  async function parseZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { unzip } = await import("fflate") as any;
    return new Promise((resolve, reject) => {
      unzip(new Uint8Array(buffer), (err: unknown, files: Record<string, Uint8Array>) => {
        if (err) { reject(new Error("Not a valid ZIP file")); return; }
        const result = new Map<string, Uint8Array>();
        for (const [name, data] of Object.entries(files)) {
          if (!name.endsWith("/")) result.set(name, data);
        }
        resolve(result);
      });
    });
  }

  /** Detect if a filename looks like the playfield background art. */
  function isBackgroundFile(name: string): boolean {
    const base = name.toLowerCase().replace(/\\/g, "/").split("/").pop() ?? "";
    const slug = base.replace(/\.[^.]+$/, "").replace(/[\s-]+/g, "_");
    return ["playfield", "background", "table_art", "table_background", "art", "backdrop"].includes(slug)
      || base.endsWith(".jpg") && slug.includes("playfield")
      || false;
  }

  /** Import a zip that contains background art + parts kit PNGs in one shot. */
  const handleKitZipUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast({ title: "Invalid file", description: "Please select a .zip file.", variant: "destructive" });
      return;
    }
    const kitId = ensureKitId();
    let partsMatched = 0;
    let artApplied = false;
    const errors: string[] = [];

    try {
      const buffer = await file.arrayBuffer();
      const entries = await parseZipEntries(buffer);

      let layoutJson: Record<string, unknown> | null = null;
      for (const [path, data] of entries) {
        // Use just the basename (handle subfolders inside zip)
        const basename = path.replace(/\\/g, "/").split("/").pop() ?? path;
        const ext = basename.split(".").pop()?.toLowerCase() ?? "";

        // layout.json — element position spec from ChatGPT
        if (basename.toLowerCase() === "layout.json") {
          try {
            const text = new TextDecoder().decode(data);
            layoutJson = JSON.parse(text) as Record<string, unknown>;
          } catch { /* malformed JSON — ignore */ }
          continue;
        }

        if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) continue;

        const slug = basename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[\s-]+/g, "_");
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
        const blob = new Blob([data], { type: mime });

        if (KNOWN_SLOTS.includes(slug)) {
          // Parts kit slot
          const imgFile = new File([blob], basename, { type: mime });
          try { await savePart(kitId, slug, imgFile); partsMatched++; } catch { errors.push(slug); }
        } else if (isBackgroundFile(basename)) {
          // Background playfield art — convert to data URL via FileReader so
          // artImgRef.src is always a data URL (blob: URLs die on page reload).
          const fr = new FileReader();
          fr.onload = (ev) => { const u = ev.target?.result as string; if (u) applyArt(u); };
          fr.readAsDataURL(blob);
          artApplied = true;
        }
      }

      if (partsMatched > 0) await loadAndApplyPartsKit(kitId);

      // Apply layout.json — merge ChatGPT's element positions into the live table
      // so physics elements align with where they're painted in the artwork.
      if (layoutJson && tableRef.current && gameRef.current) {
        const t = tableRef.current;
        const lj = layoutJson;
        // Clamp top_lane x values so they stay inside the playfield (x=60–400).
        // ChatGPT adding a 5th lane can push the last entry near LANE=455,
        // which puts a channel inside the launch lane and breaks everything.
        if (Array.isArray(lj.top_lanes)) {
          t.top_lanes = (lj.top_lanes as Array<Record<string, unknown>>).map((l) => ({
            ...l,
            x: Math.max(60, Math.min(400, Number(l.x) || 150)),
            y: Math.max(50, Math.min(90,  Number(l.y) || 75)),
          }));
        }
        // Clamp bumpers to y≥280 so they stay well below channel exits (CHAN_BOT≈115).
        // Bumpers at y=175 land only 60 units below channels — repeated cooldown
        // hits at that range drain ball energy before it builds speed. y≥280 gives
        // ~165 units of open air so the ball accelerates to full speed before first
        // bumper contact.
        if (Array.isArray(lj.bumpers)) {
          t.bumpers = (lj.bumpers as Array<Record<string, unknown>>).map((b) => ({
            ...b,
            y: Math.max(280, Number(b.y) || 300),
          }));
        }
        if (lj.slingshots)                t.slingshots = lj.slingshots;
        if (Array.isArray(lj.targets))    t.targets    = lj.targets;
        if (lj.flippers)                  t.flippers   = lj.flippers;
        if (Array.isArray(lj.saucers))    t.saucers    = lj.saucers;
        // inlanes and rails: NOT imported — wrong values create physics walls
        // that block the ball path; the code's own defaults are always correct.
        t.rails = []; // clear any rails left over from previous loads
        gameRef.current.setTable(t);    // rebuilds walls + physics in-place
        tableRef.current = t;
      }

      const parts = partsMatched > 0 ? `${partsMatched} part${partsMatched !== 1 ? "s" : ""} loaded` : "";
      const art   = artApplied ? "background art applied" : "";
      const summary = [parts, art].filter(Boolean).join(" · ");

      if (!summary) {
        toast({
          title: "Nothing recognized",
          description: "Name parts after slot names (e.g. bumper_cap.png) and the background as playfield.png.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Table package imported!",
          description: summary + (errors.length > 0 ? ` · Failed: ${errors.join(", ")}` : ""),
          variant: errors.length > 0 ? "destructive" : "default",
        });
      }
    } catch (err) {
      toast({
        title: "Zip import failed",
        description: err instanceof Error ? err.message : "Could not read the zip file.",
        variant: "destructive",
      });
    }
  }, [ensureKitId, loadAndApplyPartsKit, toast]);

  /** Remove a single slot from the current kit. */
  const handlePartRemove = useCallback(async (slot: string) => {
    const kitId = tableRef.current?.parts_kit_id as string | undefined;
    if (!kitId) return;
    try {
      await removePart(kitId, slot);
      // Check if any other saved table still references this kit before purging
      const remaining = await listKitSlots(kitId);
      if (remaining.length === 0) {
        const others = loadSavedTables().filter((s) => s.table?.parts_kit_id === kitId);
        if (others.length === 0) await deleteKit(kitId);
      }
      // Rebuild in-memory state without the removed slot
      const next = { ...partsRef.current };
      delete next[slot];
      partsRef.current = next;
      setPartsThumbs((prev) => { const n = { ...prev }; delete n[slot]; return n; });
      if (gameRef.current) {
        const imgs = gameRef.current.images || {};
        gameRef.current.setImages({ ...imgs, parts: { ...(next as Record<string, unknown>), flipMeta: flipMetaRef.current } });
        gameRef.current.rebuildStatic();
      }
    } catch (err) {
      toast({
        title: `Remove failed for "${slot}"`,
        description: err instanceof Error ? err.message : "Storage error.",
        variant: "destructive",
      });
    }
  }, [toast]);

  /** Returns partsRef merged with current flipMeta so the renderer can use it. */
  const getPartsWithMeta = useCallback(
    (): Record<string, unknown> => ({ ...(partsRef.current as Record<string, unknown>), flipMeta: flipMetaRef.current }),
    []
  );

  /** Persist and apply a new flipper tilt (in degrees). */
  const handleFlipTiltChange = useCallback((deg: number) => {
    const tilt = deg * Math.PI / 180;
    flipMetaRef.current = { ...flipMetaRef.current, tilt };
    setFlipTiltDeg(deg);
    const kitId = tableRef.current?.parts_kit_id as string | undefined;
    if (kitId) {
      try { localStorage.setItem(`pinball_flipMeta_${kitId}`, JSON.stringify(flipMetaRef.current)); } catch { /* ignore */ }
    }
    if (gameRef.current) {
      const imgs = gameRef.current.images || {};
      gameRef.current.setImages({ ...imgs, parts: { ...(partsRef.current as Record<string, unknown>), flipMeta: flipMetaRef.current } });
    }
  }, []);

  /** Build the art prompt for the current table — mirrors server-side buildArtPrompt(). */
  const copyArtPrompt = useCallback(() => {
    const t = tableRef.current;
    const label = (t?.title as string) || (t?.name as string) || (t?.theme as string) || theme || "Pinball";
    const prompt = `I'm building a pinball machine themed around "${label}". I need THREE things from you in this conversation:

═══════════════════════════════════════════
PART 1 — PLAYFIELD BACKGROUND IMAGE
═══════════════════════════════════════════
Create the background artwork for a "${label}" pinball machine playfield. Portrait orientation — tall and narrow, roughly 1:2 ratio. The art style, composition, and color palette are completely your choice — make it authentic and visually stunning for this theme.

Design this as a real pinball machine playfield — not just background art. Paint the physical game elements directly into the image so they look like they belong there:
• At the TOP (roughly the top 15%): paint the letter channel slots — the narrow vertical lanes that spell out your chosen word. Make them look like actual pinball lane inserts integrated into the artwork.
• BUMPERS: paint them as themed objects (bottle caps, coins, medallions, whatever fits) positioned where you'd naturally place them in your design.
• LOWER PORTION: flippers, apron, and drain area should feel like a classic pinball table's lower section.
• The MIDDLE open area (roughly center to lower-mid) should be relatively clear — the ball needs room to move.

The game engine places interactive overlays on top, so anything you paint will gain physics automatically. Paint it like a real arcade table someone would walk up to and want to play.

High quality, detailed. No HUD text, score displays, numbers, or floating UI elements — just the machine itself.

═══════════════════════════════════════════
PART 2 — PARTS KIT ELEMENTS (ZIP FILE)
═══════════════════════════════════════════
After generating the background, create all 15 pinball machine parts below in the same "${label}" visual style (matching colors, materials, and decorative motifs). Each part must be:
• A separate PNG file with a FULLY TRANSPARENT background (no black, no white, no shadow box)
• Centered in the frame with nothing else visible
• Named EXACTLY as listed (filenames are case-sensitive)

FILES TO CREATE:
  bumper_base.png     — the circular base ring/dish that sits on the playfield
  bumper_cap.png      — the decorative cap that sits on top of the base (unlit/normal state)
  bumper_cap_lit.png  — same cap glowing brightly (hit/activated state)
  flipper_left.png    — the flipper blade, horizontal, tip pointing right; the game mirrors it automatically for the right side (no flipper_right.png needed)
  slingshot.png       — the LEFT slingshot triangle (flat edge on the right, point to upper-left); the game mirrors it automatically for the right side
  rail.png            — a short curved rail/habitrail tube segment
  rail_post.png       — a small vertical post/stanchion that holds rails
  target_drop.png     — a rectangular drop target (standing upright)
  target_flag.png     — a flag-style target
  target_shield.png   — a shield-shaped target
  target_gem.png      — a diamond/gem-shaped target
  saucer.png          — a circular kick-out saucer hole (top-down view)
  apron_left.png      — the LEFT decorative lower apron plate (wide, curved, landscape orientation)
  apron_right.png     — the RIGHT decorative lower apron plate (mirror of left)

═══════════════════════════════════════════
PART 3 — ELEMENT LAYOUT FILE (layout.json)
═══════════════════════════════════════════
After the parts kit, output a file called "layout.json" that records where you painted each game element in Part 1's playfield image.

COORDINATE SYSTEM: treat the playfield image as exactly 500 units wide × 900 units tall, with (0, 0) at the TOP-LEFT corner. Convert your image's pixel positions proportionally into this 500×900 space.

Output this exact JSON structure — fill in coordinates that match your artwork:
{
  "canvas_width": 500,
  "canvas_height": 900,
  "top_lanes": [
    { "label": "D", "x": 75,  "y": 75, "points": 200 },
    { "label": "I", "x": 157, "y": 75, "points": 200 },
    { "label": "N", "x": 239, "y": 75, "points": 200 },
    { "label": "E", "x": 321, "y": 75, "points": 200 },
    { "label": "R", "x": 400, "y": 75, "points": 200 }
    // Pick ONE iconic word from the theme (3–5 letters). Use that word's letters
    // as labels, one per entry. CRITICAL: x must NEVER exceed 400 — above that
    // is the launch lane wall and the ball will get stuck.
    // 3-letter: x=[115,230,345]  4-letter: x=[90,190,290,390]  5-letter: x=[75,157,239,321,400]
  ],
  "bumpers": [
    { "x": 180, "y": 300, "r": 26 }
    // one per bumper; r = radius in our space (typically 22–30)
  ],
  "slingshots": {
    "left":  [[70,580],[70,660],[130,705]],
    "right": [[430,580],[430,660],[370,705]]
  },
  "targets": [
    { "x": 150, "y": 420, "w": 30, "angle": 0, "kind": "drop" }
    // kind = drop | flag | shield | gem; angle in degrees (0 = horizontal)
  ],
  "flippers": {
    "left":  { "pivotX": 150, "pivotY": 770, "length": 72 },
    "right": { "pivotX": 320, "pivotY": 770, "length": 72 }
  }
}

IMPORTANT — ZIP PACKAGING:
When Parts 1–3 are ready, package EVERYTHING into one zip file called "${label.replace(/\s+/g, "_")}_table.zip":
  • The background playfield image from Part 1, saved as "playfield.png"
  • All 15 parts kit PNGs named exactly as listed above
  • The layout.json from Part 3
Total: 17 files in the zip. Provide it as a single download.`;
    navigator.clipboard.writeText(prompt).then(() => {
      toast({
        title: "Full kit prompt copied!",
        description: `Paste into ChatGPT → it generates the background + all 15 parts and gives you one zip with all 16 files.`,
      });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Try selecting and copying manually.", variant: "destructive" });
    });
  }, [theme, toast]);

  const saveTable = useCallback(() => {
    const t = tableRef.current;
    if (!t) return;
    setSaveNameInput((t.title as string) || (t.name as string) || (t.theme as string) || "My Table");
    setShowSaveDialog(true);
  }, []);

  const confirmSave = useCallback((name: string) => {
    const t = tableRef.current;
    if (!t) return;
    const trimmed = name.trim() || "My Table";
    const id = Date.now().toString(36);
    const artSrc = artImgRef.current?.src ?? null;
    const entry: SavedTable = {
      id,
      name: trimmed,
      savedAt: Date.now(),
      table: { ...t, title: trimmed, name: trimmed },
      artDataUrl: artSrc,  // kept in-memory so the playing session still has it
      artOffset,
    };
    // Save art to IDB (large), metadata only to localStorage (tiny).
    const saveAndPersist = async () => {
      if (artSrc) await saveArtToIDB(id, artSrc).catch(() => {});
      const updated = [entry, ...loadSavedTables().slice(0, 19)];
      const ok = persistSavedTables(updated);
      if (ok) {
        setSavedTables(updated);
        setShowSaveDialog(false);
        toast({ title: `"${trimmed}" saved`, description: "Available in Saved Tables on the home screen." });
      } else {
        setShowSaveDialog(false);
        toast({ title: "Save failed", description: "Could not save — please try again.", variant: "destructive" });
      }
    };
    void saveAndPersist();
  }, [artOffset, toast]);

  const deleteSavedTable = useCallback((id: string) => {
    const updated = loadSavedTables().filter((t) => t.id !== id);
    persistSavedTables(updated);
    setSavedTables(updated);
    void deleteArtFromIDB(id);
  }, []);

  // Launch a previously-saved table directly (no crawl, no API call)
  const loadSavedTable = useCallback((saved: SavedTable) => {
    pendingLaunchRef.current = false;
    pendingTableRef.current = null;
    setPhase("playing");
    const offset = saved.artOffset ?? { x: 0, y: 0 };
    setArtOffset(offset);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!canvasRef.current) return;
        gameRef.current?.destroy();
        const game = new PinballGame(canvasRef.current, saved.table, {
          onState: (s: GameState) => setGameState(s),
          onGameOver: (score: number) => {
            toast({ title: "Game Over", description: `Final score: ${score.toLocaleString()}` });
          },
        });
        gameRef.current = game;
        tableRef.current = saved.table;
        // Reset parts before loading — epoch bump prevents a prior async load
        // from a different table from applying to this one.
        partsRef.current = {};
        setPartsThumbs({});
        kitLoadEpochRef.current++;
        // Art may be in-memory (just saved this session) or in IDB (loaded from storage).
        const applyArt = (dataUrl: string) => {
          const img = new Image();
          img.onload = () => { artImgRef.current = img; applyArtWithOffset(img, offset); };
          img.src = dataUrl;
        };
        if (saved.artDataUrl) {
          applyArt(saved.artDataUrl);
        } else {
          loadArtFromIDB(saved.id).then((url) => { if (url) applyArt(url); }).catch(() => {});
        }
        // Load parts kit if the table has one — missing kit gracefully falls back
        // to procedural rendering (requirement 10)
        const kitId = saved.table?.parts_kit_id as string | undefined;
        if (kitId) loadAndApplyPartsKit(kitId);
      });
    });
  }, [toast, applyArtWithOffset, loadAndApplyPartsKit]);

  return (
    <div ref={fullscreenRef} className="min-h-screen bg-[#08090e] flex flex-col items-center" style={isFullscreen ? { height: "100vh", overflow: "hidden" } : {}}>
      {/* Fullscreen floating button row — top-right corner overlay */}
      {isFullscreen && phase === "playing" && (
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 40 }} className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-gray-950/70">
          <button onClick={saveTable} title="Save table" className="text-gray-400 hover:text-[#ffd740] transition-colors"><Bookmark className="w-5 h-5" /></button>
          <button onClick={() => artInputRef.current?.click()} title="Upload playfield art" className="text-gray-400 hover:text-[#ff007a] transition-colors"><ImagePlus className="w-5 h-5" /></button>
          <button onClick={copyArtPrompt} title="Copy art prompt for ChatGPT" className="text-gray-400 hover:text-[#c8a050] transition-colors" style={{ fontSize: 15, lineHeight: 1 }}>🎨</button>
          <button onClick={() => setShowPan((p) => !p)} title="Pan art" className={`transition-colors ${showPan ? "text-[#ffd740]" : artImgRef.current ? "text-gray-400 hover:text-[#ffd740]" : "text-gray-700"}`} disabled={!artImgRef.current}><Move className="w-5 h-5" /></button>
          <button onClick={toggleArtOnly} title={artOnly ? "Show elements" : "Art only"} className={`transition-colors ${artOnly ? "text-[#ff007a]" : "text-gray-400 hover:text-white"}`}>{artOnly ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
          {editElements ? (
            <button onClick={applyElementEdits} title="Apply layout" className="text-[#00ff88] hover:text-white transition-colors"><Check className="w-5 h-5" /></button>
          ) : (
            <button onClick={() => { setEditElements(true); setArtOnly(true); }} title="Edit element positions" className="text-gray-400 hover:text-[#00f0ff] transition-colors"><Pencil className="w-5 h-5" /></button>
          )}
          <button onClick={() => setShowPartsKit((p) => !p)} title="Parts kit" className={`transition-colors ${showPartsKit ? "text-[#c8a050]" : "text-gray-400 hover:text-[#c8a050]"}`}><Package className="w-5 h-5" /></button>
          <button onClick={toggleFullscreen} title="Exit fullscreen" className="text-gray-400 hover:text-white transition-colors"><Minimize2 className="w-5 h-5" /></button>
          <button onClick={resetToIdle} className="text-gray-400 hover:text-white transition-colors"><RotateCcw className="w-5 h-5" /></button>
        </div>
      )}

      {/* Header — hidden in fullscreen so the canvas gets the full viewport */}
      <div className={`w-full max-w-lg flex items-center justify-between px-4 py-3${isFullscreen ? " hidden" : ""}`}>
        <button onClick={() => setLocation("/games-vault")} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div style={{ textAlign: "center", lineHeight: 1.15 }}>
          <div style={{
            background: "linear-gradient(180deg, #ffd87a 0%, #c8a050 45%, #7a5010 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontFamily: "Georgia, serif",
            fontSize: 19,
            fontWeight: 900,
            letterSpacing: "0.04em",
            fontStyle: "italic",
          }}>UR · Linc</div>
          <div style={{ color: "#4a3810", fontSize: 8, letterSpacing: "0.18em" }}>TAYLER-MADE ™</div>
        </div>
        {phase === "playing" && (
          <div className="flex items-center gap-3">
            <button
              onClick={saveTable}
              title="Save this table"
              className="text-gray-500 hover:text-[#ffd740] transition-colors"
            >
              <Bookmark className="w-5 h-5" />
            </button>
            <button
              onClick={() => artInputRef.current?.click()}
              title="Upload playfield art"
              className="text-gray-500 hover:text-[#ff007a] transition-colors"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <button
              onClick={copyArtPrompt}
              title="Copy art prompt for ChatGPT"
              className="text-gray-500 hover:text-[#c8a050] transition-colors"
              style={{ fontSize: 15, lineHeight: 1 }}
            >🎨</button>
            <button
              onClick={() => setShowPan((p) => !p)}
              title="Pan / reposition art"
              className={`transition-colors ${showPan ? "text-[#ffd740]" : artImgRef.current ? "text-gray-400 hover:text-[#ffd740]" : "text-gray-700"}`}
              disabled={!artImgRef.current}
            >
              <Move className="w-5 h-5" />
            </button>
            <button
              onClick={toggleArtOnly}
              title={artOnly ? "Show game elements" : "Art-only view"}
              className={`transition-colors ${artOnly ? "text-[#ff007a]" : "text-gray-500 hover:text-white"}`}
            >
              {artOnly ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            {editElements ? (
              <button onClick={applyElementEdits} title="Apply element positions" className="text-[#00ff88] hover:text-white transition-colors">
                <Check className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={() => { setEditElements(true); setArtOnly(true); }} title="Edit element positions" className="text-gray-500 hover:text-[#00f0ff] transition-colors">
                <Pencil className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setShowPartsKit((p) => !p)}
              title="Parts kit"
              className={`transition-colors ${showPartsKit ? "text-[#c8a050]" : "text-gray-500 hover:text-[#c8a050]"}`}
            >
              <Package className="w-5 h-5" />
            </button>
            {crawlData && (
              <button
                onClick={() => setPhase("crawl")}
                title="Read the story"
                className="text-gray-500 hover:text-[#c8a050] transition-colors"
                style={{ fontSize: 15, lineHeight: 1 }}
              >📖</button>
            )}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="text-gray-500 hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button onClick={resetToIdle} className="text-gray-400 hover:text-white transition-colors">
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        )}
        {phase !== "playing" && <div className="w-5" />}
        {/* Hidden file input for art upload */}
        <input
          ref={artInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleArtFile(f); e.target.value = ""; }}
        />
      </div>

      {/* Idle: theme input */}
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-5 px-6 mt-6 w-full max-w-sm">

          {/* Featured demo table */}
          <button
            onClick={handleDemo}
            className="w-full rounded-xl overflow-hidden border border-[#c8102e]/40 hover:border-[#c8102e] transition-all group relative"
            style={{ background: "linear-gradient(160deg, #1a0508 0%, #0d0208 60%, #180a04 100%)" }}
          >
            <div className="px-4 pt-4 pb-3 text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] tracking-widest uppercase text-[#c8102e] font-semibold">Featured Table</span>
              </div>
              <p className="text-white font-bold text-base tracking-wide">Monster Matinee</p>
              <p className="text-gray-400 text-xs mt-0.5 leading-snug">
                They bought their tickets. Now they're watching you.
              </p>
            </div>
            <div className="px-4 pb-4">
              <div className="flex items-center gap-1.5 text-xs text-[#ff6b1a] group-hover:text-[#ffaa55] transition-colors">
                <Zap className="w-3 h-3" />
                <span>Play instantly — no wait</span>
              </div>
            </div>
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-xl"
              style={{ background: "radial-gradient(ellipse at center, rgba(200,16,46,0.06) 0%, transparent 70%)" }}
            />
          </button>

          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-gray-600 text-xs uppercase tracking-wider">forge your own</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          <p className="text-gray-500 text-xs text-center -mb-1">
            Name a world — we'll build a complete machine around it.
          </p>
          <div className="flex gap-2 w-full">
            <Input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Deep Space, Pirate Cove, Haunted Carnival…"
              className="bg-gray-900 border-gray-700 text-white placeholder-gray-500"
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            />
            <Button
              onClick={handleGenerate}
              disabled={!theme.trim()}
              className="bg-[#ff007a] hover:bg-[#cc0062] text-white shrink-0"
            >
              <Zap className="w-4 h-4" />
            </Button>
          </div>

          {/* Top lane count & optional word */}
          <div className="flex flex-col gap-1.5 w-full">
            <p className="text-gray-500 text-[11px] uppercase tracking-wider">Top lanes</p>
            <div className="flex gap-1.5 w-full">
              {([null, 0, 3, 4, 5] as const).map((n) => (
                <button
                  key={String(n)}
                  onClick={() => { setLaneCount(n); if (n === null || n === 0) setLaneWord(""); }}
                  className={`flex-1 py-1.5 rounded text-xs border transition-colors ${laneCount === n ? "border-[#ff007a] bg-[#ff007a]/20 text-white" : "border-gray-700 bg-gray-900 text-gray-400 hover:text-white"}`}
                >
                  {n === null ? "Auto" : n === 0 ? "None" : n}
                </button>
              ))}
            </div>
            {laneCount !== null && laneCount !== 0 && (
              <Input
                value={laneWord}
                onChange={(e) => setLaneWord(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, laneCount as number).toUpperCase())}
                placeholder={`${laneCount}-letter word (optional — AI picks if blank)`}
                maxLength={laneCount as number}
                className="bg-gray-900 border-gray-700 text-white placeholder-gray-500 uppercase tracking-widest text-sm"
              />
            )}
          </div>

          {/* Component toggles */}
          <div className="flex flex-col gap-1.5 w-full">
            <p className="text-gray-500 text-[11px] uppercase tracking-wider">Components</p>
            <div className="flex gap-1.5 w-full">
              {[
                { key: "ramps", label: "Ramps", value: includeRamps, set: setIncludeRamps },
                { key: "rails", label: "Rails", value: includeRails, set: setIncludeRails },
              ].map(({ key, label, value, set }) => (
                <button
                  key={key}
                  onClick={() => set(!value)}
                  className={`flex-1 py-1.5 rounded text-xs border transition-colors ${value ? "border-[#ff007a] bg-[#ff007a]/20 text-white" : "border-gray-700 bg-gray-900 text-gray-400 hover:text-white"}`}
                >
                  {value ? "✓ " : ""}{label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-gray-600 text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>
          <Button
            onClick={handleFromVault}
            variant="outline"
            className="w-full border-gray-700 bg-gray-900 text-white hover:bg-gray-800 gap-2"
          >
            <Vault className="w-4 h-4 text-[#00f0ff]" />
            From My Vault
          </Button>
          <p className="text-gray-600 text-xs text-center">
            "From My Vault" builds a table from your last 30 saved URLinc links.
          </p>

          {/* Saved Tables */}
          {savedTables.length > 0 && (
            <>
              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-gray-600 text-xs uppercase tracking-wider flex items-center gap-1"><FolderOpen className="w-3 h-3" /> Saved Tables</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <div className="flex flex-col gap-2 w-full">
                {savedTables.map((saved) => (
                  <div key={saved.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{saved.name}</p>
                      <p className="text-gray-600 text-xs">{new Date(saved.savedAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => loadSavedTable(saved)}
                      className="px-3 py-1 rounded text-xs bg-[#ff007a]/20 text-[#ff007a] hover:bg-[#ff007a]/30 transition-colors shrink-0"
                    >
                      Play
                    </button>
                    <button onClick={() => deleteSavedTable(saved.id)} className="text-gray-700 hover:text-gray-400 transition-colors shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Generating: spinner */}
      {phase === "generating" && (
        <div className="flex flex-col items-center gap-4 mt-20">
          <Loader2 className="w-10 h-10 text-[#ff007a] animate-spin" />
          <p className="text-white text-sm">{generatingMsg}</p>
          <p className="text-gray-500 text-xs">About 10–15 seconds — art loads while you play</p>
        </div>
      )}

      {/* Crawl: Star Wars-style story scroll */}
      {phase === "crawl" && crawlData && (
        <StarWarsCrawl
          data={crawlData}
          onSkip={launchGame}
        />
      )}

      {/* Playing: canvas + HUD.
          In fullscreen the canvas fills the entire container and all HUD
          elements become absolute overlays so nothing clips the playfield. */}
      {(phase === "playing" || phase === "generating") && (
        <div className={isFullscreen
          ? "absolute inset-0 flex items-center justify-center"
          : "relative flex flex-col items-center w-full"
        }>
          {/* Message overlay */}
          {gameState?.message && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <span className="text-white font-black text-xl tracking-widest uppercase drop-shadow-[0_0_12px_rgba(0,240,255,0.9)]">
                {gameState.message}
              </span>
            </div>
          )}

          {/* Art pan hint bar — normal mode only (in fullscreen it would cover the table) */}
          {showPan && !isFullscreen && (
            <div className="flex items-center justify-between w-full max-w-[500px] px-3 py-1.5 mb-1 rounded-lg bg-gray-900/90 border border-[#ffd740]/30">
              <span className="text-[#ffd740] text-xs tracking-wide">Drag art to reposition</span>
              <button onClick={() => setArtOffset({ x: 0, y: 0 })} className="text-gray-500 hover:text-white text-xs transition-colors">Reset</button>
            </div>
          )}
          {/* In fullscreen pan mode, show a minimal floating hint */}
          {showPan && isFullscreen && (
            <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 30 }}
              className="flex items-center gap-3 px-3 py-1 rounded-lg bg-gray-900/90 border border-[#ffd740]/30 text-xs">
              <span className="text-[#ffd740]">Drag to reposition</span>
              <button onClick={() => setArtOffset({ x: 0, y: 0 })} className="text-gray-500 hover:text-white">Reset</button>
            </div>
          )}

          {/* Save Table name dialog */}
          {showSaveDialog && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
            }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowSaveDialog(false); }}
            >
              <div style={{
                background: "#131419", border: "1px solid rgba(200,160,80,0.4)", borderRadius: 14,
                padding: "28px 28px 22px", width: 340, boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
              }}>
                <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Name this table</div>
                <div style={{ color: "#666", fontSize: 12, marginBottom: 18 }}>Give it a unique name so you can tell it apart in your saved list.</div>
                <input
                  autoFocus
                  type="text"
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmSave(saveNameInput); if (e.key === "Escape") setShowSaveDialog(false); }}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 14,
                    background: "#1e1f28", border: "1px solid rgba(200,160,80,0.35)", color: "#fff",
                    outline: "none", boxSizing: "border-box", marginBottom: 18,
                  }}
                  placeholder="e.g. Monster Matinee v2"
                />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowSaveDialog(false)}
                    style={{
                      padding: "8px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                      background: "none", border: "1px solid rgba(255,255,255,0.12)", color: "#888",
                    }}
                  >Cancel</button>
                  <button
                    onClick={() => confirmSave(saveNameInput)}
                    style={{
                      padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      background: "rgba(200,160,80,0.2)", border: "1px solid rgba(200,160,80,0.5)", color: "#c8a050",
                    }}
                  >Save Table</button>
                </div>
              </div>
            </div>
          )}

          {/* Canvas + Parts Kit side panel — flex row when kit is open */}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            {/* Canvas */}
            <div style={{ position: "relative", lineHeight: 0, flexShrink: 0 }}>
              <canvas
                ref={canvasRef}
                style={{
                  // When the kit panel is open, shrink the canvas to fit the full
                  // table height in the viewport (table aspect ratio is 500:900 = 5:9)
                  width: isFullscreen
                    ? "min(56vh, 100vw)"
                    : (showPartsKit && phase === "playing")
                      ? "auto"
                      : "min(500px, 100vw)",
                  height: isFullscreen
                    ? "100vh"
                    : (showPartsKit && phase === "playing")
                      ? "min(900px, calc(100vh - 110px))"
                      : "auto",
                  aspectRatio: (showPartsKit && phase === "playing") ? "500 / 900" : undefined,
                  display: "block",
                  touchAction: "none",
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleArtFile(f);
                }}
              />
              {(artOnly || editElements) && tableRef.current && (
                <PinballErrorBoundary>
                  <EditOverlay
                    table={tableRef.current}
                    editMode={editElements}
                    overrides={elementOverrides}
                    onMove={handleElementMove}
                    onDelete={handleElementDelete}
                  />
                </PinballErrorBoundary>
              )}
              {gameState && phase === "playing" && <ApronHUD gameState={gameState} />}
              {showPan && (
                <div
                  style={{ position: "absolute", inset: 0, cursor: dragStartRef.current ? "grabbing" : "grab", zIndex: 20 }}
                  onPointerDown={onPanPointerDown}
                  onPointerMove={onPanPointerMove}
                  onPointerUp={onPanPointerUp}
                  onPointerCancel={onPanPointerUp}
                />
              )}
            </div>

            {/* ── Parts Kit Side Panel ──────────────────────────────────── */}
            {showPartsKit && phase === "playing" && (() => {
              // Helper: render one accordion section
              const toggleSection = (id: string) =>
                setOpenSections((prev) => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                });

              const SectionHeader = ({ id, label }: { id: string; label: string }) => (
                <button
                  onClick={() => toggleSection(id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 16px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    cursor: "pointer", color: openSections.has(id) ? "#fff" : "#aaa",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
                  <span style={{ fontSize: 11, color: "#666" }}>{openSections.has(id) ? "▲" : "▶"}</span>
                </button>
              );

              const SlotRow = ({ slot, label }: { slot: string; label: string }) => {
                const thumb = partsThumbs[slot];
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {/* Thumb */}
                    <div style={{
                      width: 60, height: 60, flexShrink: 0, borderRadius: 8, overflow: "hidden",
                      background: "repeating-conic-gradient(#1a1a24 0% 25%, #111118 0% 50%) 0 0 / 12px 12px",
                      border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {thumb
                        ? <img src={thumb} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <span style={{ color: "#2a2a38", fontSize: 8, textAlign: "center" }}>EMPTY</span>
                      }
                    </div>
                    {/* Label + buttons */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#d0d0d8", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => { uploadingSlotRef.current = slot; partsInputRef.current?.click(); }}
                          style={{
                            fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600,
                            background: "rgba(200,160,80,0.15)", color: "#c8a050", border: "1px solid rgba(200,160,80,0.4)",
                          }}
                        >↑ {thumb ? "Replace" : "Upload PNG"}</button>
                        {thumb && (
                          <button
                            onClick={() => handlePartRemove(slot)}
                            style={{
                              fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 600,
                              background: "rgba(200,30,30,0.15)", color: "#ff5555", border: "1px solid rgba(200,30,30,0.35)",
                            }}
                          >Remove</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <div style={{
                  width: 320, flexShrink: 0,
                  maxHeight: "min(92vh, 900px)", overflowY: "auto",
                  background: "#0d0e14",
                  borderLeft: "2px solid rgba(200,160,80,0.2)",
                  display: "flex", flexDirection: "column",
                  fontFamily: "system-ui, sans-serif",
                }}>
                  {/* Header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
                    position: "sticky", top: 0, background: "#0d0e14", zIndex: 5,
                  }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Parts Kit</span>
                    <button onClick={() => setShowPartsKit(false)} style={{ color: "#555", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {/* Import full table package from zip */}
                  <div style={{ padding: "10px 16px 6px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <button
                      onClick={() => kitZipInputRef.current?.click()}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                        background: "rgba(0,200,120,0.12)", color: "#00c878", fontWeight: 700, fontSize: 13,
                        border: "1px solid rgba(0,200,120,0.4)", letterSpacing: "0.03em",
                      }}
                    >📦 Import Table Package (.zip)</button>
                    <p style={{ color: "#444", fontSize: 9, marginTop: 5, lineHeight: 1.5 }}>
                      Drop the zip ChatGPT gives you. Background art (<em style={{ color: "#666" }}>playfield.png</em>), parts kit PNGs, and element positions (<em style={{ color: "#666" }}>layout.json</em>) are all applied in one shot.
                    </p>
                  </div>
                  {/* Load Full Kit from folder */}
                  <div style={{ padding: "6px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <button
                      onClick={() => kitFolderInputRef.current?.click()}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                        background: "rgba(200,160,80,0.10)", color: "#888", fontWeight: 600, fontSize: 12,
                        border: "1px solid rgba(200,160,80,0.25)", letterSpacing: "0.03em",
                      }}
                    >📂 Load Parts Kit from Folder</button>
                    <p style={{ color: "#444", fontSize: 9, marginTop: 5, lineHeight: 1.5 }}>
                      Or select a folder of PNGs named after slot names (e.g. <em style={{ color: "#666" }}>bumper_cap.png</em>).
                    </p>
                  </div>
                  <p style={{ color: "#555", fontSize: 11, padding: "10px 16px 0", lineHeight: 1.5 }}>
                    Or replace individual parts below.
                  </p>

                  {/* ─── Bumpers ─── */}
                  {SectionHeader({ id: "bumpers", label: "Bumpers" })}
                  {openSections.has("bumpers") && (<>
                    {SlotRow({ slot: "bumper_base", label: "Bumper Base" })}
                    {SlotRow({ slot: "bumper_cap", label: "Bumper Cap (Normal)" })}
                    {SlotRow({ slot: "bumper_cap_lit", label: "Bumper Cap (Lit / Hit)" })}
                  </>)}

                  {/* ─── Flippers ─── */}
                  {SectionHeader({ id: "flippers", label: "Flippers" })}
                  {openSections.has("flippers") && (<>
                    {SlotRow({ slot: "flipper_left", label: "Flipper (auto-mirrors for right)" })}
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ color: "#888", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>ARM TILT</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="range" min={-45} max={45} step={0.5} value={flipTiltDeg}
                          onChange={(e) => handleFlipTiltChange(Number(e.target.value))}
                          style={{ flex: 1, accentColor: "#c8a050" }} />
                        <span style={{ color: "#c8a050", fontSize: 12, minWidth: 38, textAlign: "right" }}>{flipTiltDeg.toFixed(1)}°</span>
                      </div>
                      <p style={{ color: "#444", fontSize: 9, marginTop: 4 }}>Adjusts how your PNG aligns with the physics angle. Negative = flatten; positive = droop more.</p>
                    </div>
                  </>)}

                  {/* ─── Slingshots ─── */}
                  {SectionHeader({ id: "slingshots", label: "Slingshots" })}
                  {openSections.has("slingshots") && (
                    SlotRow({ slot: "slingshot", label: "Slingshot" })
                  )}

                  {/* ─── Rails & Posts ─── */}
                  {SectionHeader({ id: "rails", label: "Rails & Posts" })}
                  {openSections.has("rails") && (<>
                    <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <button
                        onClick={() => {
                          const t = tableRef.current;
                          if (!t) return;
                          t.rails = [];
                          t.show_guide_walls = false;
                          if (gameRef.current && canvasRef.current) {
                            gameRef.current.destroy();
                            const g = new PinballGame(canvasRef.current, t, (s: GameState) => setGameState({ ...s }));
                            gameRef.current = g;
                            if (artImgRef.current) applyArtWithOffset(artImgRef.current, artOffset);
                          }
                          toast({ title: "Rails removed", description: "All guide rails and wall guides cleared." });
                        }}
                        style={{
                          width: "100%", padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                          background: "rgba(200,30,30,0.15)", color: "#ff5555", fontWeight: 700, fontSize: 12,
                          border: "1px solid rgba(200,30,30,0.4)", letterSpacing: "0.04em",
                        }}
                      >✕ Remove All Rails</button>
                      <p style={{ color: "#444", fontSize: 9, marginTop: 6 }}>Removes all AI-generated guide rails from the physics engine immediately.</p>
                    </div>
                    {SlotRow({ slot: "rail", label: "Rail" })}
                    {SlotRow({ slot: "rail_post", label: "Rail Post" })}
                  </>)}

                  {/* ─── Targets ─── */}
                  {SectionHeader({ id: "targets", label: "Targets" })}
                  {openSections.has("targets") && (<>
                    {SlotRow({ slot: "target_drop", label: "Drop Target" })}
                    {SlotRow({ slot: "target_flag", label: "Flag Target" })}
                    {SlotRow({ slot: "target_shield", label: "Shield Target" })}
                    {SlotRow({ slot: "target_gem", label: "Gem Target" })}
                  </>)}

                  {/* ─── Saucers ─── */}
                  {SectionHeader({ id: "saucers", label: "Saucers" })}
                  {openSections.has("saucers") && (
                    SlotRow({ slot: "saucer", label: "Saucer" })
                  )}

                  {/* ─── Apron ─── */}
                  {SectionHeader({ id: "apron", label: "Apron" })}
                  {openSections.has("apron") && (<>
                    {SlotRow({ slot: "apron_left", label: "Apron (Left)" })}
                    {SlotRow({ slot: "apron_right", label: "Apron (Right)" })}
                  </>)}

                  {/* ─── Tuning ─── */}
                  {SectionHeader({ id: "tuning", label: "Tuning" })}
                  {openSections.has("tuning") && (
                    <div style={{ padding: "12px 16px" }}>
                      <div style={{ color: "#888", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>BALL SPEED</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="range" min={0.3} max={1.5} step={0.05} value={ballSpeed}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setBallSpeed(v);
                            const t = tableRef.current;
                            if (t) { if (!t.physics) t.physics = {}; t.physics.gravity = v; }
                          }}
                          style={{ flex: 1, accentColor: "#c8a050" }} />
                        <span style={{ color: "#c8a050", fontSize: 12, minWidth: 38, textAlign: "right" }}>{ballSpeed.toFixed(2)}×</span>
                      </div>
                      <p style={{ color: "#444", fontSize: 9, marginTop: 4 }}>1.00× is normal speed. Drag left to slow the ball for testing.</p>
                    </div>
                  )}

                  {/* Hidden file input — single slot */}
                  <input
                    ref={partsInputRef}
                    type="file"
                    accept="image/png,image/webp,image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePartUpload(f);
                      e.target.value = "";
                    }}
                  />
                  {/* Hidden folder input — full kit */}
                  <input
                    ref={kitFolderInputRef}
                    type="file"
                    accept="image/png,image/webp,image/*"
                    // @ts-ignore — webkitdirectory is non-standard but widely supported
                    webkitdirectory=""
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) handleKitFolderUpload(files);
                      e.target.value = "";
                    }}
                  />
                  {/* Hidden zip input — full table package */}
                  <input
                    ref={kitZipInputRef}
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleKitZipUpload(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })()}
          </div>

          {/* Touch controls — hidden in fullscreen (use keyboard on projector) */}
          {!isFullscreen && (
            <>
              <div className="flex w-full max-w-[500px] mt-2 gap-2 px-2 select-none">
                <button className="flex-1 h-14 rounded-lg bg-gray-800 border border-gray-700 text-white font-bold text-lg active:bg-[#ff007a] active:border-[#ff007a] transition-colors"
                  onPointerDown={() => handleTouchLeft(true)} onPointerUp={() => handleTouchLeft(false)} onPointerLeave={() => handleTouchLeft(false)}>← Z</button>
                <button className="flex-[0.6] h-14 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs active:bg-gray-600 transition-colors"
                  onPointerDown={() => handleTouchPlunger(true)} onPointerUp={() => handleTouchPlunger(false)} onPointerLeave={() => handleTouchPlunger(false)}>LAUNCH</button>
                <button className="flex-1 h-14 rounded-lg bg-gray-800 border border-gray-700 text-white font-bold text-lg active:bg-[#ff007a] active:border-[#ff007a] transition-colors"
                  onPointerDown={() => handleTouchRight(true)} onPointerUp={() => handleTouchRight(false)} onPointerLeave={() => handleTouchRight(false)}>X →</button>
              </div>
              <p className="text-gray-600 text-xs mt-2 mb-4">
                Keyboard: <span className="text-gray-500">L-Shift / R-Shift = flippers · Z / X or Arrow keys also work · Hold Space to charge, release to launch · Gamepad: LB+LT / RB+RT = flippers, A = plunger</span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
