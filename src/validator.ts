import { countPatternMatches } from "./prefill";
import type {
  CrosswordCell,
  CrosswordEntry,
  CrosswordPosition,
  CrosswordProfile,
  CrosswordPuzzle,
  CrosswordValidationIssue,
  CrosswordValidationReport
} from "./types";

export type CrosswordValidationInput = {
  profile: CrosswordProfile;
  candidateAnswers: readonly string[];
};

export function validateCrosswordPuzzle(
  puzzle: CrosswordPuzzle,
  { profile, candidateAnswers }: CrosswordValidationInput
): CrosswordValidationReport {
  const issues: CrosswordValidationIssue[] = [];
  const cellsByKey = new Map(puzzle.cells.map((cell) => [positionKey(cell), cell]));

  addDuplicateAnswerIssues(puzzle.entries, issues);
  addDimensionIssues(puzzle, profile, issues);
  addEntryCellIssues(puzzle.entries, cellsByKey, issues);
  addConnectionIssues(puzzle, issues);
  addCrossingIssues(puzzle, profile, issues);
  addClueLeakIssues(puzzle.entries, issues);
  addAccidentalFragmentIssues(puzzle, issues);
  addPrefillAmbiguityIssues(puzzle, profile, candidateAnswers, issues);

  return {
    ok: issues.length === 0,
    issues
  };
}

function addDuplicateAnswerIssues(entries: readonly CrosswordEntry[], issues: CrosswordValidationIssue[]): void {
  const seen = new Map<string, string>();

  for (const entry of entries) {
    const answer = normalizeAnswer(entry.answer);
    const existingEntryId = seen.get(answer);

    if (existingEntryId) {
      issues.push({
        code: "duplicate-answer",
        message: `Answer ${answer} is used by both ${existingEntryId} and ${entry.id}.`,
        entryId: entry.id
      });
    } else {
      seen.set(answer, entry.id);
    }
  }
}

function addDimensionIssues(
  puzzle: CrosswordPuzzle,
  profile: CrosswordProfile,
  issues: CrosswordValidationIssue[]
): void {
  if (puzzle.width > profile.maxWidth || puzzle.height > profile.maxHeight) {
    issues.push({
      code: "dimension-overflow",
      message: `Puzzle is ${puzzle.width}x${puzzle.height}, exceeding ${profile.maxWidth}x${profile.maxHeight}.`
    });
  }
}

function addEntryCellIssues(
  entries: readonly CrosswordEntry[],
  cellsByKey: Map<string, CrosswordCell>,
  issues: CrosswordValidationIssue[]
): void {
  for (const entry of entries) {
    if (entry.cells.length !== entry.answer.length) {
      issues.push({
        code: "entry-cell-mismatch",
        message: `Entry ${entry.id} has ${entry.cells.length} cells for ${entry.answer.length} letters.`,
        entryId: entry.id
      });
      continue;
    }

    entry.cells.forEach((position, index) => {
      const cell = cellsByKey.get(positionKey(position));
      const expected = normalizeAnswer(entry.answer).charAt(index);

      if (!cell || cell.solution !== expected || !cell.entryIds.includes(entry.id)) {
        issues.push({
          code: "entry-cell-mismatch",
          message: `Entry ${entry.id} does not match the cell at ${positionKey(position)}.`,
          entryId: entry.id
        });
      }
    });
  }
}

function addConnectionIssues(puzzle: CrosswordPuzzle, issues: CrosswordValidationIssue[]): void {
  if (puzzle.entries.length <= 1) {
    return;
  }

  const entryIds = new Set(puzzle.entries.map((entry) => entry.id));
  const graph = new Map<string, Set<string>>();

  for (const entryId of entryIds) {
    graph.set(entryId, new Set());
  }

  for (const cell of puzzle.cells) {
    if (cell.entryIds.length < 2) {
      continue;
    }

    for (const left of cell.entryIds) {
      for (const right of cell.entryIds) {
        if (left !== right) {
          graph.get(left)?.add(right);
        }
      }
    }
  }

  const firstEntry = puzzle.entries[0];

  if (!firstEntry) {
    return;
  }

  const visited = new Set<string>();
  const stack = [firstEntry.id];

  while (stack.length > 0) {
    const entryId = stack.pop();

    if (!entryId || visited.has(entryId)) {
      continue;
    }

    visited.add(entryId);
    graph.get(entryId)?.forEach((neighbor) => stack.push(neighbor));
  }

  if (visited.size !== entryIds.size) {
    issues.push({
      code: "disconnected",
      message: `Only ${visited.size} of ${entryIds.size} entries are connected by crossings.`
    });
  }
}

