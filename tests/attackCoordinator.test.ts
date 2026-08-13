import { describe, expect, it } from 'vitest';
import { AttackCoordinator } from '../src/game/core/AttackCoordinator';

describe('AttackCoordinator', () => {
  it('caps simultaneous melee, ranged, and special attacks', () => {
    const coordinator = new AttackCoordinator();
    for (let index = 0; index < 6; index += 1) {
      expect(coordinator.tryAcquire(`melee-${index}`, 'melee')).not.toBeNull();
    }
    expect(coordinator.tryAcquire('melee-overflow', 'melee')).toBeNull();

    for (let index = 0; index < 4; index += 1) {
      expect(coordinator.tryAcquire(`ranged-${index}`, 'ranged')).not.toBeNull();
    }
    expect(coordinator.tryAcquire('ranged-overflow', 'ranged')).toBeNull();

    for (let index = 0; index < 2; index += 1) {
      expect(coordinator.tryAcquire(`special-${index}`, 'special')).not.toBeNull();
    }
    expect(coordinator.tryAcquire('special-overflow', 'special')).toBeNull();
  });

  it('releases slots and slows ranged cadence during boss power attacks', () => {
    const coordinator = new AttackCoordinator({ melee: 1 });
    expect(coordinator.tryAcquire('first', 'melee')).not.toBeNull();
    expect(coordinator.tryAcquire('second', 'melee')).toBeNull();
    expect(coordinator.release('first')).toBe(true);
    expect(coordinator.tryAcquire('second', 'melee')).not.toBeNull();

    expect(coordinator.cadenceMultiplier('ranged')).toBe(1);
    coordinator.setBossPowerAttack(true);
    expect(coordinator.cadenceMultiplier('ranged')).toBeGreaterThan(1);
    expect(coordinator.cadenceMultiplier('melee')).toBe(1);
  });
});
