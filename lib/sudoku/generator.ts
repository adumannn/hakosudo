import { Board, BOX, Difficulty, idx } from "./types";
import { mulberry32 } from "./seed";
import { solve } from "./solver";
import { countSolutions } from "./unique";
import { DIFFICULTY } from "./difficulty";

function shuffle<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fillFullBoard(rng: () => number): Board {
  const b: Board = Array(81).fill(0);
  // Fill the 3 diagonal 3x3 boxes with shuffled 1-9 — they don't share any row, column, or box,
  // so each is independently valid. The solver then completes the rest.
  const setBox = (boxRow: number, boxCol: number) => {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
    let k = 0;
    for (let dr = 0; dr < BOX; dr++)
      for (let dc = 0; dc < BOX; dc++)
        b[idx(boxRow * BOX + dr, boxCol * BOX + dc)] = nums[k++];
  };
  setBox(0, 0); setBox(1, 1); setBox(2, 2);
  return solve(b)!;
}

export function generate(diff: Difficulty, seed: number) {
  const rng = mulberry32(seed);
  const full = fillFullBoard(rng);
  const solution = full.join("");

  const [lo, hi] = DIFFICULTY[diff].clues;
  const target = lo + Math.floor(rng() * (hi - lo + 1));

  const board = full.slice();
  const order = shuffle([...Array(81).keys()], rng);

  let clues = 81;
  for (const i of order) {
    if (clues <= target) break;
    const saved = board[i];
    board[i] = 0;
    if (countSolutions(board, 2) !== 1) {
      board[i] = saved;
    } else {
      clues--;
    }
  }

  return {
    givens: board.map((v) => v.toString()).join(""),
    solution,
  };
}
