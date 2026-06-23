import { expect, test } from "bun:test";
import { generateCrosswordPuzzles } from "./generator";
import { createCrosswordProfile } from "./types";

const officeCandidates = [
  "MEETING",
  "EMAIL",
  "AGENDA",
  "REPORT",
  "INVOICE",
  "CLIENT",
  "BUDGET",
  "TASK",
  "RISK",
  "DEMO",
  "LEAD",
  "VENDOR",
  "REVIEW",
  "UPDATE",
  "SUMMARY",
  "APPROVAL",
  "ROADMAP",
  "HANDOFF",
  "RECEIPT",
  "REQUEST",
  "PROJECT",
  "OFFICE",
  "TICKET",
  "SUPPORT",
  "OWNER",
  "DRAFT",
  "PLAN",
  "CALL",
  "NOTE",
  "TEAM"
].map((answer, index) => ({
  id: answer.toLowerCase(),
  answer,
  clue: `A workplace clue number ${index + 1}.`,
  weight: index < 20 ? 2 : 1
}));

test("generates deterministic puzzles for the same seed", () => {
  const profile = createCrosswordProfile({
    id: "mini",
    targetEntryCount: 8,
    maxWidth: 12,
    maxHeight: 12,
    minCrossingCount: 4,
    beamWidth: 32
  });
  const first = generateCrosswordPuzzles({ candidates: officeCandidates, profile, seed: 20260622, limit: 1 });
  const second = generateCrosswordPuzzles({ candidates: officeCandidates, profile, seed: 20260622, limit: 1 });

  expect(first.puzzles).toEqual(second.puzzles);
  expect(first.puzzles[0]?.entries).toHaveLength(8);
});

test("generates a valid mini puzzle with prefilled letters", () => {
  const profile = createCrosswordProfile({
    id: "mini",
    targetEntryCount: 8,
    maxWidth: 12,
    maxHeight: 12,
    minCrossingCount: 4,
    minCheckedRatio: 0.12,
    beamWidth: 32
  });
  const result = generateCrosswordPuzzles({ candidates: officeCandidates, profile, seed: 44, limit: 1 });
  const puzzle = result.puzzles[0];

  expect(puzzle).toBeDefined();
  expect(puzzle?.validation.ok).toBe(true);
  expect(puzzle?.entries).toHaveLength(8);
  expect(puzzle?.width).toBeLessThanOrEqual(12);
  expect(puzzle?.height).toBeLessThanOrEqual(12);
  expect(puzzle?.prefilledCells.length).toBeGreaterThanOrEqual(8);
  expect(new Set(puzzle?.entries.map((entry) => entry.answer)).size).toBe(8);
});

test("generates unique ids and answer sets when exporting multiple puzzles", () => {
  const profile = createCrosswordProfile({
    id: "mini",
    targetEntryCount: 8,
    maxWidth: 12,
    maxHeight: 12,
    minCrossingCount: 4,
    minCheckedRatio: 0.12,
    beamWidth: 32,
    maxAttempts: 120
  });
  const result = generateCrosswordPuzzles({ candidates: officeCandidates, profile, seed: 44, limit: 5 });
  const ids = result.puzzles.map((puzzle) => puzzle.id);
  const answerSignatures = result.puzzles.map((puzzle) =>
    puzzle.entries
      .map((entry) => entry.answer)
      .sort()
      .join("|")
  );

  expect(result.puzzles).toHaveLength(5);
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(answerSignatures).size).toBe(answerSignatures.length);

  const answerCounts = new Map<string, number>();

  for (const puzzle of result.puzzles) {
    for (const entry of puzzle.entries) {
      answerCounts.set(entry.answer, (answerCounts.get(entry.answer) ?? 0) + 1);
    }
  }

  expect(Math.max(...answerCounts.values())).toBeLessThan(result.puzzles.length);
});

test("supports larger 20-word profiles without changing the public API", () => {
  const profile = createCrosswordProfile({
    id: "classic-seed",
    targetEntryCount: 20,
    maxWidth: 24,
    maxHeight: 24,
    minCrossingCount: 12,
    minCheckedRatio: 0.12,
    beamWidth: 24,
    maxAttempts: 20,
    placementLimitPerCandidate: 10
  });
  const result = generateCrosswordPuzzles({ candidates: officeCandidates, profile, seed: 77, limit: 1 });
  const puzzle = result.puzzles[0];

  expect(puzzle).toBeDefined();
  expect(puzzle?.validation.ok).toBe(true);
  expect(puzzle?.entries).toHaveLength(20);
  expect(puzzle?.width).toBeLessThanOrEqual(24);
  expect(puzzle?.height).toBeLessThanOrEqual(24);
});

test("generates a classic crossword within a 15x15 board", () => {
  const profile = createCrosswordProfile({
    id: "classic",
    targetEntryCount: 20,
    maxWidth: 15,
    maxHeight: 15,
    minCrossingCount: 12,
    minCheckedRatio: 0.16,
    beamWidth: 64,
    maxAttempts: 120,
    placementLimitPerCandidate: 20
  });
  const result = generateCrosswordPuzzles({ candidates: officeCandidates, profile, seed: 20260623, limit: 1 });
  const puzzle = result.puzzles[0];

  expect(puzzle).toBeDefined();
  expect(puzzle?.entries.length).toBeGreaterThanOrEqual(20);
  expect(puzzle?.width).toBeLessThanOrEqual(15);
  expect(puzzle?.height).toBeLessThanOrEqual(15);
  expect(puzzle?.validation.ok).toBe(true);
}, 10000);

test("returns no puzzles for impossible pools instead of emitting invalid data", () => {
  const profile = createCrosswordProfile({
    id: "impossible",
    targetEntryCount: 3,
    maxWidth: 8,
    maxHeight: 8,
    minCrossingCount: 2,
    maxAttempts: 5
  });
  const result = generateCrosswordPuzzles({
    candidates: [
      { id: "abc", answer: "ABC", clue: "Letters." },
      { id: "def", answer: "DEF", clue: "Letters." },
      { id: "ghi", answer: "GHI", clue: "Letters." }
    ],
    profile,
    seed: 1,
    limit: 1
  });

  expect(result.puzzles).toEqual([]);
  expect(result.rejectedCount).toBeGreaterThan(0);
});
