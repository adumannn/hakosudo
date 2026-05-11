import { Board, SIZE, BOX, idx, rc } from "./types";

export type Technique =
  | "naked-single" | "hidden-single" | "locked-candidate"
  | "naked-pair" | "hidden-pair" | "x-wing";

export interface Hint {
  index: number;            // anchor cell (0-80) — the cell the UI highlights and the hint speaks about
  value: number | null;     // digit central to the technique; null for naked-pair (involves two)
  technique: Technique;
  unit: string;             // human label, e.g. "row 5", "column 3", "box 7"
  cells: number[];          // supporting cells (empty for naked-single; the two paired cells for naked-pair; in-box candidate cells for locked-candidate)
  reason: string;
  redirect?: boolean;       // true when the hint applies to a different cell than the user's selection
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
    if (cs.length === 1) {
      return {
        index: i,
        value: cs[0],
        technique: "naked-single",
        unit: `cell ${cellName(i)}`,
        cells: [],
        reason: `Cell ${cellName(i)} has only one possible digit (${cs[0]}).`,
      };
    }
  }
  // 2. Hidden single — only one cell in a unit can hold a digit
  for (const unit of allUnits) {
    for (let v = 1; v <= 9; v++) {
      if (unit.some((i) => b[i] === v)) continue;
      const candidatesInUnit = unit.filter((i) => !b[i] && candidates(b, i).includes(v));
      if (candidatesInUnit.length === 1) {
        const i = candidatesInUnit[0];
        return {
          index: i,
          value: v,
          technique: "hidden-single",
          unit: unitKind(unit),
          cells: unit.filter((j) => !b[j] && j !== i),
          reason: `In this ${unitKind(unit)}, only ${cellName(i)} can hold ${v}.`,
        };
      }
    }
  }
  return null;
}

export function findLockedCandidate(
  b: Board,
  opts: { boxIndex?: number } = {},
): Hint | null {
  // For each box × digit: if all candidate cells for that digit inside the
  // box share a single row or single column, the digit is "locked" — it
  // can be eliminated from the rest of that line. When `opts.boxIndex` is
  // set, only that box is considered (target-aware lookup).
  for (let bi = 0; bi < 9; bi++) {
    if (opts.boxIndex !== undefined && bi !== opts.boxIndex) continue;
    const br = Math.floor(bi / BOX) * BOX;
    const bc = (bi % BOX) * BOX;
    const boxCells: number[] = [];
    for (let dr = 0; dr < BOX; dr++)
      for (let dc = 0; dc < BOX; dc++) boxCells.push(idx(br + dr, bc + dc));

    for (let v = 1; v <= 9; v++) {
      if (boxCells.some((i) => b[i] === v)) continue; // already placed in box
      const cands = boxCells.filter((i) => !b[i] && candidates(b, i).includes(v));
      if (cands.length < 2) continue; // 0 = no candidates; 1 = hidden single (handled elsewhere)
      const rows = new Set(cands.map((i) => rc(i)[0]));
      const cols = new Set(cands.map((i) => rc(i)[1]));
      if (rows.size === 1) {
        const r = [...rows][0];
        // Confirm the constraint actually eliminates something outside the box.
        const eliminatesOutside = Array.from({ length: SIZE }, (_, c) => idx(r, c))
          .filter((i) => { const [, cc] = rc(i); return cc < bc || cc >= bc + BOX; })
          .some((i) => !b[i] && candidates(b, i).includes(v));
        if (!eliminatesOutside) continue;
        return {
          index: cands[0],
          value: v,
          technique: "locked-candidate",
          unit: `box ${bi + 1}`,
          cells: cands,
          reason: `In box ${bi + 1}, ${v} can only sit in row ${r + 1} — so ${v} is eliminated from the rest of row ${r + 1}.`,
        };
      }
      if (cols.size === 1) {
        const c = [...cols][0];
        const eliminatesOutside = Array.from({ length: SIZE }, (_, r) => idx(r, c))
          .filter((i) => {
            const [rr] = rc(i);
            return rr < br || rr >= br + BOX;
          })
          .some((i) => !b[i] && candidates(b, i).includes(v));
        if (!eliminatesOutside) continue;
        return {
          index: cands[0],
          value: v,
          technique: "locked-candidate",
          unit: `box ${bi + 1}`,
          cells: cands,
          reason: `In box ${bi + 1}, ${v} can only sit in column ${c + 1} — so ${v} is eliminated from the rest of column ${c + 1}.`,
        };
      }
    }
  }
  return null;
}

