import type { DamageType } from './types';

export type AttackPhase = 'idle' | 'windup' | 'active' | 'recovery';

export type DamageBlockReason =
  | 'none'
  | 'not-active'
  | 'immune'
  | 'non-positive';

export interface DamageRequest {
  amount: number;
  damageType: DamageType;
  resistances?: Partial<Record<DamageType, number>>;
  immunities?: readonly DamageType[];
  isBasicAttack?: boolean;
  attackPhase?: AttackPhase;
  criticalMultiplier?: number;
  outgoingMultiplier?: number;
  /** 0.2 models the shieldbearer's 80% frontal projectile reduction. */
  directionalMultiplier?: number;
  /** Separate encounter modifiers, such as a boss's 50% phase resistance. */
  encounterResistance?: number;
  flatReduction?: number;
}

export interface DamageResult {
  damage: number;
  blocked: boolean;
  reason: DamageBlockReason;
  effectiveResistance: number;
}

const MAX_NORMAL_RESISTANCE = 0.95;
const MAX_BASIC_ATTACK_RESISTANCE = 0.9;

/**
 * Pure damage resolver. An attack only hurts during its active/impact frame, so
 * merely touching a monster never damages the player.
 */
export function resolveDamage(request: DamageRequest): DamageResult {
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    return noDamage('non-positive', 0);
  }

  if ((request.attackPhase ?? 'active') !== 'active') {
    return noDamage('not-active', 0);
  }

  const isBasicAttack = request.isBasicAttack ?? false;
  const immune = request.immunities?.includes(request.damageType) ?? false;
  if (immune && !isBasicAttack) return noDamage('immune', 1);

  const configuredResistance = clamp(
    request.resistances?.[request.damageType] ?? 0,
    0,
    MAX_NORMAL_RESISTANCE,
  );
  const typeResistance = immune ? 1 : configuredResistance;
  const encounterResistance = clamp(request.encounterResistance ?? 0, 0, MAX_NORMAL_RESISTANCE);
  let combinedResistance = 1 - (1 - typeResistance) * (1 - encounterResistance);
  combinedResistance = Math.min(
    combinedResistance,
    isBasicAttack ? MAX_BASIC_ATTACK_RESISTANCE : MAX_NORMAL_RESISTANCE,
  );

  const criticalMultiplier = nonNegative(request.criticalMultiplier ?? 1);
  const outgoingMultiplier = nonNegative(request.outgoingMultiplier ?? 1);
  const directionalMultiplier = nonNegative(request.directionalMultiplier ?? 1);
  const flatReduction = nonNegative(request.flatReduction ?? 0);

  const preMitigation = request.amount * criticalMultiplier * outgoingMultiplier;
  const afterResistance = preMitigation * (1 - combinedResistance);
  const damage = Math.max(0, afterResistance * directionalMultiplier - flatReduction);

  return {
    damage: roundDamage(damage),
    blocked: damage <= 0,
    reason: damage <= 0 ? 'non-positive' : 'none',
    effectiveResistance: combinedResistance,
  };
}

export interface FrontalHitRequest {
  defenderFacingRadians: number;
  incomingDirectionRadians: number;
  frontalHalfAngleRadians?: number;
}

/** Returns true when the hit arrives inside the defender's forward shield arc. */
export function isFrontalHit(request: FrontalHitRequest): boolean {
  const halfAngle = request.frontalHalfAngleRadians ?? Math.PI / 3;
  const delta = smallestAngle(request.incomingDirectionRadians, request.defenderFacingRadians);
  return Math.abs(delta) <= halfAngle;
}

export function shieldbearerDirectionalMultiplier(frontalProjectileHit: boolean): number {
  return frontalProjectileHit ? 0.2 : 1;
}

function noDamage(reason: DamageBlockReason, effectiveResistance: number): DamageResult {
  return { damage: 0, blocked: true, reason, effectiveResistance };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundDamage(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function smallestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(from - to), Math.cos(from - to));
}
