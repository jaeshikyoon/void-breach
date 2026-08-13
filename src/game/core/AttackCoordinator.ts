import type { EntityId, Vec2 } from './types';

export type AttackLane = 'melee' | 'ranged' | 'special';

export interface AttackLimits {
  melee: number;
  ranged: number;
  special: number;
}

export interface AttackPermit {
  entityId: EntityId;
  lane: AttackLane;
  slot: number;
}

export const DEFAULT_ATTACK_LIMITS: Readonly<AttackLimits> = {
  melee: 6,
  ranged: 4,
  special: 2,
};

/** Caps concurrent windup/attack sequences and hands out non-overlapping approach slots. */
export class AttackCoordinator {
  private readonly limits: AttackLimits;
  private readonly holders: Record<AttackLane, Map<EntityId, AttackPermit>> = {
    melee: new Map(),
    ranged: new Map(),
    special: new Map(),
  };
  private bossPowerAttackActive = false;

  constructor(limits: Partial<AttackLimits> = {}) {
    this.limits = {
      melee: validatedLimit(limits.melee ?? DEFAULT_ATTACK_LIMITS.melee, 'melee'),
      ranged: validatedLimit(limits.ranged ?? DEFAULT_ATTACK_LIMITS.ranged, 'ranged'),
      special: validatedLimit(limits.special ?? DEFAULT_ATTACK_LIMITS.special, 'special'),
    };
  }

  tryAcquire(entityId: EntityId, lane: AttackLane): AttackPermit | null {
    const existing = this.getPermit(entityId);
    if (existing !== null) return existing.lane === lane ? existing : null;

    const laneHolders = this.holders[lane];
    if (laneHolders.size >= this.limits[lane]) return null;

    const occupiedSlots = new Set([...laneHolders.values()].map((permit) => permit.slot));
    let slot = 0;
    while (occupiedSlots.has(slot)) slot += 1;
    const permit: AttackPermit = { entityId, lane, slot };
    laneHolders.set(entityId, permit);
    return permit;
  }

  release(entityId: EntityId): boolean {
    for (const lane of attackLanes) {
      if (this.holders[lane].delete(entityId)) return true;
    }
    return false;
  }

  releaseAll(): void {
    for (const lane of attackLanes) this.holders[lane].clear();
  }

  getPermit(entityId: EntityId): AttackPermit | null {
    for (const lane of attackLanes) {
      const permit = this.holders[lane].get(entityId);
      if (permit !== undefined) return permit;
    }
    return null;
  }

  activeCount(lane: AttackLane): number {
    return this.holders[lane].size;
  }

  availableCount(lane: AttackLane): number {
    return this.limits[lane] - this.activeCount(lane);
  }

  setBossPowerAttack(active: boolean): void {
    this.bossPowerAttackActive = active;
  }

  /** Ranged enemies wait longer while a boss power attack owns the telegraph space. */
  cadenceMultiplier(lane: AttackLane): number {
    return lane === 'ranged' && this.bossPowerAttackActive ? 1.75 : 1;
  }

  suggestedWorldPosition(
    permit: AttackPermit,
    target: Vec2,
    meleeRadius = 74,
    rangedRadius = 320,
    specialRadius = 230,
  ): Vec2 {
    const limit = this.limits[permit.lane];
    const stagger = permit.lane === 'ranged' ? Math.PI / Math.max(1, limit) : 0;
    const angle = (permit.slot / Math.max(1, limit)) * Math.PI * 2 + stagger;
    const radius =
      permit.lane === 'melee'
        ? meleeRadius
        : permit.lane === 'ranged'
          ? rangedRadius
          : specialRadius;
    return {
      x: target.x + Math.cos(angle) * radius,
      y: target.y + Math.sin(angle) * radius,
    };
  }

  snapshot(): Readonly<Record<AttackLane, readonly EntityId[]>> {
    return {
      melee: [...this.holders.melee.keys()],
      ranged: [...this.holders.ranged.keys()],
      special: [...this.holders.special.keys()],
    };
  }
}

const attackLanes: readonly AttackLane[] = ['melee', 'ranged', 'special'];

function validatedLimit(value: number, lane: AttackLane): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${lane} attack limit must be a positive integer.`);
  }
  return value;
}
