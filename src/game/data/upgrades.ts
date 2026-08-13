import type { PassiveUpgradeId } from '../core/types';

export type PassiveUpgradeCategory = 'basic' | 'survival';

export interface PassiveUpgradeDefinition {
  id: PassiveUpgradeId;
  name: string;
  category: PassiveUpgradeCategory;
  maxLevel: number;
  effectPerLevel: string;
  artKey: string;
}

export const PASSIVE_UPGRADES: Readonly<Record<PassiveUpgradeId, PassiveUpgradeDefinition>> = {
  reinforcedRounds: { id: 'reinforcedRounds', name: '강화 총열', category: 'basic', maxLevel: 5, effectPerLevel: '기본 공격력 +15%', artKey: 'upgrade-reinforced-rounds' },
  rapidFire: { id: 'rapidFire', name: '고속 방아쇠', category: 'basic', maxLevel: 5, effectPerLevel: '기본 공격 속도 +12%', artKey: 'upgrade-rapid-fire' },
  penetration: { id: 'penetration', name: '관통탄', category: 'basic', maxLevel: 3, effectPerLevel: '관통 횟수 +1', artKey: 'upgrade-penetration' },
  multishot: { id: 'multishot', name: '다중 발사', category: 'basic', maxLevel: 2, effectPerLevel: '추가 투사체 +1 (70% 피해)', artKey: 'upgrade-multishot' },
  ricochet: { id: 'ricochet', name: '튕김탄', category: 'basic', maxLevel: 3, effectPerLevel: '주변 적에게 추가 도탄', artKey: 'upgrade-ricochet' },
  precisionSight: { id: 'precisionSight', name: '정밀 조준경', category: 'basic', maxLevel: 4, effectPerLevel: '치명타 확률 +7.5%', artKey: 'upgrade-precision-sight' },
  largeCaliber: { id: 'largeCaliber', name: '대구경탄', category: 'basic', maxLevel: 3, effectPerLevel: '투사체 크기와 밀쳐내기 증가', artKey: 'upgrade-large-caliber' },
  explosiveRounds: { id: 'explosiveRounds', name: '폭발탄', category: 'basic', maxLevel: 3, effectPerLevel: '5번째 탄환이 범위 폭발', artKey: 'upgrade-explosive-rounds' },
  focusedFire: { id: 'focusedFire', name: '집중 사격', category: 'basic', maxLevel: 3, effectPerLevel: '같은 적 연속 공격 시 피해 증가', artKey: 'upgrade-focused-fire' },
  combatMobility: { id: 'combatMobility', name: '전투 이동', category: 'basic', maxLevel: 2, effectPerLevel: '사격 중 이동 속도 감소 완화', artKey: 'upgrade-combat-mobility' },
  lightweightArmor: { id: 'lightweightArmor', name: '경량 전투복', category: 'survival', maxLevel: 3, effectPerLevel: '이동 속도 +8%', artKey: 'upgrade-lightweight-armor' },
  reinforcedArmor: { id: 'reinforcedArmor', name: '강화 장갑', category: 'survival', maxLevel: 3, effectPerLevel: '최대 체력 +20 및 즉시 회복', artKey: 'upgrade-reinforced-armor' },
  coolantUnit: { id: 'coolantUnit', name: '냉각 장치', category: 'survival', maxLevel: 4, effectPerLevel: '스킬 재사용 대기시간 -8%', artKey: 'upgrade-coolant-unit' },
  xpMagnet: { id: 'xpMagnet', name: '경험치 자석', category: 'survival', maxLevel: 3, effectPerLevel: '획득 범위 +35%', artKey: 'upgrade-xp-magnet' },
  emergencyRepair: { id: 'emergencyRepair', name: '응급 수리', category: 'survival', maxLevel: 3, effectPerLevel: '체력 30 즉시 회복', artKey: 'upgrade-emergency-repair' },
  enhancedDash: { id: 'enhancedDash', name: '회피 강화', category: 'survival', maxLevel: 2, effectPerLevel: '회피 재사용 대기시간 -15%', artKey: 'upgrade-enhanced-dash' },
};

export const PASSIVE_UPGRADE_IDS = Object.freeze(
  (Object.keys(PASSIVE_UPGRADES) as PassiveUpgradeId[]).filter(
    (id) => id !== 'explosiveRounds',
  ),
);

export const MAX_GLOBAL_COOLDOWN_REDUCTION = 0.4;
