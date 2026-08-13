import { describe, expect, it } from 'vitest';
import {
  MAX_STAGE,
  MAX_STAGE_STARS,
  STAGE_COUNT,
  STAGE_DEFINITIONS,
  TOTAL_AVAILABLE_STAGE_STARS,
  calculateStageStars,
  clampStage,
  getStageDefinition,
  isStageUnlocked,
  normalizeStageStars,
  totalEarnedStars,
} from '../src/game/stages';
import {
  CURRENT_GAME_PROFILE_VERSION,
  DEFAULT_GAME_PROFILE,
  GameStorage,
  normalizeGameProfile,
  normalizeStageBestDurationSeconds,
} from '../src/game/services/storage';

describe('stage progression', () => {
  it('defines exactly twenty stages and sixty available stars', () => {
    expect(MAX_STAGE).toBe(20);
    expect(STAGE_COUNT).toBe(20);
    expect(MAX_STAGE_STARS).toBe(3);
    expect(TOTAL_AVAILABLE_STAGE_STARS).toBe(60);
    expect(STAGE_DEFINITIONS).toHaveLength(20);
  });

  it('awards two stars at exactly fifty percent and above it', () => {
    expect(calculateStageStars({ victory: true, hpRatio: 0.5 })).toBe(2);
    expect(calculateStageStars({ victory: true, hpRatio: 0.500_001 })).toBe(2);
    expect(calculateStageStars({ victory: true, hpRatio: 0.5 - 5e-10 })).toBe(2);
    expect(calculateStageStars({ victory: true, health: 50, maxHealth: 100 })).toBe(2);
    expect(calculateStageStars({ victory: true, health: 75, maxHealth: 100 })).toBe(2);
  });

  it('awards three stars only at one hundred percent health', () => {
    expect(calculateStageStars({ victory: true, hpRatio: 1 })).toBe(3);
    expect(calculateStageStars({ victory: true, health: 100, maxHealth: 100 })).toBe(3);
    expect(calculateStageStars({ victory: true, hpRatio: 0.999_999 })).toBe(2);
    expect(calculateStageStars({ victory: true, hpRatio: 1.2 })).toBe(3);
  });

  it('awards one star for a victory with positive health below fifty percent', () => {
    expect(calculateStageStars({ victory: true, hpRatio: Number.MIN_VALUE })).toBe(1);
    expect(calculateStageStars({ victory: true, hpRatio: 0.499_999 })).toBe(1);
    expect(calculateStageStars({ victory: true, health: 1, maxHealth: 100 })).toBe(1);
  });

  it('awards no stars on loss and keeps zero-health victory behavior safe', () => {
    expect(calculateStageStars({ victory: false, hpRatio: 1 })).toBe(0);
    expect(calculateStageStars({ victory: true, health: 0, maxHealth: 100 })).toBe(1);
    expect(calculateStageStars({ victory: true, health: 100, maxHealth: 0 })).toBe(1);
  });

  it('normalizes corrupt or legacy star arrays to twenty safe integer values', () => {
    const source = [3, 8, -2, 2.9, Number.NaN, 1];
    const normalized = normalizeStageStars(source);
    expect(normalized).toHaveLength(20);
    expect(normalized.slice(0, 6)).toEqual([3, 3, 0, 2, 0, 1]);
    expect(normalized.slice(6)).toEqual(Array.from({ length: 14 }, () => 0));
    expect(normalized).not.toBe(source);
  });

  it('unlocks stage one by default and each later stage from the preceding clear', () => {
    const stars = normalizeStageStars([]);
    expect(isStageUnlocked(1, stars)).toBe(true);
    expect(isStageUnlocked(2, stars)).toBe(false);
    stars[0] = 1;
    expect(isStageUnlocked(2, stars)).toBe(true);
    expect(isStageUnlocked(3, stars)).toBe(false);
    stars[1] = 3;
    expect(isStageUnlocked(3, stars)).toBe(true);
    expect(isStageUnlocked(0, stars)).toBe(false);
    expect(isStageUnlocked(21, stars)).toBe(false);
  });

  it('totals normalized ratings without exceeding sixty', () => {
    expect(totalEarnedStars(Array.from({ length: 20 }, () => 3))).toBe(60);
    expect(totalEarnedStars(Array.from({ length: 25 }, () => 99))).toBe(60);
    expect(totalEarnedStars([3, 2, 1])).toBe(6);
  });

  it('starts every difficulty multiplier at one and increases monotonically', () => {
    const first = getStageDefinition(1);
    expect(first).toEqual({
      stage: 1,
      enemyHealthMultiplier: 1,
      enemyDamageMultiplier: 1,
      enemySpeedMultiplier: 1,
      bossHealthMultiplier: 1,
      bossDamageMultiplier: 1,
    });
    const multiplierKeys = [
      'enemyHealthMultiplier',
      'enemyDamageMultiplier',
      'enemySpeedMultiplier',
      'bossHealthMultiplier',
      'bossDamageMultiplier',
    ] as const;
    for (let index = 1; index < STAGE_DEFINITIONS.length; index += 1) {
      const previous = STAGE_DEFINITIONS[index - 1];
      const current = STAGE_DEFINITIONS[index];
      expect(current?.stage).toBe((previous?.stage ?? 0) + 1);
      for (const key of multiplierKeys) expect(current?.[key]).toBeGreaterThan(previous?.[key] ?? 0);
    }
    expect(clampStage(-10)).toBe(1);
    expect(clampStage(20.9)).toBe(20);
    expect(clampStage(99)).toBe(20);
    expect(getStageDefinition(99)).toBe(getStageDefinition(20));
  });

  it('keeps the stage twenty curve challenging without excessive health sponges', () => {
    const finalStage = getStageDefinition(20);
    expect(finalStage.enemyHealthMultiplier).toBeLessThanOrEqual(2.5);
    expect(finalStage.enemyDamageMultiplier).toBeLessThanOrEqual(2);
    expect(finalStage.enemySpeedMultiplier).toBeLessThanOrEqual(1.2);
    expect(finalStage.bossHealthMultiplier).toBeLessThanOrEqual(3);
    expect(finalStage.bossDamageMultiplier).toBeLessThanOrEqual(2.25);
  });
});

