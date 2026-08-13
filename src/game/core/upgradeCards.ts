import { ACTIVE_SKILLS, ACTIVE_SKILL_IDS, MAX_ACTIVE_SKILLS, MAX_SKILL_LEVEL } from '../data/skills';
import { PASSIVE_UPGRADES, PASSIVE_UPGRADE_IDS } from '../data/upgrades';
import type { RandomSource } from './rng';
import type { ActiveSkillId, PassiveUpgradeId, PlayerBuild } from './types';

export type UpgradeCardCategory =
  | 'newActive'
  | 'activeUpgrade'
  | 'basic'
  | 'survival'
  | 'recovery';

export interface UpgradeCard {
  id: string;
  category: UpgradeCardCategory;
  title: string;
  description: string;
  currentLevel: number;
  nextLevel: number;
  isNew: boolean;
  skillId?: ActiveSkillId;
  passiveId?: PassiveUpgradeId;
  recoveryAmount?: number;
}

export interface UpgradeDraftContext {
  /** The player's level after applying the XP gain. Level 2 is the first draft. */
  playerLevel: number;
  build: PlayerBuild;
  cardCount?: number;
}

const openSlotWeights: Readonly<Record<Exclude<UpgradeCardCategory, 'recovery'>, number>> = {
  newActive: 35,
  activeUpgrade: 35,
  basic: 20,
  survival: 10,
};

const fullSlotWeights: Readonly<Record<Exclude<UpgradeCardCategory, 'recovery'>, number>> = {
  newActive: 0,
  activeUpgrade: 45,
  basic: 40,
  survival: 15,
};

const recoveryCards: readonly UpgradeCard[] = [
  {
    id: 'recovery:field-repair',
    category: 'recovery',
    title: '현장 수리',
    description: '체력을 30 회복합니다.',
    currentLevel: 0,
    nextLevel: 0,
    isNew: false,
    recoveryAmount: 30,
  },
  {
    id: 'recovery:trauma-kit',
    category: 'recovery',
    title: '응급 치료',
    description: '체력을 24 회복합니다.',
    currentLevel: 0,
    nextLevel: 0,
    isNew: false,
    recoveryAmount: 24,
  },
  {
    id: 'recovery:nanogel',
    category: 'recovery',
    title: '나노 재생젤',
    description: '체력을 18 회복합니다.',
    currentLevel: 0,
    nextLevel: 0,
    isNew: false,
    recoveryAmount: 18,
  },
];

type CandidateGroups = Record<Exclude<UpgradeCardCategory, 'recovery'>, UpgradeCard[]>;

export function generateUpgradeCards(
  context: UpgradeDraftContext,
  rng: RandomSource,
): readonly UpgradeCard[] {
  if (!Number.isInteger(context.playerLevel) || context.playerLevel < 2) {
    throw new RangeError('Upgrade cards are available from player level 2 onward.');
  }
  const cardCount = context.cardCount ?? 3;
  if (!Number.isInteger(cardCount) || cardCount < 1) {
    throw new RangeError('cardCount must be a positive integer.');
  }

  const groups = buildCandidateGroups(context.build);
  const chosen: UpgradeCard[] = [];
  const chosenIds = new Set<string>();

  // The first draft deliberately teaches the core choice: two skills and one gun upgrade.
  if (context.playerLevel === 2 && cardCount >= 3) {
    takeRandom(groups.newActive, rng, chosen, chosenIds);
    takeRandom(groups.newActive, rng, chosen, chosenIds);
    takeRandom(groups.basic, rng, chosen, chosenIds);
  } else {
    const hasOpenSkillSlot = ownedActiveCount(context.build) < MAX_ACTIVE_SKILLS;

    // At levels 4 and 6, keep at least one new-skill opportunity while a slot remains.
    if ((context.playerLevel === 4 || context.playerLevel === 6) && hasOpenSkillSlot) {
      takeRandom(groups.newActive, rng, chosen, chosenIds);
    }

    // If any equipped skill can grow, one of the three cards always supports the build.
    if (groups.activeUpgrade.length > 0 && chosen.length < cardCount) {
      takeRandom(groups.activeUpgrade, rng, chosen, chosenIds);
    }
  }

  const slotsFull = ownedActiveCount(context.build) >= MAX_ACTIVE_SKILLS;
  const weights = slotsFull ? fullSlotWeights : openSlotWeights;
  while (chosen.length < cardCount) {
    const availableCategories = categoryOrder.filter(
      (category) => weights[category] > 0 && groups[category].some((card) => !chosenIds.has(card.id)),
    );
    if (availableCategories.length === 0) break;
    const category = rng.weightedPick(availableCategories, (candidate) => weights[candidate]);
    takeRandom(groups[category], rng, chosen, chosenIds);
  }

  for (const recovery of recoveryCards) {
    if (chosen.length >= cardCount) break;
    if (!chosenIds.has(recovery.id)) {
      chosen.push(recovery);
      chosenIds.add(recovery.id);
    }
  }

  return rng.shuffle(chosen).slice(0, cardCount);
}