const cellName = (i: number) => { const [r, c] = rc(i); return `R${r + 1}C${c + 1}`; };
const unitKind = (u: number[]) => {
  const coords = u.map(rc);
  const [r0, c0] = coords[0];
  if (coords.every(([r]) => r === r0)) return `row ${r0 + 1}`;
  if (coords.every(([, c]) => c === c0)) return `column ${c0 + 1}`;
  return `box ${Math.floor(r0 / BOX) * BOX + Math.floor(c0 / BOX) + 1}`;
};

export type HintResult =
  | { hint: Hint; tier: "free" | "pro" }
  | { downgrade: true; redirect: Hint | null };

/** Find a hint relevant to `target`. Order: naked single → hidden single
 * (free) → locked candidate → naked pair (pro). If none apply at target,
 * fall back to any hint elsewhere on the board (returned with redirect:true).
 * Pro-tier hints for free users return a downgrade payload with an optional
 * singles-tier redirect. */
export function findHintForCell(
  b: Board,
  target: number,
  opts: { proTechniques: boolean },
): HintResult | null {
  // 1. Naked single AT target
  if (!b[target]) {
    const cs = candidates(b, target);
    if (cs.length === 1) {
      return {
        hint: {
          index: target,
          value: cs[0],
          technique: "naked-single",
          unit: `cell ${cellName(target)}`,
          cells: [],
          reason: `Cell ${cellName(target)} has only one possible digit (${cs[0]}).`,
        },
        tier: "free",
      };
    }
  }

  // 2. Hidden single in any unit containing target, where target is the resolver
  const [tr, tc] = rc(target);
  const tbox = Math.floor(tr / BOX) * BOX + Math.floor(tc / BOX);
  const unitsAtTarget = allUnits.filter((u) => u.includes(target));
  for (const unit of unitsAtTarget) {
    for (let v = 1; v <= 9; v++) {
      if (unit.some((i) => b[i] === v)) continue;
      const cands = unit.filter((i) => !b[i] && candidates(b, i).includes(v));
      if (cands.length === 1 && cands[0] === target) {
        return {
          hint: {
            index: target,
            value: v,
            technique: "hidden-single",
            unit: unitKind(unit),
            cells: unit.filter((j) => !b[j] && j !== target),
            reason: `In this ${unitKind(unit)}, only ${cellName(target)} can hold ${v}.`,
          },
          tier: "free",
        };
      }
    }
  }

  // 3. Pro-tier techniques touching target
  const proHint = findProHintTouching(b, target, tbox);
  if (proHint) {
    if (opts.proTechniques) return { hint: proHint, tier: "pro" };
    // Downgrade for free user
    const redirect = findHint(b);
    if (redirect) redirect.redirect = true;
    return { downgrade: true, redirect };
  }

  // 4. Fallback redirect (any singles-tier hint elsewhere)
  const fallback = findHint(b);
  if (fallback) {
    fallback.redirect = true;
    return { hint: fallback, tier: "free" };
  }
  return null;
}

function findProHintTouching(
  b: Board,
  target: number,
  tbox: number,
): Hint | null {
  // Locked candidate confined to the target's box.
  const lc = findLockedCandidate(b, { boxIndex: tbox });
  if (lc) return lc;
  // Naked pair in any unit (row/col/box) that contains the target.
  const np = findNakedPair(b, { unitFilter: (u) => u.includes(target) });
  if (np) return np;
  return null;
}

export function findNakedPair(
  b: Board,
  opts: { unitFilter?: (u: number[]) => boolean } = {},
): Hint | null {
  for (const unit of allUnits) {
    if (opts.unitFilter && !opts.unitFilter(unit)) continue;
    const empties = unit.filter((i) => !b[i]);
    const pairs: { i: number; cs: number[] }[] = empties
      .map((i) => ({ i, cs: candidates(b, i) }))
      .filter((x) => x.cs.length === 2);
    for (let a = 0; a < pairs.length; a++) {
      for (let bIdx = a + 1; bIdx < pairs.length; bIdx++) {
        const A = pairs[a],
          B = pairs[bIdx];
        if (A.cs[0] !== B.cs[0] || A.cs[1] !== B.cs[1]) continue;
        // Confirm the pair actually eliminates a candidate elsewhere in the unit.
        const eliminates = empties.some(
          (i) =>
            i !== A.i &&
            i !== B.i &&
            candidates(b, i).some((d) => d === A.cs[0] || d === A.cs[1]),
        );
        if (!eliminates) continue;
        return {
          index: A.i,
          value: null,
          technique: "naked-pair",
          unit: unitKind(unit),
          cells: [A.i, B.i],
          reason: `In ${unitKind(unit)}, ${cellName(A.i)} and ${cellName(B.i)} must be ${A.cs[0]} and ${A.cs[1]} in some order — so ${A.cs[0]} and ${A.cs[1]} are eliminated from the other cells.`,
        };
      }
    }
  }
  return null;
}
