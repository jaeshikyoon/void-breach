import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPACT_HOLD_SECONDS,
  getAttackTelegraphTiming,
  resolveTelegraphedHit,
  type AttackTelegraphKind,
} from '../src/game/core/attackTelegraph';

const TARGET = { x: 400, y: 300 } as const;
const PLAYER_RADIUS = 18;
const IMPACT_RADIUS = 42;
const DAMAGE = 20;

function healthAfterTelegraph(
  health: number,
  elapsedSeconds: number,
  totalSeconds: number,
  impactHoldSeconds: number,
  playerPosition = TARGET,
): number {
  const result = resolveTelegraphedHit({
    elapsedSeconds,
    totalSeconds,
    impactHoldSeconds,
    target: TARGET,
    playerPosition,
    impactRadius: IMPACT_RADIUS,
    playerRadius: PLAYER_RADIUS,
  });
  return health - (result.canDamage ? DAMAGE : 0);
}

describe('telegraphed enemy attack timing', () => {
  it('does not change player health when the warning is created', () => {
    const timing = getAttackTelegraphTiming({
      kind: 'melee',
      authoredWindupSeconds: 0.1,
    });

    expect(
      resolveTelegraphedHit({
        elapsedSeconds: 0,
        totalSeconds: timing.totalSeconds,
        impactHoldSeconds: timing.impactHoldSeconds,
        target: TARGET,
        playerPosition: TARGET,
        impactRadius: IMPACT_RADIUS,
        playerRadius: PLAYER_RADIUS,
      }),
    ).toEqual({ phase: 'warning', canDamage: false });
    expect(healthAfterTelegraph(100, 0, timing.totalSeconds, timing.impactHoldSeconds)).toBe(100);
  });

  it('cannot hit before the minimum warning and hits on the impact boundary', () => {
    const timing = getAttackTelegraphTiming({
      kind: 'melee',
      authoredWindupSeconds: 0.1,
    });
    expect(timing).toEqual({
      warningSeconds: 0.55,
      impactHoldSeconds: 0.1,
      totalSeconds: 0.65,
    });

    const justBeforeImpact = resolveTelegraphedHit({
      elapsedSeconds: timing.warningSeconds - 0.001,
      totalSeconds: timing.totalSeconds,
      impactHoldSeconds: timing.impactHoldSeconds,
      target: TARGET,
      playerPosition: TARGET,
      impactRadius: IMPACT_RADIUS,
      playerRadius: PLAYER_RADIUS,
    });
    expect(justBeforeImpact).toEqual({ phase: 'warning', canDamage: false });
    expect(
      healthAfterTelegraph(
        100,
        timing.warningSeconds - 0.001,
        timing.totalSeconds,
        timing.impactHoldSeconds,
      ),
    ).toBe(100);

    const impact = resolveTelegraphedHit({
      elapsedSeconds: timing.warningSeconds,
      totalSeconds: timing.totalSeconds,
      impactHoldSeconds: timing.impactHoldSeconds,
      target: TARGET,
      playerPosition: TARGET,
      impactRadius: IMPACT_RADIUS,
      playerRadius: PLAYER_RADIUS,
    });
    expect(impact).toEqual({ phase: 'impact', canDamage: true });
    expect(
      healthAfterTelegraph(
        100,
        timing.warningSeconds,
        timing.totalSeconds,
        timing.impactHoldSeconds,
      ),
    ).toBe(80);
  });

  it('misses when the player moves outside the marked impact area during windup', () => {
    const timing = getAttackTelegraphTiming({
      kind: 'area',
      authoredWindupSeconds: 0.2,
    });
    const combinedRadius = IMPACT_RADIUS + PLAYER_RADIUS;
    const outside = { x: TARGET.x + combinedRadius + 0.01, y: TARGET.y };

    const escaped = resolveTelegraphedHit({
      elapsedSeconds: timing.warningSeconds,
      totalSeconds: timing.totalSeconds,
      impactHoldSeconds: timing.impactHoldSeconds,
      target: TARGET,
      playerPosition: outside,
      impactRadius: IMPACT_RADIUS,
      playerRadius: PLAYER_RADIUS,
    });
    expect(escaped).toEqual({ phase: 'impact', canDamage: false });
    expect(
      healthAfterTelegraph(
        100,
        timing.warningSeconds,
        timing.totalSeconds,
        timing.impactHoldSeconds,
        outside,
      ),
    ).toBe(100);
  });

  it('treats the combined player and impact radius boundary as a hit', () => {
    const timing = getAttackTelegraphTiming({
      kind: 'melee',
      authoredWindupSeconds: 0.55,
    });
    const combinedRadius = IMPACT_RADIUS + PLAYER_RADIUS;
    expect(
      resolveTelegraphedHit({
        elapsedSeconds: timing.warningSeconds,
        totalSeconds: timing.totalSeconds,
        impactHoldSeconds: timing.impactHoldSeconds,
        target: TARGET,
        playerPosition: { x: TARGET.x + combinedRadius, y: TARGET.y },
        impactRadius: IMPACT_RADIUS,
        playerRadius: PLAYER_RADIUS,
      }).canDamage,
    ).toBe(true);
  });

  it('enforces readable minimum warnings for every regular and boss attack kind', () => {
    const expectedMinimums: Record<AttackTelegraphKind, number> = {
      melee: 0.55,
      ranged: 0.62,
      area: 0.8,
      bossLine: 1,
      bossArea: 1.05,
      bossRadial: 0.9,
    };

    for (const [kind, warningSeconds] of Object.entries(expectedMinimums) as Array<
      [AttackTelegraphKind, number]
    >) {
      const timing = getAttackTelegraphTiming({ kind, authoredWindupSeconds: 0 });
      expect(timing.warningSeconds).toBe(warningSeconds);
      expect(timing.impactHoldSeconds).toBeGreaterThan(0);
      expect(timing.totalSeconds).toBeCloseTo(
        timing.warningSeconds + timing.impactHoldSeconds,
        3,
      );
    }
  });

  it('preserves longer authored warnings, makes elites slower, and has a safe default hold', () => {
    const authored = getAttackTelegraphTiming({
      kind: 'ranged',
      authoredWindupSeconds: 1.25,
    });
    const elite = getAttackTelegraphTiming({
      kind: 'ranged',
      authoredWindupSeconds: 1.25,
      elite: true,
    });
    expect(authored.warningSeconds).toBe(1.25);
    expect(elite.warningSeconds).toBe(1.35);

    const defaultHoldImpact = resolveTelegraphedHit({
      elapsedSeconds: 0.88,
      totalSeconds: 1,
      target: TARGET,
      playerPosition: TARGET,
      impactRadius: IMPACT_RADIUS,
      playerRadius: PLAYER_RADIUS,
    });
    expect(DEFAULT_IMPACT_HOLD_SECONDS).toBe(0.12);
    expect(defaultHoldImpact).toEqual({ phase: 'impact', canDamage: true });
  });
});
