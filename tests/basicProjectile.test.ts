import { describe, expect, it } from 'vitest';
import { resolveBasicProjectile } from '../src/game/core/basicProjectile';
import type { PlayerBuild, Vec2 } from '../src/game/core/types';
import { buildCandidateGroups } from '../src/game/core/upgradeCards';
import { GameRuntime } from '../src/game/runtime/GameRuntime';

interface SpawnedBasicBullet {
  damage: number;
  damageType: string;
  isBasic: boolean;
}

interface BasicAttackHarness {
  player: {
    fireCooldown: number;
    shotCounter: number;
    position: Vec2;
    facing: number;
  } | null;
  build: PlayerBuild;
  virtualAttack: boolean;
  pointerAimActive: boolean;
  lastAimDirection: Vec2;
  rng: { chance(probability: number): boolean; next(): number };
  audio: { play(id: string, options?: unknown): void };
  spawnBullet(specification: SpawnedBasicBullet): void;
  createMuzzleFlash(position: Vec2, direction: Vec2): void;
  fireBasicAttack(): void;
}

describe('single-target basic projectiles', () => {
  it('never grants radius or area damage, including legacy explosive-round builds', () => {
    for (const explosiveRoundsLevel of [0, 1, 3, 999]) {
      const projectile = resolveBasicProjectile({
        baseDamage: 20,
        explosiveRoundsLevel,
      });
      expect(projectile).toEqual({
        damage: 20,
        damageType: 'kinetic',
        areaDamage: 0,
        areaRadius: 0,
      });
    }
  });

  it('keeps multishot and critical modifiers as direct projectile damage only', () => {
    expect(resolveBasicProjectile({ baseDamage: 20, sideShot: true })).toEqual({
      damage: 14,
      damageType: 'kinetic',
      areaDamage: 0,
      areaRadius: 0,
    });
    expect(resolveBasicProjectile({ baseDamage: 20, critical: true })).toEqual({
      damage: 35,
      damageType: 'kinetic',
      areaDamage: 0,
      areaRadius: 0,
    });
  });

  it('returns a harmless single-target profile for invalid base damage', () => {
    for (const baseDamage of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveBasicProjectile({ baseDamage })).toEqual({
        damage: 0,
        damageType: 'kinetic',
        areaDamage: 0,
        areaRadius: 0,
      });
    }
  });

  it('does not offer explosive rounds as a new or legacy upgrade draft', () => {
    const fresh = buildCandidateGroups({ activeSkills: {}, passiveLevels: {} });
    const legacy = buildCandidateGroups({
      activeSkills: {},
      passiveLevels: { explosiveRounds: 2 },
    });

    expect(fresh.basic.some((card) => card.passiveId === 'explosiveRounds')).toBe(false);
    expect(legacy.basic.some((card) => card.passiveId === 'explosiveRounds')).toBe(false);
  });

  it('routes a legacy runtime build through a kinetic single-target bullet', () => {
    const runtime = new GameRuntime({ host: {} as HTMLElement, seed: 'basic-projectile-test' });
    const harness = runtime as unknown as BasicAttackHarness;
    const spawned: SpawnedBasicBullet[] = [];
    harness.player = {
      fireCooldown: 0,
      shotCounter: 4,
      position: { x: 100, y: 100 },
      facing: 0,
    };
    harness.build = { activeSkills: {}, passiveLevels: { explosiveRounds: 3 } };
    harness.virtualAttack = false;
    harness.pointerAimActive = false;
    harness.lastAimDirection = { x: 1, y: 0 };
    harness.rng = { chance: () => false, next: () => 0.5 };
    harness.audio = { play: () => undefined };
    harness.spawnBullet = (specification) => spawned.push(specification);
    harness.createMuzzleFlash = () => undefined;

    harness.fireBasicAttack();

    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({
      damage: 12,
      damageType: 'kinetic',
      isBasic: true,
    });
  });
});
