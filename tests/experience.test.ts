import { describe, expect, it } from 'vitest';
import {
  ExperienceSystem,
  requiredExperienceForLevel,
  totalExperienceToReachLevel,
} from '../src/game/core/experience';

describe('experience and level progression', () => {
  it('uses the specified deployment-run XP formula', () => {
    expect([1, 2, 3, 4, 5].map(requiredExperienceForLevel)).toEqual([6, 8, 9, 11, 12]);
    expect(totalExperienceToReachLevel(4)).toBe(23);
  });

  it('queues every card selection when one pickup crosses multiple levels', () => {
    const experience = new ExperienceSystem();
    const result = experience.addExperience(23);
    expect(result).toMatchObject({
      level: 4,
      experience: 0,
      levelsGained: 3,
      queuedLevelUps: 3,
      queuedLevelUpLevels: [2, 3, 4],
    });
    expect(experience.nextQueuedLevelUpLevel).toBe(2);
    expect(experience.consumeLevelUpSelection()).toBe(true);
    expect(experience.queuedLevelUps).toBe(2);
    expect(experience.nextQueuedLevelUpLevel).toBe(3);
    expect(experience.queuedLevelUpLevels).toEqual([3, 4]);
  });

  it('preserves pending draft levels across snapshots and supports legacy count-only snapshots', () => {
    const original = new ExperienceSystem();
    original.addExperience(23);
    original.consumeLevelUpSelection();

    const restored = new ExperienceSystem(original.snapshot());
    expect(restored.queuedLevelUpLevels).toEqual([3, 4]);
    expect(restored.nextQueuedLevelUpLevel).toBe(3);

    const legacy = new ExperienceSystem({ level: 6, experience: 0, queuedLevelUps: 2 });
    expect(legacy.queuedLevelUpLevels).toEqual([5, 6]);
  });

  it('returns defensive pending-level snapshots and rejects impossible queues', () => {
    const experience = new ExperienceSystem();
    experience.addExperience(14);
    const queued = experience.queuedLevelUpLevels as number[];
    queued.length = 0;
    expect(experience.queuedLevelUpLevels).toEqual([2, 3]);

    expect(() => new ExperienceSystem({ level: 2, queuedLevelUps: 2 })).toThrow(RangeError);
    expect(
      () =>
        new ExperienceSystem({
          level: 4,
          experience: 0,
          queuedLevelUps: 2,
          queuedLevelUpLevels: [2, 4],
        }),
    ).toThrow(RangeError);
  });
});
