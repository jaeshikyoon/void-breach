import type { DamageType, MonsterId } from '../core/types';
import { clampStage, type StageNumber } from '../stages';
import { MONSTERS, type MonsterDefinition, type MonsterUnlockFront } from './monsters';

export const ENCOUNTER_FRONT_COUNT = 5;

export interface EncounterFrontDefinition {
  id: MonsterUnlockFront;
  name: string;
  minStage: StageNumber;
  maxStage: StageNumber;
  environmentTag: string;
}

export const ENCOUNTER_FRONTS: readonly EncounterFrontDefinition[] = Object.freeze([
  { id: 1, name: '폐허 외곽선', minStage: 1, maxStage: 4, environmentTag: 'ruined-outskirts' },
  { id: 2, name: '오염 정제소', minStage: 5, maxStage: 8, environmentTag: 'toxic-refinery' },
  { id: 3, name: '극저온 방벽', minStage: 9, maxStage: 12, environmentTag: 'cryo-bastion' },
  { id: 4, name: '공허 공성지', minStage: 13, maxStage: 16, environmentTag: 'void-siegeworks' },
  { id: 5, name: '균열 핵심부', minStage: 17, maxStage: 20, environmentTag: 'rift-core' },
]);

export const NEW_MONSTER_IDS = Object.freeze([
  'plagueHound',
  'phaseStalker',
  'toxicSpitter',
  'voidPriest',
  'shockTrooper',
  'cryoSentinel',
  'siegeCrawler',
  'nullifier',
] as const satisfies readonly MonsterId[]);

/** Complete 20-unit roster; every entry is a real MonsterId consumed by runtime. */
export const ENCOUNTER_MONSTERS: Readonly<Record<MonsterId, MonsterDefinition>> = MONSTERS;

export interface StageMonsterWeight {
  monsterId: MonsterId;
  weight: number;
}

export interface StageMonsterPool {
  stage: StageNumber;
  front: MonsterUnlockFront;
  monsters: readonly StageMonsterWeight[];
}

export interface StageMonsterSelection {
  stage: StageNumber;
  front: MonsterUnlockFront;
  monsterId: MonsterId;
  definition: MonsterDefinition;
  weight: number;
  requestedMonsterId: MonsterId | null;
}

const I = 'infected' as const;
const R = 'razor' as const;
const M = 'marksman' as const;
const E = 'exploder' as const;
const P = 'plagueHound' as const;
const B = 'brute' as const;
const S = 'shieldbearer' as const;
const T = 'toxicSpitter' as const;
const F = 'flameCultist' as const;
const H = 'healer' as const;
const C = 'frostCultist' as const;
const L = 'lightningArcher' as const;
const A = 'ambusher' as const;
const PH = 'phaseStalker' as const;
const SH = 'shockTrooper' as const;
const CR = 'cryoSentinel' as const;
const SU = 'summoner' as const;
const V = 'voidPriest' as const;
const SC = 'siegeCrawler' as const;
const N = 'nullifier' as const;

/**
 * Explicit stage pools. Weights are normalized from left-to-right priority,
 * retaining fodder density while steadily admitting specialist units.
 */
export const STAGE_MONSTER_POOLS: readonly StageMonsterPool[] = Object.freeze([
  makePool(1, [I, R, M, E]),
  makePool(2, [I, R, M, E]),
  makePool(3, [I, R, P, M, E]),
  makePool(4, [I, R, P, M, E]),
  makePool(5, [I, R, P, B, M, E]),
  makePool(6, [I, P, B, M, T, E]),
  makePool(7, [I, P, B, S, M, T, E]),
  makePool(8, [I, P, B, S, M, T, F, H]),
  makePool(9, [I, P, B, S, M, C, L, A]),
  makePool(10, [I, P, B, S, M, C, L, A, T]),
  makePool(11, [I, P, B, S, M, C, L, A, PH]),
  makePool(12, [I, P, B, S, C, L, A, PH, SH, CR]),
  makePool(13, [I, P, B, S, C, L, A, PH, SH, SU]),
  makePool(14, [I, P, B, S, C, L, A, PH, SH, SU, V]),
  makePool(15, [I, B, S, T, C, L, A, PH, SH, V, SC]),
  makePool(16, [I, B, S, T, C, L, A, PH, SH, SU, V, SC]),
  makePool(17, [I, B, S, T, C, L, A, PH, SH, V, SC, N]),
  makePool(18, [I, P, B, S, T, F, C, L, A, PH, SH, V, N]),
  makePool(19, [I, P, B, S, T, F, C, L, A, PH, SH, CR, SC]),
  makePool(20, [I, P, B, S, T, F, C, L, A, PH, SH, CR, SC, N]),
]);

