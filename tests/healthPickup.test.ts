import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  HEALTH_PICKUP_DROP_CHANCE,
  HEALTH_PICKUP_HEAL_FRACTION,
  calculateHealthPickupHeal,
  shouldDropHealthPickup,
} from '../src/game/core/healthPickup';
import { GameRuntime } from '../src/game/runtime/GameRuntime';

interface PickupHarness {
  player: {
    position: { x: number; y: number };
    health: number;
    maxHealth: number;
  } | null;
  healthPickups: Array<{
    active: boolean;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    visual: Container;
    glow: Graphics;
  }>;
  updateHealthPickups(delta: number): void;
}

function collectPickup(health: number, maxHealth: number) {
  const runtime = new GameRuntime({ host: {} as HTMLElement });
  const harness = runtime as unknown as PickupHarness;
  const visual = new Container();
  const glow = new Graphics();
  visual.addChild(glow);
  const pickup = {
    active: true,
    position: { x: 200, y: 300 },
    velocity: { x: 0, y: 0 },
    visual,
    glow,
  };
  harness.player = {
    position: { x: 200, y: 300 },
    health,
    maxHealth,
  };
  harness.healthPickups.push(pickup);
  harness.updateHealthPickups(0);
  return { player: harness.player, pickup };
}

describe('health pickup drop contract', () => {
  it('uses an exclusive two-percent deterministic roll threshold', () => {
    expect(HEALTH_PICKUP_DROP_CHANCE).toBe(0.02);
    expect(shouldDropHealthPickup({ spawnSource: 'director', roll: 0 })).toBe(true);
    expect(shouldDropHealthPickup({ spawnSource: 'director', roll: 0.019_999_999 })).toBe(true);
    expect(shouldDropHealthPickup({ spawnSource: 'director', roll: 0.02 })).toBe(false);
    expect(shouldDropHealthPickup({ spawnSource: 'director', roll: 0.999_999 })).toBe(false);
  });

  it('excludes summoned and boss-spawned monsters regardless of the roll', () => {
    expect(shouldDropHealthPickup({ spawnSource: 'summoner', roll: 0 })).toBe(false);
    expect(shouldDropHealthPickup({ spawnSource: 'boss', roll: 0 })).toBe(false);
    expect(shouldDropHealthPickup({ spawnSource: 'summoner', roll: 0.019 })).toBe(false);
    expect(shouldDropHealthPickup({ spawnSource: 'boss', roll: 0.019 })).toBe(false);
  });

  it('supports deterministic custom rates and rejects invalid director rolls', () => {
    expect(shouldDropHealthPickup({ spawnSource: 'director', roll: 0.4, dropChance: 0.5 })).toBe(true);
    expect(shouldDropHealthPickup({ spawnSource: 'director', roll: 0.5, dropChance: 0.5 })).toBe(false);
    for (const roll of [-0.001, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => shouldDropHealthPickup({ spawnSource: 'director', roll })).toThrow(RangeError);
    }
  });
});

describe('health pickup healing contract', () => {
  it('heals for fifteen percent of maximum health', () => {
    expect(HEALTH_PICKUP_HEAL_FRACTION).toBe(0.15);
    expect(calculateHealthPickupHeal(100)).toBe(15);
    expect(calculateHealthPickupHeal(240)).toBe(36);
    expect(calculateHealthPickupHeal(123)).toBe(18.45);
  });

  it('returns no healing for invalid health inputs', () => {
    expect(calculateHealthPickupHeal(0)).toBe(0);
    expect(calculateHealthPickupHeal(-100)).toBe(0);
    expect(calculateHealthPickupHeal(Number.NaN)).toBe(0);
    expect(calculateHealthPickupHeal(100, -0.1)).toBe(0);
  });

  it('collects once and clamps healing to maximum health', () => {
    const { player, pickup } = collectPickup(95, 100);
    expect(calculateHealthPickupHeal(100)).toBe(15);
    expect(player?.health).toBe(100);
    expect(player?.health).toBeLessThanOrEqual(player?.maxHealth ?? 0);
    expect(pickup.active).toBe(false);
  });

  it('consumes a pickup at full health without exceeding the maximum', () => {
    const { player, pickup } = collectPickup(100, 100);
    expect(player?.health).toBe(100);
    expect(pickup.active).toBe(false);
  });
});
