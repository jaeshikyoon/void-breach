import type { DamageType } from './types';

export interface BasicProjectileRequest {
  baseDamage: number;
  sideShot?: boolean;
  critical?: boolean;
  /** Legacy profiles may still contain this passive; it never creates area damage. */
  explosiveRoundsLevel?: number;
}

export interface BasicProjectileProfile {
  damage: number;
  damageType: Extract<DamageType, 'kinetic'>;
  areaDamage: 0;
  areaRadius: 0;
}

/** A rifle hit never creates radial damage; visible pierce/ricochet contacts remain direct hits. */
export function resolveBasicProjectile(request: BasicProjectileRequest): BasicProjectileProfile {
  if (!Number.isFinite(request.baseDamage) || request.baseDamage <= 0) {
    return { damage: 0, damageType: 'kinetic', areaDamage: 0, areaRadius: 0 };
  }
  const damage =
    request.baseDamage * (request.sideShot ? 0.7 : 1) * (request.critical ? 1.75 : 1);
  return {
    damage: Math.round(damage * 1_000) / 1_000,
    damageType: 'kinetic',
    areaDamage: 0,
    areaRadius: 0,
  };
}
