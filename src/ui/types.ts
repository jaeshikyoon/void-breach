import type { ActiveSkillId } from '../game/core/types';

export type GameUiScreen =
  | 'start'
  | 'stageSelect'
  | 'playing'
  | 'paused'
  | 'levelup'
  | 'victory'
  | 'defeat';

export type SkillTone = 'cyan' | 'violet' | 'orange' | 'lime';
export type UpgradeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type StageStars = 0 | 1 | 2 | 3;

export interface StageRecord {
  stage: number;
  unlocked: boolean;
  bestStars: StageStars;
  bestKills?: number;
  bestDurationSeconds?: number;
  /** Human-readable campaign front/sector name shown in stage intel. */
  frontName?: string;
  /** Final threat assigned to this stage. */
  bossName?: string;
  /** Compact encounter roster; callers may pass the full list and the UI will truncate it. */
  threatRoster?: readonly string[];
}

export interface StageProgressSummary {
  currentStage: number;
  unlockedStages: number;
  totalStars: number;
  totalStages?: number;
  maxStars?: number;
  stageStars?: readonly StageStars[];
  stageBestDurationSeconds?: readonly (number | null)[];
}

export interface PlayerVitals {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
}

export interface BossState {
  name: string;
  health: number;
  maxHealth: number;
  phase: 1 | 2 | 3;
  vulnerable?: boolean;
  breakRemaining?: number;
  vulnerabilityDamageMultiplier?: number;
}

export interface CombatProgress {
  deployed: number;
  totalDeployments: number;
  alive: number;
  kills: number;
  level: number;
  xp: number;
  xpToNext: number;
  elitesAlive?: number;
}

export interface SkillHudItem {
  id: ActiveSkillId;
  name: string;
  level: number;
  cooldownRemaining: number;
  cooldownTotal: number;
  hotkey?: string;
  iconSrc?: string;
  tone?: SkillTone;
}

export interface UpgradeOption {
  id: string;
  title: string;
  description: string;
  currentLevel: number;
  nextLevel: number;
  currentEffect?: string;
  nextEffect: string;
  rarity: UpgradeRarity;
  category: 'active' | 'weapon' | 'survival' | 'recovery';
  iconSrc?: string;
  isNew?: boolean;
  isMaxLevel?: boolean;
}

export interface EquippedSkillSummary {
  id: ActiveSkillId;
  name: string;
  level: number;
  iconSrc?: string;
}

export interface RunResult {
  victory: boolean;
  deployed: number;
  kills: number;
  finalLevel: number;
  durationSeconds: number;
  bossDefeated: boolean;
  bossName?: string;
  equippedSkills: EquippedSkillSummary[];
  upgrades: string[];
  stageNumber?: number;
  starsEarned?: StageStars;
  stageBestStars?: StageStars;
  stageBestKills?: number;
  stageBestDurationSeconds?: number;
  isNewStageBest?: boolean;
  healthRatio?: number;
}

export interface StartScreenProps {
  onStart: () => void;
  onStageSelect?: () => void;
  onStageChange?: (stage: number) => void;
  onSettings?: () => void;
  title?: string;
  subtitle?: string;
  bestKills?: number;
  bestLevel?: number;
  bestDurationSeconds?: number;
  stageProgress?: StageProgressSummary;
}

export interface StageSelectScreenProps {
  stages: readonly StageRecord[];
  selectedStage?: number;
  totalStars?: number;
  maxStars?: number;
  /** Legacy deploy callback. Kept as an alias for direct consumers. */
  onSelectStage?: (stage: number) => void;
  /** Called whenever the carousel preview changes; it must not launch combat. */
  onPreviewStage?: (stage: number) => void;
  /** Called only by the explicit deploy action. */
  onDeploy?: (stage: number) => void;
  onBack: () => void;
}

export interface HudProps {
  vitals: PlayerVitals;
  progress: CombatProgress;
  skills: SkillHudItem[];
  dodgeCooldownRemaining: number;
  dodgeCooldownTotal: number;
  boss?: BossState | null;
  showBossWarning?: boolean;
  currentStage?: number;
  currentFrontName?: string;
  currentBossName?: string;
  currentThreatRoster?: readonly string[];
  bossWarningName?: string;
  onPause: () => void;
}

export interface LevelUpModalProps {
  level: number;
  options: UpgradeOption[];
  rerollsRemaining: number;
  onSelect: (option: UpgradeOption) => void;
  onReroll: () => void;
}

export interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onSettings?: () => void;
}

export interface ResultScreenProps {
  result: RunResult;
  onRestart: () => void;
  onMainMenu: () => void;
  onNextStage?: () => void;
  onStageSelect?: () => void;
  totalStages?: number;
}

export interface MoveVector {
  x: number;
  y: number;
}

export interface MobileControlsProps {
  skills: SkillHudItem[];
  playerScreenPosition?: MoveVector;
  dodgeCooldownRemaining: number;
  dodgeCooldownTotal: number;
  onMove: (vector: MoveVector) => void;
  onMoveEnd: () => void;
  onAttackChange: (pressed: boolean) => void;
  /** Null keeps/restores automatic targeting; a vector is a normalized manual aim direction. */
  onAttackAim: (vector: MoveVector | null) => void;
  onDodge: () => void;
  onSkill: (skillId: ActiveSkillId) => void;
  onSkillAim: (skillId: ActiveSkillId, vector: MoveVector | null, distance?: number) => void;
}

export interface GameUiProps {
  screen: GameUiScreen;
  vitals: PlayerVitals;
  progress: CombatProgress;
  skills: SkillHudItem[];
  playerScreenPosition?: MoveVector;
  dodgeCooldownRemaining: number;
  dodgeCooldownTotal: number;
  boss?: BossState | null;
  showBossWarning?: boolean;
  bossWarningName?: string;
  upgradeOptions?: UpgradeOption[];
  rerollsRemaining?: number;
  result?: RunResult;
  startScreen?: Omit<StartScreenProps, 'onStart'>;
  stageSelect?: Omit<
    StageSelectScreenProps,
    'onSelectStage' | 'onPreviewStage' | 'onDeploy' | 'onBack'
  >;
  currentStage?: number;
  onStart: () => void;
  onOpenStageSelect?: () => void;
  onStageSelected?: (stage: number) => void;
  onStagePreviewed?: (stage: number) => void;
  onStageDeploy?: (stage: number) => void;
  onStageSelectBack?: () => void;
  onNextStage?: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onSettings?: () => void;
  onUpgradeSelect: (option: UpgradeOption) => void;
  onReroll: () => void;
  onMove: (vector: MoveVector) => void;
  onMoveEnd: () => void;
  onAttackChange: (pressed: boolean) => void;
  /** Null keeps/restores automatic targeting; a vector is a normalized manual aim direction. */
  onAttackAim: (vector: MoveVector | null) => void;
  onDodge: () => void;
  onSkill: (skillId: ActiveSkillId) => void;
  onSkillAim: (skillId: ActiveSkillId, vector: MoveVector | null, distance?: number) => void;
}
