import {
  ELITE_DEPLOYMENT_ORDINALS,
  SPAWN_BANDS,
  type SpawnBandDefinition,
} from '../data/monsters';
import { SeededRng, type RandomSource } from './rng';
import type { MonsterId, MonsterSpawnSource } from './types';

export const MAX_DIRECTOR_DEPLOYMENTS = 200;
export const MAX_ALIVE_DIRECTOR_MONSTERS = 90;
export const MAX_ALIVE_SUMMONS = 15;
export const MAX_ALIVE_ELITES = 3;

const eliteOrdinals = new Set<number>(ELITE_DEPLOYMENT_ORDINALS);

export interface SpawnRequest {
  monsterId: MonsterId;
  source: 'director';
  deploymentOrdinal: number;
  elite: boolean;
}

export interface ReinforcementContext {
  /** Living monsters created by this director. Summons and the boss are excluded. */
  aliveDirectorMonsters: number;
  aliveElites?: number;
}

export interface ReinforcementPlan {
  spawns: readonly SpawnRequest[];
  targetAlive: number;
  bossIncoming: boolean;
  normalSpawningComplete: boolean;
}

export interface SpawnRegistration {
  source: MonsterSpawnSource;
  deploymentOrdinal: number | null;
  countsTowardDeployment: boolean;
  grantsExperience: boolean;
  bossIncoming: boolean;
}

export interface SpawnDirectorSnapshot {
  deployedCount: number;
  bossTriggerIssued: boolean;
  rngState: number;
}

export function getSpawnBandForOrdinal(ordinal: number): SpawnBandDefinition {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > MAX_DIRECTOR_DEPLOYMENTS) {
    throw new RangeError(`Deployment ordinal must be between 1 and ${MAX_DIRECTOR_DEPLOYMENTS}.`);
  }
  const band = SPAWN_BANDS.find(
    (candidate) => ordinal >= candidate.minOrdinal && ordinal <= candidate.maxOrdinal,
  );
  if (band === undefined) throw new Error(`No spawn band configured for ordinal ${ordinal}.`);
  return band;
}

export class SpawnDirector {
  private deployed = 0;
  private bossTriggerIssued = false;
  private readonly rng: RandomSource;
  private readonly serializableRng: SeededRng | null;

  constructor(seedOrRng: number | string | RandomSource = 0xdecafbad) {
    if (typeof seedOrRng === 'number' || typeof seedOrRng === 'string') {
      const rng = new SeededRng(seedOrRng);
      this.rng = rng;
      this.serializableRng = rng;
    } else {
      this.rng = seedOrRng;
      this.serializableRng = seedOrRng instanceof SeededRng ? seedOrRng : null;
    }
  }

  get deployedCount(): number {
    return this.deployed;
  }

  get normalSpawningComplete(): boolean {
    return this.deployed >= MAX_DIRECTOR_DEPLOYMENTS;
  }

  get bossWasTriggered(): boolean {
    return this.bossTriggerIssued;
  }

  get currentBand(): SpawnBandDefinition {
    const ordinal = Math.min(this.deployed + 1, MAX_DIRECTOR_DEPLOYMENTS);
    return getSpawnBandForOrdinal(ordinal);
  }

  /**
   * Records any monster creation. Only director-created monsters advance the 200 counter;
   * summoner and boss spawns deliberately return a null ordinal and zero XP entitlement.
   */
  recordSpawn(source: MonsterSpawnSource): SpawnRegistration {
    if (source !== 'director') {
      return {
        source,
        deploymentOrdinal: null,
        countsTowardDeployment: false,
        grantsExperience: false,
        bossIncoming: false,
      };
    }

    if (this.normalSpawningComplete) {
      throw new RangeError('The director cannot deploy more than 200 regular monsters.');
    }

    this.deployed += 1;
    const bossIncoming = this.deployed === MAX_DIRECTOR_DEPLOYMENTS && !this.bossTriggerIssued;
    if (bossIncoming) this.bossTriggerIssued = true;

    return {
      source,
      deploymentOrdinal: this.deployed,
      countsTowardDeployment: true,
      grantsExperience: true,
      bossIncoming,
    };
  }

