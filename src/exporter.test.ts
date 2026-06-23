import { expect, test } from "bun:test";
import { exportCrosswordDataset } from "./exporter";
import type { CrosswordPuzzle } from "./types";

test("exports plain JSON puzzle datasets", () => {
  const dataset = exportCrosswordDataset({
    profileId: "mini",
    generatedAt: "2026-06-22T00:00:00.000Z",
    puzzles: [makePuzzle()]
  });
  const serialized = JSON.stringify(dataset);
  const parsed = JSON.parse(serialized) as typeof dataset;

  expect(parsed.profileId).toBe("mini");
  expect(parsed.generatedAt).toBe("2026-06-22T00:00:00.000Z");
  expect(parsed.puzzles).toHaveLength(1);
  expect(parsed.puzzles[0]?.entries[0]?.answer).toBe("EMAIL");
  expect(parsed.puzzles[0]?.prefilledCells[0]?.letter).toBe("M");
  expect(parsed.puzzles[0]?.validation.ok).toBe(true);
  expect(parsed.puzzles[0]?.quality.total).toBe(88);
  expect(serialized).not.toContain("[object Map]");
  expect(serialized).not.toContain("function");
});

function makePuzzle(): CrosswordPuzzle {
  return {
    id: "mini-1",
    profileId: "mini",
    seed: 1,
    width: 5,
    height: 1,
    entries: [
      {
        id: "email-across-0",
        candidateId: "email",
        answer: "EMAIL",
        clue: "A digital work message.",
        direction: "across",
        number: 1,
        start: { row: 0, col: 0 },
        cells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 0, col: 4 }
        ]
      }
    ],
    cells: [
      { row: 0, col: 0, solution: "E", entryIds: ["email-across-0"], number: 1 },
      { row: 0, col: 1, solution: "M", entryIds: ["email-across-0"] },
      { row: 0, col: 2, solution: "A", entryIds: ["email-across-0"] },
      { row: 0, col: 3, solution: "I", entryIds: ["email-across-0"] },
      { row: 0, col: 4, solution: "L", entryIds: ["email-across-0"] }
    ],
    prefilledCells: [{ row: 0, col: 1, entryId: "email-across-0", answerIndex: 1, letter: "M", reason: "minimum" }],
    validation: { ok: true, issues: [] },
    quality: {
      total: 88,
      crossingScore: 25,
      compactnessScore: 23,
      prefillScore: 20,
      validationScore: 20
    }
  };
}
