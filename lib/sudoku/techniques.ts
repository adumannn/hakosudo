import { Board, SIZE, BOX, idx, rc } from "./types";

export type Technique =
  | "naked-single" | "hidden-single" | "locked-candidate"
  | "naked-pair" | "hidden-pair" | "x-wing";

export interface Hint {
  index: number;
  value: number;
  technique: Technique;
  reason: string;
}

export function candidates(b: Board, i: number): number[] {
  if (b[i]) return [];
  const [r, c] = rc(i);
  const used = new Set<number>();
  for (let k = 0; k < SIZE; k++) {
    if (b[idx(r, k)]) used.add(b[idx(r, k)]);
    if (b[idx(k, c)]) used.add(b[idx(k, c)]);
  }
  const br = Math.floor(r / BOX) * BOX, bc = Math.floor(c / BOX) * BOX;
  for (let dr = 0; dr < BOX; dr++)
    for (let dc = 0; dc < BOX; dc++) {
      const v = b[idx(br + dr, bc + dc)];
      if (v) used.add(v);
    }
  const out: number[] = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

const allUnits = (() => {
  const u: number[][] = [];
  for (let r = 0; r < SIZE; r++) u.push([...Array(SIZE)].map((_, c) => idx(r, c)));
  for (let c = 0; c < SIZE; c++) u.push([...Array(SIZE)].map((_, r) => idx(r, c)));
  for (let b0 = 0; b0 < SIZE; b0++) {
    const br = Math.floor(b0 / BOX) * BOX, bc = (b0 % BOX) * BOX;
    const cells: number[] = [];
    for (let dr = 0; dr < BOX; dr++) for (let dc = 0; dc < BOX; dc++) cells.push(idx(br + dr, bc + dc));
    u.push(cells);
  }
  return u;
})();

export function findHint(b: Board): Hint | null {
  // 1. Naked single — only one candidate for a cell
  for (let i = 0; i < 81; i++) {
    if (b[i]) continue;
    const cs = candidates(b, i);
    if (cs.length === 1) return { index: i, value: cs[0], technique: "naked-single", reason: `Cell ${cellName(i)} has only one possible digit (${cs[0]}).` };
  }
  // 2. Hidden single — only one cell in a unit can hold a digit
  for (const unit of allUnits) {
    for (let v = 1; v <= 9; v++) {
      if (unit.some((i) => b[i] === v)) continue;
      const candidatesInUnit = unit.filter((i) => !b[i] && candidates(b, i).includes(v));
      if (candidatesInUnit.length === 1) {
        const i = candidatesInUnit[0];
        return { index: i, value: v, technique: "hidden-single", reason: `In this ${unitKind(unit)}, only ${cellName(i)} can hold ${v}.` };
      }
    }
  }
  return null;
}

const cellName = (i: number) => { const [r, c] = rc(i); return `R${r + 1}C${c + 1}`; };
const unitKind = (u: number[]) => {
  const [r0] = rc(u[0]), [r1] = rc(u[1]);
  if (r0 === r1) return `row ${r0 + 1}`;
  const [, c0] = rc(u[0]), [, c1] = rc(u[1]);
  if (c0 === c1) return `column ${c0 + 1}`;
  return `box`;
};