  planReinforcement(context: ReinforcementContext): ReinforcementPlan {
    validateCount(context.aliveDirectorMonsters, 'aliveDirectorMonsters');
    const aliveElites = context.aliveElites ?? 0;
    validateCount(aliveElites, 'aliveElites');

    const band = this.currentBand;
    if (
      this.normalSpawningComplete ||
      context.aliveDirectorMonsters >= band.targetAlive ||
      context.aliveDirectorMonsters >= MAX_ALIVE_DIRECTOR_MONSTERS
    ) {
      return {
        spawns: [],
        targetAlive: band.targetAlive,
        bossIncoming: false,
        normalSpawningComplete: this.normalSpawningComplete,
      };
    }

    const requested = this.rng.int(band.batchMin, band.batchMax);
    const remainingDeployments = MAX_DIRECTOR_DEPLOYMENTS - this.deployed;
    const aliveCapacity = MAX_ALIVE_DIRECTOR_MONSTERS - context.aliveDirectorMonsters;
    const targetGap = band.targetAlive - context.aliveDirectorMonsters;
    const batchSize = Math.min(requested, remainingDeployments, aliveCapacity, targetGap);
    const spawns: SpawnRequest[] = [];
    let bossIncoming = false;
    let elitesInBatch = 0;

    for (let index = 0; index < batchSize; index += 1) {
      const nextOrdinal = this.deployed + 1;
      const elite = eliteOrdinals.has(nextOrdinal);
      if (elite && aliveElites + elitesInBatch >= MAX_ALIVE_ELITES) break;

      const ordinalBand = getSpawnBandForOrdinal(nextOrdinal);
      const monster = this.rng.weightedPick(ordinalBand.composition, (entry) => entry.weight);
      const registration = this.recordSpawn('director');
      if (registration.deploymentOrdinal === null) {
        throw new Error('A director spawn must receive a deployment ordinal.');
      }
      bossIncoming ||= registration.bossIncoming;
      if (elite) elitesInBatch += 1;
      spawns.push({
        monsterId: monster.monsterId,
        source: 'director',
        deploymentOrdinal: registration.deploymentOrdinal,
        elite,
      });
    }

    return {
      spawns,
      targetAlive: band.targetAlive,
      bossIncoming,
      normalSpawningComplete: this.normalSpawningComplete,
    };
  }

  allowedSummonCount(currentSummonedAlive: number, requested: number): number {
    validateCount(currentSummonedAlive, 'currentSummonedAlive');
    validateCount(requested, 'requested');
    return Math.max(0, Math.min(requested, MAX_ALIVE_SUMMONS - currentSummonedAlive));
  }

  snapshot(): SpawnDirectorSnapshot {
    if (this.serializableRng === null) {
      throw new Error('Cannot snapshot a SpawnDirector that uses an external random source.');
    }
    return {
      deployedCount: this.deployed,
      bossTriggerIssued: this.bossTriggerIssued,
      rngState: this.serializableRng.getState(),
    };
  }

  restore(snapshot: SpawnDirectorSnapshot): void {
    if (this.serializableRng === null) {
      throw new Error('Cannot restore a SpawnDirector that uses an external random source.');
    }
    if (
      !Number.isInteger(snapshot.deployedCount) ||
      snapshot.deployedCount < 0 ||
      snapshot.deployedCount > MAX_DIRECTOR_DEPLOYMENTS
    ) {
      throw new RangeError('Invalid deployedCount in SpawnDirector snapshot.');
    }
    this.deployed = snapshot.deployedCount;
    this.bossTriggerIssued = snapshot.bossTriggerIssued;
    this.serializableRng.setState(snapshot.rngState);
  }
}

function validateCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}
