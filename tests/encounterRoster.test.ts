import { describe, expect, it } from 'vitest';
import {
  BOSS_ENCOUNTERS,
  ENCOUNTER_FRONTS,
  ENCOUNTER_MONSTERS,
  NEW_MONSTER_IDS,
  STAGE_MONSTER_POOLS,
  getBossForStage,
  getEncounterFront,
  getStageBoss,
  getStageMonsterPool,
  isBossStage,
  remapSpawnMonsterForStage,
  selectStageMonster,
} from '../src/game/data/encounters';
import { MONSTERS } from '../src/game/data/monsters';

describe('encounter monster roster', () => {
  it('contains the original twelve and eight fully defined new monsters', () => {
    expect(Object.keys(MONSTERS)).toHaveLength(20);
    expect(Object.keys(ENCOUNTER_MONSTERS)).toHaveLength(20);
    expect(NEW_MONSTER_IDS).toHaveLength(8);
    expect(new Set(NEW_MONSTER_IDS).size).toBe(8);
    for (const id of NEW_MONSTER_IDS) {
      const definition = MONSTERS[id];
      expect(definition.id).toBe(id);
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.unlockFront).toBeGreaterThanOrEqual(1);
      expect(definition.unlockFront).toBeLessThanOrEqual(5);
      expect(definition.maxHealth).toBeGreaterThan(0);
      expect(definition.damage).toBeGreaterThan(0);
      expect(definition.moveSpeed).toBeGreaterThan(0);
      expect(definition.tags.length).toBeGreaterThanOrEqual(2);
      expect(definition.immunities.length).toBeLessThanOrEqual(1);
      for (const resistance of Object.values(definition.resistances)) {
        expect(resistance).toBeGreaterThanOrEqual(0);
        expect(resistance).toBeLessThan(1);
      }
    }
  });

  it('maps twenty stages into five four-stage fronts', () => {
    expect(ENCOUNTER_FRONTS).toHaveLength(5);
    for (let stage = 1; stage <= 20; stage += 1) {
      const front = getEncounterFront(stage);
      expect(front.id).toBe(Math.floor((stage - 1) / 4) + 1);
      expect(stage).toBeGreaterThanOrEqual(front.minStage);
      expect(stage).toBeLessThanOrEqual(front.maxStage);
    }
  });

  it('provides unique weighted pools with increasing roster diversity', () => {
    expect(STAGE_MONSTER_POOLS).toHaveLength(20);
    const signatures = new Set<string>();
    let previousSize = 0;
    for (let stage = 1; stage <= 20; stage += 1) {
      const pool = getStageMonsterPool(stage);
      expect(pool.stage).toBe(stage);
      expect(pool.monsters.length).toBeGreaterThanOrEqual(4);
      expect(pool.monsters.length).toBeGreaterThanOrEqual(previousSize);
      previousSize = pool.monsters.length;
      expect(new Set(pool.monsters.map((entry) => entry.monsterId)).size).toBe(pool.monsters.length);
      expect(pool.monsters.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(100, 8);
      for (const entry of pool.monsters) {
        expect(entry.weight).toBeGreaterThan(0);
        expect(MONSTERS[entry.monsterId].unlockFront).toBeLessThanOrEqual(pool.front);
      }
      signatures.add(pool.monsters.map((entry) => `${entry.monsterId}:${entry.weight.toFixed(8)}`).join('|'));
    }
    expect(getStageMonsterPool(20).monsters.length).toBeGreaterThanOrEqual(8);
    expect(signatures.size).toBe(20);
  });

  it('selects weighted actual MonsterIds at deterministic interval boundaries', () => {
    const pool = getStageMonsterPool(20);
    const first = selectStageMonster(20, 0);
    const last = selectStageMonster(20, 1);
    expect(first.monsterId).toBe(pool.monsters[0]?.monsterId);
    expect(last.monsterId).toBe(pool.monsters.at(-1)?.monsterId);
    expect(first.definition).toBe(MONSTERS[first.monsterId]);
    expect(() => selectStageMonster(1, -0.01)).toThrow(RangeError);
    expect(() => selectStageMonster(1, 1.01)).toThrow(RangeError);
  });

  it('remaps legacy SpawnDirector requests reproducibly into the stage pool', () => {
    const request = { stage: 18, requestedMonsterId: 'infected' as const, deploymentOrdinal: 137 };
    const first = remapSpawnMonsterForStage(request);
    const replay = remapSpawnMonsterForStage(request);
    expect(replay).toEqual(first);
    expect(first.requestedMonsterId).toBe('infected');
    expect(getStageMonsterPool(18).monsters.some((entry) => entry.monsterId === first.monsterId)).toBe(true);
    expect(() => remapSpawnMonsterForStage({ ...request, deploymentOrdinal: 0 })).toThrow(RangeError);
  });
});

describe('front bosses', () => {
  it('defines five increasingly dangerous bosses at canonical finale stages', () => {
    const bosses = Object.values(BOSS_ENCOUNTERS).sort((left, right) => left.stage - right.stage);
    expect(bosses).toHaveLength(5);
    expect(bosses.map((boss) => boss.stage)).toEqual([4, 8, 12, 16, 20]);
    expect(bosses.map((boss) => boss.visualFrame)).toEqual([0, 1, 2, 3, 4]);
    for (let index = 0; index < bosses.length; index += 1) {
      const boss = bosses[index];
      expect(boss?.baseHealth).toBeGreaterThan(index === 0 ? 0 : (bosses[index - 1]?.baseHealth ?? 0));
      expect(boss?.baseDamage).toBeGreaterThan(index === 0 ? 0 : (bosses[index - 1]?.baseDamage ?? 0));
      expect(boss?.patterns.length).toBeGreaterThanOrEqual(5);
      expect(new Set(boss?.patterns.map((pattern) => pattern.phase))).toEqual(new Set([1, 2, 3]));
      for (const pattern of boss?.patterns ?? []) {
        expect(pattern.windupSeconds).toBeGreaterThan(0);
        expect(pattern.cooldownSeconds).toBeGreaterThan(pattern.windupSeconds);
        expect(pattern.tags.length).toBeGreaterThan(0);
      }
    }
  });

  it('distinguishes exact finales from the boss used by every stage in a front', () => {
    for (let stage = 1; stage <= 20; stage += 1) {
      const frontBoss = getStageBoss(stage);
      expect(frontBoss).not.toBeNull();
      expect(frontBoss?.front).toBe(Math.floor((stage - 1) / 4) + 1);
      const finale = stage % 4 === 0;
      expect(isBossStage(stage)).toBe(finale);
      expect(getBossForStage(stage)).toBe(finale ? frontBoss : null);
    }
    expect(getStageBoss(0)).toBeNull();
    expect(getStageBoss(21)).toBeNull();
  });
});
