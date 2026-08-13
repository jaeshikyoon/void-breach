import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/game/core/rng';

describe('SeededRng', () => {
  it('replays the same run from the same seed', () => {
    const first = new SeededRng('deployment-zero');
    const second = new SeededRng('deployment-zero');
    expect(Array.from({ length: 20 }, () => first.next())).toEqual(
      Array.from({ length: 20 }, () => second.next()),
    );
  });

  it('can restore its serialized state', () => {
    const rng = new SeededRng(42);
    rng.next();
    const state = rng.getState();
    const expected = rng.next();
    rng.setState(state);
    expect(rng.next()).toBe(expected);
  });
});
