import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, userMessage, fallbackVoice } from "@/lib/coach/prompt";
import type { Hint } from "@/lib/sudoku/techniques";

const nakedSingle: Hint = {
  index: 0,
  value: 1,
  technique: "naked-single",
  unit: "cell R1C1",
  cells: [],
  reason: "Cell R1C1 has only one possible digit (1).",
};

const hiddenSingle: Hint = {
  index: 13,
  value: 7,
  technique: "hidden-single",
  unit: "row 2",
  cells: [10, 11],
  reason: "In this row 2, only R2C5 can hold 7.",
};

const lockedCandidate: Hint = {
  index: 0,
  value: 7,
  technique: "locked-candidate",
  unit: "box 1",
  cells: [0, 1, 2],
  reason: "In box 1, 7 can only sit in row 1 — so 7 is eliminated from the rest of row 1.",
};

const nakedPair: Hint = {
  index: 0,
  value: null,
  technique: "naked-pair",
  unit: "row 1",
  cells: [0, 1],
  reason: "In this row 1, R1C1 and R1C2 must be 1 and 2 in some order.",
};

const redirectHint: Hint = { ...nakedSingle, redirect: true };

describe("SYSTEM_PROMPT", () => {
  it("instructs the model to never invent cells/digits", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent cells, digits, or reasoning/i);
  });

  it("describes nudge mode as no-cell-no-digit", () => {
    expect(SYSTEM_PROMPT).toMatch(/nudge.*NEVER state the cell or digit/is);
  });

  it("describes ask mode as cell + digit + why", () => {
    expect(SYSTEM_PROMPT).toMatch(/ask.*cell.*digit/is);
  });
});

describe("userMessage — hint payloads", () => {
  it("naked-single nudge strips every coordinate- and digit-bearing field", () => {
    const msg = userMessage({ kind: "hint", hint: nakedSingle }, "nudge");
    expect(msg).toContain("Technique: naked-single");
    expect(msg).toContain("Mode: nudge");
    expect(msg).not.toContain("Target cell:");
    expect(msg).not.toContain("Digit:");
    // Naked-single's `unit` is "cell R1C1" — must be omitted, not surfaced.
    expect(msg).not.toContain("R1C1");
    expect(msg).not.toContain("Unit: cell");
    expect(msg).not.toContain("Reasoning:");
    expect(msg).not.toContain("Supporting cells:");
  });

  it("hidden-single nudge keeps the unit label but strips cells/digit/reasoning", () => {
    const msg = userMessage({ kind: "hint", hint: hiddenSingle }, "nudge");
    expect(msg).toContain("Technique: hidden-single");
    expect(msg).toContain("Unit: row 2");
    expect(msg).toContain("Mode: nudge");
    expect(msg).not.toContain("Target cell:");
    expect(msg).not.toContain("Digit: 7");
    expect(msg).not.toContain("R2C5");
    expect(msg).not.toContain("Supporting cells:");
    expect(msg).not.toContain("Reasoning:");
  });

  it("redirect hint in nudge mode does not name a cell", () => {
    const msg = userMessage({ kind: "hint", hint: redirectHint, originalTarget: 40 }, "nudge");
    expect(msg).toContain("Mode: nudge");
    expect(msg).not.toContain("R5C5");
    expect(msg).not.toContain("R1C1");
    expect(msg).not.toContain("Original target");
  });

  it("naked-single ask includes cell and digit", () => {
    const msg = userMessage({ kind: "hint", hint: nakedSingle }, "ask");
    expect(msg).toContain("Target cell: R1C1");
    expect(msg).toContain("Digit: 1");
    expect(msg).toContain("Mode: ask");
  });

  it("hidden-single ask names the unit and digit", () => {
    const msg = userMessage({ kind: "hint", hint: hiddenSingle }, "ask");
    expect(msg).toContain("Unit: row 2");
    expect(msg).toContain("Target cell: R2C5");
    expect(msg).toContain("Digit: 7");
  });

  it("locked-candidate ask includes the digit and supporting cells", () => {
    const msg = userMessage({ kind: "hint", hint: lockedCandidate }, "ask");
    expect(msg).toContain("Technique: locked-candidate");
    expect(msg).toContain("Digit: 7");
    expect(msg).toContain("Supporting cells: R1C1, R1C2, R1C3");
  });

  it("naked-pair ask omits Digit (null) and lists both cells", () => {
    const msg = userMessage({ kind: "hint", hint: nakedPair }, "ask");
    expect(msg).toContain("Technique: naked-pair");
    expect(msg).not.toContain("Digit:");
    expect(msg).toContain("Supporting cells: R1C1, R1C2");
  });

  it("redirect hint prepends a redirect note (ask mode)", () => {
    const msg = userMessage({ kind: "hint", hint: redirectHint, originalTarget: 40 }, "ask");
    expect(msg).toContain("Original target was R5C5");
    expect(msg).toContain("suggesting R1C1 instead");
  });
});

describe("userMessage — downgrade payload", () => {
  it("downgrade with no redirect just sets Mode", () => {
    const msg = userMessage({ kind: "downgrade", redirect: null }, "ask");
    expect(msg).toContain("Mode: downgrade");
    expect(msg).not.toContain("Original target");
  });

  it("downgrade with redirect includes the redirect block", () => {
    const msg = userMessage(
      { kind: "downgrade", redirect: { ...nakedSingle, redirect: true }, originalTarget: 40 },
      "ask",
    );
    expect(msg).toContain("Mode: downgrade");
    expect(msg).toContain("Original target was R5C5");
    expect(msg).toContain("suggesting R1C1 instead");
  });

  it("downgrade nudge omits the redirect block", () => {
    const msg = userMessage(
      { kind: "downgrade", redirect: { ...nakedSingle, redirect: true }, originalTarget: 40 },
      "nudge",
    );
    expect(msg).toContain("Mode: downgrade");
    expect(msg).not.toContain("Original target");
    expect(msg).not.toContain("Suggested cell:");
  });
});

describe("fallbackVoice", () => {
  it("ask returns the engine reason verbatim", () => {
    const msg = fallbackVoice({ kind: "hint", hint: hiddenSingle }, "ask");
    expect(msg).toBe(hiddenSingle.reason);
  });

  it("nudge does not name the cell or digit", () => {
    const msg = fallbackVoice({ kind: "hint", hint: hiddenSingle }, "nudge");
    expect(msg).not.toContain("R2C5");
    expect(msg).not.toContain("7");
    expect(msg).toContain("hidden-single");
    expect(msg).toContain("row 2");
  });

  it("nudge for naked-single omits the cell-shaped unit", () => {
    const msg = fallbackVoice({ kind: "hint", hint: nakedSingle }, "nudge");
    expect(msg).not.toContain("R1C1");
    expect(msg).toContain("naked-single");
  });

  it("downgrade ask names the redirect cell", () => {
    const msg = fallbackVoice(
      { kind: "downgrade", redirect: { ...nakedSingle, redirect: true } },
      "ask",
    );
    expect(msg).toContain("R1C1");
    expect(msg).toMatch(/Pro/i);
  });

  it("downgrade nudge does not name a cell", () => {
    const msg = fallbackVoice(
      { kind: "downgrade", redirect: { ...nakedSingle, redirect: true } },
      "nudge",
    );
    expect(msg).not.toContain("R1C1");
    expect(msg).toMatch(/Pro/i);
  });

  it("downgrade with no redirect still produces a usable line", () => {
    const msg = fallbackVoice({ kind: "downgrade", redirect: null }, "ask");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/Pro/i);
  });
});
