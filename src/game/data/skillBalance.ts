import type { ActiveSkillId } from '../core/types';
import { ACTIVE_SKILLS, type SkillLevelDefinition } from './skills';

export type SkillRole = 'burst' | 'control' | 'channel' | 'summon' | 'trap' | 'melee' | 'defense';
export type BossTargeting = 'direct' | 'fallback' | 'area';
export type SecondaryEffectKind =
  | 'splash'
  | 'submunition'
  | 'shatter'
  | 'burn'
  | 'deathExplosion'
  | 'fragment'
  | 'shockwave';

export interface SkillSecondaryCoefficient {
  kind: SecondaryEffectKind;
  /** Damage relative to one primary hit. */
  coefficient: number;
  /** Number of secondary hits or projectiles created per trigger. */
  count: number;
  minimumLevel: 1 | 2 | 3 | 4 | 5;
  targetCap: number;
}

export interface SkillBalanceConfig {
  id: ActiveSkillId;
  role: SkillRole;
  bossTargeting: BossTargeting;
  basePower: number;
  /** Seconds between repeated primary hits. Omitted for one-shot skills. */
  tickSeconds?: number;
  baseRadius: number;
  baseRange: number;
  primaryTargetCap: number;
  expectedTargets: number;
  /** Multiplies primary damage against bosses without changing normal targets. */
  bossDamageMultiplier: number;
  secondary: readonly SkillSecondaryCoefficient[];
  notes: readonly string[];
}

export interface SkillBalanceOptions {
  targetCount?: number;
  coolantLevel?: number;
  includeSecondary?: boolean;
}

export interface SkillBalanceEstimate {
  skillId: ActiveSkillId;
  level: 1 | 2 | 3 | 4 | 5;
  cooldownSeconds: number;
  /** Average primary damage/power delivered to each expected target. */
  primaryDamagePerTarget: number;
  /** Average secondary damage delivered to each expected target. */
  secondaryDamagePerTarget: number;
  castDamagePerTarget: number;
  primaryCastDamage: number;
  secondaryCastDamage: number;
  maxPrimaryTargets: number;
  expectedTargets: number;
  expectedCastDamage: number;
  sustainedDamagePerSecond: number;
  utility: Readonly<{
    radius: number;
    range: number;
    durationSeconds: number;
    tickCount: number;
    projectileCount: number;
    bossTargeting: BossTargeting;
  }>;
}

const UNLIMITED_TARGETS = Number.POSITIVE_INFINITY;

