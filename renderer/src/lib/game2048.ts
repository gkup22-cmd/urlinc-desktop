// Grid maths for 2048. Pure functions, no React, no dependencies.
//
// Ported from the hunt-link-quest Base44 project with types added and the
// logic untouched. Every move is expressed as a slide-left: the grid is
// transposed and/or reversed into that orientation, slid, then unwound. One
// direction to get right instead of four.

export type Grid = number[][];
export type Direction = "left" | "right" | "up" | "down";

export const SIZE = 4;

export function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function addRandomTile(grid: Grid): Grid {
  const empty: [number, number][] = [];
  grid.forEach((row, r) => row.forEach((v, c) => { if (v === 0) empty.push([r, c]); }));
  if (empty.length === 0) return grid;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = grid.map((row) => [...row]);
  // 4s are the occasional complication; mostly you get 2s.
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function slideRowLeft(row: number[]): { row: number[]; scoreGained: number } {
  const nums = row.filter((v) => v !== 0);
  let scoreGained = 0;
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] === nums[i + 1]) {
      nums[i] *= 2;
      scoreGained += nums[i];
      nums.splice(i + 1, 1);
    }
  }
  while (nums.length < SIZE) nums.push(0);
  return { row: nums, scoreGained };
}

function transpose(grid: Grid): Grid {
  return grid[0].map((_, c) => grid.map((row) => row[c]));
}

function reverseRows(grid: Grid): Grid {
  return grid.map((row) => [...row].reverse());
}

function gridsEqual(a: Grid, b: Grid): boolean {
  return a.every((row, r) => row.every((v, c) => v === b[r][c]));
}

function applyMoveLeft(grid: Grid): { grid: Grid; scoreGained: number } {
  let scoreGained = 0;
  const next = grid.map((row) => {
    const { row: newRow, scoreGained: gained } = slideRowLeft(row);
    scoreGained += gained;
    return newRow;
  });
  return { grid: next, scoreGained };
}

export function move(grid: Grid, direction: Direction): { grid: Grid; scoreGained: number; moved: boolean } {
  let working = grid;
  let flipped = false;
  let transposed = false;

  if (direction === "right") { working = reverseRows(working); flipped = true; }
  if (direction === "up") { working = transpose(working); transposed = true; }
  if (direction === "down") { working = reverseRows(transpose(working)); transposed = true; flipped = true; }

  const { grid: movedGrid, scoreGained } = applyMoveLeft(working);

  let result = movedGrid;
  if (transposed && flipped) result = transpose(reverseRows(result));
  else if (transposed) result = transpose(result);
  else if (flipped) result = reverseRows(result);

  // A move that changes nothing shouldn't spawn a tile, or a blocked direction
  // would slowly fill the board for free.
  const moved = !gridsEqual(grid, result);
  return { grid: result, scoreGained, moved };
}

export function canMove(grid: Grid): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) return true;
      if (c < SIZE - 1 && grid[r][c] === grid[r][c + 1]) return true;
      if (r < SIZE - 1 && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}
