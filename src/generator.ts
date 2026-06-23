import { makeEntryCells, measureBounds, nextPosition, parsePositionKey, perpendicularNeighbors, positionKey } from "./grid";
import type { DraftCell } from "./grid";
import { selectPrefilledLetters } from "./prefill";
import { scoreCrosswordPuzzle } from "./scorer";
import type {
  CrosswordCandidate,
  CrosswordDirection,
  CrosswordEntry,
  CrosswordGenerationOptions,
  CrosswordGenerationResult,
  CrosswordPosition,
  CrosswordProfile,
  CrosswordPuzzle
} from "./types";
import { validateCrosswordPuzzle } from "./validator";
import { shuffleWithSeed } from "./random";

type NormalizedCandidate = CrosswordCandidate & {
  answer: string;
};

type DraftEntry = Omit<CrosswordEntry, "number">;

type DraftState = {
  entries: DraftEntry[];
  cells: Map<string, DraftCell>;
  usedCandidateIds: Set<string>;
  crossingCount: number;
  weightTotal: number;
};

type Placement = {
  start: CrosswordPosition;
  direction: CrosswordDirection;
  cells: CrosswordPosition[];
  crossingCount: number;
};

export function generateCrosswordPuzzles({
  candidates,
  profile,
  seed,
  limit = 1
}: CrosswordGenerationOptions): CrosswordGenerationResult {
  const normalizedCandidates = normalizeCandidates(candidates);
  const accepted: CrosswordPuzzle[] = [];
  const seenSignatures = new Set<string>();
  const acceptedAnswerCounts = new Map<string, number>();
  let rejectedCount = 0;

  if (normalizedCandidates.length < profile.targetEntryCount) {
    return {
      puzzles: [],
      rejectedCount: 1,
      seed
    };
  }

  for (let attempt = 0; attempt < profile.maxAttempts && accepted.length < limit; attempt += 1) {
    const attemptSeed = seed + attempt * 10007;
    const orderedCandidates = rankCandidates(normalizedCandidates, attemptSeed, acceptedAnswerCounts);
    let states = createAnchorStates(orderedCandidates, profile, attemptSeed);

    for (let depth = 1; depth < profile.targetEntryCount && states.length > 0; depth += 1) {
      const nextStates: DraftState[] = [];

      for (const state of states) {
        for (const candidate of orderedCandidates) {
          if (state.usedCandidateIds.has(candidate.id)) {
            continue;
          }

          const placements = findPlacements(state, candidate, profile);

          for (const placement of placements) {
            nextStates.push(applyPlacement(state, candidate, placement));
          }
        }
      }

      states = nextStates
        .sort(
          (left, right) =>
            scoreDraftState(right, acceptedAnswerCounts) - scoreDraftState(left, acceptedAnswerCounts)
        )
        .slice(0, profile.beamWidth);
    }

    const attemptPuzzles: CrosswordPuzzle[] = [];

    for (const state of states) {
      if (state.entries.length !== profile.targetEntryCount) {
        rejectedCount += 1;
        continue;
      }

      const puzzle = finalizeState({
        state,
        profile,
        seed: attemptSeed,
        candidateAnswers: normalizedCandidates.map((candidate) => candidate.answer)
      });

      const signature = answerSignature(puzzle);

      if (seenSignatures.has(signature)) {
        rejectedCount += 1;
        continue;
      }

      if (puzzle.validation.ok) {
        attemptPuzzles.push({
          ...puzzle,
          id: `${profile.id}-${attemptSeed}-${hashSignature(signature)}`
        });
      } else {
        rejectedCount += 1;
      }
    }

    const bestAttemptPuzzle = attemptPuzzles.sort(
      (left, right) =>
        diversityAdjustedScore(right, acceptedAnswerCounts) - diversityAdjustedScore(left, acceptedAnswerCounts)
    )[0];

    if (bestAttemptPuzzle) {
      seenSignatures.add(answerSignature(bestAttemptPuzzle));
      for (const entry of bestAttemptPuzzle.entries) {
        acceptedAnswerCounts.set(entry.answer, (acceptedAnswerCounts.get(entry.answer) ?? 0) + 1);
      }
      accepted.push(bestAttemptPuzzle);
    }
  }

  return {
    puzzles: accepted.sort((left, right) => right.quality.total - left.quality.total).slice(0, limit),
    rejectedCount: Math.max(rejectedCount, accepted.length === 0 ? 1 : rejectedCount),
    seed
  };
}

function normalizeCandidates(candidates: readonly CrosswordCandidate[]): NormalizedCandidate[] {
  const seenAnswers = new Set<string>();
  const normalized: NormalizedCandidate[] = [];

  for (const candidate of candidates) {
    const answer = normalizeAnswer(candidate.answer);

    if (answer.length < 2 || seenAnswers.has(answer)) {
      continue;
    }

    seenAnswers.add(answer);
    normalized.push({
      ...candidate,
      answer
    });
  }

  return normalized;
}