export function getEncounterFront(stage: number): EncounterFrontDefinition {
  const normalized = clampStage(stage);
  const front = ENCOUNTER_FRONTS.find(
    (candidate) => normalized >= candidate.minStage && normalized <= candidate.maxStage,
  );
  if (!front) throw new RangeError(`No encounter front configured for stage ${normalized}.`);
  return front;
}

export function getStageMonsterPool(stage: number): StageMonsterPool {
  const normalized = clampStage(stage);
  const pool = STAGE_MONSTER_POOLS[normalized - 1];
  if (!pool) throw new RangeError(`No monster pool configured for stage ${normalized}.`);
  return pool;
}

/** Deterministic weighted selection from an explicit unit interval roll. */
export function selectStageMonster(stage: number, roll: number): StageMonsterSelection {
  if (!Number.isFinite(roll) || roll < 0 || roll > 1) {
    throw new RangeError(`roll must be a finite number from 0 through 1; received ${roll}.`);
  }
  const pool = getStageMonsterPool(stage);
  const target = roll === 1 ? 100 : roll * 100;
  let cumulative = 0;
  let selected = pool.monsters[pool.monsters.length - 1];
  for (const candidate of pool.monsters) {
    cumulative += candidate.weight;
    if (target < cumulative) {
      selected = candidate;
      break;
    }
  }
  if (!selected) throw new Error(`Stage ${pool.stage} has an empty monster pool.`);
  return makeSelection(pool, selected, null);
}

export interface SpawnMonsterRemapRequest {
  stage: number;
  requestedMonsterId: MonsterId;
  deploymentOrdinal: number;
}

/**
 * Converts a legacy SpawnDirector request to the stage roster without consuming
 * mutable RNG state. Replaying the same stage and ordinal yields the same unit.
 */
export function remapSpawnMonsterForStage(request: SpawnMonsterRemapRequest): StageMonsterSelection {
  if (!Number.isInteger(request.deploymentOrdinal) || request.deploymentOrdinal < 1) {
    throw new RangeError('deploymentOrdinal must be a positive integer.');
  }
  if (!(request.requestedMonsterId in MONSTERS)) {
    throw new RangeError(`Unknown monster id: ${request.requestedMonsterId}.`);
  }
  const pool = getStageMonsterPool(request.stage);
  const roll = stableUnitRoll(`${pool.stage}:${request.deploymentOrdinal}:${request.requestedMonsterId}`);
  const picked = selectStageMonster(pool.stage, roll);
  return { ...picked, requestedMonsterId: request.requestedMonsterId };
}

export type BossId =
  | 'ironColossus'
  | 'plagueOvermind'
  | 'stormWarden'
  | 'voidMatriarch'
  | 'riftSovereign';

export type BossPatternKind =
  | 'charge'
  | 'slam'
  | 'projectileFan'
  | 'hazardField'
  | 'summon'
  | 'laserSweep'
  | 'shieldPulse'
  | 'teleportStrike'
  | 'radialBurst';

export interface BossPatternDefinition {
  id: string;
  phase: 1 | 2 | 3;
  kind: BossPatternKind;
  windupSeconds: number;
  cooldownSeconds: number;
  damageMultiplier: number;
  radius: number;
  range: number;
  projectileCount: number;
  tags: readonly string[];
}

export interface BossEncounterDefinition {
  id: BossId;
  name: string;
  stage: 4 | 8 | 12 | 16 | 20;
  front: MonsterUnlockFront;
  baseHealth: number;
  baseDamage: number;
  visualFrame: 0 | 1 | 2 | 3 | 4;
  artKey: string;
  resistances: Partial<Record<DamageType, number>>;
  patterns: readonly BossPatternDefinition[];
}

