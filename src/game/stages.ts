export const MAX_STAGE = 20;
export const STAGE_COUNT = MAX_STAGE;
export const MAX_STAGE_STARS = 3;
export const TOTAL_AVAILABLE_STAGE_STARS = MAX_STAGE * MAX_STAGE_STARS;
const STAR_THRESHOLD_EPSILON = 1e-9;

export type StageNumber =
  | 1 | 2 | 3 | 4 | 5
  | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15
  | 16 | 17 | 18 | 19 | 20;

export type StageStarRating = 0 | 1 | 2 | 3;

export interface StageDefinition {
  stage: StageNumber;
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  enemySpeedMultiplier: number;
  bossHealthMultiplier: number;
  bossDamageMultiplier: number;
}

export interface StageResultForStars {
  victory: boolean;
  /** May be supplied directly by callers that already have a normalized snapshot. */
  hpRatio?: number;
  health?: number;
  maxHealth?: number;
}

/** Converts arbitrary input to the closest playable stage. */
export function clampStage(stage: number): StageNumber {
  if (Number.isNaN(stage)) return 1;
  if (stage === Number.POSITIVE_INFINITY) return MAX_STAGE;
  if (!Number.isFinite(stage)) return 1;
  return Math.min(MAX_STAGE, Math.max(1, Math.floor(stage))) as StageNumber;
}

function roundMultiplier(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function createStageDefinition(stage: StageNumber): StageDefinition {
  const step = stage - 1;
  return Object.freeze({
    stage,
    // Every stage starts from a fresh Lv.1 build, so the curve should create a
    // clear campaign climb without turning early kills into a health-sponge grind.
    enemyHealthMultiplier: roundMultiplier(1 + step * 0.055 + step * step * 0.001),
    enemyDamageMultiplier: roundMultiplier(1 + step * 0.03 + step * step * 0.0007),
    enemySpeedMultiplier: roundMultiplier(1 + step * 0.006),
    bossHealthMultiplier: roundMultiplier(1 + step * 0.075 + step * step * 0.0015),
    bossDamageMultiplier: roundMultiplier(1 + step * 0.04 + step * step * 0.0008),
  });
}

export const STAGE_DEFINITIONS: readonly StageDefinition[] = Object.freeze(
  Array.from({ length: STAGE_COUNT }, (_, index) => createStageDefinition((index + 1) as StageNumber)),
);

/** Returns immutable, deterministic difficulty values; out-of-range input is clamped. */
export function getStageDefinition(stage: number): StageDefinition {
  const normalizedStage = clampStage(stage);
  const definition = STAGE_DEFINITIONS[normalizedStage - 1];
  if (!definition) throw new RangeError(`Missing stage definition for stage ${normalizedStage}.`);
  return definition;
}

/**
 * A loss always earns zero. A victory earns 3 stars at full health, 2 at half
 * health or better, and 1 otherwise (including zero remaining health).
 */
export function calculateStageStars(result: StageResultForStars): StageStarRating {
  if (!result.victory) return 0;
  const ratio = resolveHealthRatio(result);
  if (ratio + STAR_THRESHOLD_EPSILON >= 1) return 3;
  if (ratio + STAR_THRESHOLD_EPSILON >= 0.5) return 2;
  return 1;
}

/** Produces exactly twenty integer ratings and never grants stars from invalid data. */
export function normalizeStageStars(value: unknown): StageStarRating[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: STAGE_COUNT }, (_, index) => normalizeStar(source[index]));
}

export function isStageUnlocked(stage: number, stageStars: unknown): boolean {
  if (!Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE) return false;
  if (stage === 1) return true;
  return (normalizeStageStars(stageStars)[stage - 2] ?? 0) >= 1;
}

export function totalEarnedStars(stageStars: unknown): number {
  return normalizeStageStars(stageStars).reduce<number>((total, stars) => total + stars, 0);
}

/** Backwards-compatible descriptive alias. */
export const totalStageStars = totalEarnedStars;

function resolveHealthRatio(result: StageResultForStars): number {
  if (Number.isFinite(result.hpRatio)) return Math.max(0, result.hpRatio ?? 0);
  const health = Number.isFinite(result.health) ? Math.max(0, result.health ?? 0) : 0;
  const maxHealth = Number.isFinite(result.maxHealth) ? result.maxHealth ?? 0 : 0;
  return maxHealth > 0 ? health / maxHealth : 0;
}

function normalizeStar(value: unknown): StageStarRating {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_STAGE_STARS, Math.max(0, Math.floor(value))) as StageStarRating;
}