function addCrossingIssues(
  puzzle: CrosswordPuzzle,
  profile: CrosswordProfile,
  issues: CrosswordValidationIssue[]
): void {
  const crossingCount = puzzle.cells.filter((cell) => cell.entryIds.length > 1).length;
  const checkedRatio = puzzle.cells.length === 0 ? 0 : crossingCount / puzzle.cells.length;

  if (crossingCount < profile.minCrossingCount) {
    issues.push({
      code: "insufficient-crossings",
      message: `Puzzle has ${crossingCount} crossings, below required ${profile.minCrossingCount}.`
    });
  }

  if (checkedRatio < profile.minCheckedRatio) {
    issues.push({
      code: "insufficient-checked-ratio",
      message: `Puzzle checked ratio is ${checkedRatio.toFixed(2)}, below required ${profile.minCheckedRatio}.`
    });
  }
}

function addClueLeakIssues(entries: readonly CrosswordEntry[], issues: CrosswordValidationIssue[]): void {
  for (const entry of entries) {
    const clue = entry.clue.toLowerCase();
    const answer = entry.answer.toLowerCase();

    if (answer.length > 2 && clue.includes(answer)) {
      issues.push({
        code: "clue-leaks-answer",
        message: `Clue for ${entry.id} contains its answer.`,
        entryId: entry.id
      });
    }
  }
}

function addAccidentalFragmentIssues(puzzle: CrosswordPuzzle, issues: CrosswordValidationIssue[]): void {
  const cellsByKey = new Map(puzzle.cells.map((cell) => [positionKey(cell), cell]));
  const entrySegments = new Set(
    puzzle.entries.map((entry) => segmentKey(entry.direction, entry.cells.map(positionKey)))
  );

  for (const direction of ["across", "down"] as const) {
    for (const segment of findSegments(puzzle.cells, direction, cellsByKey)) {
      if (segment.length > 1 && !entrySegments.has(segmentKey(direction, segment.map(positionKey)))) {
        issues.push({
          code: "accidental-fragment",
          message: `Found an unplanned ${direction} fragment at ${segment.map(positionKey).join(" ")}.`
        });
      }
    }
  }
}

function addPrefillAmbiguityIssues(
  puzzle: CrosswordPuzzle,
  profile: CrosswordProfile,
  candidateAnswers: readonly string[],
  issues: CrosswordValidationIssue[]
): void {
  for (const entry of puzzle.entries) {
    const indexes = puzzle.prefilledCells
      .filter((cell) => cell.entryId === entry.id)
      .map((cell) => cell.answerIndex);
    const matches = countPatternMatches(entry.answer, indexes, candidateAnswers);

    if (matches > profile.prefill.maxAmbiguousMatches) {
      issues.push({
        code: "ambiguous-prefill",
        message: `Prefill pattern for ${entry.id} still matches ${matches} answers.`,
        entryId: entry.id
      });
    }
  }
}

function findSegments(
  cells: readonly CrosswordCell[],
  direction: "across" | "down",
  cellsByKey: Map<string, CrosswordCell>
): CrosswordPosition[][] {
  const segments: CrosswordPosition[][] = [];

  for (const cell of cells) {
    const previous =
      direction === "across" ? { row: cell.row, col: cell.col - 1 } : { row: cell.row - 1, col: cell.col };

    if (cellsByKey.has(positionKey(previous))) {
      continue;
    }

    const segment: CrosswordPosition[] = [];
    let next = { row: cell.row, col: cell.col };

    while (cellsByKey.has(positionKey(next))) {
      segment.push(next);
      next = direction === "across" ? { row: next.row, col: next.col + 1 } : { row: next.row + 1, col: next.col };
    }

    segments.push(segment);
  }

  return segments;
}

function segmentKey(direction: "across" | "down", keys: readonly string[]): string {
  return `${direction}:${keys.join(";")}`;
}

function positionKey(position: CrosswordPosition): string {
  return `${position.row},${position.col}`;
}

function normalizeAnswer(answer: string): string {
  return answer.toUpperCase().replace(/[^A-Z]/g, "");
}
