// Classic sliding-tile (15-puzzle style) logic.
// `order` is an array indexed by board position; order[i] is the piece id
// currently sitting there. The piece id `total - 1` is treated as the blank.
//
// Ported from the hunt-link-quest Base44 project with types added, logic
// untouched.

export function buildSolvedOrder(total: number): number[] {
  return Array.from({ length: total }, (_, i) => i);
}

export function getNeighbors(pos: number, rows: number, cols: number): number[] {
  const row = Math.floor(pos / cols);
  const col = pos % cols;
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(pos - cols);
  if (row < rows - 1) neighbors.push(pos + cols);
  if (col > 0) neighbors.push(pos - 1);
  if (col < cols - 1) neighbors.push(pos + 1);
  return neighbors;
}

/**
 * Shuffles by making random valid slides from the solved state, which
 * guarantees the result is always solvable -- scrambling the tiles directly
 * would produce an unsolvable board half the time.
 *
 * `trail` is the sequence of blank positions from solved to shuffled.
 * Reversing it (skipping the current position) is a guaranteed valid path
 * back, which is what the Solve button walks.
 */
export function shuffleSlidingBoard(
  rows: number,
  cols: number,
  moves = 150,
): { order: number[]; emptyPos: number; trail: number[] } {
  const total = rows * cols;
  const order = buildSolvedOrder(total);
  let emptyPos = total - 1;
  let lastPos = -1;
  const trail = [emptyPos];
  for (let m = 0; m < moves; m++) {
    // Excluding lastPos stops the blank immediately undoing itself, which
    // would waste much of the shuffle walking back and forth.
    const neighbors = getNeighbors(emptyPos, rows, cols).filter((n) => n !== lastPos);
    const swapWith = neighbors[Math.floor(Math.random() * neighbors.length)];
    [order[emptyPos], order[swapWith]] = [order[swapWith], order[emptyPos]];
    lastPos = emptyPos;
    emptyPos = swapWith;
    trail.push(emptyPos);
  }
  return { order, emptyPos, trail };
}

export function isSolved(order: number[]): boolean {
  return order.every((pieceId, pos) => pieceId === pos);
}
