export const STARTING_LEVEL = 1;

/** XP needed to advance from the supplied current level. */
export function requiredExperienceForLevel(currentLevel: number): number {
  if (!Number.isInteger(currentLevel) || currentLevel < STARTING_LEVEL) {
    throw new RangeError('Current level must be a positive integer.');
  }
  return 6 + Math.ceil(1.5 * (currentLevel - 1));
}

export function totalExperienceToReachLevel(targetLevel: number): number {
  if (!Number.isInteger(targetLevel) || targetLevel < STARTING_LEVEL) {
    throw new RangeError('Target level must be a positive integer.');
  }
  let total = 0;
  for (let level = STARTING_LEVEL; level < targetLevel; level += 1) {
    total += requiredExperienceForLevel(level);
  }
  return total;
}

export interface ExperienceSnapshot {
  level: number;
  experience: number;
  queuedLevelUps: number;
  /**
   * Levels whose upgrade-card selections are still pending, in FIFO order.
   * Keeping the level identity prevents a multi-level XP pickup from skipping
   * level-specific draft rules (for example, the special level-2 draft).
   */
  queuedLevelUpLevels: readonly number[];
}

export interface ExperienceGainResult extends ExperienceSnapshot {
  levelsGained: number;
}

export class ExperienceSystem {
  private currentLevel: number;
  private currentExperience: number;
  private pendingLevelUpLevels: number[];

  constructor(snapshot: Partial<ExperienceSnapshot> = {}) {
    this.currentLevel = snapshot.level ?? STARTING_LEVEL;
    this.currentExperience = snapshot.experience ?? 0;
    const queuedCount = snapshot.queuedLevelUps ?? snapshot.queuedLevelUpLevels?.length ?? 0;
    this.pendingLevelUpLevels = snapshot.queuedLevelUpLevels
      ? [...snapshot.queuedLevelUpLevels]
      : inferPendingLevelUpLevels(this.currentLevel, queuedCount);

    if (
      snapshot.queuedLevelUps !== undefined &&
      snapshot.queuedLevelUpLevels !== undefined &&
      snapshot.queuedLevelUps !== snapshot.queuedLevelUpLevels.length
    ) {
      throw new RangeError('Queued level-up count does not match queued level identities.');
    }
    validateSnapshot(this.snapshot());
  }

  get level(): number {
    return this.currentLevel;
  }

  get experience(): number {
    return this.currentExperience;
  }

  get experienceRequired(): number {
    return requiredExperienceForLevel(this.currentLevel);
  }

  get queuedLevelUps(): number {
    return this.pendingLevelUpLevels.length;
  }

  /** The player level whose card draft must be shown next. */
  get nextQueuedLevelUpLevel(): number | null {
    return this.pendingLevelUpLevels[0] ?? null;
  }

  /** A defensive copy of all pending draft levels, oldest first. */
  get queuedLevelUpLevels(): readonly number[] {
    return [...this.pendingLevelUpLevels];
  }

  addExperience(amount: number): ExperienceGainResult {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new RangeError('Experience gain must be a non-negative integer.');
    }

    this.currentExperience += amount;
    let levelsGained = 0;
    while (this.currentExperience >= requiredExperienceForLevel(this.currentLevel)) {
      this.currentExperience -= requiredExperienceForLevel(this.currentLevel);
      this.currentLevel += 1;
      this.pendingLevelUpLevels.push(this.currentLevel);
      levelsGained += 1;
    }

    return { ...this.snapshot(), levelsGained };
  }

  consumeLevelUpSelection(): boolean {
    if (this.pendingLevelUpLevels.length === 0) return false;
    this.pendingLevelUpLevels.shift();
    return true;
  }

  progressRatio(): number {
    return this.currentExperience / this.experienceRequired;
  }

  snapshot(): ExperienceSnapshot {
    return {
      level: this.currentLevel,
      experience: this.currentExperience,
      queuedLevelUps: this.pendingLevelUpLevels.length,
      queuedLevelUpLevels: [...this.pendingLevelUpLevels],
    };
  }
}

function validateSnapshot(snapshot: ExperienceSnapshot): void {
  if (!Number.isInteger(snapshot.level) || snapshot.level < STARTING_LEVEL) {
    throw new RangeError('Experience snapshot level must be a positive integer.');
  }
  if (!Number.isInteger(snapshot.experience) || snapshot.experience < 0) {
    throw new RangeError('Experience snapshot XP must be a non-negative integer.');
  }
  if (snapshot.experience >= requiredExperienceForLevel(snapshot.level)) {
    throw new RangeError('Experience snapshot XP must be below the next-level requirement.');
  }
  if (!Number.isInteger(snapshot.queuedLevelUps) || snapshot.queuedLevelUps < 0) {
    throw new RangeError('Queued level-ups must be a non-negative integer.');
  }
  if (snapshot.queuedLevelUps !== snapshot.queuedLevelUpLevels.length) {
    throw new RangeError('Queued level-up count does not match queued level identities.');
  }
  const expectedLevels = inferPendingLevelUpLevels(snapshot.level, snapshot.queuedLevelUps);
  if (
    snapshot.queuedLevelUpLevels.some(
      (level, index) => !Number.isInteger(level) || level !== expectedLevels[index],
    )
  ) {
    throw new RangeError('Queued level-up levels must be the unconsumed contiguous level suffix.');
  }
}

function inferPendingLevelUpLevels(currentLevel: number, queuedCount: number): number[] {
  if (!Number.isInteger(queuedCount) || queuedCount < 0) {
    throw new RangeError('Queued level-ups must be a non-negative integer.');
  }
  if (queuedCount > Math.max(0, currentLevel - STARTING_LEVEL)) {
    throw new RangeError('Queued level-ups cannot exceed the number of levels gained.');
  }
  const firstPendingLevel = currentLevel - queuedCount + 1;
  return Array.from({ length: queuedCount }, (_, index) => firstPendingLevel + index);
}
