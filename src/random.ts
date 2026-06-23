export function createSeededRandom(seed: number): () => number {
  let value = Math.trunc(seed) % 2147483647;

  if (value <= 0) {
    value += 2147483646;
  }

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function shuffleWithSeed<T>(values: readonly T[], seed: number): T[] {
  const rng = createSeededRandom(seed);
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = copy[index];
    const swap = copy[swapIndex];

    if (current === undefined || swap === undefined) {
      continue;
    }

    copy[index] = swap;
    copy[swapIndex] = current;
  }

  return copy;
}
