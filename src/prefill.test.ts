import { expect, test } from "bun:test";
import type { CrosswordEntry } from "./types";
import { createCrosswordProfile } from "./types";
import { countPatternMatches, selectPrefilledLetters } from "./prefill";

const profile = createCrosswordProfile({
  id: "mini",
  targetEntryCount: 8,
  maxWidth: 12,
  maxHeight: 12
});

test("prefills one letter for short words and two letters for six to eight letter words", () => {
  const entries = [
    makeEntry("risk", "RISK", 0),
    makeEntry("vendor", "VENDOR", 1)
  ];
  const prefilled = selectPrefilledLetters({
    entries,
    candidateAnswers: ["RISK", "TASK", "MASK", "VENDOR", "VECTOR", "VESSEL", "VOLUME"],
    policy: profile.prefill,
    seed: 12
  });

  expect(prefilled.filter((cell) => cell.entryId === "risk").length).toBeGreaterThanOrEqual(1);
  expect(prefilled.filter((cell) => cell.entryId === "vendor").length).toBeGreaterThanOrEqual(2);
});

test("adds high-information letters until same-length candidates are no longer ambiguous", () => {
  const entries = [makeEntry("vendor", "VENDOR", 0)];
  const candidateAnswers = ["VENDOR", "VECTOR", "VESSEL", "VOLUME", "LENDER", "TENDER", "SENDER"];
  const prefilled = selectPrefilledLetters({
    entries,
    candidateAnswers,
    policy: profile.prefill,
    seed: 99
  });
  const vendorPrefills = prefilled.filter((cell) => cell.entryId === "vendor");
  const revealedIndexes = vendorPrefills.map((cell) => cell.answerIndex);

  expect(vendorPrefills.length).toBeLessThanOrEqual(profile.prefill.maxLettersPerEntry);
  expect(countPatternMatches("VENDOR", revealedIndexes, candidateAnswers)).toBe(1);
  expect(vendorPrefills.some((cell) => cell.reason === "ambiguity")).toBe(true);
});

function makeEntry(id: string, answer: string, row: number): CrosswordEntry {
  return {
    id,
    candidateId: id,
    number: row + 1,
    answer,
    clue: `Clue for ${id}`,
    direction: "across",
    start: { row, col: 0 },
    cells: [...answer].map((_, index) => ({ row, col: index }))
  };
}
