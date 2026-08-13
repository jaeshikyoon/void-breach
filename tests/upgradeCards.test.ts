import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/game/core/rng';
import type { PlayerBuild } from '../src/game/core/types';
import {
  applyUpgradeCard,
  buildCandidateGroups,
  generateUpgradeCards,
} from '../src/game/core/upgradeCards';

const emptyBuild = (): PlayerBuild => ({ activeSkills: {}, passiveLevels: {} });

describe('upgrade-card rules', () => {
  it('deals exactly two new skills and one basic upgrade on the first level-up', () => {
    const cards = generateUpgradeCards(
      { playerLevel: 2, build: emptyBuild() },
      new SeededRng('first-draft'),
    );
    expect(cards).toHaveLength(3);
    expect(cards.filter((card) => card.category === 'newActive')).toHaveLength(2);
    expect(cards.filter((card) => card.category === 'basic')).toHaveLength(1);
    expect(new Set(cards.map((card) => card.id)).size).toBe(3);
  });

  it('removes unowned actives when all three slots are occupied', () => {
    const build: PlayerBuild = {
      activeSkills: { homingMissiles: 1, gravityWell: 2, autoTurret: 3 },
      passiveLevels: {},
    };
    const groups = buildCandidateGroups(build);
    expect(groups.newActive).toHaveLength(0);
    expect(groups.activeUpgrade.every((card) => card.skillId !== undefined)).toBe(true);

    for (let seed = 0; seed < 20; seed += 1) {
      const cards = generateUpgradeCards({ playerLevel: 7, build }, new SeededRng(seed));
      expect(cards).toHaveLength(3);
      expect(cards.some((card) => card.category === 'newActive')).toBe(false);
      expect(cards.some((card) => card.category === 'activeUpgrade')).toBe(true);
      expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    }
  });

  it('guarantees a new skill at level 4 or 6 while a slot is open', () => {
    const build: PlayerBuild = {
      activeSkills: { glacialGrenade: 2 },
      passiveLevels: {},
    };
    const cards = generateUpgradeCards({ playerLevel: 4, build }, new SeededRng(22));
    expect(cards.some((card) => card.category === 'newActive')).toBe(true);
    expect(cards.some((card) => card.category === 'activeUpgrade')).toBe(true);
  });

  it('excludes max-level cards and refuses a fourth active skill', () => {
    const build: PlayerBuild = {
      activeSkills: { homingMissiles: 5, gravityWell: 1, autoTurret: 1 },
      passiveLevels: { reinforcedRounds: 5 },
    };
    const groups = buildCandidateGroups(build);
    expect(groups.activeUpgrade.some((card) => card.skillId === 'homingMissiles')).toBe(false);
    expect(groups.basic.some((card) => card.passiveId === 'reinforcedRounds')).toBe(false);

    const illegalCard = {
      id: 'skill:new:flameBeam',
      category: 'newActive' as const,
      title: '화염 방사',
      description: 'test',
      currentLevel: 0,
      nextLevel: 1,
      isNew: true,
      skillId: 'flameBeam' as const,
    };
    expect(() => applyUpgradeCard(build, illegalCard)).toThrow('occupied');
  });
});
