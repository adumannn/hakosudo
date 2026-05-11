import { rc } from "@/lib/sudoku/types";
import type { Hint } from "@/lib/sudoku/techniques";

export const SYSTEM_PROMPT = `You are the Sensei in a Japanese-aesthetic sudoku app. You receive a verified hint derived by the engine. Your only job is to phrase it for the player in 2–3 sentences.

Rules:
- Never invent cells, digits, or reasoning. Use exactly what the hint provides.
- "nudge" mode: name the technique and point to the unit. NEVER state the cell or digit.
- "ask" mode: name the technique, the cell (R<row>C<col>), and the digit (if provided). Then a one-sentence why.
- "redirect" hints: gently suggest the player try the other cell instead of the one they selected.
- "downgrade" hints: tell the player this position needs an advanced technique reserved for Pro, and offer the redirect cell if one is provided.
- Tone: spare, encouraging, grounded. No emoji, no exclamations, no filler.`;

export type CoachKind = "ask" | "nudge";

export type CoachPayload =
  | { kind: "hint"; hint: Hint; originalTarget?: number }
  | { kind: "downgrade"; redirect: Hint | null; originalTarget?: number };

const cellName = (i: number) => {
  const [r, c] = rc(i);
  return `R${r + 1}C${c + 1}`;
};

export function userMessage(payload: CoachPayload, kind: CoachKind): string {
  if (payload.kind === "downgrade") {
    const lines = ["Mode: downgrade"];
    if (kind === "ask" && payload.redirect && payload.originalTarget != null) {
      lines.unshift(redirectLine(payload.originalTarget, payload.redirect.index));
      lines.push(`Suggested cell: ${cellName(payload.redirect.index)}`);
    }
    return lines.join("\n");
  }

  const { hint, originalTarget } = payload;
  const lines: string[] = [];

  if (kind === "nudge") {
    // Nudge mode: deliberately strip every field that names a cell or digit.
    // Engine-derived `unit`, `cells`, and `reason` all carry coordinates;
    // emit only the technique and (if available) the unit-level label.
    if (hint.redirect) {
      lines.push("The selected cell has no easy hint — point the player to look elsewhere on the board, without naming a cell.");
    }
    lines.push(`Technique: ${hint.technique}`);
    if (!hint.unit.startsWith("cell ")) {
      lines.push(`Unit: ${hint.unit}`);
    }
    lines.push("Mode: nudge");
    return lines.join("\n");
  }

  // Ask mode
  if (hint.redirect && originalTarget != null) {
    lines.push(redirectLine(originalTarget, hint.index));
  }
  lines.push(`Technique: ${hint.technique}`);
  lines.push(`Unit: ${hint.unit}`);
  lines.push(`Target cell: ${cellName(hint.index)}`);
  if (hint.value !== null) lines.push(`Digit: ${hint.value}`);
  if (hint.cells.length > 0) {
    lines.push(`Supporting cells: ${hint.cells.map(cellName).join(", ")}`);
  }
  lines.push(`Reasoning: ${hint.reason}`);
  lines.push("Mode: ask");
  return lines.join("\n");
}

function redirectLine(from: number, to: number) {
  return `Original target was ${cellName(from)}; suggesting ${cellName(to)} instead.`;
}
