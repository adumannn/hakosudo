import { Board, SIZE, BOX, idx } from "./types";

export function isValidPlacement(b: Board, r: number, c: number, v: number): boolean {
  if (v < 1 || v > 9) return false;
  for (let k = 0; k < SIZE; k++) {
    if (k !== c && b[idx(r, k)] === v) return false;
    if (k !== r && b[idx(k, c)] === v) return false;
  }
  const br = Math.floor(r / BOX) * BOX;
  const bc = Math.floor(c / BOX) * BOX;
  for (let dr = 0; dr < BOX; dr++)
    for (let dc = 0; dc < BOX; dc++) {
      const rr = br + dr, cc = bc + dc;
      if ((rr !== r || cc !== c) && b[idx(rr, cc)] === v) return false;
    }
  return true;
}

export const isComplete = (b: Board) => b.every((v) => v >= 1 && v <= 9);

export function findConflicts(b: Board): number[] {
  const out = new Set<number>();
  const seen = (cells: number[]) => {
    const map = new Map<number, number[]>();
    for (const i of cells) if (b[i]) (map.get(b[i]) ?? map.set(b[i], []).get(b[i])!).push(i);
    for (const arr of map.values()) if (arr.length > 1) arr.forEach((i) => out.add(i));
  };
  for (let r = 0; r < SIZE; r++) seen([...Array(SIZE)].map((_, c) => idx(r, c)));
  for (let c = 0; c < SIZE; c++) seen([...Array(SIZE)].map((_, r) => idx(r, c)));
  for (let b0 = 0; b0 < SIZE; b0++) {
    const br = Math.floor(b0 / BOX) * BOX, bc = (b0 % BOX) * BOX;
    const cells: number[] = [];
    for (let dr = 0; dr < BOX; dr++) for (let dc = 0; dc < BOX; dc++) cells.push(idx(br + dr, bc + dc));
    seen(cells);
  }
  return [...out];
}
