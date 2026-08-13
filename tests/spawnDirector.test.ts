import { describe, expect, it } from 'vitest';
import {
  MAX_ALIVE_SUMMONS,
  MAX_DIRECTOR_DEPLOYMENTS,
  SpawnDirector,
} from '../src/game/core';
import { ELITE_DEPLOYMENT_ORDINALS } from '../src/game/data/monsters';

describe('SpawnDirector', () => {
  it('deploys every ordinal exactly once, stops at 200, and triggers one boss warning', () => {
    const director = new SpawnDirector('exact-cut');
    const ordinals: number[] = [];
    const eliteOrdinals: number[] = [];
    let bossWarnings = 0;

    while (!director.normalSpawningComplete) {
      const plan = director.planReinforcement({ aliveDirectorMonsters: 0 });
      expect(plan.spawns.length).toBeGreaterThan(0);
      for (const spawn of plan.spawns) {
        ordinals.push(spawn.deploymentOrdinal);
        if (spawn.elite) eliteOrdinals.push(spawn.deploymentOrdinal);
      }
      if (plan.bossIncoming) bossWarnings += 1;
    }

    expect(ordinals).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
    expect(eliteOrdinals).toEqual([...ELITE_DEPLOYMENT_ORDINALS]);
    expect(director.deployedCount).toBe(MAX_DIRECTOR_DEPLOYMENTS);
    expect(bossWarnings).toBe(1);
    expect(director.planReinforcement({ aliveDirectorMonsters: 0 }).spawns).toEqual([]);
  });

  it('does not count summoned or boss-created adds toward deployment or XP', () => {
    const director = new SpawnDirector(9);
    for (let index = 0; index < 50; index += 1) {
      const registration = director.recordSpawn(index % 2 === 0 ? 'summoner' : 'boss');
      expect(registration.deploymentOrdinal).toBeNull();
      expect(registration.countsTowardDeployment).toBe(false);
      expect(registration.grantsExperience).toBe(false);
    }
    expect(director.deployedCount).toBe(0);
  });

  it('only reinforces below the current alive target', () => {
    const director = new SpawnDirector(123);
    expect(director.planReinforcement({ aliveDirectorMonsters: 20 }).spawns).toHaveLength(0);
    const plan = director.planReinforcement({ aliveDirectorMonsters: 19 });
    expect(plan.spawns).toHaveLength(1);
  });

  it('never overshoots a band target when a batch fills the remaining gap', () => {
    const director = new SpawnDirector('target-clamp');
    let alive = 0;
    while (alive < director.currentBand.targetAlive) {
      const plan = director.planReinforcement({ aliveDirectorMonsters: alive });
      expect(plan.spawns.length).toBeGreaterThan(0);
      alive += plan.spawns.length;
      expect(alive).toBeLessThanOrEqual(plan.targetAlive);
    }
    expect(alive).toBe(20);
  });

  it('enforces the separate summoned-monster cap', () => {
    const director = new SpawnDirector(5);
    expect(director.allowedSummonCount(13, 8)).toBe(2);
    expect(director.allowedSummonCount(MAX_ALIVE_SUMMONS, 3)).toBe(0);
  });
});