describe('stage profile persistence', () => {
  it('adds twenty-entry stage records to defaults and migrates legacy profiles', async () => {
    expect(DEFAULT_GAME_PROFILE.stageStars).toEqual(Array.from({ length: 20 }, () => 0));
    expect(DEFAULT_GAME_PROFILE.stageBestDurationSeconds).toEqual(
      Array.from({ length: 20 }, () => null),
    );
    const storage = new GameStorage();
    await storage.set('profile', {
      version: 1,
      bestKills: 77,
      recentSkills: ['gravityWell'],
      stageStars: [2, 9, -1],
    });
    const profile = await storage.loadProfile();
    expect(profile.version).toBe(CURRENT_GAME_PROFILE_VERSION);
    expect(profile.bestKills).toBe(77);
    expect(profile.recentSkills).toEqual(['gravityWell']);
    expect(profile.stageStars).toHaveLength(20);
    expect(profile.stageStars.slice(0, 4)).toEqual([2, 3, 0, 0]);
    expect(profile.stageBestDurationSeconds).toEqual(Array.from({ length: 20 }, () => null));

    const persisted = await storage.get<Partial<typeof profile> | null>('profile', null);
    expect(persisted?.version).toBe(CURRENT_GAME_PROFILE_VERSION);
    expect(persisted?.stageStars).toHaveLength(20);
    expect(persisted?.stageBestDurationSeconds).toHaveLength(20);
  });

  it('normalizes profiles without sharing the supplied stars array', () => {
    const stageStars = [3];
    const profile = normalizeGameProfile({ stageStars });
    stageStars[0] = 0;
    expect(profile.stageStars[0]).toBe(3);
    expect(profile.stageStars).toHaveLength(20);
  });

  it('normalizes stage clear times to detached positive finite seconds', () => {
    const source = [83.4567, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 12.3];
    const normalized = normalizeStageBestDurationSeconds(source);
    source[0] = 999;

    expect(normalized).toHaveLength(20);
    expect(normalized.slice(0, 7)).toEqual([83.457, null, null, null, null, 12.3, null]);
    expect(normalizeGameProfile({ stageBestDurationSeconds: normalized }).stageBestDurationSeconds)
      .not.toBe(normalized);
  });

  it('records only the best rating for each stage', async () => {
    const storage = new GameStorage();
    let profile = await storage.recordStageResult({ stage: 1, victory: true, health: 100, maxHealth: 100 });
    expect(profile.stageStars[0]).toBe(3);
    profile = await storage.recordStageResult({ stage: 1, victory: true, hpRatio: 0.2 });
    expect(profile.stageStars[0]).toBe(3);
    profile = await storage.recordStageResult({ stage: 1, victory: false, hpRatio: 1 });
    expect(profile.stageStars[0]).toBe(3);
    profile = await storage.recordStageResult({ stage: 2, victory: true, hpRatio: 0.5 });
    expect(profile.stageStars.slice(0, 3)).toEqual([3, 2, 0]);
  });

  it('records only the fastest valid victorious clear for each stage', async () => {
    const storage = new GameStorage();
    let profile = await storage.recordStageResult({
      stage: 1,
      victory: true,
      hpRatio: 0.5,
      clearDurationSeconds: 83.4567,
    });
    expect(profile.stageBestDurationSeconds[0]).toBe(83.457);

    profile = await storage.recordStageResult({
      stage: 1,
      victory: true,
      hpRatio: 1,
      clearDurationSeconds: 95,
    });
    expect(profile.stageBestDurationSeconds[0]).toBe(83.457);

    profile = await storage.recordStageResult({
      stage: 1,
      victory: false,
      hpRatio: 1,
      clearDurationSeconds: 30,
    });
    expect(profile.stageBestDurationSeconds[0]).toBe(83.457);

    profile = await storage.recordStageResult({
      stage: 1,
      victory: true,
      hpRatio: 0.2,
      clearDurationSeconds: 72.1254,
    });
    expect(profile.stageBestDurationSeconds[0]).toBe(72.125);
    expect(profile.stageStars[0]).toBe(3);
  });

  it('ignores missing, non-finite, and non-positive clear durations', async () => {
    const storage = new GameStorage();
    for (const clearDurationSeconds of [undefined, 0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      await storage.recordStageResult({
        stage: 2,
        victory: true,
        hpRatio: 0.4,
        ...(clearDurationSeconds === undefined ? {} : { clearDurationSeconds }),
      });
    }
    expect((await storage.loadProfile()).stageBestDurationSeconds[1]).toBeNull();
  });

  it('serializes concurrent stage updates so neither result is lost', async () => {
    const storage = new GameStorage();
    await Promise.all([
      storage.recordStageResult({ stage: 4, victory: true, hpRatio: 0.1 }),
      storage.recordStageResult({ stage: 5, victory: true, hpRatio: 0.6 }),
      storage.recordStageResult({ stage: 6, victory: true, hpRatio: 1 }),
    ]);
    const profile = await storage.loadProfile();
    expect(profile.stageStars.slice(3, 6)).toEqual([1, 2, 3]);
  });

  it('rejects invalid stage identifiers without changing the profile', async () => {
    const storage = new GameStorage();
    await expect(storage.recordStageResult({ stage: 0, victory: true, hpRatio: 1 })).rejects.toThrow(RangeError);
    await expect(storage.recordStageResult({ stage: 2.5, victory: true, hpRatio: 1 })).rejects.toThrow(RangeError);
    expect((await storage.loadProfile()).stageStars).toEqual(Array.from({ length: 20 }, () => 0));
  });
});
