import type { CrosswordPuzzle } from "./types";

export type CrosswordDataset = {
  engineVersion: 1;
  profileId: string;
  generatedAt: string;
  puzzles: CrosswordPuzzle[];
};

export type CrosswordDatasetInput = {
  profileId: string;
  generatedAt?: string;
  puzzles: readonly CrosswordPuzzle[];
};

export function exportCrosswordDataset({
  profileId,
  generatedAt = new Date().toISOString(),
  puzzles
}: CrosswordDatasetInput): CrosswordDataset {
  return {
    engineVersion: 1,
    profileId,
    generatedAt,
    puzzles: puzzles.map((puzzle) => ({
      ...puzzle,
      entries: puzzle.entries.map((entry) => ({
        ...entry,
        cells: entry.cells.map((cell) => ({ ...cell }))
      })),
      cells: puzzle.cells.map((cell) => ({
        ...cell,
        entryIds: [...cell.entryIds]
      })),
      prefilledCells: puzzle.prefilledCells.map((cell) => ({ ...cell })),
      validation: {
        ok: puzzle.validation.ok,
        issues: puzzle.validation.issues.map((issue) => ({ ...issue }))
      },
      quality: { ...puzzle.quality }
    }))
  };
}