function rankCandidates(
  candidates: readonly NormalizedCandidate[],
  seed: number,
  acceptedAnswerCounts: Map<string, number>
): NormalizedCandidate[] {
  return shuffleWithSeed(candidates, seed).sort((left, right) => {
    const usageDelta = (acceptedAnswerCounts.get(left.answer) ?? 0) - (acceptedAnswerCounts.get(right.answer) ?? 0);

    if (usageDelta !== 0) {
      return usageDelta;
    }

    const weightDelta = (right.weight ?? 1) - (left.weight ?? 1);

    if (weightDelta !== 0) {
      return weightDelta;
    }

    return Math.abs(7 - left.answer.length) - Math.abs(7 - right.answer.length);
  });
}

function createAnchorStates(
  candidates: readonly NormalizedCandidate[],
  profile: CrosswordProfile,
  seed: number
): DraftState[] {
  return shuffleWithSeed(candidates, seed + 31)
    .slice(0, Math.min(candidates.length, profile.beamWidth))
    .map((candidate) =>
      applyPlacement(emptyState(), candidate, {
        start: { row: 0, col: 0 },
        direction: "across",
        cells: makeEntryCells(candidate.answer, { row: 0, col: 0 }, "across"),
        crossingCount: 0
      })
    );
}

function emptyState(): DraftState {
  return {
    entries: [],
    cells: new Map(),
    usedCandidateIds: new Set(),
    crossingCount: 0,
    weightTotal: 0
  };
}

function findPlacements(
  state: DraftState,
  candidate: NormalizedCandidate,
  profile: CrosswordProfile
): Placement[] {
  const placements: Placement[] = [];

  for (const entry of state.entries) {
    for (let existingIndex = 0; existingIndex < entry.answer.length; existingIndex += 1) {
      const existingCell = entry.cells[existingIndex];

      if (!existingCell) {
        continue;
      }

      for (let candidateIndex = 0; candidateIndex < candidate.answer.length; candidateIndex += 1) {
        if (entry.answer.charAt(existingIndex) !== candidate.answer.charAt(candidateIndex)) {
          continue;
        }

        const direction: CrosswordDirection = entry.direction === "across" ? "down" : "across";
        const start =
          direction === "across"
            ? { row: existingCell.row, col: existingCell.col - candidateIndex }
            : { row: existingCell.row - candidateIndex, col: existingCell.col };
        const cells = makeEntryCells(candidate.answer, start, direction);
        const placement = canPlace(state, candidate.answer, direction, start, cells, profile);

        if (placement) {
          placements.push(placement);
        }
      }
    }
  }

  return placements
    .sort((left, right) => scorePlacement(right, state) - scorePlacement(left, state))
    .slice(0, profile.placementLimitPerCandidate);
}

function canPlace(
  state: DraftState,
  answer: string,
  direction: CrosswordDirection,
  start: CrosswordPosition,
  cells: readonly CrosswordPosition[],
  profile: CrosswordProfile
): Placement | null {
  let crossingCount = 0;
  const firstCell = cells[0];
  const lastCell = cells[cells.length - 1];

  if (!firstCell || !lastCell) {
    return null;
  }

  if (
    state.cells.has(positionKey(nextPosition(firstCell, direction, -1))) ||
    state.cells.has(positionKey(nextPosition(lastCell, direction, 1)))
  ) {
    return null;
  }

  for (let index = 0; index < cells.length; index += 1) {
    const cellPosition = cells[index];
    const letter = answer.charAt(index);

    if (!cellPosition || !letter) {
      return null;
    }

    const existingCell = state.cells.get(positionKey(cellPosition));

    if (existingCell) {
      if (existingCell.solution !== letter || existingCell.directions.includes(direction)) {
        return null;
      }

      crossingCount += 1;
      continue;
    }

    const [left, right] = perpendicularNeighbors(cellPosition, direction);

    if (state.cells.has(positionKey(left)) || state.cells.has(positionKey(right))) {
      return null;
    }
  }

  if (state.entries.length > 0 && crossingCount === 0) {
    return null;
  }

  const bounds = measureBounds([...state.cells.keys()].map(parsePositionKey).concat(cells));

  if (bounds.width > profile.maxWidth || bounds.height > profile.maxHeight) {
    return null;
  }

  return {
    start,
    direction,
    cells: [...cells],
    crossingCount
  };
}

