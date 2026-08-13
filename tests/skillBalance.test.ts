import { describe, expect, it } from 'vitest';
import {
  ACTIVE_SKILLS,
  ACTIVE_SKILL_IDS,
  MAX_SKILL_LEVEL,
  SKILL_BALANCE,
  calculateSkillBalance,
  calculateSkillProgression,
  getSkillBalance,
} from '../src/game/data';

describe('skill balance contract', () => {
  it('keeps one balance config for each of the ten active skills', () => {
    expect(ACTIVE_SKILL_IDS).toHaveLength(10);
    expect(Object.keys(SKILL_BALANCE).sort()).toEqual([...ACTIVE_SKILL_IDS].sort());

    for (const skillId of ACTIVE_SKILL_IDS) {
      expect(getSkillBalance(skillId).id).toBe(skillId);
      expect(ACTIVE_SKILLS[skillId].id).toBe(skillId);
    }
  });

  it('defines five valid levels and positive estimates for every skill', () => {
    for (const skillId of ACTIVE_SKILL_IDS) {
      const definition = ACTIVE_SKILLS[skillId];
      const progression = calculateSkillProgression(skillId);

      expect(definition.levels).toHaveLength(MAX_SKILL_LEVEL);
      expect(progression).toHaveLength(MAX_SKILL_LEVEL);
      expect(progression.map((estimate) => estimate.level)).toEqual([1, 2, 3, 4, 5]);

      for (const [index, level] of definition.levels.entries()) {
        expect(level.level).toBe(index + 1);
        expect(level.damageMultiplier).toBeGreaterThan(0);
        expect(level.cooldownMultiplier).toBeGreaterThan(0);

        const estimate = progression[index];
        expect(estimate).toBeDefined();
        expect(estimate?.cooldownSeconds).toBeGreaterThan(0);
        expect(estimate?.primaryCastDamage).toBeGreaterThan(0);
        expect(estimate?.expectedCastDamage).toBeGreaterThan(0);
        expect(estimate?.sustainedDamagePerSecond).toBeGreaterThan(0);
      }
    }
  });

  it('keeps config magnitudes valid and boss targeting explicit', () => {
    const supportedBossModes = ['direct', 'fallback', 'area'];

    for (const skillId of ACTIVE_SKILL_IDS) {
      const config = SKILL_BALANCE[skillId];
      expect(config.basePower).toBeGreaterThan(0);
      expect(config.baseRadius).toBeGreaterThanOrEqual(0);
      expect(config.baseRange).toBeGreaterThanOrEqual(0);
      expect(config.primaryTargetCap).toBeGreaterThan(0);
      expect(config.expectedTargets).toBeGreaterThan(0);
      expect(config.bossDamageMultiplier).toBeGreaterThan(0);
      expect(supportedBossModes).toContain(config.bossTargeting);
      expect(calculateSkillBalance(skillId, 1).utility.bossTargeting).toBe(
        config.bossTargeting,
      );
    }
  });

  it('derives cooldowns from skill levels and caps coolant reduction at 40 percent', () => {
    for (const skillId of ACTIVE_SKILL_IDS) {
      const definition = ACTIVE_SKILLS[skillId];
      for (const level of definition.levels) {
        const base = definition.baseCooldownSeconds * level.cooldownMultiplier;
        expect(calculateSkillBalance(skillId, level.level).cooldownSeconds).toBeCloseTo(base, 8);
        expect(
          calculateSkillBalance(skillId, level.level, { coolantLevel: 99 }).cooldownSeconds,
        ).toBeCloseTo(base * 0.6, 8);
      }
    }
  });

  it('rejects invalid level, target, and coolant inputs', () => {
    expect(() => calculateSkillBalance('homingMissiles', 0)).toThrow(RangeError);
    expect(() => calculateSkillBalance('homingMissiles', 6)).toThrow(RangeError);
    expect(() => calculateSkillBalance('homingMissiles', 1.5)).toThrow(RangeError);
    expect(() =>
      calculateSkillBalance('homingMissiles', 1, { targetCount: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      calculateSkillBalance('homingMissiles', 1, { coolantLevel: Number.NaN }),
    ).toThrow(RangeError);
  });

  it('records every damage-producing level-five secondary mechanic', () => {
    const secondarySkills = [
      'homingMissiles',
      'glacialGrenade',
      'gravityWell',
      'flameBeam',
      'landmines',
      'orbitingBlades',
      'iceBarrier',
    ] as const;

    for (const skillId of secondarySkills) {
      const levelFiveEffects = SKILL_BALANCE[skillId].secondary.filter(
        (effect) => effect.minimumLevel === 5,
      );
      expect(levelFiveEffects.length, `${skillId} needs its Lv.5 secondary`).toBeGreaterThan(0);
      for (const effect of levelFiveEffects) {
        expect(effect.coefficient).toBeGreaterThan(0);
        expect(effect.count).toBeGreaterThan(0);
        expect(effect.targetCap).toBeGreaterThan(0);
      }
    }

    expect(ACTIVE_SKILLS.autoTurret.levels[4]?.projectileCount).toBe(2);
    expect(ACTIVE_SKILLS.attackDrone.levels[4]?.projectileCount).toBe(2);
  });

  it('keeps the level-five gravity well inside its control-skill budget', () => {
    const single = calculateSkillBalance('gravityWell', 5, { targetCount: 1 });
    const crowd = calculateSkillBalance('gravityWell', 5, { targetCount: 6 });

    expect(single.primaryCastDamage).toBe(144);
    expect(single.secondaryCastDamage).toBe(36);
    expect(single.expectedCastDamage).toBe(180);
    expect(single.sustainedDamagePerSecond).toBeCloseTo(180 / 11, 8);
    expect(crowd.sustainedDamagePerSecond).toBeLessThanOrEqual(98.2);
  });

  it('keeps level-five missiles effective against both one target and a crowd', () => {
    const single = calculateSkillBalance('homingMissiles', 5, { targetCount: 1 });
    const crowd = calculateSkillBalance('homingMissiles', 5, { targetCount: 3 });

    expect(single.primaryCastDamage).toBe(330);
    expect(single.secondaryCastDamage).toBe(0);
    expect(single.sustainedDamagePerSecond).toBeGreaterThanOrEqual(49);
    expect(crowd.secondaryCastDamage).toBeGreaterThan(0);
    expect(crowd.sustainedDamagePerSecond).toBeGreaterThanOrEqual(130);
  });

  it('budgets chain lightning only across unique forward targets without reverse re-hits', () => {
    const levelOne = calculateSkillBalance('chainLightning', 1, { targetCount: 4 });
    const levelFive = calculateSkillBalance('chainLightning', 5, { targetCount: 7 });

    expect(levelOne.sustainedDamagePerSecond).toBeCloseTo(26.6, 1);
    expect(levelFive.sustainedDamagePerSecond).toBeCloseTo(93.5, 1);
    expect(levelFive.secondaryCastDamage).toBe(0);
    expect(levelFive.expectedCastDamage).toBe(levelFive.primaryCastDamage);
    expect(SKILL_BALANCE.chainLightning.secondary).toEqual([]);
  });

  it('grows active behavior through counts, duration, or area instead of damage alone', () => {
    const changedUtility = (skillId: keyof typeof ACTIVE_SKILLS, level: number) => {
      const previous = ACTIVE_SKILLS[skillId].levels[level - 2];
      const current = ACTIVE_SKILLS[skillId].levels[level - 1];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      return (
        (current?.projectileCount ?? 1) > (previous?.projectileCount ?? 1) ||
        (current?.durationSeconds ?? 0) > (previous?.durationSeconds ?? 0) ||
        (current?.radiusMultiplier ?? 1) > (previous?.radiusMultiplier ?? 1) ||
        (current?.cooldownMultiplier ?? 1) < (previous?.cooldownMultiplier ?? 1)
      );
    };

    expect(changedUtility('homingMissiles', 2)).toBe(true);
    expect(changedUtility('glacialGrenade', 2)).toBe(true);
    expect(changedUtility('gravityWell', 2)).toBe(true);
    expect(changedUtility('flameBeam', 2)).toBe(true);
    expect(changedUtility('chainLightning', 2)).toBe(true);
    expect(changedUtility('landmines', 2)).toBe(true);
    expect(changedUtility('orbitingBlades', 2)).toBe(true);
    expect(changedUtility('iceBarrier', 2)).toBe(true);
    expect(changedUtility('attackDrone', 2)).toBe(true);
    expect(ACTIVE_SKILLS.autoTurret.levels[1]?.summary).toContain('공격 속도');
  });

  it('models the barrier as defense and can exclude secondary damage', () => {
    const levelOne = calculateSkillBalance('iceBarrier', 1);
    const levelFive = calculateSkillBalance('iceBarrier', 5);
    const primaryOnly = calculateSkillBalance('iceBarrier', 5, { includeSecondary: false });

    expect(SKILL_BALANCE.iceBarrier.role).toBe('defense');
    expect(levelOne.primaryCastDamage).toBe(50);
    expect(levelFive.secondaryCastDamage).toBeGreaterThan(0);
    expect(primaryOnly.secondaryCastDamage).toBe(0);
    expect(primaryOnly.expectedCastDamage).toBe(primaryOnly.primaryCastDamage);
  });
});