export const BOSS_ENCOUNTERS: Readonly<Record<BossId, BossEncounterDefinition>> = Object.freeze({
  ironColossus: boss('ironColossus', '철갑 파쇄자', 4, 1, 2_500, 22, 0, 'boss-iron-colossus',
    { kinetic: 0.15 }, [
      pattern('ram', 1, 'charge', 0.9, 3.4, 1.15, 46, 520, 1, ['wall-impact']),
      pattern('forge-slam', 1, 'slam', 1.05, 4.2, 1.3, 150, 0, 1, ['radial-telegraph']),
      pattern('shrapnel-fan', 2, 'projectileFan', 0.75, 3.1, 0.72, 0, 600, 7, ['spread-projectiles']),
      pattern('armor-pulse', 2, 'shieldPulse', 0.8, 6, 0.6, 180, 0, 1, ['temporary-armor']),
      pattern('overdrive', 3, 'radialBurst', 1.2, 4.8, 1.45, 220, 0, 12, ['double-pulse']),
    ]),
  plagueOvermind: boss('plagueOvermind', '역병 군체의식', 8, 2, 3_800, 27, 1, 'boss-plague-overmind',
    { fire: 0.2, explosive: 0.1 }, [
      pattern('toxic-salvo', 1, 'projectileFan', 0.9, 3.2, 0.75, 0, 640, 9, ['toxic-trails']),
      pattern('spore-ring', 1, 'hazardField', 1.1, 5.2, 0.55, 190, 0, 1, ['persistent-pool']),
      pattern('brood-call', 2, 'summon', 1.25, 7, 0, 240, 0, 4, ['plague-hounds']),
      pattern('burrow-crush', 2, 'teleportStrike', 0.85, 4.4, 1.4, 105, 520, 1, ['delayed-marker']),
      pattern('virulent-nova', 3, 'radialBurst', 1.35, 5.5, 1.35, 260, 0, 16, ['alternating-gaps']),
    ]),
  stormWarden: boss('stormWarden', '폭풍 감시자', 12, 3, 5_400, 32, 2, 'boss-storm-warden',
    { lightning: 0.35, frost: 0.15 }, [
      pattern('arc-lances', 1, 'projectileFan', 0.65, 2.8, 0.78, 0, 720, 6, ['chain-on-hit']),
      pattern('cryo-pulse', 1, 'radialBurst', 1, 4.5, 0.8, 180, 0, 10, ['slow-ring']),
      pattern('storm-sweep', 2, 'laserSweep', 1.1, 5.1, 1.05, 55, 760, 1, ['rotating-beam']),
      pattern('sentinel-drop', 2, 'summon', 1.2, 7.5, 0, 260, 0, 2, ['cryo-sentinels']),
      pattern('thunder-cage', 3, 'hazardField', 1.4, 5.8, 1.25, 280, 0, 8, ['closing-ring']),
    ]),
  voidMatriarch: boss('voidMatriarch', '공허 모체', 16, 4, 7_500, 38, 3, 'boss-void-matriarch',
    { gravity: 0.35, kinetic: 0.1 }, [
      pattern('rift-step', 1, 'teleportStrike', 0.62, 3.1, 1.2, 90, 620, 1, ['afterimage']),
      pattern('gravity-wake', 1, 'hazardField', 1, 4.6, 0.7, 210, 0, 3, ['pull-zones']),
      pattern('priest-conclave', 2, 'summon', 1.4, 7.8, 0, 270, 0, 3, ['void-priests']),
      pattern('event-horizon', 2, 'laserSweep', 1.25, 5.6, 1.15, 70, 800, 1, ['counter-clockwise']),
      pattern('collapse', 3, 'radialBurst', 1.55, 6, 1.6, 310, 0, 20, ['safe-inner-ring']),
    ]),
  riftSovereign: boss('riftSovereign', '균열 군주', 20, 5, 10_000, 45, 4, 'boss-rift-sovereign',
    { gravity: 0.2, explosive: 0.15 }, [
      pattern('sovereign-charge', 1, 'charge', 0.72, 2.9, 1.25, 54, 680, 1, ['return-charge']),
      pattern('rift-barrage', 1, 'projectileFan', 0.8, 3.3, 0.82, 0, 780, 12, ['spiral-pattern']),
      pattern('nullifier-court', 2, 'summon', 1.35, 7.2, 0, 300, 0, 4, ['mixed-elites']),
      pattern('world-splitter', 2, 'laserSweep', 1.3, 5.1, 1.35, 82, 880, 2, ['crossing-beams']),
      pattern('final-breach', 3, 'radialBurst', 1.65, 5.5, 1.7, 340, 0, 24, ['three-wave-sequence']),
      pattern('annihilation-field', 3, 'hazardField', 1.1, 4.2, 0.92, 300, 0, 6, ['moving-safe-zones']),
    ]),
});

