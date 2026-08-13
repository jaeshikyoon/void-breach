import { describe, expect, it } from 'vitest';
import {
  estimateBossTimeToKill,
  getBossAttackCooldown,
  getBossPacing,
  getBossReferenceDps,
  selectBossPattern,
  type BossPhase,
} from '../src/game/core/bossPacing';
import { BOSS_ENCOUNTERS } from '../src/game/data/encounters';

describe('boss health and TTK pacing', () => {
  it('keeps stage one readable for a fresh build', () => {
    expect(getBossPacing(1, 1).maxHealth).toBe(1_500);
    expect(getBossReferenceDps(1)).toBe(60);
    expect(estimateBossTimeToKill(1)).toBe(25);
  });

  it('uses the documented campaign health anchors', () => {
    expect([1, 4, 8, 12, 16, 20].map((stage) => getBossPacing(stage, 1).maxHealth)).toEqual([
      1_500,
      2_675,
      5_075,
      8_425,
      12_750,
      18_025,
    ]);
  });

  it('increases health, reference DPS, and TTK monotonically over all twenty stages', () => {
    for (let stage = 2; stage <= 20; stage += 1) {
      expect(getBossPacing(stage, 1).maxHealth).toBeGreaterThan(
        getBossPacing(stage - 1, 1).maxHealth,
      );
      expect(getBossReferenceDps(stage)).toBeGreaterThan(getBossReferenceDps(stage - 1));
      expect(estimateBossTimeToKill(stage)).toBeGreaterThan(
        estimateBossTimeToKill(stage - 1),
      );
    }
  });

  it('keeps early, mid, and late TTK proxies in their target bands', () => {
    const bands = [
      { first: 1, last: 6, minimum: 20, maximum: 30 },
      { first: 7, last: 14, minimum: 30, maximum: 45 },
      { first: 15, last: 20, minimum: 45, maximum: 60 },
    ] as const;
    // Pacing values are rounded proxies. A half-second tolerance protects the
    // authored bands while avoiding false failures at a boundary (e.g. 30.303s).
    const toleranceSeconds = 0.5;
    for (const band of bands) {
      for (let stage = band.first; stage <= band.last; stage += 1) {
        const ttk = estimateBossTimeToKill(stage);
        expect(ttk).toBeGreaterThanOrEqual(band.minimum - toleranceSeconds);
        expect(ttk).toBeLessThanOrEqual(band.maximum + toleranceSeconds);
      }
    }
    expect(estimateBossTimeToKill(1)).toBe(25);
    expect(estimateBossTimeToKill(6)).toBeCloseTo(30, 2);
    expect(estimateBossTimeToKill(7)).toBeCloseTo(31.5, 2);
    expect(estimateBossTimeToKill(14)).toBeCloseTo(44.5, 2);
    expect(estimateBossTimeToKill(15)).toBeCloseTo(46, 2);
    expect(estimateBossTimeToKill(20)).toBeCloseTo(53, 2);
  });

  it('uses the supplied effective-DPS proxy and rejects invalid DPS', () => {
    expect(estimateBossTimeToKill(1, 100)).toBe(15);
    expect(estimateBossTimeToKill(20, 400)).toBeCloseTo(45.063, 3);
    expect(estimateBossTimeToKill(1, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(estimateBossTimeToKill(1, -1)).toBe(Number.POSITIVE_INFINITY);
    expect(estimateBossTimeToKill(1, Number.NaN)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('boss vulnerability and attack cadence', () => {
  it('opens decreasing post-attack windows with a fixed fifty-percent damage bonus', () => {
    const expectedBreaks: Record<BossPhase, number> = { 1: 1.75, 2: 1.6, 3: 1.45 };
    for (const phase of [1, 2, 3] as const) {
      const profile = getBossPacing(10, phase);
      expect(profile.postAttackBreakSeconds).toBe(expectedBreaks[phase]);
      expect(profile.phaseBreakSeconds).toBe(1);
      expect(profile.vulnerabilityDamageMultiplier).toBe(1.5);
    }
    expect(getBossPacing(10, 1).postAttackBreakSeconds).toBeGreaterThan(
      getBossPacing(10, 2).postAttackBreakSeconds,
    );
    expect(getBossPacing(10, 2).postAttackBreakSeconds).toBeGreaterThan(
      getBossPacing(10, 3).postAttackBreakSeconds,
    );
  });

  it('keeps authored cooldowns bounded while later phases escalate', () => {
    const authoredCooldowns = Object.values(BOSS_ENCOUNTERS).flatMap((boss) =>
      boss.patterns.map((pattern) => pattern.cooldownSeconds),
    );
    expect(Math.min(...authoredCooldowns)).toBeGreaterThan(0);

    for (const authoredCooldownSeconds of authoredCooldowns) {
      const phaseOne = getBossAttackCooldown({ authoredCooldownSeconds, phase: 1 });
      const phaseTwo = getBossAttackCooldown({ authoredCooldownSeconds, phase: 2 });
      const phaseThree = getBossAttackCooldown({ authoredCooldownSeconds, phase: 3 });
      expect(phaseOne).toBe(Math.max(2.2, Math.min(4.2, authoredCooldownSeconds)));
      expect(phaseTwo).toBeLessThanOrEqual(phaseOne);
      expect(phaseThree).toBeLessThanOrEqual(phaseTwo);
      expect(phaseThree).toBeGreaterThanOrEqual(2.2);
      expect(phaseOne).toBeLessThanOrEqual(4.2);
    }
    expect(getBossAttackCooldown({ authoredCooldownSeconds: -1, phase: 1 })).toBe(0);
    expect(getBossAttackCooldown({ authoredCooldownSeconds: Number.NaN, phase: 1 })).toBe(0);
  });

  it('selects phase patterns deterministically without immediate duplicates', () => {
    const patterns = BOSS_ENCOUNTERS.riftSovereign.patterns;
    for (const phase of [1, 2, 3] as const) {
      const available = patterns.filter((pattern) => pattern.phase === phase);
      expect(available.length).toBeGreaterThanOrEqual(2);
      const first = selectBossPattern(patterns, phase, 0, null);
      const next = selectBossPattern(patterns, phase, 0, first?.id ?? null);
      expect(first).not.toBeNull();
      expect(first?.phase).toBe(phase);
      expect(next).not.toBeNull();
      expect(next?.phase).toBe(phase);
      expect(next?.id).not.toBe(first?.id);
      expect(selectBossPattern(patterns, phase, 7, null)).toEqual(
        selectBossPattern(patterns, phase, 7, null),
      );
    }
    expect(selectBossPattern([], 1, 0, null)).toBeNull();
  });
});
