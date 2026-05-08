export type Cell = number; // 0 = empty, 1-9 = digit
export type Board = Cell[]; // length 81, row-major
export type Notes = Record<number, number[]>; // index -> sorted unique digits
export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const SIZE = 9;
export const BOX = 3;
export const idx = (r: number, c: number) => r * SIZE + c;
export const rc = (i: number) => [Math.floor(i / SIZE), i % SIZE] as const;
export const boxOf = (r: number, c: number) =>
  Math.floor(r / BOX) * BOX + Math.floor(c / BOX);