export const SKILL_BALANCE = Object.freeze({
  homingMissiles: {
    id: 'homingMissiles', role: 'burst', bossTargeting: 'fallback', basePower: 44,
    baseRadius: 52, baseRange: 1_150, primaryTargetCap: 5, expectedTargets: 3,
    bossDamageMultiplier: 1,
    secondary: [
      { kind: 'splash', coefficient: 0.55, count: 1, minimumLevel: 1, targetCap: 4 },
      { kind: 'submunition', coefficient: 0.35, count: 2, minimumLevel: 5, targetCap: 2 },
    ],
    notes: ['Each missile reserves a distinct target before concentrating fire.', 'Submunitions prefer new targets.'],
  },
  glacialGrenade: {
    id: 'glacialGrenade', role: 'control', bossTargeting: 'area', basePower: 70,
    baseRadius: 104, baseRange: 540, primaryTargetCap: UNLIMITED_TARGETS, expectedTargets: 6,
    bossDamageMultiplier: 1,
    secondary: [{ kind: 'fragment', coefficient: 0.45, count: 3, minimumLevel: 5, targetCap: 3 }],
    notes: ['Applies 40% slow for 3.2 seconds.', 'Level 3 freezes the inner area for 1.5 seconds.'],
  },
  gravityWell: {
    id: 'gravityWell', role: 'control', bossTargeting: 'area', basePower: 12, tickSeconds: 0.5,
    baseRadius: 126, baseRange: 540, primaryTargetCap: UNLIMITED_TARGETS, expectedTargets: 6,
    bossDamageMultiplier: 0.55,
    secondary: [{ kind: 'shatter', coefficient: 2, count: 1, minimumLevel: 5, targetCap: UNLIMITED_TARGETS }],
    notes: ['Pull speed budget: 85 world units per second.', 'Level 5 target budget is exactly 180 damage per cast.'],
  },
  flameBeam: {
    id: 'flameBeam', role: 'channel', bossTargeting: 'direct', basePower: 11, tickSeconds: 0.18,
    baseRadius: 25, baseRange: 620, primaryTargetCap: UNLIMITED_TARGETS, expectedTargets: 3,
    bossDamageMultiplier: 1,
    secondary: [
      { kind: 'burn', coefficient: 0.2, count: 6, minimumLevel: 1, targetCap: UNLIMITED_TARGETS },
      { kind: 'deathExplosion', coefficient: 1.6, count: 1, minimumLevel: 5, targetCap: 5 },
    ],
    notes: ['Burn ticks every 0.5 seconds for 3 seconds.', 'Death explosions cannot recursively trigger.'],
  },
  chainLightning: {
    id: 'chainLightning', role: 'burst', bossTargeting: 'fallback', basePower: 58,
    baseRadius: 0, baseRange: 420, primaryTargetCap: 7, expectedTargets: 7,
    bossDamageMultiplier: 1,
    secondary: [],
    notes: ['Each forward jump retains 90% damage.', 'Only unhit targets within 150 world units can receive the next jump.'],
  },
  autoTurret: {
    id: 'autoTurret', role: 'summon', bossTargeting: 'fallback', basePower: 17, tickSeconds: 0.5,
    baseRadius: 23, baseRange: 480, primaryTargetCap: 2, expectedTargets: 1,
    bossDamageMultiplier: 1,
    secondary: [],
    notes: ['Level 5 deploys two turrets at 75% power each.', 'Level 2 changes fire rate only.'],
  },
  landmines: {
    id: 'landmines', role: 'trap', bossTargeting: 'area', basePower: 52,
    baseRadius: 62, baseRange: 540, primaryTargetCap: UNLIMITED_TARGETS, expectedTargets: 2,
    bossDamageMultiplier: 1,
    secondary: [{ kind: 'fragment', coefficient: 0.3, count: 3, minimumLevel: 5, targetCap: 3 }],
    notes: ['Repeated mines from one cast deal 55% damage to the same target.', 'Level 5 supports delayed chain detonation.'],
  },
  orbitingBlades: {
    id: 'orbitingBlades', role: 'melee', bossTargeting: 'direct', basePower: 22, tickSeconds: 0.3,
    baseRadius: 24, baseRange: 82, primaryTargetCap: 3, expectedTargets: 2,
    bossDamageMultiplier: 1,
    secondary: [{ kind: 'shockwave', coefficient: 0.45, count: 1, minimumLevel: 5, targetCap: 1 }],
    notes: ['All blades share a per-target hit cooldown.', 'Each blade may emit one shockwave per second at level 5.'],
  },
  iceBarrier: {
    id: 'iceBarrier', role: 'defense', bossTargeting: 'area', basePower: 50,
    baseRadius: 48, baseRange: 0, primaryTargetCap: 1, expectedTargets: 1,
    bossDamageMultiplier: 1,
    secondary: [{ kind: 'shatter', coefficient: 1.3, count: 1, minimumLevel: 5, targetCap: 6 }],
    notes: ['Base power is shield capacity.', 'Level 3 freezes a melee attacker for 0.65 seconds with a per-target cooldown.'],
  },
  attackDrone: {
    id: 'attackDrone', role: 'summon', bossTargeting: 'fallback', basePower: 15, tickSeconds: 0.46,
    baseRadius: 17, baseRange: 560, primaryTargetCap: 2, expectedTargets: 1,
    bossDamageMultiplier: 1,
    secondary: [],
    notes: ['Level 5 deploys two drones at 70% power each.', 'Fire rate does not silently scale with damage levels.'],
  },
} as const satisfies Readonly<Record<ActiveSkillId, SkillBalanceConfig>>);

export function getSkillBalance(skillId: ActiveSkillId): SkillBalanceConfig {
  return SKILL_BALANCE[skillId];
}

