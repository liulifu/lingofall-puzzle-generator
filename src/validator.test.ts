import { expect, test } from "bun:test";
import type { CrosswordEntry, CrosswordPuzzle } from "./types";
import { createCrosswordProfile } from "./types";
import { scoreCrosswordPuzzle } from "./scorer";
import { validateCrosswordPuzzle } from "./validator";

const profile = createCrosswordProfile({
  id: "test",
  targetEntryCount: 2,
  maxWidth: 12,
  maxHeight: 12,
  minCrossingCount: 1,
  minCheckedRatio: 0.08
});

test("passes connected puzzles with matching cells", () => {
  const puzzle = makePuzzle([
    makeEntry("email", "EMAIL", "across", { row: 1, col: 0 }),
    makeEntry("meeting", "MEETING", "down", { row: 1, col: 1 })
  ]);
  const report = validateCrosswordPuzzle(puzzle, {
    profile,
    candidateAnswers: ["EMAIL", "MEETING"]
  });
  const score = scoreCrosswordPuzzle(puzzle, report, profile);

  expect(report.ok).toBe(true);
  expect(report.issues).toEqual([]);
  expect(score.total).toBeGreaterThan(70);
});

test("rejects disconnected entries", () => {
  const puzzle = makePuzzle([
    makeEntry("email", "EMAIL", "across", { row: 0, col: 0 }),
    makeEntry("task", "TASK", "across", { row: 5, col: 5 })
  ]);
  const report = validateCrosswordPuzzle(puzzle, {
    profile,
    candidateAnswers: ["EMAIL", "TASK"]
  });

  expect(report.ok).toBe(false);
  expect(report.issues.some((issue) => issue.code === "disconnected")).toBe(true);
});

test("rejects duplicate answers and clues that leak the answer", () => {
  const puzzle = makePuzzle([
    makeEntry("email-a", "EMAIL", "across", { row: 1, col: 0 }, "A work email message."),
    makeEntry("email-b", "EMAIL", "down", { row: 1, col: 0 })
  ]);
  const report = validateCrosswordPuzzle(puzzle, {
    profile,
    candidateAnswers: ["EMAIL"]
  });

  expect(report.ok).toBe(false);
  expect(report.issues.some((issue) => issue.code === "duplicate-answer")).toBe(true);
  expect(report.issues.some((issue) => issue.code === "clue-leaks-answer")).toBe(true);
});

test("rejects accidental across or down fragments that are not entries", () => {
  const puzzle = makePuzzle([
    makeEntry("cat", "CAT", "down", { row: 0, col: 0 }),
    makeEntry("dog", "DOG", "down", { row: 0, col: 1 })
  ]);
  const report = validateCrosswordPuzzle(puzzle, {
    profile,
    candidateAnswers: ["CAT", "DOG"]
  });

  expect(report.ok).toBe(false);
  expect(report.issues.some((issue) => issue.code === "accidental-fragment")).toBe(true);
});

test("rejects prefilled patterns that leave multiple same-length answers", () => {
  const puzzle = makePuzzle([makeEntry("vendor", "VENDOR", "across", { row: 0, col: 0 })], [
    { row: 0, col: 0, entryId: "vendor", answerIndex: 0, letter: "V", reason: "minimum" }
  ]);
  const report = validateCrosswordPuzzle(puzzle, {
    profile,
    candidateAnswers: ["VENDOR", "VECTOR", "VESSEL", "VOLUME"]
  });

  expect(report.ok).toBe(false);
  expect(report.issues.some((issue) => issue.code === "ambiguous-prefill")).toBe(true);
});

function makeEntry(
  id: string,
  answer: string,
  direction: "across" | "down",
  start: { row: number; col: number },
  clue = "A workplace clue."
): CrosswordEntry {
  return {
    id,
    candidateId: id,
    number: 1,
    answer,
    clue,
    direction,
    start,
    cells: [...answer].map((_, index) =>
      direction === "across" ? { row: start.row, col: start.col + index } : { row: start.row + index, col: start.col }
    )
  };
}

function makePuzzle(
  entries: CrosswordEntry[],
  prefilledCells: CrosswordPuzzle["prefilledCells"] = []
): CrosswordPuzzle {
  const cellsByKey = new Map<string, CrosswordPuzzle["cells"][number]>();

  for (const entry of entries) {
    entry.cells.forEach((position, index) => {
      const key = `${position.row},${position.col}`;
      const cell = cellsByKey.get(key);
      const solution = entry.answer.charAt(index);

      if (cell) {
        cell.entryIds.push(entry.id);
      } else {
        cellsByKey.set(key, { ...position, solution, entryIds: [entry.id] });
      }
    });
  }

  const cells = [...cellsByKey.values()];

  return {
    id: "test-puzzle",
    profileId: "test",
    seed: 1,
    width: Math.max(...cells.map((cell) => cell.col)) + 1,
    height: Math.max(...cells.map((cell) => cell.row)) + 1,
    entries,
    cells,
    prefilledCells,
    validation: { ok: true, issues: [] },
    quality: {
      total: 0,
      crossingScore: 0,
      compactnessScore: 0,
      prefillScore: 0,
      validationScore: 0
    }
  };
}
