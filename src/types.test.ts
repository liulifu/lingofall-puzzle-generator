import { expect, test } from "bun:test";
import type { CrosswordCandidate, CrosswordProfile } from "./types";
import { createCrosswordProfile } from "./types";

test("creates a reusable mini profile with prefill rules", () => {
  const profile: CrosswordProfile = createCrosswordProfile({
    id: "mini",
    targetEntryCount: 8,
    maxWidth: 12,
    maxHeight: 12
  });
  const candidate: CrosswordCandidate = {
    id: "invoice",
    answer: "invoice",
    clue: "A document requesting payment."
  };

  expect(profile.prefill.minLettersForLength(7)).toBe(2);
  expect(profile.minCrossingCount).toBeGreaterThanOrEqual(4);
  expect(profile.beamWidth).toBeGreaterThan(1);
  expect(candidate.answer).toBe("invoice");
});