function applyPlacement(state: DraftState, candidate: NormalizedCandidate, placement: Placement): DraftState {
  const entryId = `${candidate.id}-${placement.direction}-${state.entries.length}`;
  const entries = [
    ...state.entries,
    {
      id: entryId,
      candidateId: candidate.id,
      answer: candidate.answer,
      clue: candidate.clue,
      direction: placement.direction,
      start: placement.start,
      cells: placement.cells
    }
  ];
  const cells = new Map<string, DraftCell>();

  for (const [key, cell] of state.cells.entries()) {
    cells.set(key, {
      ...cell,
      entryIds: [...cell.entryIds],
      directions: [...cell.directions]
    });
  }

  placement.cells.forEach((position, index) => {
    const key = positionKey(position);
    const existingCell = cells.get(key);
    const letter = candidate.answer.charAt(index);

    if (existingCell) {
      cells.set(key, {
        ...existingCell,
        entryIds: [...existingCell.entryIds, entryId],
        directions: [...existingCell.directions, placement.direction]
      });
    } else {
      cells.set(key, {
        ...position,
        solution: letter,
        entryIds: [entryId],
        directions: [placement.direction]
      });
    }
  });

  return {
    entries,
    cells,
    usedCandidateIds: new Set([...state.usedCandidateIds, candidate.id]),
    crossingCount: state.crossingCount + placement.crossingCount,
    weightTotal: state.weightTotal + (candidate.weight ?? 1)
  };
}

function finalizeState({
  state,
  profile,
  seed,
  candidateAnswers
}: {
  state: DraftState;
  profile: CrosswordProfile;
  seed: number;
  candidateAnswers: readonly string[];
}): CrosswordPuzzle {
  const bounds = measureBounds([...state.cells.keys()].map(parsePositionKey));
  const cellsByKey = new Map<string, DraftCell>();

  for (const cell of state.cells.values()) {
    const normalized = { row: cell.row - bounds.minRow, col: cell.col - bounds.minCol };

    cellsByKey.set(positionKey(normalized), {
      ...normalized,
      solution: cell.solution,
      entryIds: [...cell.entryIds],
      directions: [...cell.directions]
    });
  }

  const entries: CrosswordEntry[] = state.entries.map((entry) => ({
    ...entry,
    number: 0,
    start: { row: entry.start.row - bounds.minRow, col: entry.start.col - bounds.minCol },
    cells: entry.cells.map((cell) => ({ row: cell.row - bounds.minRow, col: cell.col - bounds.minCol }))
  }));
  const numberByStart = new Map<string, number>();
  let nextNumber = 1;

  for (const entry of [...entries].sort(
    (left, right) => left.start.row - right.start.row || left.start.col - right.start.col
  )) {
    const key = positionKey(entry.start);
    const number = numberByStart.get(key) ?? nextNumber;

    if (!numberByStart.has(key)) {
      numberByStart.set(key, number);
      nextNumber += 1;
    }

    entry.number = number;
    const cell = cellsByKey.get(key);

    if (cell) {
      cell.number = number;
    }
  }

  const cells = [...cellsByKey.values()]
    .map((cell) => ({
      row: cell.row,
      col: cell.col,
      solution: cell.solution,
      entryIds: [...cell.entryIds],
      number: cell.number
    }))
    .sort((left, right) => left.row - right.row || left.col - right.col);
  const prefilledCells = selectPrefilledLetters({
    entries,
    candidateAnswers,
    policy: profile.prefill,
    seed
  });
  const draftPuzzle: CrosswordPuzzle = {
    id: `${profile.id}-${seed}`,
    profileId: profile.id,
    seed,
    width: bounds.width,
    height: bounds.height,
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
  const validation = validateCrosswordPuzzle(draftPuzzle, { profile, candidateAnswers });
  const quality = scoreCrosswordPuzzle(draftPuzzle, validation, profile);

  return {
    ...draftPuzzle,
    validation,
    quality
  };
}

function scorePlacement(placement: Placement, state: DraftState): number {
  const bounds = measureBounds([...state.cells.keys()].map(parsePositionKey).concat(placement.cells));
  const area = bounds.width * bounds.height;

  return placement.crossingCount * 50 - area - Math.max(bounds.width, bounds.height) * 2;
}

function scoreDraftState(state: DraftState, acceptedAnswerCounts = new Map<string, number>()): number {
  const positions = [...state.cells.keys()].map(parsePositionKey);
  const bounds = measureBounds(positions);
  const area = bounds.width * bounds.height;
  const repeatPenalty = state.entries.reduce(
    (penalty, entry) => penalty + (acceptedAnswerCounts.get(entry.answer) ?? 0) * 160,
    0
  );

  return state.entries.length * 1000 + state.crossingCount * 80 + state.weightTotal * 10 - area - repeatPenalty;
}

function normalizeAnswer(answer: string): string {
  return answer.toUpperCase().replace(/[^A-Z]/g, "");
}

function answerSignature(puzzle: CrosswordPuzzle): string {
  return puzzle.entries
    .map((entry) => entry.answer)
    .sort()
    .join("|");
}

function hashSignature(value: string): string {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function diversityAdjustedScore(puzzle: CrosswordPuzzle, acceptedAnswerCounts: Map<string, number>): number {
  const repeatPenalty = puzzle.entries.reduce(
    (penalty, entry) => penalty + (acceptedAnswerCounts.get(entry.answer) ?? 0) * 18,
    0
  );

  return puzzle.quality.total - repeatPenalty;
}
