import { describe, expect, it } from 'vitest';
import {
  isFrontalHit,
  resolveDamage,
  shieldbearerDirectionalMultiplier,
} from '../src/game/core/damage';

describe('damage resolution', () => {
  it('does not deal contact damage outside the active attack frame', () => {
    expect(resolveDamage({ amount: 20, damageType: 'kinetic', attackPhase: 'windup' })).toMatchObject({
      damage: 0,
      blocked: true,
      reason: 'not-active',
    });
    expect(resolveDamage({ amount: 20, damageType: 'kinetic', attackPhase: 'active' }).damage).toBe(20);
  });

  it('applies resistance and true immunity while preserving basic-gun viability', () => {
    expect(
      resolveDamage({ amount: 100, damageType: 'fire', resistances: { fire: 0.4 } }).damage,
    ).toBe(60);
    expect(
      resolveDamage({ amount: 100, damageType: 'fire', immunities: ['fire'] }).damage,
    ).toBe(0);
    expect(
      resolveDamage({
        amount: 100,
        damageType: 'fire',
        immunities: ['fire'],
        isBasicAttack: true,
      }).damage,
    ).toBe(10);
  });

  it('combines encounter resistance multiplicatively and handles a frontal shield hit', () => {
    const frontal = isFrontalHit({ defenderFacingRadians: 0, incomingDirectionRadians: 0.1 });
    expect(frontal).toBe(true);
    expect(
      resolveDamage({
        amount: 100,
        damageType: 'kinetic',
        resistances: { kinetic: 0.4 },
        encounterResistance: 0.5,
        directionalMultiplier: shieldbearerDirectionalMultiplier(frontal),
      }).damage,
    ).toBe(6);
  });
});
