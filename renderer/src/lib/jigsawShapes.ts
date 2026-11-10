// Generates classic interlocking jigsaw piece outlines (SVG path data) for a
// rows x cols grid, using a semicircular "knob" tab on every internal border.
// Coordinates are in board units where each cell is exactly 1x1.
//
// Ported from the hunt-link-quest Base44 project with types added and nothing
// else changed, so it stays easy to diff against the original if that project
// moves on.

export const TAB = 0.2; // knob radius, as a fraction of one cell's edge length

export type JigsawEdges = {
  V: number[][];
  H: number[][];
};

type Point = { x: number; y: number };

function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str: string | number | null | undefined): number {
  let h = 0;
  const s = String(str || "puzzle");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// V[r][c]: sign of the vertical border between column c-1 and c, at row r (c = 1..cols-1)
// H[r][c]: sign of the horizontal border between row r-1 and r, at column c (r = 1..rows-1)
//
// Seeded rather than random so a given puzzle always cuts the same way -- the
// same board reloads with the same piece shapes.
export function generateJigsawEdges(rows: number, cols: number, seed: number): JigsawEdges {
  const rand = mulberry32(seed);
  const V: number[][] = [];
  const H: number[][] = [];
  for (let r = 0; r < rows; r++) {
    V[r] = [];
    for (let c = 1; c < cols; c++) V[r][c] = rand() > 0.5 ? 1 : -1;
  }
  for (let r = 1; r < rows; r++) {
    H[r] = [];
    for (let c = 0; c < cols; c++) H[r][c] = rand() > 0.5 ? 1 : -1;
  }
  return { V, H };
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

// Draws a straight or tabbed segment from `from` to `to` (in canonical or
// reverse direction). `sign` is null for an outer border (straight line).
function edgeSegment(from: Point, to: Point, sign: number | null, canonicalForward: boolean): string {
  if (sign === null) return `L ${to.x} ${to.y} `;
  const fNear = 0.5 - TAB;
  const fFar = 0.5 + TAB;
  const nearPt = { x: lerp(from.x, to.x, fNear), y: lerp(from.y, to.y, fNear) };
  const farPt = { x: lerp(from.x, to.x, fFar), y: lerp(from.y, to.y, fFar) };
  const sweepCanonical = sign > 0 ? 1 : 0;
  const sweep = canonicalForward ? sweepCanonical : 1 - sweepCanonical;
  return `L ${nearPt.x} ${nearPt.y} A ${TAB} ${TAB} 0 0 ${sweep} ${farPt.x} ${farPt.y} L ${to.x} ${to.y} `;
}

// A missing entry means the caller asked for a piece outside this grid --
// normally a stale id surviving a change of difficulty. Treated as a straight
// outer edge rather than allowed to throw: a briefly odd-looking piece is a
// far better failure than the blank page a TypeError here produces, since it
// unmounts the entire play surface.
const edgeAt = (table: number[][], r: number, c: number): number | null => table[r]?.[c] ?? null;

// Builds the SVG path 'd' string for piece (r,c), in board unit coordinates.
export function piecePath(r: number, c: number, rows: number, cols: number, edges: JigsawEdges): string {
  const { V, H } = edges;
  const x0 = c, x1 = c + 1, y0 = r, y1 = r + 1;
  let d = `M ${x0} ${y0} `;
  // top
  d += edgeSegment({ x: x0, y: y0 }, { x: x1, y: y0 }, r === 0 ? null : edgeAt(H, r, c), true);
  // right
  d += edgeSegment({ x: x1, y: y0 }, { x: x1, y: y1 }, c === cols - 1 ? null : edgeAt(V, r, c + 1), true);
  // bottom (reverse of canonical left->right)
  d += edgeSegment({ x: x1, y: y1 }, { x: x0, y: y1 }, r === rows - 1 ? null : edgeAt(H, r + 1, c), false);
  // left (reverse of canonical top->bottom)
  d += edgeSegment({ x: x0, y: y1 }, { x: x0, y: y0 }, c === 0 ? null : edgeAt(V, r, c), false);
  d += "Z";
  return d;
}

// ── Grid + piece helpers (was src/lib/puzzle.js) ─────────────────────────────

export const DIFFICULTY_GRID = {
  Easy:   { rows: 3, cols: 3 },
  Medium: { rows: 4, cols: 4 },
  Hard:   { rows: 5, cols: 5 },
  Expert: { rows: 6, cols: 6 },
} as const;

export type Difficulty = keyof typeof DIFFICULTY_GRID;

export function buildPieceIds(rows: number, cols: number): number[] {
  return Array.from({ length: rows * cols }, (_, i) => i);
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
