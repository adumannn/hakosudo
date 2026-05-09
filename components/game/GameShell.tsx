"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/lib/store/game-store";
import { Difficulty } from "@/lib/sudoku/types";
import { findConflicts } from "@/lib/sudoku/validate";
import { Board } from "./Board";
import { NumberPad } from "./NumberPad";
import { Timer } from "./Timer";
import { WinModal } from "./WinModal";
import { CoachPopover, SenseiBody } from "./CoachPopover";
import { Masthead } from "@/components/Masthead";
import { saveGame } from "@/app/actions/save-game";

interface Props {
  difficulty: Difficulty;
  puzzle: { id?: string; givens: string; solution: string };
  dailyDate?: string;
  dailyNumber?: number;
}

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "易 Easy",
  medium: "中 Medium",
  hard: "難 Hard",
  expert: "極 Expert",
};

export function GameShell({ difficulty, puzzle, dailyDate, dailyNumber }: Props) {
  const load = useGame((s) => s.load);
  const setCell = useGame((s) => s.setCell);
  const toggleNote = useGame((s) => s.toggleNote);
  const toggleNoteMode = useGame((s) => s.toggleNoteMode);
  const undo = useGame((s) => s.undo);
  const redo = useGame((s) => s.redo);
  const select = useGame((s) => s.select);
  const pause = useGame((s) => s.pause);
  const resumeTimer = useGame((s) => s.resumeTimer);
  const running = useGame((s) => s.running);

  useEffect(() => {
    load({
      difficulty,
      givens: puzzle.givens,
      solution: puzzle.solution,
      puzzleId: puzzle.id,
      dailyDate,
      dailyNumber,
    });
  }, [load, difficulty, puzzle.givens, puzzle.solution, puzzle.id, dailyDate, dailyNumber]);

  const board = useGame((s) => s.board);
  const notes = useGame((s) => s.notes);
  const givens = useGame((s) => s.givens);
  const elapsed = useGame((s) => s.elapsed);
  const isComplete = useGame((s) => s.isComplete);
  const errorsMade = useGame((s) => s.errorsMade);
  const hintsUsed = useGame((s) => s.hintsUsed);

  // Counts of cells filled and conflicts
  const stats = useMemo(() => {
    const filled = board.filter((v) => v !== 0).length;
    const conflicts = findConflicts(board).length;
    const noteCount = Object.keys(notes).length;
    return { filled, conflicts, noteCount };
  }, [board, notes]);

  // Save
  useEffect(() => {
    if (!useGame.getState().difficulty) return;
    const t = setTimeout(() => {
      saveGame({
        givens: givens.map((v) => v.toString()).join(""),
        current: board.map((v) => v.toString()).join(""),
        notes: Object.fromEntries(
          Object.entries(notes).map(([k, v]) => [k, v as number[]])
        ),
        difficulty,
        puzzleId: puzzle.id,
        dailyDate,
        elapsed,
        errors: errorsMade,
        hints: hintsUsed,
        complete: isComplete,
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [board, notes, elapsed, isComplete, errorsMade, hintsUsed, givens, difficulty, puzzle.id, dailyDate]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGame.getState();
      if (e.key >= "1" && e.key <= "9") {
        if (s.selected == null) return;
        const v = +e.key;
        s.noteMode ? toggleNote(s.selected, v) : setCell(s.selected, v);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (s.selected != null) setCell(s.selected, 0);
        return;
      }
      if (e.key.toLowerCase() === "n") {
        toggleNoteMode();
        return;
      }
      if (
        e.key.toLowerCase() === "z" &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey
      ) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        if (running) pause();
        else resumeTimer();
        return;
      }
      if (e.key.startsWith("Arrow")) {
        if (s.selected == null) {
          select(40);
          return;
        }
        const r = Math.floor(s.selected / 9),
          c = s.selected % 9;
        let nr = r,
          nc = c;
        if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
        else if (e.key === "ArrowDown") nr = Math.min(8, r + 1);
        else if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
        else if (e.key === "ArrowRight") nc = Math.min(8, c + 1);
        select(nr * 9 + nc);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCell, toggleNote, toggleNoteMode, undo, redo, select, pause, resumeTimer, running]);

  const formatDailyTitle = (date: string) => {
    const d = new Date(date);
    const day = d.getUTCDate();
    const month = d.toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const diffName = DIFF_LABEL[difficulty].split(" ")[1] ?? difficulty;
    const seq = dailyNumber != null
      ? `№ ${dailyNumber.toString().padStart(4, "0")} · `
      : "";
    return `Daily ${seq}${day} ${month} · ${diffName}`;
  };
  const titleSegment = dailyDate
    ? formatDailyTitle(dailyDate)
    : DIFF_LABEL[difficulty];

  const seedFragment =
    (puzzle.id ?? "0000").slice(0, 4) + " · seed";

  const [senseiOpen, setSenseiOpen] = useState(false);

  useEffect(() => {
    if (!senseiOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSenseiOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [senseiOpen]);

  const onPauseToggle = () => {
    if (running) pause();
    else resumeTimer();
  };

  return (
    <>
      <Masthead
        variant="game"
        gameTitle={titleSegment}
        timer={<Timer />}
        solvedCount={{ filled: stats.filled, total: 81 }}
        onSensei={() => setSenseiOpen(true)}
      />

      <main className="px-4 lg:px-14 py-8 lg:py-12 pb-[180px] lg:pb-12 max-w-[1480px] mx-auto">
        <div className="grid gap-12 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_360px] items-start">
          {/* LEFT: clock + status */}
          <aside className="hidden lg:block">
            <div className="eyebrow">today&rsquo;s box</div>
            <Timer variant="display" className="mt-2" />
            <p className="ital text-moss text-[16px] mt-2">
              — pacing toward top quartile.
            </p>

            <div className="mt-9 border-t border-sumi pt-4 grid grid-cols-2 gap-4">
              <Stat label="solved" value={`${stats.filled}/81`} />
              <Stat
                label="conflicts"
                value={String(stats.conflicts)}
                accent={stats.conflicts > 0}
              />
              <Stat label="hints used" value={String(hintsUsed)} />
              <Stat label="notes" value={String(stats.noteCount)} />
            </div>

            <div className="mt-9 border-t border-sumi pt-4">
              <div className="eyebrow mb-2.5">your seed</div>
              <div className="mono text-[13px] text-moss">{seedFragment}</div>
              <div className="mono text-[13px] text-moss mt-1">
                {dailyDate ? `${dailyDate}` : difficulty} · {puzzle.id ?? "—"}
              </div>
              <button
                className="btn-hako ghost mt-4 px-3.5 py-2 text-[12px]"
                onClick={() =>
                  navigator.clipboard?.writeText(puzzle.id ?? "no-seed")
                }
              >
                copy seed
              </button>
            </div>
          </aside>

          {/* CENTER: board */}
          <div className="max-w-[min(100vw-32px,640px)] lg:max-w-[640px] w-full mx-auto">
            <Board />

            {/* Keyboard shortcuts under board (desktop only — mobile has the bottom rail) */}
            <div className="hidden lg:flex mt-4 flex-wrap justify-between gap-x-4 gap-y-2 mono text-[10px] tracking-[0.18em] uppercase text-moss">
              <span>
                <kbd className="kbd">1-9</kbd> place
              </span>
              <span>
                <kbd className="kbd">N</kbd> notes
              </span>
              <span>
                <kbd className="kbd">⌘Z</kbd> undo
              </span>
              <span>
                <kbd className="kbd">⌫</kbd> erase
              </span>
              <span>
                <kbd className="kbd">?</kbd> coach
              </span>
              <span>
                <kbd className="kbd">␣</kbd> pause
              </span>
            </div>
          </div>

          {/* RIGHT (desktop only): numpad + sensei */}
          <aside className="hidden lg:block">
            <NumberPad
              paused={!running && !isComplete}
              onPause={onPauseToggle}
            />
            <CoachPopover />
          </aside>
        </div>
      </main>

      {/* MOBILE: fixed bottom rail with numpad */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-bone border-t-[1.5px] border-sumi px-3 pt-2.5"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        <NumberPad
          variant="rail"
          paused={!running && !isComplete}
          onPause={onPauseToggle}
        />
      </div>

      {/* MOBILE: sensei drawer */}
      {senseiOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col">
          <button
            type="button"
            aria-label="close sensei"
            onClick={() => setSenseiOpen(false)}
            className="flex-1 bg-sumi/40"
          />
          <div className="bg-sumi text-bone animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-between items-center px-5 pt-4">
              <div className="mono text-[10px] tracking-[0.22em] uppercase text-bone/65">
                sensei
              </div>
              <button
                type="button"
                onClick={() => setSenseiOpen(false)}
                aria-label="close"
                className="mono text-[11px] tracking-[0.22em] uppercase text-bone/65 hover:text-bone"
              >
                close ×
              </button>
            </div>
            <SenseiBody compact />
          </div>
        </div>
      )}

      <WinModal />
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className={
          "kdate-jp text-2xl font-semibold mt-0.5 tnum " +
          (accent ? "text-hazard" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
