import { generate } from "../lib/sudoku/generator";
import { countSolutions } from "../lib/sudoku/unique";
import { Difficulty } from "../lib/sudoku/types";

const diffs: Difficulty[] = ["easy", "medium", "hard", "expert"];

for (const diff of diffs) {
  console.log(`\n--- ${diff} ---`);
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    const seed = Math.floor(Math.random() * 2 ** 31);
    const { givens } = generate(diff, seed);
    const board = givens.split("").map((c) => +c);
    const clues = board.filter((v) => v > 0).length;
    const ms = Date.now() - t0;
    const count = countSolutions(board, 2);
    console.log(`  seed=${seed} clues=${clues} time=${ms}ms unique=${count === 1}`);
    if (count !== 1) { console.error("FAIL: not unique"); process.exit(1); }
  }
}
console.log("\nAll 40 puzzles generated with unique solutions.");
