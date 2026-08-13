import { describe, expect, it } from 'vitest';
import {
  BOSS_ENCOUNTERS,
  ENCOUNTER_FRONT_COUNT,
  ENCOUNTER_FRONTS,
  ENCOUNTER_MONSTERS,
  NEW_MONSTER_IDS,
  STAGE_MONSTER_POOLS,
  getBossForStage,
  getEncounterFront,
  getStageBoss,
  getStageMonsterPool,
  isBossStage,
  isFrontFinaleStage,
  remapSpawnMonsterForStage,
  selectStageMonster,
} from '../src/game/data';
import { mapStageIntel } from '../src/game/uiMappers';

const EXPECTED_NEW_MONSTERS = [
  'plagueHound',
  'phaseStalker',
  'toxicSpitter',
  'voidPriest',
  'shockTrooper',
  'cryoSentinel',
  'siegeCrawler',
  'nullifier',
] as const;

const BOSS_STAGES = [4, 8, 12, 16, 20] as const;

describe('campaign encounter contract', () => {
  it('defines twenty real monsters, including eight unique new units', () => {
    expect(NEW_MONSTER_IDS).toEqual(EXPECTED_NEW_MONSTERS);
    expect(new Set(NEW_MONSTER_IDS).size).toBe(8);

    const roster = Object.entries(ENCOUNTER_MONSTERS);
    expect(roster).toHaveLength(20);
    for (const [monsterId, definition] of roster) {
      expect(definition.id).toBe(monsterId);
      expect(definition.name.trim()).not.toBe('');
      expect(definition.unlockFront).toBeGreaterThanOrEqual(1);
      expect(definition.unlockFront).toBeLessThanOrEqual(5);
      expect(definition.maxHealth).toBeGreaterThan(0);
      expect(definition.damage).toBeGreaterThan(0);
      expect(definition.moveSpeed).toBeGreaterThan(0);
      expect(definition.attackCooldownSeconds).toBeGreaterThan(0);
      expect(definition.radius).toBeGreaterThan(0);
      expect(definition.tags.length).toBeGreaterThan(0);
    }
    for (const monsterId of NEW_MONSTER_IDS) {
      expect(ENCOUNTER_MONSTERS[monsterId].id).toBe(monsterId);
    }
  });

  it('partitions all twenty stages into five contiguous four-stage fronts', () => {
    expect(ENCOUNTER_FRONT_COUNT).toBe(5);
    expect(ENCOUNTER_FRONTS).toHaveLength(5);
    expect(ENCOUNTER_FRONTS.map(({ minStage, maxStage }) => [minStage, maxStage])).toEqual([
      [1, 4],
      [5, 8],
      [9, 12],
      [13, 16],
      [17, 20],
    ]);

    for (let stage = 1; stage <= 20; stage += 1) {
      const front = getEncounterFront(stage);
      expect(stage).toBeGreaterThanOrEqual(front.minStage);
      expect(stage).toBeLessThanOrEqual(front.maxStage);
      expect(front.name.trim()).not.toBe('');
      expect(front.environmentTag.trim()).not.toBe('');
    }
    expect(getEncounterFront(-1)).toBe(ENCOUNTER_FRONTS[0]);
    expect(getEncounterFront(99)).toBe(ENCOUNTER_FRONTS[4]);
  });

  it('defines one valid, normalized pool per stage', () => {
    expect(STAGE_MONSTER_POOLS).toHaveLength(20);
    expect(STAGE_MONSTER_POOLS.map(({ stage }) => stage)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );

    for (const pool of STAGE_MONSTER_POOLS) {
      expect(getStageMonsterPool(pool.stage)).toBe(pool);
      expect(pool.front).toBe(Math.floor((pool.stage - 1) / 4) + 1);
      expect(pool.monsters.length).toBeGreaterThanOrEqual(4);
      expect(new Set(pool.monsters.map(({ monsterId }) => monsterId)).size).toBe(
        pool.monsters.length,
      );
      expect(pool.monsters.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(100, 10);

      for (const entry of pool.monsters) {
        expect(entry.weight).toBeGreaterThan(0);
        expect(ENCOUNTER_MONSTERS[entry.monsterId]).toBeDefined();
        expect(ENCOUNTER_MONSTERS[entry.monsterId].unlockFront).toBeLessThanOrEqual(pool.front);
      }
    }
  });

  it('keeps all twenty stage pool signatures distinct', () => {
    const signatures = STAGE_MONSTER_POOLS.map((pool) =>
      pool.monsters
        .map(({ monsterId, weight }) => `${monsterId}:${weight.toFixed(10)}`)
        .join('|'),
    );
    expect(new Set(signatures).size).toBe(20);
  });

  it('grows roster diversity and makes every new monster encounterable', () => {
    expect(getStageMonsterPool(1).monsters).toHaveLength(4);
    expect(getStageMonsterPool(20).monsters.length).toBeGreaterThanOrEqual(8);

    const deployedRoster = new Set(
      STAGE_MONSTER_POOLS.flatMap((pool) => pool.monsters.map(({ monsterId }) => monsterId)),
    );
    for (const monsterId of NEW_MONSTER_IDS) expect(deployedRoster.has(monsterId)).toBe(true);
  });

  it('selects weighted monsters deterministically, including roll boundaries', () => {
    for (const pool of STAGE_MONSTER_POOLS) {
      const first = pool.monsters[0];
      const second = pool.monsters[1];
      const last = pool.monsters.at(-1);
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(last).toBeDefined();

      expect(selectStageMonster(pool.stage, 0).monsterId).toBe(first?.monsterId);
      expect(selectStageMonster(pool.stage, 1).monsterId).toBe(last?.monsterId);
      expect(selectStageMonster(pool.stage, (first?.weight ?? 0) / 100).monsterId).toBe(
        second?.monsterId,
      );
      expect(selectStageMonster(pool.stage, 0.4321)).toEqual(
        selectStageMonster(pool.stage, 0.4321),
      );
    }

    for (const roll of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => selectStageMonster(1, roll)).toThrow(RangeError);
    }
  });

  it('remaps director requests reproducibly into the selected stage pool', () => {
    const request = { stage: 20, requestedMonsterId: 'infected' as const, deploymentOrdinal: 73 };
    const selection = remapSpawnMonsterForStage(request);
    expect(selection).toEqual(remapSpawnMonsterForStage(request));
    expect(selection.requestedMonsterId).toBe('infected');
    expect(getStageMonsterPool(20).monsters.some(({ monsterId }) => monsterId === selection.monsterId)).toBe(true);
    expect(selection.definition).toBe(ENCOUNTER_MONSTERS[selection.monsterId]);

    const sampled = new Set(
      Array.from({ length: 64 }, (_, index) =>
        remapSpawnMonsterForStage({ ...request, deploymentOrdinal: index + 1 }).monsterId,
      ),
    );
    expect(sampled.size).toBeGreaterThan(1);
    expect(() => remapSpawnMonsterForStage({ ...request, deploymentOrdinal: 0 })).toThrow(RangeError);
  });

  it('defines five distinct, fully specified three-phase bosses', () => {
    const bosses = Object.values(BOSS_ENCOUNTERS);
    expect(bosses).toHaveLength(5);
    expect(bosses.map(({ stage }) => stage)).toEqual(BOSS_STAGES);
    expect(new Set(bosses.map(({ id }) => id)).size).toBe(5);
    expect(new Set(bosses.map(({ name }) => name)).size).toBe(5);
    expect(new Set(bosses.map(({ artKey }) => artKey)).size).toBe(5);
    expect(new Set(bosses.map(({ visualFrame }) => visualFrame)).size).toBe(5);

    for (const boss of bosses) {
      expect(boss.baseHealth).toBeGreaterThan(0);
      expect(boss.baseDamage).toBeGreaterThan(0);
      expect(new Set(boss.patterns.map(({ id }) => id)).size).toBe(boss.patterns.length);
      expect(new Set(boss.patterns.map(({ phase }) => phase))).toEqual(new Set([1, 2, 3]));
      for (const pattern of boss.patterns) {
        expect(pattern.windupSeconds).toBeGreaterThan(0);
        expect(pattern.cooldownSeconds).toBeGreaterThan(0);
        expect(pattern.damageMultiplier).toBeGreaterThanOrEqual(0);
        expect(pattern.radius).toBeGreaterThanOrEqual(0);
        expect(pattern.range).toBeGreaterThanOrEqual(0);
        expect(pattern.projectileCount).toBeGreaterThanOrEqual(0);
        expect(pattern.tags.length).toBeGreaterThan(0);
      }
    }
  });

  it('assigns canonical bosses only to stages 4, 8, 12, 16, and 20', () => {
    for (let stage = 1; stage <= 20; stage += 1) {
      const expected = BOSS_STAGES.includes(stage as (typeof BOSS_STAGES)[number]);
      expect(isBossStage(stage)).toBe(expected);
      expect(isFrontFinaleStage(stage)).toBe(expected);
      expect(getBossForStage(stage)?.stage ?? null).toBe(expected ? stage : null);
    }
    expect(getBossForStage(0)).toBeNull();
    expect(getBossForStage(21)).toBeNull();
    expect(isBossStage(4.5)).toBe(false);
  });

  it('maps every stage to the owning front boss and consistent UI intel', () => {
    for (let stage = 1; stage <= 20; stage += 1) {
      const canonicalStage = Math.ceil(stage / 4) * 4;
      const boss = getStageBoss(stage);
      const intel = mapStageIntel(stage);
      expect(boss).toBe(getBossForStage(canonicalStage));
      expect(intel.frontName).toBe(getEncounterFront(stage).name);
      expect(intel.bossName).toBe(boss?.name);
      expect(intel.threatRoster).toEqual(
        getStageMonsterPool(stage).monsters.map(
          ({ monsterId }) => ENCOUNTER_MONSTERS[monsterId].name,
        ),
      );
    }
    expect(getStageBoss(0)).toBeNull();
    expect(getStageBoss(21)).toBeNull();
  });
});
