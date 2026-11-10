// Card faces and board sizes for the memory game.
//
// Ported from the hunt-link-quest Base44 project unchanged. Emoji rather than
// images so a game needs no artwork at all -- you pick a theme and play.

export const MEMORY_THEMES = {
  Animals: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵"],
  Food: ["🍎", "🍌", "🍇", "🍓", "🍒", "🍍", "🍉", "🍑", "🥑", "🍕", "🍔", "🌮", "🍩", "🍪", "🍰"],
  Sports: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥊", "🥋", "🎳", "🏹", "⛳"],
  Space: ["🚀", "🛸", "🌎", "🌙", "⭐", "☄️", "🪐", "🌟", "🌌", "👽", "🛰️", "🔭", "🌠", "✨", "🌑"],
  Ocean: ["🐠", "🐬", "🐳", "🦈", "🐙", "🦀", "🐡", "🦞", "🐚", "🌊", "⚓", "🏝️", "🐢", "🦑", "🦭"],
  "Emoji Fun": ["😀", "😂", "😍", "🥳", "😎", "🤩", "😜", "🥰", "😇", "🤪", "😴", "🤯", "🥶", "🤠", "👻"],
} as const;

export type MemoryTheme = keyof typeof MEMORY_THEMES;

export const MEMORY_DIFFICULTY = {
  Easy:   { pairs: 6,  cols: 4 },
  Medium: { pairs: 8,  cols: 4 },
  Hard:   { pairs: 12, cols: 6 },
} as const;

export type MemoryDifficulty = keyof typeof MEMORY_DIFFICULTY;

export const MEMORY_THEME_NAMES = Object.keys(MEMORY_THEMES) as MemoryTheme[];
export const MEMORY_DIFFICULTY_NAMES = Object.keys(MEMORY_DIFFICULTY) as MemoryDifficulty[];
