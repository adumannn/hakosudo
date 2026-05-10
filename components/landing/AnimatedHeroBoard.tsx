"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VermillionStamp } from "./VermillionStamp";

// 9×9 grid of given digits (sumi/black, immutable). 32 non-null entries.
export const GIVENS: ReadonlyArray<ReadonlyArray<number | null>> = [
  [1, null, 3, null, null, null, 7, null, 9],
  [null, 5, null, 7, null, 9, null, 2, null],
  [7, null, 9, null, null, null, null, null, 6],
  [null, 3, null, 5, null, 7, null, 9, null],
  [5, 6, null, null, 9, null, null, null, 4],
  [null, 9, null, null, null, 4, null, 6, null],
  [3, null, 5, null, null, null, 9, null, 2],
  [null, 7, null, 9, null, 2, null, null, null],
  [9, null, 2, null, null, null, null, null, 8],
];

// Cells already filled in vermillion when the cycle starts (visible from t=0). 13 entries.
export const START_PLACED: ReadonlyArray<{ r: number; c: number; value: number }> = [
  { r: 0, c: 4, value: 5 },
  { r: 1, c: 2, value: 6 },
  { r: 2, c: 3, value: 1 },
  { r: 2, c: 6, value: 4 },
  { r: 3, c: 4, value: 6 },
  { r: 4, c: 2, value: 7 },
  { r: 4, c: 6, value: 2 },
  { r: 5, c: 3, value: 2 },
  { r: 5, c: 8, value: 7 },
  { r: 6, c: 4, value: 7 },
  { r: 7, c: 2, value: 8 },
  { r: 7, c: 6, value: 3 },
  { r: 8, c: 4, value: 4 },
];

// Cells animated in, in solve order. 36 entries.
// Order jumps between 3×3 boxes the way constraint propagation does.
export const FILL_QUEUE: ReadonlyArray<{ r: number; c: number; value: number }> = [
  // Box top-left
  { r: 0, c: 1, value: 2 },
  { r: 1, c: 0, value: 4 },
  // Hop to top-middle
  { r: 1, c: 4, value: 8 },
  // Back to top-left
  { r: 2, c: 1, value: 8 },
  // Continue top-middle
  { r: 2, c: 4, value: 2 },
  { r: 2, c: 5, value: 3 },
  // Hop to top-right
  { r: 2, c: 7, value: 5 },
  { r: 1, c: 8, value: 3 },
  { r: 0, c: 7, value: 8 },
  { r: 1, c: 6, value: 1 },
  // Finish top-middle
  { r: 0, c: 3, value: 4 },
  { r: 0, c: 5, value: 6 },
  // Hop down to middle-right
  { r: 3, c: 8, value: 1 },
  { r: 3, c: 6, value: 8 },
  { r: 4, c: 7, value: 3 },
  { r: 5, c: 6, value: 5 },
  // Middle-middle
  { r: 4, c: 5, value: 1 },
  { r: 4, c: 3, value: 8 },
  { r: 5, c: 4, value: 3 },
  // Middle-left
  { r: 5, c: 2, value: 1 },
  { r: 5, c: 0, value: 8 },
  { r: 3, c: 2, value: 4 },
  { r: 3, c: 0, value: 2 },
  // Bottom-left
  { r: 6, c: 1, value: 4 },
  { r: 7, c: 0, value: 6 },
  { r: 8, c: 1, value: 1 },
  // Bottom-middle
  { r: 7, c: 4, value: 1 },
  { r: 6, c: 3, value: 6 },
  { r: 6, c: 5, value: 8 },
  { r: 8, c: 3, value: 3 },
  { r: 8, c: 5, value: 5 },
  // Bottom-right
  { r: 6, c: 7, value: 1 },
  { r: 8, c: 6, value: 6 },
  { r: 7, c: 7, value: 4 },
  { r: 8, c: 7, value: 7 },
  { r: 7, c: 8, value: 5 },
];

const TICK_MS = 250;
const SEAL_DELAY_MS = 500;
const FILL_TOTAL_MS = TICK_MS * FILL_QUEUE.length; // 9000ms
const CYCLE_TOTAL_MS = FILL_TOTAL_MS + SEAL_DELAY_MS + 380; // +seal animation

export interface AnimatedHeroBoardProps {
  seqLabel: string;
}

type CellRole =
  | { kind: "given"; value: number }
  | { kind: "placed-static"; value: number }
  | { kind: "queue"; value: number; queueIndex: number };

