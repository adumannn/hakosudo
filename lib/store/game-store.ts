import { create } from "zustand";
import { Board, Notes, Difficulty } from "@/lib/sudoku/types";
import { findConflicts, isComplete } from "@/lib/sudoku/validate";
import { safeLocal } from "./persist";

const KEY = "sudoku/game-v1";

type Snapshot = { board: Board; notes: Notes };

export interface GameState {
  difficulty: Difficulty | null;
  givens: Board;
  board: Board;
  notes: Notes;
  solution: Board;
  history: Snapshot[];
  future: Snapshot[];
  selected: number | null;
  noteMode: boolean;
  errorsHighlighted: boolean;
  errorsMade: number;
  hintsUsed: number;
  elapsed: number;
  running: boolean;
  isComplete: boolean;
  puzzleId: string | null;
  dailyDate: string | null;
  dailyNumber: number | null;

  load: (p: { difficulty: Difficulty; givens: string; solution: string; puzzleId?: string; dailyDate?: string; dailyNumber?: number; }) => void;
  resume: () => boolean;
  setCell: (i: number, v: number) => void;
  toggleNote: (i: number, v: number) => void;
  undo: () => void;
  redo: () => void;
  select: (i: number | null) => void;
  toggleNoteMode: () => void;
  toggleErrors: () => void;
  tick: () => void;
  pause: () => void;
  resumeTimer: () => void;
  hint: (cellIndex: number, value: number) => void;
  reset: () => void;
}

export const useGame = create<GameState>((set, get) => ({
  difficulty: null,
  givens: Array(81).fill(0),
  board: Array(81).fill(0),
  notes: {},
  solution: Array(81).fill(0),
  history: [],
  future: [],
  selected: null,
  noteMode: false,
  errorsHighlighted: true,
  errorsMade: 0,
  hintsUsed: 0,
  elapsed: 0,
  running: false,
  isComplete: false,
  puzzleId: null,
  dailyDate: null,
  dailyNumber: null,

  load: ({ difficulty, givens, solution, puzzleId, dailyDate, dailyNumber }) => {
    const g = givens.split("").map(Number);
    const s = solution.split("").map(Number);
    const next = {
      difficulty,
      givens: g,
      board: g.slice(),
      solution: s,
      notes: {},
      history: [],
      future: [],
      selected: null,
      errorsMade: 0,
      hintsUsed: 0,
      elapsed: 0,
      running: true,
      isComplete: false,
      puzzleId: puzzleId ?? null,
      dailyDate: dailyDate ?? null,
      dailyNumber: dailyNumber ?? null,
    };
    set(next);
    safeLocal.set(KEY, next);
  },

  resume: () => {
    const saved = safeLocal.get<Partial<GameState>>(KEY);
    if (!saved || !saved.givens) return false;
    set({ ...saved, running: true });
    return true;
  },

  setCell: (i, v) => {
    const s = get();
    if (s.givens[i] !== 0 || s.isComplete) return;
    const snapshot: Snapshot = { board: s.board.slice(), notes: { ...s.notes } };
    const board = s.board.slice();
    board[i] = v;
    const notes = { ...s.notes };
    delete notes[i];
    const conflicts = findConflicts(board);
    const errorsMade = conflicts.includes(i) ? s.errorsMade + 1 : s.errorsMade;
    const complete = isComplete(board) && conflicts.length === 0;
    set({
      board,
      notes,
      history: [...s.history, snapshot].slice(-200),
      future: [],
      errorsMade,
      isComplete: complete,
      running: !complete && s.running,
    });
    safeLocal.set(KEY, get());
  },

  toggleNote: (i, v) => {
    const s = get();
    if (s.givens[i] !== 0 || s.board[i] !== 0) return;
    const snapshot: Snapshot = { board: s.board.slice(), notes: { ...s.notes } };
    const cur = s.notes[i] ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort();
    const notes = { ...s.notes };
    if (next.length) notes[i] = next;
    else delete notes[i];
    set({ notes, history: [...s.history, snapshot].slice(-200), future: [] });
    safeLocal.set(KEY, get());
  },

  undo: () => {
    const s = get();
    const last = s.history.at(-1);
    if (!last) return;
    const cur: Snapshot = { board: s.board.slice(), notes: { ...s.notes } };
    set({ board: last.board, notes: last.notes, history: s.history.slice(0, -1), future: [...s.future, cur] });
    safeLocal.set(KEY, get());
  },

  redo: () => {
    const s = get();
    const last = s.future.at(-1);
    if (!last) return;
    const cur: Snapshot = { board: s.board.slice(), notes: { ...s.notes } };
    set({ board: last.board, notes: last.notes, future: s.future.slice(0, -1), history: [...s.history, cur] });
    safeLocal.set(KEY, get());
  },

  select: (i) => set({ selected: i }),
  toggleNoteMode: () => set((s) => ({ noteMode: !s.noteMode })),
  toggleErrors: () => set((s) => ({ errorsHighlighted: !s.errorsHighlighted })),
  tick: () => {
    const s = get();
    if (s.running && !s.isComplete) {
      set({ elapsed: s.elapsed + 1 });
      safeLocal.set(KEY, get());
    }
  },
  pause: () => set({ running: false }),
  resumeTimer: () => {
    const s = get();
    if (!s.isComplete) set({ running: true });
  },
  hint: (i, v) => {
    const s = get();
    if (s.isComplete) return;
    const snapshot: Snapshot = { board: s.board.slice(), notes: { ...s.notes } };
    const board = s.board.slice();
    board[i] = v;
    set({
      board,
      history: [...s.history, snapshot].slice(-200),
      future: [],
      hintsUsed: s.hintsUsed + 1,
    });
    safeLocal.set(KEY, get());
  },
  reset: () => {
    safeLocal.remove(KEY);
    set({
      difficulty: null,
      board: Array(81).fill(0),
      givens: Array(81).fill(0),
      notes: {},
      history: [],
      future: [],
      elapsed: 0,
      running: false,
      isComplete: false,
    });
  },
}));
