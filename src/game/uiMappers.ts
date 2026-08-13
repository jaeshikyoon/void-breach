import { ACTIVE_SKILLS } from './data/skills';
import { PASSIVE_UPGRADES } from './data/upgrades';
import {
  ENCOUNTER_MONSTERS,
  getEncounterFront,
  getStageBoss,
  getStageMonsterPool,
} from './data/encounters';
import type { ActiveSkillId, PlayerBuild } from './core/types';
import { assetUrl } from './assetUrl';
import type { UpgradeCard } from './core/upgradeCards';
import type {
  EquippedSkillSummary,
  RunResult,
  SkillHudItem,
  SkillTone,
  UpgradeOption,
  UpgradeRarity,
} from '../ui/types';
import type { RuntimeResult, RuntimeSkillSnapshot } from './runtime/types';

export interface StageIntel {
  frontName: string;
  bossName: string;
  threatRoster: readonly string[];
}

const skillTones: Record<ActiveSkillId, SkillTone> = {
  homingMissiles: 'orange',
  glacialGrenade: 'cyan',
  gravityWell: 'violet',
  flameBeam: 'orange',
  chainLightning: 'cyan',
  autoTurret: 'lime',
  landmines: 'orange',
  orbitingBlades: 'cyan',
  iceBarrier: 'cyan',
  attackDrone: 'lime',
};

export function skillIconSrc(id: ActiveSkillId): string {
  return assetUrl(`assets/ui/icons/${id}.webp`);
}

/** Maps campaign encounter data to the optional, presentation-only stage metadata contract. */
export function mapStageIntel(stage: number): StageIntel {
  const front = getEncounterFront(stage);
  const pool = getStageMonsterPool(stage);
  const finalThreat = getStageBoss(stage);
  const threatRoster = pool.monsters.map(({ monsterId }) => ENCOUNTER_MONSTERS[monsterId].name);

  return {
    frontName: front.name,
    bossName: finalThreat?.name ?? '미확인 최종 위협',
    threatRoster,
  };
}

export function mapSkillHud(skill: RuntimeSkillSnapshot): SkillHudItem {
  return {
    ...skill,
    iconSrc: skillIconSrc(skill.id),
    tone: skillTones[skill.id],
  };
}

export function mapUpgradeCard(card: UpgradeCard): UpgradeOption {
  const category: UpgradeOption['category'] =
    card.category === 'newActive' || card.category === 'activeUpgrade'
      ? 'active'
      : card.category === 'basic'
        ? 'weapon'
        : card.category === 'recovery'
          ? 'recovery'
          : 'survival';
  const description = card.skillId
    ? ACTIVE_SKILLS[card.skillId].description
    : card.category === 'recovery'
      ? '즉시 적용되는 일회성 회복 프로토콜입니다.'
      : card.category === 'basic'
        ? '기본 무장 성능을 영구 강화합니다.'
        : '생존 및 기동 성능을 영구 강화합니다.';
  const currentEffect = card.currentLevel > 0
    ? card.skillId
      ? ACTIVE_SKILLS[card.skillId].levels[card.currentLevel - 1]?.summary
      : `현재 ${card.currentLevel}단계 적용 중`
    : undefined;
  return {
    id: card.id,
    title: card.title,
    description,
    currentLevel: card.currentLevel,
    nextLevel: card.nextLevel,
    nextEffect: card.description,
    rarity: rarityFor(card),
    category,
    iconSrc: card.skillId
      ? skillIconSrc(card.skillId)
      : card.passiveId
        ? assetUrl(`assets/ui/upgrades/${card.passiveId}.webp`)
        : assetUrl('assets/ui/upgrades/emergencyRepair.webp'),
    isNew: card.isNew,
    ...(currentEffect ? { currentEffect } : {}),
  };
}

export function upgradeCardId(option: UpgradeOption): string {
  return option.id;
}

export function equippedSkills(build: PlayerBuild): EquippedSkillSummary[] {
  return (Object.entries(build.activeSkills) as Array<[ActiveSkillId, number | undefined]>)
    .filter((entry): entry is [ActiveSkillId, number] => (entry[1] ?? 0) > 0)
    .map(([id, level]) => ({
      id,
      name: ACTIVE_SKILLS[id].name,
      level,
      iconSrc: skillIconSrc(id),
    }));
}

export function mapRunResult(result: RuntimeResult, build: PlayerBuild): RunResult {
  const upgrades = Object.entries(build.passiveLevels)
    .filter(([, level]) => (level ?? 0) > 0)
    .map(([id, level]) => `${PASSIVE_UPGRADES[id as keyof typeof PASSIVE_UPGRADES].name} Lv.${level}`);
  const runtimeBossName = 'bossName' in result && typeof result.bossName === 'string'
    ? result.bossName.trim()
    : '';
  const bossName = runtimeBossName || mapStageIntel(result.stage).bossName;
  return {
    victory: result.victory,
    stageNumber: result.stage,
    starsEarned: result.stars,
    healthRatio: result.healthRatio,
    deployed: result.deployed,
    kills: result.kills,
    finalLevel: result.finalLevel,
    durationSeconds: result.durationSeconds,
    bossDefeated: result.bossDefeated,
    bossName,
    equippedSkills: equippedSkills(build),
    upgrades,
  };
}

function rarityFor(card: UpgradeCard): UpgradeRarity {
  if (card.nextLevel >= 5) return 'legendary';
  if (card.nextLevel >= 3) return 'epic';
  if (card.category === 'newActive') return 'rare';
  return 'common';
}
