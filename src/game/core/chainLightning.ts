import type { Vec2 } from './types';

export const CHAIN_LIGHTNING_INITIAL_RANGE = 420;
export const CHAIN_LIGHTNING_HOP_RANGE = 150;
export const CHAIN_LIGHTNING_INITIAL_AIM_DOT = 0.22;

export interface ChainLightningCandidate {
  readonly id: string;
  readonly position: Vec2;
  readonly alive: boolean;
}

export interface ChainLightningTargetRequest<T extends ChainLightningCandidate> {
  origin: Vec2;
  candidates: readonly T[];
  alreadyHitIds: ReadonlySet<string>;
  maxDistance: number;
  aimDirection?: Vec2;
  minimumAimDot?: number;
}

/** Returns the nearest living, previously-unhit target, or null to end the chain. */
export function selectNextChainLightningTarget<T extends ChainLightningCandidate>(
  request: ChainLightningTargetRequest<T>,
): T | null {
  if (!Number.isFinite(request.maxDistance) || request.maxDistance <= 0) return null;
  const maxDistanceSquared = request.maxDistance * request.maxDistance;
  const aim = request.aimDirection ? normalized(request.aimDirection) : null;
  const minimumAimDot = Number.isFinite(request.minimumAimDot)
    ? request.minimumAimDot ?? -1
    : -1;
  let nearest: T | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of request.candidates) {
    if (!candidate.alive || request.alreadyHitIds.has(candidate.id)) continue;
    const offset = {
      x: candidate.position.x - request.origin.x,
      y: candidate.position.y - request.origin.y,
    };
    const distanceSquared = offset.x * offset.x + offset.y * offset.y;
    if (distanceSquared > maxDistanceSquared) continue;
    if (aim) {
      const direction = normalized(offset);
      if (direction.x * aim.x + direction.y * aim.y < minimumAimDot) continue;
    }
    if (distanceSquared < nearestDistanceSquared) {
      nearest = candidate;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
}

function normalized(vector: Vec2): Vec2 {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude <= 0.000_001) return { x: 0, y: 0 };
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}