const BOSS_STAGE_MAP = new Map<number, BossEncounterDefinition>(
  Object.values(BOSS_ENCOUNTERS).map((definition) => [definition.stage, definition]),
);

/** Returns a boss only on the canonical front finales: 4, 8, 12, 16, and 20. */
export function getBossForStage(stage: number): BossEncounterDefinition | null {
  if (!Number.isInteger(stage) || stage < 1 || stage > 20) return null;
  return BOSS_STAGE_MAP.get(stage) ?? null;
}

/** Returns the owning front's boss for every valid stage (1-4 share boss one, etc.). */
export function getStageBoss(stage: number): BossEncounterDefinition | null {
  if (!Number.isInteger(stage) || stage < 1 || stage > 20) return null;
  const front = Math.floor((stage - 1) / 4) + 1;
  return Object.values(BOSS_ENCOUNTERS).find((bossDefinition) => bossDefinition.front === front) ?? null;
}

/** True only for a front finale: stages 4, 8, 12, 16, and 20. */
export function isBossStage(stage: number): stage is 4 | 8 | 12 | 16 | 20 {
  return BOSS_STAGE_MAP.has(stage);
}

export const isFrontFinaleStage = isBossStage;

function makePool(stage: StageNumber, monsterIds: readonly MonsterId[]): StageMonsterPool {
  if (monsterIds.length < 4) throw new RangeError(`Stage ${stage} requires at least four monster types.`);
  const front = (Math.floor((stage - 1) / 4) + 1) as MonsterUnlockFront;
  const rawWeights = monsterIds.map((_, index) =>
    Math.max(5, 24 - index * 1.35 + ((stage + index) % 4) * 0.37),
  );
  const total = rawWeights.reduce((sum, weight) => sum + weight, 0);
  const monsters = monsterIds.map((monsterId, index) => {
    const definition = MONSTERS[monsterId];
    if (definition.unlockFront > front) {
      throw new RangeError(`${monsterId} unlocks in front ${definition.unlockFront}, not stage ${stage}.`);
    }
    return Object.freeze({ monsterId, weight: ((rawWeights[index] ?? 0) / total) * 100 });
  });
  return Object.freeze({ stage, front, monsters: Object.freeze(monsters) });
}

function makeSelection(
  pool: StageMonsterPool,
  selected: StageMonsterWeight,
  requestedMonsterId: MonsterId | null,
): StageMonsterSelection {
  return {
    stage: pool.stage,
    front: pool.front,
    monsterId: selected.monsterId,
    definition: MONSTERS[selected.monsterId],
    weight: selected.weight,
    requestedMonsterId,
  };
}

function stableUnitRoll(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function boss(
  id: BossId,
  name: string,
  stage: 4 | 8 | 12 | 16 | 20,
  front: MonsterUnlockFront,
  baseHealth: number,
  baseDamage: number,
  visualFrame: 0 | 1 | 2 | 3 | 4,
  artKey: string,
  resistances: Partial<Record<DamageType, number>>,
  patterns: readonly BossPatternDefinition[],
): BossEncounterDefinition {
  return Object.freeze({ id, name, stage, front, baseHealth, baseDamage, visualFrame, artKey, resistances, patterns });
}

function pattern(
  id: string,
  phase: 1 | 2 | 3,
  kind: BossPatternKind,
  windupSeconds: number,
  cooldownSeconds: number,
  damageMultiplier: number,
  radius: number,
  range: number,
  projectileCount: number,
  tags: readonly string[],
): BossPatternDefinition {
  return Object.freeze({ id, phase, kind, windupSeconds, cooldownSeconds, damageMultiplier, radius, range, projectileCount, tags });
}
