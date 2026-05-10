"use client";
import { useMemo } from "react";
import { useGame } from "@/lib/store/game-store";
import { cn } from "@/lib/utils";

interface NumberPadProps {
  onPause?: () => void;
  paused?: boolean;
  /** "default" = vertical right-rail (desktop). "rail" = horizontal bottom bar (mobile). */
  variant?: "default" | "rail";
}

export function NumberPad({ onPause, paused, variant = "default" }: NumberPadProps) {
  const selected = useGame((s) => s.selected);
  const noteMode = useGame((s) => s.noteMode);
  const board = useGame((s) => s.board);
  const selectedVal = selected != null ? board[selected] : 0;
  const setCell = useGame((s) => s.setCell);
  const toggleNote = useGame((s) => s.toggleNote);
  const toggleNoteMode = useGame((s) => s.toggleNoteMode);
  const undo = useGame((s) => s.undo);

  const counts = useMemo(() => {
    const c: Record<number, number> = {
      1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9, 9: 9,
    };
    for (let i = 0; i < 81; i++) {
      const v = board[i];
      if (v) c[v] = Math.max(0, c[v] - 1);
    }
    return c;
  }, [board]);

  const press = (v: number) => {
    if (selected == null) return;
    if (noteMode) toggleNote(selected, v);
    else setCell(selected, v);
  };

  const erase = () => {
    if (selected != null) setCell(selected, 0);
  };

  if (variant === "rail") {
    return (
      <div>
        {/* Action row first (top), digits below — digits sit closer to thumb */}
        <div className="grid grid-cols-4 gap-1.5">
          <button type="button" className="nk-d ak" onClick={undo}>
            ↶ undo
          </button>
          <button
            type="button"
            className={cn("nk-d ak", noteMode && "on")}
            onClick={toggleNoteMode}
            aria-pressed={noteMode}
          >
            ✎ notes
          </button>
          <button type="button" className="nk-d ak" onClick={erase}>
            ⌫ erase
          </button>
          <button
            type="button"
            className={cn("nk-d ak", paused && "on")}
            onClick={onPause}
            aria-pressed={paused}
          >
            ‖ pause
          </button>
        </div>
        <div className="grid grid-cols-9 gap-1 mt-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
            const remaining = counts[n];
            const done = remaining === 0;
            const hot = !done && selectedVal === n;
            const warn = !done && remaining <= 2;
            return (
              <button
                key={n}
                type="button"
                onClick={() => press(n)}
                className={cn(
                  "nk-d nk-d-rail",
                  done && "done",
                  hot && "hot",
                )}
                aria-label={`place ${n}, ${remaining} remaining`}
              >
                {n}
                {!done && (
                  <span className={cn("ct", warn && "warn")}>{remaining}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow mb-2.5">numerals</div>
      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const remaining = counts[n];
          const done = remaining === 0;
          const hot = !done && selectedVal === n;
          const warn = !done && remaining <= 2;
          return (
            <button
              key={n}
              type="button"
              onClick={() => press(n)}
              className={cn("nk-d", done && "done", hot && "hot")}
              aria-label={`place ${n}, ${remaining} remaining`}
            >
              {n}
              {!done && (
                <span className={cn("ct", warn && "warn")}>{remaining}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <button type="button" className="nk-d ak" onClick={undo}>
          ↶ undo
        </button>
        <button
          type="button"
          className={cn("nk-d ak", noteMode && "on")}
          onClick={toggleNoteMode}
          aria-pressed={noteMode}
        >
          ✎ notes
        </button>
        <button type="button" className="nk-d ak" onClick={erase}>
          ⌫ erase
        </button>
        <button
          type="button"
          className={cn("nk-d ak", paused && "on")}
          onClick={onPause}
          aria-pressed={paused}
        >
          ‖ pause
        </button>
      </div>
    </div>
  );
}
