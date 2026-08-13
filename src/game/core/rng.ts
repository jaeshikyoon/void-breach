/** A serializable deterministic PRNG based on mulberry32. */
export class SeededRng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  int(minInclusive: number, maxInclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
      throw new TypeError('SeededRng.int bounds must be integers.');
    }
    if (maxInclusive < minInclusive) {
      throw new RangeError('SeededRng.int max must be greater than or equal to min.');
    }
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError('Probability must be between 0 and 1.');
    }
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from an empty collection.');
    }
    return items[this.int(0, items.length - 1)] as T;
  }

  weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from an empty collection.');
    }

    let total = 0;
    for (const item of items) {
      const itemWeight = weight(item);
      if (!Number.isFinite(itemWeight) || itemWeight < 0) {
        throw new RangeError('Weights must be finite and non-negative.');
      }
      total += itemWeight;
    }

    if (total <= 0) {
      throw new RangeError('At least one item must have a positive weight.');
    }

    let cursor = this.next() * total;
    for (const item of items) {
      cursor -= weight(item);
      if (cursor < 0) return item;
    }

    return items[items.length - 1] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
    }
    return result;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    if (!Number.isInteger(state)) throw new TypeError('RNG state must be an integer.');
    this.state = state >>> 0;
  }
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export type RandomSource = Pick<SeededRng, 'next' | 'int' | 'pick' | 'weightedPick' | 'shuffle'>;
