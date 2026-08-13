import { describe, expect, it } from 'vitest';
import {
  CHAIN_LIGHTNING_HOP_RANGE,
  CHAIN_LIGHTNING_INITIAL_AIM_DOT,
  CHAIN_LIGHTNING_INITIAL_RANGE,
  selectNextChainLightningTarget,
  type ChainLightningCandidate,
} from '../src/game/core/chainLightning';
import type { Vec2 } from '../src/game/core/types';
import { GameRuntime } from '../src/game/runtime/GameRuntime';

interface TestTarget extends ChainLightningCandidate {
  kind: 'monster' | 'boss';
}

const target = (
  id: string,
  x: number,
  y = 0,
  kind: TestTarget['kind'] = 'monster',
  alive = true,
): TestTarget => ({ id, position: { x, y }, kind, alive });

interface RuntimeChainHarness {
  player: { position: Vec2 } | null;
  monsters: Array<{
    id: string;
    position: Vec2;
    alive: boolean;
    monsterId: 'infected' | 'lightningArcher';
  }>;
  boss: { id: 'boss'; position: Vec2; alive: boolean } | null;
  lastAimDirection: Vec2;
  rng: { next(): number };
  createDirectionalBurst(...args: unknown[]): void;
  createSkillAtlasVfx(...args: unknown[]): void;
  createLightningMiss(...args: unknown[]): void;
  damageMonster(target: { id: string }, ...args: unknown[]): void;
  damageBoss(...args: unknown[]): void;
  castChainLightning(maxTargets: number, damage: number): void;
}

function runtimeChainHarness() {
  const runtime = new GameRuntime({ host: {} as HTMLElement, seed: 'chain-runtime-test' });
  const harness = runtime as unknown as RuntimeChainHarness;
  const monsterHits: string[] = [];
  let bossHits = 0;
  let misses = 0;
  harness.player = { position: { x: 0, y: 0 } };
  harness.monsters = [];
  harness.boss = null;
  harness.lastAimDirection = { x: 1, y: 0 };
  harness.rng = { next: () => 0.5 };
  harness.createDirectionalBurst = () => undefined;
  harness.createSkillAtlasVfx = () => undefined;
  harness.createLightningMiss = () => { misses += 1; };
  harness.damageMonster = (monster) => { monsterHits.push(monster.id); };
  harness.damageBoss = () => { bossHits += 1; };
  return {
    harness,
    monsterHits,
    bossHits: () => bossHits,
    misses: () => misses,
  };
}

