import type { ActiveSkillId, PlayerBuild, Vec2 } from '../core/types';
import type { UpgradeCard } from '../core/upgradeCards';

export type RuntimeStatus =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'levelUp'
  | 'bossWarning'
  | 'victory'
  | 'defeat';

export interface RuntimeVitalsSnapshot {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
}

export interface RuntimeProgressSnapshot {
  deployed: number;
  totalDeployments: 200;
  alive: number;
  kills: number;
  level: number;
  xp: number;
  xpToNext: number;
  elitesAlive: number;
}

export interface RuntimeSkillSnapshot {
  id: ActiveSkillId;
  name: string;
  level: number;
  cooldownRemaining: number;
  cooldownTotal: number;
  hotkey: 'Q' | 'E' | 'R';
  iconSrc: string;
}

export interface RuntimeSkillCatalogItem {
  id: ActiveSkillId;
  name: string;
  level: number;
  equipped: boolean;
  cooldownRemaining: number;
  cooldownTotal: number;
  hotkey?: 'Q' | 'E' | 'R';
  iconSrc: string;
}

export interface RuntimeBossSnapshot {
  name: string;
  health: number;
  maxHealth: number;
  phase: 1 | 2 | 3;
  vulnerable: boolean;
  breakRemaining: number;
  vulnerabilityDamageMultiplier: number;
}

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  stage: number;
  vitals: RuntimeVitalsSnapshot;
  progress: RuntimeProgressSnapshot;
  skills: readonly RuntimeSkillSnapshot[];
  skillCatalog?: readonly RuntimeSkillCatalogItem[];
  dashCooldownRemaining: number;
  dashCooldownTotal: number;
  boss: RuntimeBossSnapshot | null;
  showBossWarning: boolean;
  elapsedSeconds: number;
  build: PlayerBuild;
  upgradeOptions: readonly UpgradeCard[];
  rerollsRemaining: number;
  fps: number;
}

export interface RuntimeResult {
  victory: boolean;
  stage: number;
  stars: 0 | 1 | 2 | 3;
  playerHealth: number;
  playerMaxHealth: number;
  healthRatio: number;
  deployed: number;
  kills: number;
  finalLevel: number;
  durationSeconds: number;
  bossDefeated: boolean;
  bossName: string;
  equippedSkills: readonly ActiveSkillId[];
  upgrades: readonly string[];
}

export interface RuntimeAssetPaths {
  arena: readonly string[];
  arenaFronts?: readonly (readonly string[])[];
  playerSheet: readonly string[];
  enemySheet: readonly string[];
  enemyExpansionSheet?: readonly string[];
  bossSheet: readonly string[];
  projectile: readonly string[];
  experience: readonly string[];
  healthPickup?: readonly string[];
  vfxAtlas: readonly string[];
  skillVfxAtlas?: readonly string[];
}

export interface RuntimeCallbacks {
  onReady?: (runtime: import('./GameRuntime').GameRuntime) => void;
  /** Emitted at most ten times per second, plus immediately after important transitions. */
  onSnapshot?: (snapshot: RuntimeSnapshot) => void;
  onLevelUp?: (level: number, options: readonly UpgradeCard[], rerollsRemaining: number) => void;
  onBossWarning?: () => void;
  onVictory?: (result: RuntimeResult) => void;
  onDefeat?: (result: RuntimeResult) => void;
  onPauseChanged?: (paused: boolean) => void;
  onError?: (error: Error) => void;
}

export interface GameRuntimeOptions extends RuntimeCallbacks {
  host: HTMLElement;
  stage?: number;
  seed?: number | string;
  initialBuild?: PlayerBuild;
  initialSkills?: readonly ActiveSkillId[];
  assetPaths?: Partial<RuntimeAssetPaths>;
  autoStart?: boolean;
  quality?: 'high' | 'balanced' | 'low' | 'auto';
  worldWidth?: number;
  worldHeight?: number;
  playerMaxHealth?: number;
  debug?: boolean;
}

export interface RuntimeControlApi {
  setVirtualMovement(vector: Vec2): void;
  setVirtualAttack(pressed: boolean): void;
  triggerDash(): void;
  triggerSkill(skill: ActiveSkillId | number): void;
}
