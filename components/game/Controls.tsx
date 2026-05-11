"use client";
import { Undo2, Redo2, Lightbulb, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/store/game-store";
import { findHint } from "@/lib/sudoku/techniques";

export function Controls() {
  const undo = useGame((s) => s.undo);
  const redo = useGame((s) => s.redo);
  const toggleErrors = useGame((s) => s.toggleErrors);
  const errorsOn = useGame((s) => s.errorsHighlighted);
  const hint = useGame((s) => s.hint);
  const board = useGame((s) => s.board);
  const solution = useGame((s) => s.solution);

  const giveHint = () => {
    const h = findHint(board);
    if (h) {
      if (h.value !== null) hint(h.index, h.value);
      return;
    }
    const i = board.findIndex((v) => v === 0);
    if (i >= 0) hint(i, solution[i]);
  };

  return (
    <div className="flex gap-2 w-full max-w-md mt-3">
      <Button variant="outline" size="sm" onClick={undo} aria-label="Undo">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={redo} aria-label="Redo">
        <Redo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={toggleErrors}
        aria-label="Toggle errors"
        className={errorsOn ? "" : "opacity-50"}
      >
        <AlertTriangle className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={giveHint} className="ml-auto">
        <Lightbulb className="h-4 w-4 mr-1" /> Hint
      </Button>
    </div>
  );
}
