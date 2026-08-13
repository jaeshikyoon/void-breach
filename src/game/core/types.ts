export interface Vec2 {
  x: number;
  y: number;
}

export type EntityId = string;

export type DamageType =
  | 'kinetic'
  | 'explosive'
  | 'fire'
  | 'frost'
  | 'lightning'
  | 'gravity';

export type MonsterRole = 'melee' | 'ranged' | 'special' | 'support';

export type MonsterSpawnSource = 'director' | 'summoner' | 'boss';

export type MonsterId =
  | 'infected'
  | 'razor'
  | 'brute'
  | 'shieldbearer'
  | 'marksman'
  | 'flameCultist'
  | 'frostCultist'
  | 'lightningArcher'
  | 'exploder'
  | 'healer'
  | 'summoner'
  | 'ambusher'
  | 'plagueHound'
  | 'phaseStalker'
  | 'toxicSpitter'
  | 'voidPriest'
  | 'shockTrooper'
  | 'cryoSentinel'
  | 'siegeCrawler'
  | 'nullifier';

export type ActiveSkillId =
  | 'homingMissiles'
  | 'glacialGrenade'
  | 'gravityWell'
  | 'flameBeam'
  | 'chainLightning'
  | 'autoTurret'
  | 'landmines'
  | 'orbitingBlades'
  | 'iceBarrier'
  | 'attackDrone';

export type BasicUpgradeId =
  | 'reinforcedRounds'
  | 'rapidFire'
  | 'penetration'
  | 'multishot'
  | 'ricochet'
  | 'precisionSight'
  | 'largeCaliber'
  | 'explosiveRounds'
  | 'focusedFire'
  | 'combatMobility';

export type SurvivalUpgradeId =
  | 'lightweightArmor'
  | 'reinforcedArmor'
  | 'coolantUnit'
  | 'xpMagnet'
  | 'emergencyRepair'
  | 'enhancedDash';

export type PassiveUpgradeId = BasicUpgradeId | SurvivalUpgradeId;

export interface BaseEntity {
  id: EntityId;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  alive: boolean;
}

export interface PlayerEntity extends BaseEntity {
  kind: 'player';
  health: number;
  maxHealth: number;
  shield: number;
  level: number;
  experience: number;
  facingRadians: number;
}

export type MonsterAiState =
  | 'spawning'
  | 'chasing'
  | 'repositioning'
  | 'windup'
  | 'attacking'
  | 'recovery'
  | 'frozen'
  | 'dead';

export interface MonsterEntity extends BaseEntity {
  kind: 'monster';
  monsterId: MonsterId;
  spawnSource: MonsterSpawnSource;
  deploymentOrdinal: number | null;
  elite: boolean;
  role: MonsterRole;
  health: number;
  maxHealth: number;
  damage: number;
  moveSpeed: number;
  experienceValue: number;
  aiState: MonsterAiState;
  resistances: Partial<Record<DamageType, number>>;
  immunities: readonly DamageType[];
}

export interface ProjectileEntity extends BaseEntity {
  kind: 'projectile';
  ownerId: EntityId;
  damage: number;
  damageType: DamageType;
  isBasicAttack: boolean;
  remainingRange: number;
  pierceRemaining: number;
}

export interface ExperienceCrystalEntity extends BaseEntity {
  kind: 'experienceCrystal';
  value: number;
  magnetized: boolean;
}

export interface EffectEntity extends BaseEntity {
  kind: 'effect';
  effectId: string;
  remainingSeconds: number;
}

export type GameEntity =
  | PlayerEntity
  | MonsterEntity
  | ProjectileEntity
  | ExperienceCrystalEntity
  | EffectEntity;

export interface PlayerBuild {
  activeSkills: Partial<Record<ActiveSkillId, number>>;
  passiveLevels: Partial<Record<PassiveUpgradeId, number>>;
}

export function countsTowardDeployment(source: MonsterSpawnSource): boolean {
  return source === 'director';
}

export function grantsExperience(source: MonsterSpawnSource): boolean {
  return source === 'director';
}