export function calculateSkillBalance(
  skillId: ActiveSkillId,
  level: number,
  options: SkillBalanceOptions = {},
): SkillBalanceEstimate {
  assertSkillLevel(level);
  const typedLevel = level as 1 | 2 | 3 | 4 | 5;
  const config = SKILL_BALANCE[skillId];
  const levelDefinition = ACTIVE_SKILLS[skillId].levels[typedLevel - 1];
  if (!levelDefinition) throw new RangeError(`Missing ${skillId} level ${typedLevel} definition.`);
  const cooldownSeconds = calculateCooldown(skillId, levelDefinition, options.coolantLevel ?? 0);
  const projectileCount = levelDefinition.projectileCount ?? 1;
  const durationSeconds = levelDefinition.durationSeconds ?? 0;
  const tickCount = calculateTickCount(config, durationSeconds);
  const maxPrimaryTargets = levelTargetCap(skillId, projectileCount, config.primaryTargetCap);
  const requestedTargets = options.targetCount ?? config.expectedTargets;
  if (!Number.isFinite(requestedTargets) || requestedTargets < 0) {
    throw new RangeError('targetCount must be a non-negative finite number.');
  }
  const expectedTargets = Math.floor(Math.max(0, Math.min(requestedTargets, maxPrimaryTargets)));
  const primaryCastDamage = calculatePrimaryCastDamage(
    skillId,
    typedLevel,
    config,
    levelDefinition,
    projectileCount,
    tickCount,
    expectedTargets,
  );
  const secondaryCastDamage = options.includeSecondary === false
    ? 0
    : calculateSecondaryCastDamage(
        skillId,
        typedLevel,
        config,
        levelDefinition,
        primaryCastDamage,
        projectileCount,
        durationSeconds,
        expectedTargets,
        requestedTargets,
      );
  const divisor = Math.max(1, expectedTargets);
  const primaryDamagePerTarget = primaryCastDamage / divisor;
  const secondaryDamagePerTarget = secondaryCastDamage / divisor;
  const castDamagePerTarget = primaryDamagePerTarget + secondaryDamagePerTarget;
  const expectedCastDamage = primaryCastDamage + secondaryCastDamage;

  return {
    skillId,
    level: typedLevel,
    cooldownSeconds,
    primaryDamagePerTarget,
    secondaryDamagePerTarget,
    castDamagePerTarget,
    primaryCastDamage,
    secondaryCastDamage,
    maxPrimaryTargets,
    expectedTargets,
    expectedCastDamage,
    sustainedDamagePerSecond: cooldownSeconds > 0 ? expectedCastDamage / cooldownSeconds : 0,
    utility: {
      radius: config.baseRadius * (levelDefinition.radiusMultiplier ?? 1),
      range: config.baseRange,
      durationSeconds,
      tickCount,
      projectileCount,
      bossTargeting: config.bossTargeting,
    },
  };
}

export function calculateSkillProgression(
  skillId: ActiveSkillId,
  options: SkillBalanceOptions = {},
): readonly SkillBalanceEstimate[] {
  return ([1, 2, 3, 4, 5] as const).map((level) => calculateSkillBalance(skillId, level, options));
}

function calculateCooldown(
  skillId: ActiveSkillId,
  levelDefinition: SkillLevelDefinition,
  coolantLevel: number,
): number {
  if (!Number.isFinite(coolantLevel) || coolantLevel < 0) {
    throw new RangeError('coolantLevel must be a non-negative finite number.');
  }
  const coolantReduction = Math.min(0.4, Math.floor(coolantLevel) * 0.08);
  return ACTIVE_SKILLS[skillId].baseCooldownSeconds * levelDefinition.cooldownMultiplier * (1 - coolantReduction);
}

function calculateTickCount(config: SkillBalanceConfig, durationSeconds: number): number {
  if (!config.tickSeconds || durationSeconds <= 0) return 1;
  return Math.max(1, Math.round(durationSeconds / config.tickSeconds));
}

