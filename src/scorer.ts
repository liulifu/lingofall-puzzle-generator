import type { CrosswordProfile, CrosswordPuzzle, CrosswordQualityScore, CrosswordValidationReport } from "./types";

export function scoreCrosswordPuzzle(
  puzzle: CrosswordPuzzle,
  validation: CrosswordValidationReport,
  profile: CrosswordProfile
): CrosswordQualityScore {
  const crossingCount = puzzle.cells.filter((cell) => cell.entryIds.length > 1).length;
  const crossingScore = Math.min(35, 20 + crossingCount * 5);
  const area = Math.max(1, puzzle.width * puzzle.height);
  const fillRatio = puzzle.cells.length / area;
  const compactnessScore = Math.min(25, Math.round(fillRatio * 90));
  const prefillPressure = puzzle.entries.length === 0 ? 0 : puzzle.prefilledCells.length / puzzle.entries.length;
  const prefillScore = Math.max(5, Math.round(20 - Math.max(0, prefillPressure - 2) * 5));
  const validationScore = validation.ok ? 20 : Math.max(0, 20 - validation.issues.length * 6);
  const profileFitPenalty =
    puzzle.width > profile.maxWidth || puzzle.height > profile.maxHeight || puzzle.entries.length < profile.targetEntryCount
      ? 10
      : 0;
  const total = clampScore(crossingScore + compactnessScore + prefillScore + validationScore - profileFitPenalty);

  return {
    total,
    crossingScore,
    compactnessScore,
    prefillScore,
    validationScore
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
