import { Board } from "@/lib/sudoku/types";

export const SYSTEM_PROMPT = `You are a Sudoku coach. The user is stuck on a cell. Your job is to nudge them toward the answer using a named technique, NOT to give the answer (unless they explicitly ask).

Process:
1. Identify ONE technique that applies: naked single, hidden single, locked candidate (pointing/claiming), naked pair, hidden pair, X-wing.
2. Name it.
3. Explain it in 2-3 sentences, citing the cells/units involved (use R<row>C<col> notation).
4. Stop. Do not reveal the digit unless the user has already asked twice.

Be encouraging, concise, and concrete. No filler. No emoji.`;

export function serializeBoard(b: Board): string {
  let out = "";
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      out += b[r * 9 + c] === 0 ? "." : b[r * 9 + c].toString();
      if (c % 3 === 2 && c < 8) out += " | ";
    }
    out += "\n";
    if (r % 3 === 2 && r < 8) out += "------+-------+------\n";
  }
  return out;
}

export function userMessage(board: Board, target: number): string {
  const r = Math.floor(target / 9) + 1,
    c = (target % 9) + 1;
  return `Board:\n${serializeBoard(board)}\nI'm stuck on R${r}C${c}. What technique gets me unstuck?`;
}