function calculatePrimaryCastDamage(
  skillId: ActiveSkillId,
  level: 1 | 2 | 3 | 4 | 5,
  config: SkillBalanceConfig,
  definition: SkillLevelDefinition,
  projectileCount: number,
  tickCount: number,
  expectedTargets: number,
): number {
  if (expectedTargets === 0) return 0;
  if (skillId === 'iceBarrier') return config.basePower * definition.damageMultiplier;
  if (skillId === 'chainLightning') {
    const targets = Math.min(expectedTargets, definition.projectileCount ?? 4);
    return geometricSum(config.basePower * definition.damageMultiplier, 0.9, targets);
  }
  if (skillId === 'autoTurret') {
    const duration = definition.durationSeconds ?? 8;
    const fireInterval = level >= 2 ? 0.4 : config.tickSeconds ?? 0.5;
    const turretCount = level >= 5 ? 2 : 1;
    const turretPower = level >= 5 ? 0.75 : 1;
    return config.basePower * definition.damageMultiplier * Math.floor(duration / fireInterval) * turretCount * turretPower;
  }
  if (skillId === 'attackDrone') {
    const duration = definition.durationSeconds ?? 10;
    const droneCount = level >= 5 ? 2 : 1;
    const dronePower = level >= 5 ? 0.7 : 1;
    return config.basePower * definition.damageMultiplier * Math.floor(duration / (config.tickSeconds ?? 0.46)) * droneCount * dronePower;
  }
  if (skillId === 'orbitingBlades') {
    const duration = definition.durationSeconds ?? 5;
    const angularSpeed = 2.9 + level * 0.12;
    const passesPerTarget = duration * angularSpeed * projectileCount / (Math.PI * 2);
    return config.basePower * definition.damageMultiplier * passesPerTarget * expectedTargets;
  }
  if (skillId === 'landmines') {
    const repeatedMineMultiplier = projectileCount <= 1 ? 1 : 1 + (projectileCount - 1) * 0.55;
    return config.basePower * definition.damageMultiplier * repeatedMineMultiplier * expectedTargets;
  }
  const perTargetMultiplier = skillId === 'homingMissiles' ? 1 : expectedTargets;
  return config.basePower * definition.damageMultiplier * projectileCount * tickCount * perTargetMultiplier;
}

function calculateSecondaryCastDamage(
  skillId: ActiveSkillId,
  level: 1 | 2 | 3 | 4 | 5,
  config: SkillBalanceConfig,
  definition: SkillLevelDefinition,
  primaryCastDamage: number,
  projectileCount: number,
  durationSeconds: number,
  expectedTargets: number,
  requestedTargets: number,
): number {
  if (expectedTargets === 0) return 0;
  let damage = 0;
  for (const secondary of config.secondary) {
    if (level < secondary.minimumLevel) continue;
    if (skillId === 'homingMissiles' && secondary.kind === 'splash') {
      const adjacentTargets = Math.min(secondary.targetCap, Math.max(0, Math.floor(requestedTargets) - 1));
      damage += primaryCastDamage * secondary.coefficient * adjacentTargets;
    } else if (skillId === 'homingMissiles' && secondary.kind === 'submunition') {
      const availableNewTargets = Math.min(secondary.count, Math.max(0, Math.floor(requestedTargets) - 1));
      damage += primaryCastDamage * secondary.coefficient * availableNewTargets;
    } else if (skillId === 'gravityWell' && secondary.kind === 'shatter') {
      damage += config.basePower * definition.damageMultiplier * secondary.coefficient * expectedTargets;
    } else if (skillId === 'iceBarrier' && secondary.kind === 'shatter') {
      damage += config.basePower * definition.damageMultiplier * secondary.coefficient;
    } else if (secondary.kind === 'burn') {
      damage += config.basePower * definition.damageMultiplier * secondary.coefficient * secondary.count * expectedTargets;
    } else if (skillId === 'landmines' && secondary.kind === 'fragment') {
      damage += config.basePower * definition.damageMultiplier * secondary.coefficient * secondary.count * projectileCount;
    } else if (skillId === 'orbitingBlades' && secondary.kind === 'shockwave') {
      damage += config.basePower * definition.damageMultiplier * secondary.coefficient * projectileCount * Math.floor(durationSeconds);
    } else if (secondary.kind !== 'deathExplosion') {
      damage += config.basePower * definition.damageMultiplier * secondary.coefficient * secondary.count;
    }
  }
  return damage;
}

function levelTargetCap(skillId: ActiveSkillId, projectileCount: number, configuredCap: number): number {
  if (skillId === 'homingMissiles' || skillId === 'chainLightning') {
    return Math.min(configuredCap, projectileCount);
  }
  return configuredCap;
}

function geometricSum(first: number, ratio: number, terms: number): number {
  return ratio === 1 ? first * terms : first * (1 - ratio ** terms) / (1 - ratio);
}

function assertSkillLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new RangeError(`Skill level must be an integer from 1 to 5; received ${level}.`);
  }
}
