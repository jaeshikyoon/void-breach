import type { MonsterSpawnSource } from './types';

export const HEALTH_PICKUP_DROP_CHANCE = 0.02;
export const HEALTH_PICKUP_HEAL_FRACTION = 0.15;

export interface HealthPickupDropRequest {
  spawnSource: MonsterSpawnSource;
  /** A deterministic unit roll supplied by the runtime's seeded RNG. */
  roll: number;
  dropChance?: number;
}

/** Only director-deployed enemies may create a health pickup. */
export function shouldDropHealthPickup(request: HealthPickupDropRequest): boolean {
  if (request.spawnSource !== 'director') return false;
  if (!Number.isFinite(request.roll) || request.roll < 0 || request.roll >= 1) {
    throw new RangeError(`roll must be in [0, 1); received ${request.roll}.`);
  }
  const chance = request.dropChance ?? HEALTH_PICKUP_DROP_CHANCE;
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
    throw new RangeError(`dropChance must be in [0, 1]; received ${chance}.`);
  }
  return request.roll < chance;
}

/** Returns the fixed max-health-relative healing payload for a pickup. */
export function calculateHealthPickupHeal(
  maxHealth: number,
  healFraction = HEALTH_PICKUP_HEAL_FRACTION,
): number {
  if (!Number.isFinite(maxHealth) || maxHealth <= 0) return 0;
  if (!Number.isFinite(healFraction) || healFraction < 0) return 0;
  return Math.round(maxHealth * healFraction * 1_000) / 1_000;
}
