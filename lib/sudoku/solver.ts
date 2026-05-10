import { Board, SIZE, boxOf } from "./types";

export function solve(board: Board): Board | null {
  const b = board.slice();
  const rowMask = new Int32Array(SIZE);
  const colMask = new Int32Array(SIZE);
  const boxMask = new Int32Array(SIZE);
  for (let i = 0; i < 81; i++) {
    const v = b[i]; if (!v) continue;
    const r = (i / SIZE) | 0, c = i % SIZE, bx = boxOf(r, c), bit = 1 << (v - 1);
    if (rowMask[r] & bit || colMask[c] & bit || boxMask[bx] & bit) return null;
    rowMask[r] |= bit; colMask[c] |= bit; boxMask[bx] |= bit;
  }
  const order: number[] = [];
  for (let i = 0; i < 81; i++) if (!b[i]) order.push(i);
  if (recurse(b, 0, order, rowMask, colMask, boxMask)) return b;
  return null;
}

function recurse(
  b: Board, k: number, order: number[],
  rm: Int32Array, cm: Int32Array, bm: Int32Array
): boolean {
  if (k === order.length) return true;
  let bestK = k, bestCount = 10, bestMask = 0;
  for (let j = k; j < order.length; j++) {
    const i = order[j], r = (i / SIZE) | 0, c = i % SIZE, bx = boxOf(r, c);
    const used = rm[r] | cm[c] | bm[bx];
    const free = 0x1ff & ~used;
    const cnt = popcount(free);
    if (cnt < bestCount) { bestCount = cnt; bestK = j; bestMask = free; if (cnt <= 1) break; }
  }
  if (bestCount === 0) return false;
  [order[k], order[bestK]] = [order[bestK], order[k]];
  const i = order[k], r = (i / SIZE) | 0, c = i % SIZE, bx = boxOf(r, c);
  let mask = bestMask;
  while (mask) {
    const lsb = mask & -mask;
    const v = log2(lsb) + 1;
    rm[r] |= lsb; cm[c] |= lsb; bm[bx] |= lsb; b[i] = v;
    if (recurse(b, k + 1, order, rm, cm, bm)) return true;
    rm[r] &= ~lsb; cm[c] &= ~lsb; bm[bx] &= ~lsb; b[i] = 0;
    mask &= mask - 1;
  }
  [order[k], order[bestK]] = [order[bestK], order[k]];
  return false;
}

const popcount = (x: number) => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
const log2 = (x: number) => Math.log2(x) | 0;
