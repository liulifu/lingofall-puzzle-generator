export type CrosswordDirection = "across" | "down";

export type CrosswordPosition = {
  row: number;
  col: number;
};

export type CrosswordCandidate = {
  id: string;
  answer: string;
  clue: string;
  difficulty?: number;
  tags?: readonly string[];
  weight?: number;
  metadata?: Record<string, unknown>;
};

export type CrosswordPrefillPolicy = {
  maxAmbiguousMatches: number;
  maxLettersPerEntry: number;
  minLettersForLength: (length: number) => number;
};

export type CrosswordProfileInput = {
  id: string;
  targetEntryCount: number;
  maxWidth: number;
  maxHeight: number;
  minCrossingCount?: number;
  minCheckedRatio?: number;
  maxAttempts?: number;
  beamWidth?: number;
  placementLimitPerCandidate?: number;
  prefill?: Partial<Omit<CrosswordPrefillPolicy, "minLettersForLength">> & {
    minLettersForLength?: (length: number) => number;
  };
};

export type CrosswordProfile = {
  id: string;
  targetEntryCount: number;
  maxWidth: number;
  maxHeight: number;
  minCrossingCount: number;
  minCheckedRatio: number;
  maxAttempts: number;
  beamWidth: number;
  placementLimitPerCandidate: number;
  prefill: CrosswordPrefillPolicy;
};

export type CrosswordEntry = {
  id: string;
  number: number;
  candidateId: string;
  answer: string;
  clue: string;
  direction: CrosswordDirection;
  start: CrosswordPosition;
  cells: CrosswordPosition[];
};

export type CrosswordCell = CrosswordPosition & {
  solution: string;
  entryIds: string[];
  number?: number;
};

export type CrosswordPrefilledCell = CrosswordPosition & {
  entryId: string;
  answerIndex: number;
  letter: string;
  reason: "minimum" | "ambiguity";
};

export type CrosswordValidationIssueCode =
  | "duplicate-answer"
  | "dimension-overflow"
  | "entry-cell-mismatch"
  | "disconnected"
  | "insufficient-crossings"
  | "insufficient-checked-ratio"
  | "clue-leaks-answer"
  | "accidental-fragment"
  | "ambiguous-prefill";

export type CrosswordValidationIssue = {
  code: CrosswordValidationIssueCode;
  message: string;
  entryId?: string;
};

export type CrosswordValidationReport = {
  ok: boolean;
  issues: CrosswordValidationIssue[];
};

export type CrosswordQualityScore = {
  total: number;
  crossingScore: number;
  compactnessScore: number;
  prefillScore: number;
  validationScore: number;
};

export type CrosswordPuzzle = {
  id: string;
  profileId: string;
  seed: number;
  width: number;
  height: number;
  entries: CrosswordEntry[];
  cells: CrosswordCell[];
  prefilledCells: CrosswordPrefilledCell[];
  validation: CrosswordValidationReport;
  quality: CrosswordQualityScore;
};

export type CrosswordGenerationResult = {
  puzzles: CrosswordPuzzle[];
  rejectedCount: number;
  seed: number;
};

export type CrosswordGenerationOptions = {
  candidates: readonly CrosswordCandidate[];
  profile: CrosswordProfile;
  seed: number;
  limit?: number;
};

export function createCrosswordProfile(input: CrosswordProfileInput): CrosswordProfile {
  return {
    id: input.id,
    targetEntryCount: input.targetEntryCount,
    maxWidth: input.maxWidth,
    maxHeight: input.maxHeight,
    minCrossingCount: input.minCrossingCount ?? Math.max(1, Math.floor(input.targetEntryCount / 2)),
    minCheckedRatio: input.minCheckedRatio ?? 0.25,
    maxAttempts: input.maxAttempts ?? 80,
    beamWidth: input.beamWidth ?? 24,
    placementLimitPerCandidate: input.placementLimitPerCandidate ?? 12,
    prefill: {
      maxAmbiguousMatches: input.prefill?.maxAmbiguousMatches ?? 1,
      maxLettersPerEntry: input.prefill?.maxLettersPerEntry ?? 3,
      minLettersForLength: input.prefill?.minLettersForLength ?? defaultMinLettersForLength
    }
  };
}

function defaultMinLettersForLength(length: number): number {
  if (length <= 5) {
    return 1;
  }

  if (length <= 8) {
    return 2;
  }

  return 3;
}