function buildRoleGrid(): CellRole[][] {
  const grid: (CellRole | null)[][] = Array.from({ length: 9 }, () => Array(9).fill(null));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = GIVENS[r][c];
      if (v !== null) grid[r][c] = { kind: "given", value: v };
    }
  }
  for (const cell of START_PLACED) {
    grid[cell.r][cell.c] = { kind: "placed-static", value: cell.value };
  }
  FILL_QUEUE.forEach((cell, queueIndex) => {
    grid[cell.r][cell.c] = { kind: "queue", value: cell.value, queueIndex };
  });
  return grid as CellRole[][];
}

const ROLE_GRID = buildRoleGrid();
const GIVENS_COUNT = 32;
const START_PLACED_COUNT = 13;

export function AnimatedHeroBoard({ seqLabel }: AnimatedHeroBoardProps): JSX.Element {
  const [placedCount, setPlacedCount] = useState(0);
  const [sealVisible, setSealVisible] = useState(false);
  const timeoutsRef = useRef<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const cycleStateRef = useRef<"idle" | "playing" | "rest">("idle");
  const armReplayRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const id of timeoutsRef.current) {
      window.clearTimeout(id);
    }
    timeoutsRef.current = [];
  }, []);

  const play = useCallback(() => {
    clearTimers();
    cycleStateRef.current = "playing";
    armReplayRef.current = false;
    setPlacedCount(0);
    setSealVisible(false);

    for (let i = 1; i <= FILL_QUEUE.length; i++) {
      const id = window.setTimeout(() => setPlacedCount(i), TICK_MS * i);
      timeoutsRef.current.push(id);
    }
    const sealId = window.setTimeout(
      () => setSealVisible(true),
      FILL_TOTAL_MS + SEAL_DELAY_MS,
    );
    timeoutsRef.current.push(sealId);
    const doneId = window.setTimeout(() => {
      cycleStateRef.current = "rest";
    }, CYCLE_TOTAL_MS);
    timeoutsRef.current.push(doneId);
  }, [clearTimers]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPlacedCount(FILL_QUEUE.length);
      setSealVisible(true);
      cycleStateRef.current = "rest";
      return;
    }

    const el = containerRef.current;
    if (!el) return clearTimers;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (cycleStateRef.current === "idle") {
              play();
            } else if (cycleStateRef.current === "rest" && armReplayRef.current) {
              play();
            }
          } else if (cycleStateRef.current === "rest") {
            armReplayRef.current = true;
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      clearTimers();
    };
  }, [play, clearTimers]);

  const placed = GIVENS_COUNT + START_PLACED_COUNT + placedCount;
  const toGo = FILL_QUEUE.length - placedCount;

  const cells: JSX.Element[] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const role = ROLE_GRID[r][c];
      let className = "hako-cell";
      let display: string | number = "·";

      if (role.kind === "given") {
        className += " given";
        display = role.value;
      } else if (role.kind === "placed-static") {
        className += " player";
        display = role.value;
      } else {
        // role.kind === "queue"
        if (role.queueIndex < placedCount) {
          className += " player";
          display = role.value;
          if (role.queueIndex === placedCount - 1) {
            className += " ink-place";
          }
        } else {
          className += " text-transparent";
        }
      }

      cells.push(
        <div key={`${r}-${c}`} className={className} style={{ cursor: "default" }}>
          <span className="cell-value">{display}</span>
        </div>,
      );
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative px-8 pt-14 pb-12 lg:p-16 bg-rice flex flex-col justify-center overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center">
        <span className="mono text-[9.5px] tracking-[0.22em] uppercase text-moss">
          — preview · today&rsquo;s grid, mid-solve
        </span>
        <span className="mono text-[9.5px] tracking-[0.22em] uppercase text-moss">
          № {seqLabel}
        </span>
      </div>

      <div className="absolute top-[18px] right-[18px]">
        <VermillionStamp glyph="日" size={64} fontSize={34} rotate={8} />
      </div>

      <div className="mt-9 mx-auto w-full max-w-[440px] relative">
        <div className="hako-board">{cells}</div>

        {sealVisible && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <VermillionStamp
              glyph="完"
              size={140}
              fontSize={76}
              rotate={8}
              className="hako-hero-seal"
            />
          </div>
        )}
      </div>

      <div className="mt-6 text-center max-w-[440px] self-center ital text-[15px] text-moss leading-snug">
        — sumi numerals are <em className="text-vermillion-deep">given</em>;
        vermillion are <em className="text-vermillion-deep">yours</em>. The grid
        is the brand.
      </div>

      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end mono text-[9.5px] tracking-[0.18em] uppercase text-moss">
        <div>
          seed <strong className="text-sumi font-medium">7b3c</strong> ·{" "}
          <strong className="text-sumi font-medium">{placed}</strong> placed
        </div>
        <div>
          conflicts <strong className="text-sumi font-medium">0</strong> ·{" "}
          <strong className="text-sumi font-medium">{toGo}</strong> to go
        </div>
      </div>
    </div>
  );
}
