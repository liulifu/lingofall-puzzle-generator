import type { CrosswordEntry, CrosswordPrefillPolicy, CrosswordPrefilledCell } from "./types";

export type CrosswordPrefillInput = {
  entries: readonly CrosswordEntry[];
  candidateAnswers: readonly string[];
  policy: CrosswordPrefillPolicy;
  seed: number;
};

export function selectPrefilledLetters({
  entries,
  candidateAnswers,
  policy,
  seed
}: CrosswordPrefillInput): CrosswordPrefilledCell[] {
  const answerUniverse = normalizeAnswers([...candidateAnswers, ...entries.map((entry) => entry.answer)]);
  const prefilled: CrosswordPrefilledCell[] = [];

  entries.forEach((entry, entryIndex) => {
    const answer = normalizeAnswer(entry.answer);
    const selected = new Set<number>();
    const minLetters = Math.min(policy.minLettersForLength(answer.length), answer.length);
    const maxLetters = Math.min(Math.max(minLetters, policy.maxLettersPerEntry), answer.length);

    while (selected.size < maxLetters) {
      const currentMatches = countPatternMatches(answer, [...selected], answerUniverse);
      const needsMinimum = selected.size < minLetters;
      const needsAmbiguityReduction = currentMatches > policy.maxAmbiguousMatches;

      if (!needsMinimum && !needsAmbiguityReduction) {
        break;
      }

      const nextIndex = chooseBestPrefillIndex({
        answer,
        selected,
        candidateAnswers: answerUniverse,
        seed: seed + entryIndex * 7919
      });

      if (nextIndex === null) {
        break;
      }

      selected.add(nextIndex);
      const cell = entry.cells[nextIndex];

      if (!cell) {
        continue;
      }

      prefilled.push({
        ...cell,
        entryId: entry.id,
        answerIndex: nextIndex,
        letter: answer.charAt(nextIndex),
        reason: currentMatches > policy.maxAmbiguousMatches ? "ambiguity" : "minimum"
      });
    }
  });

  return prefilled;
}

export function countPatternMatches(
  answer: string,
  revealedIndexes: readonly number[],
  candidateAnswers: readonly string[]
): number {
  const normalizedAnswer = normalizeAnswer(answer);
  const indexes = [...new Set(revealedIndexes)].filter((index) => index >= 0 && index < normalizedAnswer.length);
  const candidates = normalizeAnswers([...candidateAnswers, normalizedAnswer]).filter(
    (candidate) => candidate.length === normalizedAnswer.length
  );

  return candidates.filter((candidate) =>
    indexes.every((index) => candidate.charAt(index) === normalizedAnswer.charAt(index))
  ).length;
}

function chooseBestPrefillIndex({
  answer,
  selected,
  candidateAnswers,
  seed
}: {
  answer: string;
  selected: Set<number>;
  candidateAnswers: readonly string[];
  seed: number;
}): number | null {
  let best: { index: number; matches: number; rarity: number; tie: number } | null = null;

  for (let index = 0; index < answer.length; index += 1) {
    if (selected.has(index)) {
      continue;
    }

    const nextIndexes = [...selected, index];
    const matches = countPatternMatches(answer, nextIndexes, candidateAnswers);
    const rarity = countLetterAtPosition(answer.charAt(index), index, answer.length, candidateAnswers);
    const tie = seededTie(seed, answer, index);
    const candidate = { index, matches, rarity, tie };

    if (
      !best ||
      candidate.matches < best.matches ||
      (candidate.matches === best.matches && candidate.rarity < best.rarity) ||
      (candidate.matches === best.matches && candidate.rarity === best.rarity && candidate.tie < best.tie)
    ) {
      best = candidate;
    }
  }

  return best?.index ?? null;
}

function countLetterAtPosition(
  letter: string,
  index: number,
  answerLength: number,
  candidateAnswers: readonly string[]
): number {
  return candidateAnswers.filter((candidate) => candidate.length === answerLength && candidate.charAt(index) === letter)
    .length;
}

function seededTie(seed: number, answer: string, index: number): number {
  let value = seed + index * 1009;

  for (const letter of answer) {
    value = (value * 33 + letter.charCodeAt(0)) % 2147483647;
  }

  return value;
}

function normalizeAnswers(answers: readonly string[]): string[] {
  return [...new Set(answers.map(normalizeAnswer).filter(Boolean))];
}

function normalizeAnswer(answer: string): string {
  return answer.toUpperCase().replace(/[^A-Z]/g, "");
}
