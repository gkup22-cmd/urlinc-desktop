// Word search grid generation and gameplay helpers.
//
// Ported from the hunt-link-quest Base44 project with types added, logic
// untouched. Grids are generated once when a game is created and stored, so
// everyone playing the same game sees the same puzzle.

export type Cell = { row: number; col: number };

const DIRECTIONS = [
  [0, 1], [1, 0], [1, 1], [-1, 1],
  [0, -1], [-1, 0], [-1, -1], [1, -1],
];

/**
 * Places as many words as possible into a size x size grid, filling the
 * remaining cells with random letters. Returns the grid (array of row
 * strings) and the list of words that were actually placed.
 *
 * Longest words first: they're the hardest to fit, and placing them while the
 * grid is still empty means the short ones can slot into whatever is left.
 * Words that don't fit after 60 attempts are dropped rather than forced,
 * which is why the caller must use `placedWords` rather than its own list --
 * otherwise a game could list a word that isn't in the grid and can never be
 * found.
 */
export function generateWordSearchGrid(
  words: string[],
  size: number,
): { grid: string[]; placedWords: string[] } {
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const placed: string[] = [];
  const sorted = [...words].sort((a, b) => b.length - a.length);

  for (const raw of sorted) {
    const upper = String(raw || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!upper || upper.length > size) continue;
    const dirs = [...DIRECTIONS].sort(() => Math.random() - 0.5);
    let success = false;
    for (let attempt = 0; attempt < 60 && !success; attempt++) {
      const dir = dirs[attempt % dirs.length];
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);
      const endRow = row + dir[0] * (upper.length - 1);
      const endCol = col + dir[1] * (upper.length - 1);
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;

      // Overlaps are allowed where letters agree -- that's what makes a grid
      // feel woven rather than a set of parallel lines.
      let fits = true;
      for (let i = 0; i < upper.length; i++) {
        const r = row + dir[0] * i;
        const c = col + dir[1] * i;
        const existing = grid[r][c];
        if (existing && existing !== upper[i]) { fits = false; break; }
      }
      if (!fits) continue;

      for (let i = 0; i < upper.length; i++) {
        const r = row + dir[0] * i;
        const c = col + dir[1] * i;
        grid[r][c] = upper[i];
      }
      placed.push(upper);
      success = true;
    }
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
    }
  }

  return { grid: grid.map((row) => row.join("")), placedWords: placed };
}

// Returns the straight-line path (horizontal, vertical, or diagonal) of
// cells between start and end, or null if they don't form a straight line.
export function computePath(start: Cell, end: Cell): Cell[] | null {
  const dr = end.row - start.row;
  const dc = end.col - start.col;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const path: Cell[] = [];
  for (let i = 0; i <= steps; i++) {
    path.push({ row: start.row + stepR * i, col: start.col + stepC * i });
  }
  return path;
}

export function cellsToWord(grid: string[], cells: Cell[]): string {
  return cells.map((c) => grid[c.row]?.[c.col] || "").join("");
}

export const WORD_SEARCH_SIZES = {
  Easy:   10,
  Medium: 13,
  Hard:   16,
} as const;

export type WordSearchDifficulty = keyof typeof WORD_SEARCH_SIZES;
