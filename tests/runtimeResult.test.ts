import { describe, expect, it } from 'vitest';
import { GameRuntime } from '../src/game/runtime/GameRuntime';
import type { RuntimeResult } from '../src/game/runtime/types';

interface FinishRunHarness {
  player: {
    health: number;
    maxHealth: number;
  } | null;
  finishRun(victory: boolean): void;
}

function finishVictory(playerHealth: number, playerMaxHealth: number): RuntimeResult {
  let result: RuntimeResult | undefined;
  const runtime = new GameRuntime({
    host: {} as HTMLElement,
    onVictory: (nextResult) => {
      result = nextResult;
    },
  });
  const harness = runtime as unknown as FinishRunHarness;
  harness.player = { health: playerHealth, maxHealth: playerMaxHealth };
  harness.finishRun(true);
  if (!result) throw new Error('Runtime did not emit a victory result.');
  return result;
}

describe('runtime result health contract', () => {
  it.each([
    { health: 50, maxHealth: 100, healthRatio: 0.5, stars: 2 },
    { health: 75, maxHealth: 100, healthRatio: 0.75, stars: 2 },
    { health: 100, maxHealth: 100, healthRatio: 1, stars: 3 },
    { health: 1, maxHealth: 100, healthRatio: 0.01, stars: 1 },
  ] as const)(
    'emits $health/$maxHealth as ratio $healthRatio and $stars star(s)',
    ({ health, maxHealth, healthRatio, stars }) => {
      const result = finishVictory(health, maxHealth);
      expect(result.playerHealth).toBe(health);
      expect(result.playerMaxHealth).toBe(maxHealth);
      expect(result.healthRatio).toBe(healthRatio);
      expect(result.stars).toBe(stars);
    },
  );

  it('clamps over-heal to a full-health result ratio', () => {
    const result = finishVictory(125, 100);
    expect(result.playerHealth).toBe(125);
    expect(result.playerMaxHealth).toBe(100);
    expect(result.healthRatio).toBe(1);
    expect(result.stars).toBe(3);
  });
});
