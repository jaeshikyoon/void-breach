import { clampStage } from '../stages';

export type BossPhase = 1 | 2 | 3;

export interface BossPacingProfile {
  /** Monotonic campaign health target for the current stage. */
  readonly maxHealth: number;
  /** Reward window opened after a completed power attack. */
  readonly postAttackBreakSeconds: number;
  /** Short stagger opened when the boss crosses a phase threshold. */
  readonly phaseBreakSeconds: number;
  /** Incoming damage multiplier while either break window is active. */
  readonly vulnerabilityDamageMultiplier: number;
}

export interface BossAttackCooldownRequest {
  authoredCooldownSeconds: number;
  phase: BossPhase;
}

export interface BossPatternLike {
  readonly id: string;
  readonly phase: BossPhase;
}

const POST_ATTACK_BREAK_BY_PHASE: Readonly<Record<BossPhase, number>> = Object.freeze({
  1: 1.75,
  2: 1.6,
  3: 1.45,
});

const ATTACK_COOLDOWN_MULTIPLIER_BY_PHASE: Readonly<Record<BossPhase, number>> = Object.freeze({
  1: 1,
  2: 0.92,
  3: 0.84,
});

const PHASE_BREAK_SECONDS = 1;
const VULNERABILITY_DAMAGE_MULTIPLIER = 1.5;

/**
 * Central boss health/reward curve. Unlike the old base-health multiplication,
 * this curve cannot jump backwards at a front boundary and remains readable
 * when every stage begins from a fresh level-one build.
 */
export function getBossPacing(stage: number, phase: BossPhase): BossPacingProfile {
  const normalizedStage = clampStage(stage);
  const step = normalizedStage - 1;
  const rawHealth = 1_500 + step * 300 + step * step * 30;
  return Object.freeze({
    maxHealth: roundToNearest(rawHealth, 25),
    postAttackBreakSeconds: POST_ATTACK_BREAK_BY_PHASE[phase],
    phaseBreakSeconds: PHASE_BREAK_SECONDS,
    vulnerabilityDamageMultiplier: VULNERABILITY_DAMAGE_MULTIPLIER,
  });
}

/** Applies the authored pattern cadence while allowing later phases to escalate. */
export function getBossAttackCooldown(request: BossAttackCooldownRequest): number {
  if (!Number.isFinite(request.authoredCooldownSeconds) || request.authoredCooldownSeconds <= 0) return 0;
  const authored = request.authoredCooldownSeconds;
  return roundTo(clamp(authored * ATTACK_COOLDOWN_MULTIPLIER_BY_PHASE[request.phase], 2.2, 4.2), 3);
}

/**
 * Deterministically cycles the phase roster and avoids an immediate duplicate
 * whenever the phase has another pattern available.
 */
export function selectBossPattern<T extends BossPatternLike>(
  patterns: readonly T[],
  phase: BossPhase,
  attackCounter: number,
  previousPatternId: string | null,
): T | null {
  const phasePatterns = patterns.filter((pattern) => pattern.phase === phase);
  const candidates = phasePatterns.length > 0 ? phasePatterns : patterns;
  if (candidates.length === 0) return null;
  const safeCounter = Number.isFinite(attackCounter) ? Math.max(0, Math.floor(attackCounter)) : 0;
  let index = safeCounter % candidates.length;
  if (candidates.length > 1 && candidates[index]?.id === previousPatternId) {
    index = (index + 1) % candidates.length;
  }
  return candidates[index] ?? null;
}

/**
 * Conservative effective-DPS proxy after mitigation for a typical build that
 * has completed the stage's 200 director deployments.
 */
export function getBossReferenceDps(stage: number): number {
  const normalizedStage = clampStage(stage);
  const step = normalizedStage - 1;
  const health = getBossPacing(stage, 1).maxHealth;
  const targetTtkSeconds = normalizedStage <= 6
    ? 25 + step
    : normalizedStage <= 14
      ? 31.5 + (normalizedStage - 7) * (13 / 7)
      : 46 + (normalizedStage - 15) * (7 / 5);
  return roundTo(health / targetTtkSeconds, 3);
}

/** Estimated uninterrupted damage time; encounter movement still adds real play time. */
export function estimateBossTimeToKill(stage: number, referenceDps = getBossReferenceDps(stage)): number {
  if (!Number.isFinite(referenceDps) || referenceDps <= 0) return Number.POSITIVE_INFINITY;
  return roundTo(getBossPacing(stage, 1).maxHealth / referenceDps, 3);
}

function roundToNearest(value: number, interval: number): number {
  return Math.round(value / interval) * interval;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
