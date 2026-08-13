import type { ActiveSkillId, DamageType } from '../core/types';

export type SkillTargeting = 'direction' | 'position' | 'instant';

export interface SkillLevelDefinition {
  level: 1 | 2 | 3 | 4 | 5;
  summary: string;
  damageMultiplier: number;
  cooldownMultiplier: number;
  projectileCount?: number;
  durationSeconds?: number;
  radiusMultiplier?: number;
}

export interface ActiveSkillDefinition {
  id: ActiveSkillId;
  name: string;
  damageType: DamageType;
  targeting: SkillTargeting;
  baseCooldownSeconds: number;
  description: string;
  levels: readonly SkillLevelDefinition[];
  artKey: string;
}

export const ACTIVE_SKILLS: Readonly<Record<ActiveSkillId, ActiveSkillDefinition>> = {
  homingMissiles: {
    id: 'homingMissiles',
    name: '유도 미사일',
    damageType: 'explosive',
    targeting: 'direction',
    baseCooldownSeconds: 8,
    description: '지정한 방향의 적을 추적하는 미사일을 일제히 발사합니다.',
    artKey: 'skill-homing-missiles',
    levels: [
      { level: 1, summary: '미사일 3발', damageMultiplier: 1, cooldownMultiplier: 1, projectileCount: 3 },
      { level: 2, summary: '미사일 4발, 피해량 15% 증가', damageMultiplier: 1.15, cooldownMultiplier: 1, projectileCount: 4 },
      { level: 3, summary: '미사일 5발', damageMultiplier: 1.22, cooldownMultiplier: 1, projectileCount: 5 },
      { level: 4, summary: '재사용 대기시간 20% 감소', damageMultiplier: 1.22, cooldownMultiplier: 0.8, projectileCount: 5 },
      { level: 5, summary: '미사일 6발, 폭발 후 자탄 2개', damageMultiplier: 1.25, cooldownMultiplier: 0.8, projectileCount: 6 },
    ],
  },
  glacialGrenade: {
    id: 'glacialGrenade',
    name: '빙결 수류탄',
    damageType: 'frost',
    targeting: 'position',
    baseCooldownSeconds: 9,
    description: '범위 피해와 감속을 주고 중심부의 적을 빙결시킵니다.',
    artKey: 'skill-glacial-grenade',
    levels: [
      { level: 1, summary: '수류탄 1개, 40% 감속', damageMultiplier: 1, cooldownMultiplier: 1, projectileCount: 1, radiusMultiplier: 1 },
      { level: 2, summary: '수류탄 2개, 범위 15% 증가', damageMultiplier: 0.78, cooldownMultiplier: 1, projectileCount: 2, radiusMultiplier: 1.15 },
      { level: 3, summary: '수류탄 2개, 중심부 1.5초 빙결', damageMultiplier: 0.85, cooldownMultiplier: 1, projectileCount: 2, radiusMultiplier: 1.15 },
      { level: 4, summary: '재사용 대기시간 20% 감소', damageMultiplier: 0.85, cooldownMultiplier: 0.8, projectileCount: 2, radiusMultiplier: 1.15 },
      { level: 5, summary: '빙결 적 처치 시 냉기 파편 3개', damageMultiplier: 1, cooldownMultiplier: 0.8, projectileCount: 2, radiusMultiplier: 1.25 },
    ],
  },
  gravityWell: {
    id: 'gravityWell',
    name: '중력장',
    damageType: 'gravity',
    targeting: 'position',
    baseCooldownSeconds: 11,
    description: '적을 중심으로 끌어당기며 지속 피해를 줍니다.',
    artKey: 'skill-gravity-well',
    levels: [
      { level: 1, summary: '3초간 끌어당김', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 3, radiusMultiplier: 1 },
      { level: 2, summary: '지속시간 0.5초 증가', damageMultiplier: 1.08, cooldownMultiplier: 1, durationSeconds: 3.5, radiusMultiplier: 1 },
      { level: 3, summary: '범위 30% 증가', damageMultiplier: 1.12, cooldownMultiplier: 1, durationSeconds: 3.5, radiusMultiplier: 1.3 },
      { level: 4, summary: '지속시간 1초 증가', damageMultiplier: 1.18, cooldownMultiplier: 1, durationSeconds: 4.5, radiusMultiplier: 1.3 },
      { level: 5, summary: '종료 시 200% 중심부 폭발', damageMultiplier: 1.5, cooldownMultiplier: 1, durationSeconds: 4, radiusMultiplier: 1.3 },
    ],
  },
  flameBeam: {
    id: 'flameBeam',
    name: '화염 방사',
    damageType: 'fire',
    targeting: 'direction',
    baseCooldownSeconds: 8.5,
    description: '전방을 불태우는 관통 화염을 방사합니다.',
    artKey: 'skill-flame-beam',
    levels: [
      { level: 1, summary: '전방 지속 화염', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 2 },
      { level: 2, summary: '지속시간 0.5초 증가', damageMultiplier: 1.1, cooldownMultiplier: 1, durationSeconds: 2.5 },
      { level: 3, summary: '폭과 사거리 증가', damageMultiplier: 1.16, cooldownMultiplier: 1, durationSeconds: 2.5, radiusMultiplier: 1.25 },
      { level: 4, summary: '지속시간 0.7초 증가', damageMultiplier: 1.2, cooldownMultiplier: 1, durationSeconds: 3.2, radiusMultiplier: 1.25 },
      { level: 5, summary: '화상 적 사망 시 160% 폭발', damageMultiplier: 1.42, cooldownMultiplier: 1, durationSeconds: 3.2, radiusMultiplier: 1.25 },
    ],
  },
  chainLightning: {
    id: 'chainLightning',
    name: '연쇄 번개',
    damageType: 'lightning',
    targeting: 'direction',
    baseCooldownSeconds: 7.5,
    description: '가까운 미피격 적에게만 짧게 이어지는 연쇄 번개를 방출합니다.',
    artKey: 'skill-chain-lightning',
    levels: [
      { level: 1, summary: '가까운 미피격 적 최대 4명', damageMultiplier: 1, cooldownMultiplier: 1, projectileCount: 4 },
      { level: 2, summary: '연쇄 대상 최대 5명', damageMultiplier: 1.12, cooldownMultiplier: 1, projectileCount: 5 },
      { level: 3, summary: '가까운 미피격 적 최대 7명', damageMultiplier: 1.25, cooldownMultiplier: 1, projectileCount: 7 },
      { level: 4, summary: '재사용 대기시간 18% 감소', damageMultiplier: 1.25, cooldownMultiplier: 0.82, projectileCount: 7 },
      { level: 5, summary: '연쇄 대상 최대 9명', damageMultiplier: 1.9, cooldownMultiplier: 0.82, projectileCount: 9 },
    ],
  },
  autoTurret: {
    id: 'autoTurret',
    name: '자동 포탑',
    damageType: 'kinetic',
    targeting: 'position',
    baseCooldownSeconds: 13,
    description: '일정 시간 가까운 적을 자동 공격하는 포탑을 배치합니다.',
    artKey: 'skill-auto-turret',
    levels: [
      { level: 1, summary: '8초간 포탑 배치', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 8 },
      { level: 2, summary: '공격 속도 20% 증가', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 8 },
      { level: 3, summary: '관통 탄환 장착', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 8 },
      { level: 4, summary: '지속시간 3초 증가', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 11 },
      { level: 5, summary: '75% 위력 포탑 2대 배치', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 11, projectileCount: 2 },
    ],
  },
  landmines: {
    id: 'landmines',
    name: '지뢰밭',
    damageType: 'explosive',
    targeting: 'position',
    baseCooldownSeconds: 10,
    description: '지정 위치에 여러 개의 근접 신관 지뢰를 설치합니다.',
    artKey: 'skill-landmines',
    levels: [
      { level: 1, summary: '지뢰 3개 설치', damageMultiplier: 1, cooldownMultiplier: 1, projectileCount: 3 },
      { level: 2, summary: '지뢰 4개 설치', damageMultiplier: 1.08, cooldownMultiplier: 1, projectileCount: 4 },
      { level: 3, summary: '지뢰 5개 설치', damageMultiplier: 1.3, cooldownMultiplier: 1, projectileCount: 5 },
      { level: 4, summary: '폭발 범위 증가', damageMultiplier: 1.3, cooldownMultiplier: 1, projectileCount: 5, radiusMultiplier: 1.3 },
      { level: 5, summary: '연쇄 폭발과 30% 파편 3개', damageMultiplier: 1.65, cooldownMultiplier: 1, projectileCount: 5, radiusMultiplier: 1.3 },
    ],
  },
  orbitingBlades: {
    id: 'orbitingBlades',
    name: '회전 칼날',
    damageType: 'kinetic',
    targeting: 'instant',
    baseCooldownSeconds: 10,
    description: '플레이어 주위를 도는 칼날을 소환합니다.',
    artKey: 'skill-orbiting-blades',
    levels: [
      { level: 1, summary: '칼날 2개, 5초 지속', damageMultiplier: 1, cooldownMultiplier: 1, projectileCount: 2, durationSeconds: 5 },
      { level: 2, summary: '지속시간 1초 증가', damageMultiplier: 1.12, cooldownMultiplier: 1, projectileCount: 2, durationSeconds: 6 },
      { level: 3, summary: '칼날 3개', damageMultiplier: 1.3, cooldownMultiplier: 1, projectileCount: 3, durationSeconds: 5 },
      { level: 4, summary: '지속시간 2초 증가', damageMultiplier: 1.3, cooldownMultiplier: 1, projectileCount: 3, durationSeconds: 8 },
      { level: 5, summary: '8초간 매초 45% 충격파 발사', damageMultiplier: 1.48, cooldownMultiplier: 1, projectileCount: 3, durationSeconds: 8 },
    ],
  },
  iceBarrier: {
    id: 'iceBarrier',
    name: '아이스 방어막',
    damageType: 'frost',
    targeting: 'instant',
    baseCooldownSeconds: 15,
    description: '피해를 흡수하고 근접 공격자를 둔화하는 보호막을 생성합니다.',
    artKey: 'skill-ice-barrier',
    levels: [
      { level: 1, summary: '50 피해 흡수', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 6 },
      { level: 2, summary: '흡수량 25%, 지속시간 2초 증가', damageMultiplier: 1.25, cooldownMultiplier: 1, durationSeconds: 8 },
      { level: 3, summary: '8초간 근접 공격자 빙결', damageMultiplier: 1.3, cooldownMultiplier: 1, durationSeconds: 8 },
      { level: 4, summary: '재사용 대기시간 20% 감소', damageMultiplier: 1.3, cooldownMultiplier: 0.8, durationSeconds: 8 },
      { level: 5, summary: '파괴 시 130% 냉기 폭발', damageMultiplier: 1.6, cooldownMultiplier: 0.8, durationSeconds: 8 },
    ],
  },
  attackDrone: {
    id: 'attackDrone',
    name: '공격 드론',
    damageType: 'kinetic',
    targeting: 'direction',
    baseCooldownSeconds: 14,
    description: '일정 시간 플레이어를 따라다니며 자동 사격하는 드론을 호출합니다.',
    artKey: 'skill-attack-drone',
    levels: [
      { level: 1, summary: '10초간 드론 호출', damageMultiplier: 1, cooldownMultiplier: 1, durationSeconds: 10 },
      { level: 2, summary: '지속시간 2초 증가', damageMultiplier: 1.08, cooldownMultiplier: 1, durationSeconds: 12 },
      { level: 3, summary: '12초간 드론 탄환 관통', damageMultiplier: 1.18, cooldownMultiplier: 1, durationSeconds: 12 },
      { level: 4, summary: '지속시간 4초 증가', damageMultiplier: 1.22, cooldownMultiplier: 1, durationSeconds: 16 },
      { level: 5, summary: '16초간 70% 위력 드론 2대', damageMultiplier: 1.35, cooldownMultiplier: 1, durationSeconds: 16, projectileCount: 2 },
    ],
  },
};

export const ACTIVE_SKILL_IDS = Object.freeze(Object.keys(ACTIVE_SKILLS) as ActiveSkillId[]);
export const MAX_ACTIVE_SKILLS = 3;
export const MAX_SKILL_LEVEL = 5;