describe('chain lightning target selection', () => {
  it('uses a 420-unit aimed initial acquisition and includes the exact boundary', () => {
    expect(CHAIN_LIGHTNING_INITIAL_RANGE).toBe(420);
    expect(CHAIN_LIGHTNING_INITIAL_AIM_DOT).toBe(0.22);
    const forwardBoundary = target('forward-boundary', 420);
    const selected = selectNextChainLightningTarget({
      origin: { x: 0, y: 0 },
      candidates: [target('behind', -10), target('side', 0, 10), target('beyond', 420.001), forwardBoundary],
      alreadyHitIds: new Set(),
      maxDistance: CHAIN_LIGHTNING_INITIAL_RANGE,
      aimDirection: { x: 1, y: 0 },
      minimumAimDot: CHAIN_LIGHTNING_INITIAL_AIM_DOT,
    });

    expect(selected).toBe(forwardBoundary);
  });

  it('selects the nearest living target that has not already been hit', () => {
    const nearestEligible = target('nearest-eligible', 80);
    const selected = selectNextChainLightningTarget({
      origin: { x: 0, y: 0 },
      candidates: [
        target('farther', 120),
        target('dead', 5, 0, 'monster', false),
        target('already-hit', 10),
        nearestEligible,
      ],
      alreadyHitIds: new Set(['already-hit']),
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    });

    expect(selected).toBe(nearestEligible);
  });

  it('allows an exact 150-unit hop and stops when every unhit target is farther away', () => {
    expect(CHAIN_LIGHTNING_HOP_RANGE).toBe(150);
    const exactBoundary = target('exact-boundary', 150);
    expect(selectNextChainLightningTarget({
      origin: { x: 0, y: 0 },
      candidates: [target('outside', 150.001), exactBoundary],
      alreadyHitIds: new Set(),
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    })).toBe(exactBoundary);

    expect(selectNextChainLightningTarget({
      origin: { x: 0, y: 0 },
      candidates: [target('outside', 150.001)],
      alreadyHitIds: new Set(),
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    })).toBeNull();
  });

  it('forms a unique short-hop path and stops instead of re-hitting prior targets', () => {
    const candidates = [target('a', 100), target('b', 230), target('c', 381)];
    const hitIds = new Set<string>();
    let origin = { x: 0, y: 0 };

    const first = selectNextChainLightningTarget({
      origin,
      candidates,
      alreadyHitIds: hitIds,
      maxDistance: CHAIN_LIGHTNING_INITIAL_RANGE,
      aimDirection: { x: 1, y: 0 },
      minimumAimDot: CHAIN_LIGHTNING_INITIAL_AIM_DOT,
    });
    expect(first?.id).toBe('a');
    hitIds.add(first!.id);
    origin = first!.position;

    const second = selectNextChainLightningTarget({
      origin,
      candidates,
      alreadyHitIds: hitIds,
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    });
    expect(second?.id).toBe('b');
    hitIds.add(second!.id);

    expect(selectNextChainLightningTarget({
      origin: second!.position,
      candidates,
      alreadyHitIds: hitIds,
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    })).toBeNull();
    expect([...hitIds]).toEqual(['a', 'b']);
  });

  it('treats a boss as the same unique range-limited candidate without global fallback', () => {
    const boss = target('boss', 150, 0, 'boss');
    expect(selectNextChainLightningTarget({
      origin: { x: 0, y: 0 },
      candidates: [target('monster-outside', 151), boss],
      alreadyHitIds: new Set(),
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    })).toBe(boss);

    expect(selectNextChainLightningTarget({
      origin: { x: 0, y: 0 },
      candidates: [boss],
      alreadyHitIds: new Set(['boss']),
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    })).toBeNull();

    expect(selectNextChainLightningTarget({
      origin: { x: 0, y: 0 },
      candidates: [target('boss-outside', 150.001, 0, 'boss')],
      alreadyHitIds: new Set(),
      maxDistance: CHAIN_LIGHTNING_HOP_RANGE,
    })).toBeNull();
  });

  it('keeps the runtime cast unique, short-hopped, and immune-aware', () => {
    const { harness, monsterHits, bossHits } = runtimeChainHarness();
    harness.monsters = [
      { id: 'immune-nearest', position: { x: 40, y: 0 }, alive: true, monsterId: 'lightningArcher' },
      { id: 'a', position: { x: 100, y: 0 }, alive: true, monsterId: 'infected' },
      { id: 'b', position: { x: 250, y: 0 }, alive: true, monsterId: 'infected' },
      { id: 'outside-next-hop', position: { x: 400.001, y: 0 }, alive: true, monsterId: 'infected' },
    ];
    harness.boss = { id: 'boss', position: { x: 1_000, y: 0 }, alive: true };

    harness.castChainLightning(7, 100);

    expect(monsterHits).toEqual(['a', 'b']);
    expect(new Set(monsterHits).size).toBe(monsterHits.length);
    expect(bossHits()).toBe(0);
  });

  it('does not let the runtime globally fall back to an out-of-range boss', () => {
    const { harness, monsterHits, bossHits, misses } = runtimeChainHarness();
    harness.boss = {
      id: 'boss',
      position: { x: CHAIN_LIGHTNING_INITIAL_RANGE + 0.001, y: 0 },
      alive: true,
    };

    harness.castChainLightning(7, 100);

    expect(monsterHits).toEqual([]);
    expect(bossHits()).toBe(0);
    expect(misses()).toBe(1);
  });
});
