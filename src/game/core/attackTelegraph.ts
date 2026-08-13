import type { Vec2 } from './types';

export type AttackTelegraphKind =
  | 'melee'
  | 'ranged'
  | 'area'
  | 'bossLine'
  | 'bossArea'
  | 'bossRadial';

export interface AttackTelegraphTimingRequest {
  kind: AttackTelegraphKind;
  authoredWindupSeconds: number;
  elite?: boolean;
}

export interface AttackTelegraphTiming {
  warningSeconds: number;
  impactHoldSeconds: number;
  totalSeconds: number;
}

export interface TelegraphedHitRequest {
  elapsedSeconds: number;
  totalSeconds: number;
  impactHoldSeconds?: number;
  target: Vec2;
  playerPosition: Vec2;
  impactRadius: number;
  playerRadius: number;
}

export interface TelegraphedHitResult {
  phase: 'warning' | 'impact';
  canDamage: boolean;
}

export const DEFAULT_IMPACT_HOLD_SECONDS = 0.12;

const MINIMUM_WARNING_SECONDS: Readonly<Record<AttackTelegraphKind, number>> = {
  melee: 0.55,
  ranged: 0.62,
  area: 0.8,
  bossLine: 1,
  bossArea: 1.05,
  bossRadial: 0.9,
};

const IMPACT_HOLD_SECONDS: Readonly<Record<AttackTelegraphKind, number>> = {
  melee: 0.1,
  ranged: 0.08,
  area: 0.14,
  bossLine: 0.16,
  bossArea: 0.18,
  bossRadial: 0.14,
};

/** Normalizes authored attacks to a readable warning followed by a distinct impact beat. */
export function getAttackTelegraphTiming(
  request: AttackTelegraphTimingRequest,
): AttackTelegraphTiming {
  const authored = finiteNonNegative(request.authoredWindupSeconds);
  const minimum = MINIMUM_WARNING_SECONDS[request.kind];
  const eliteMultiplier = request.elite ? 1.08 : 1;
  const warningSeconds = round(Math.max(authored, minimum) * eliteMultiplier);
  const impactHoldSeconds = IMPACT_HOLD_SECONDS[request.kind];
  return {
    warningSeconds,
    impactHoldSeconds,
    totalSeconds: round(warningSeconds + impactHoldSeconds),
  };
}

/**
 * Pure warning/impact gate for circular telegraphs. `elapsedSeconds` is measured
 * from attack start; damage is legal only during the final impact hold window.
 */
export function resolveTelegraphedHit(request: TelegraphedHitRequest): TelegraphedHitResult {
  const totalSeconds = finiteNonNegative(request.totalSeconds);
  const holdSeconds = Math.min(
    totalSeconds,
    finiteNonNegative(request.impactHoldSeconds ?? DEFAULT_IMPACT_HOLD_SECONDS),
  );
  const elapsedSeconds = finiteNonNegative(request.elapsedSeconds);
  const phase = elapsedSeconds + Number.EPSILON >= totalSeconds - holdSeconds
    ? 'impact'
    : 'warning';
  const hitRadius = finiteNonNegative(request.impactRadius) + finiteNonNegative(request.playerRadius);
  const dx = request.playerPosition.x - request.target.x;
  const dy = request.playerPosition.y - request.target.y;
  const insideImpact = dx * dx + dy * dy <= hitRadius * hitRadius;
  return { phase, canDamage: phase === 'impact' && insideImpact };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