export function buildCandidateGroups(build: PlayerBuild): CandidateGroups {
  const activeCount = ownedActiveCount(build);
  const newActive: UpgradeCard[] = [];
  const activeUpgrade: UpgradeCard[] = [];
  const basic: UpgradeCard[] = [];
  const survival: UpgradeCard[] = [];

  for (const skillId of ACTIVE_SKILL_IDS) {
    const currentLevel = build.activeSkills[skillId] ?? 0;
    const skill = ACTIVE_SKILLS[skillId];
    if (currentLevel === 0 && activeCount < MAX_ACTIVE_SKILLS) {
      newActive.push({
        id: `skill:new:${skillId}`,
        category: 'newActive',
        title: skill.name,
        description: skill.levels[0]?.summary ?? skill.description,
        currentLevel: 0,
        nextLevel: 1,
        isNew: true,
        skillId,
      });
    } else if (currentLevel > 0 && currentLevel < MAX_SKILL_LEVEL) {
      const next = skill.levels[currentLevel];
      activeUpgrade.push({
        id: `skill:upgrade:${skillId}:${currentLevel + 1}`,
        category: 'activeUpgrade',
        title: `${skill.name} Lv.${currentLevel + 1}`,
        description: next?.summary ?? '스킬 강화',
        currentLevel,
        nextLevel: currentLevel + 1,
        isNew: false,
        skillId,
      });
    }
  }

  for (const passiveId of PASSIVE_UPGRADE_IDS) {
    const definition = PASSIVE_UPGRADES[passiveId];
    const currentLevel = build.passiveLevels[passiveId] ?? 0;
    if (currentLevel >= definition.maxLevel) continue;
    const card: UpgradeCard = {
      id: `passive:${passiveId}:${currentLevel + 1}`,
      category: definition.category,
      title: definition.name,
      description: definition.effectPerLevel,
      currentLevel,
      nextLevel: currentLevel + 1,
      isNew: currentLevel === 0,
      passiveId,
    };
    (definition.category === 'basic' ? basic : survival).push(card);
  }

  return { newActive, activeUpgrade, basic, survival };
}

export function applyUpgradeCard(build: PlayerBuild, card: UpgradeCard): PlayerBuild {
  const activeSkills = { ...build.activeSkills };
  const passiveLevels = { ...build.passiveLevels };

  if (card.skillId !== undefined) {
    const current = activeSkills[card.skillId] ?? 0;
    if (card.category === 'newActive') {
      if (current > 0) throw new Error(`${card.skillId} is already equipped.`);
      if (ownedActiveCount(build) >= MAX_ACTIVE_SKILLS) {
        throw new Error('All active-skill slots are occupied.');
      }
      activeSkills[card.skillId] = 1;
    } else {
      if (current <= 0) throw new Error(`Cannot upgrade unequipped skill ${card.skillId}.`);
      if (current >= MAX_SKILL_LEVEL) throw new Error(`${card.skillId} is already max level.`);
      activeSkills[card.skillId] = current + 1;
    }
  }

  if (card.passiveId !== undefined) {
    const definition = PASSIVE_UPGRADES[card.passiveId];
    const current = passiveLevels[card.passiveId] ?? 0;
    if (current >= definition.maxLevel) throw new Error(`${card.passiveId} is already max level.`);
    passiveLevels[card.passiveId] = current + 1;
  }

  return { activeSkills, passiveLevels };
}

export class UpgradeDraft {
  private remainingRerolls: number;

  constructor(
    private readonly context: UpgradeDraftContext,
    private readonly rng: RandomSource,
    rerolls = 3,
  ) {
    if (!Number.isInteger(rerolls) || rerolls < 0) {
      throw new RangeError('Rerolls must be a non-negative integer.');
    }
    this.remainingRerolls = rerolls;
  }

  get rerollsRemaining(): number {
    return this.remainingRerolls;
  }

  deal(): readonly UpgradeCard[] {
    return generateUpgradeCards(this.context, this.rng);
  }

  reroll(): readonly UpgradeCard[] {
    if (this.remainingRerolls <= 0) throw new Error('No upgrade-card rerolls remain.');
    this.remainingRerolls -= 1;
    return this.deal();
  }
}

export function ownedActiveCount(build: PlayerBuild): number {
  return ACTIVE_SKILL_IDS.reduce(
    (count, skillId) => count + ((build.activeSkills[skillId] ?? 0) > 0 ? 1 : 0),
    0,
  );
}

const categoryOrder: readonly Exclude<UpgradeCardCategory, 'recovery'>[] = [
  'newActive',
  'activeUpgrade',
  'basic',
  'survival',
];

function takeRandom(
  candidates: readonly UpgradeCard[],
  rng: RandomSource,
  chosen: UpgradeCard[],
  chosenIds: Set<string>,
): boolean {
  const available = candidates.filter((card) => !chosenIds.has(card.id));
  if (available.length === 0) return false;
  const card = rng.pick(available);
  chosen.push(card);
  chosenIds.add(card.id);
  return true;
}
