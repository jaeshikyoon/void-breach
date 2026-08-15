import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type Ticker,
} from 'pixi.js';
import {
  AttackCoordinator,
  ExperienceSystem,
  GameStateMachine,
  MAX_ALIVE_SUMMONS,
  MAX_DIRECTOR_DEPLOYMENTS,
  SeededRng,
  SpawnDirector,
  applyUpgradeCard,
  resolveDamage,
  shieldbearerDirectionalMultiplier,
  isFrontalHit,
  getAttackTelegraphTiming,
  resolveTelegraphedHit,
  calculateHealthPickupHeal,
  shouldDropHealthPickup,
  resolveBasicProjectile,
  selectNextChainLightningTarget,
  CHAIN_LIGHTNING_INITIAL_AIM_DOT,
  CHAIN_LIGHTNING_INITIAL_RANGE,
  CHAIN_LIGHTNING_HOP_RANGE,
  getBossPacing,
  getBossAttackCooldown,
  selectBossPattern,
  UpgradeDraft,
  type AttackLane,
  type AttackPermit,
  type AttackTelegraphKind,
  type BossPhase,
  type UpgradeCard,
} from '../core';
import type {
  ActiveSkillId,
  DamageType,
  MonsterAiState,
  MonsterId,
  MonsterRole,
  MonsterSpawnSource,
  PassiveUpgradeId,
  PlayerBuild,
  Vec2,
} from '../core/types';
import {
  ACTIVE_SKILLS,
  getStageBoss,
  ELITE_MULTIPLIERS,
  MONSTERS,
  remapSpawnMonsterForStage,
  type BossEncounterDefinition,
  type BossPatternDefinition,
  type MonsterDefinition,
} from '../data';
import {
  AdaptiveQualityController,
  AudioSystem,
  InputSystem,
  type QualityPreference,
} from '../services';
import {
  calculateStageStars,
  clampStage,
  getStageDefinition,
  type StageDefinition,
} from '../stages';
import { loadRuntimeTextures, type RuntimeTextures } from './assets';
import { assetUrl } from '../assetUrl';
import { SpatialHash } from './SpatialHash';
import type {
  GameRuntimeOptions,
  RuntimeBossSnapshot,
  RuntimeResult,
  RuntimeSkillCatalogItem,
  RuntimeSkillSnapshot,
  RuntimeSnapshot,
  RuntimeStatus,
} from './types';

const FIXED_STEP = 1 / 60;
const MAX_FIXED_STEPS = 4;
const SNAPSHOT_INTERVAL = 0.1;
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 210;
const PLAYER_BULLET_SPEED = 900;
const PLAYER_BULLET_RANGE = 600;
const BASE_FIRE_INTERVAL = 0.2;
const BASE_DASH_COOLDOWN = 3.5;
const DASH_SECONDS = 0.22;
const DASH_INVULNERABILITY_SECONDS = 0.18;
const DASH_SPEED = 760;
const BOSS_WARNING_SECONDS = 2.35;
const SKILL_KEYS = ['Q', 'E', 'R'] as const;
const TELEGRAPH_WARNING_COLOR = 0xffb347;
const TELEGRAPH_IMPACT_COLOR = 0xff263f;
const HEALTH_PICKUP_MAGNET_RADIUS = 125;
const HEALTH_PICKUP_COLLECT_RADIUS = 17;

// Lv.1 starts with only the rifle and dash. The first draft grants the first active skill.
const DEFAULT_SKILLS: readonly ActiveSkillId[] = [];

const MONSTER_FRAME: Readonly<Record<MonsterId, number>> = {
  infected: 0,
  razor: 1,
  brute: 2,
  shieldbearer: 3,
  marksman: 4,
  flameCultist: 5,
  frostCultist: 6,
  lightningArcher: 7,
  exploder: 8,
  healer: 9,
  summoner: 10,
  ambusher: 11,
  plagueHound: 12,
  phaseStalker: 13,
  toxicSpitter: 14,
  voidPriest: 15,
  shockTrooper: 16,
  cryoSentinel: 17,
  siegeCrawler: 18,
  nullifier: 19,
};

const ROLE_TINT: Readonly<Record<MonsterRole, number>> = {
  melee: 0xef5b4c,
  ranged: 0xb567ff,
  special: 0xffa23f,
  support: 0x55e7aa,
};

interface ActorVisual {
  root: Container;
  shadow: Graphics;
  sprite: Sprite;
  fallback: Graphics;
  healthBack: Graphics;
  healthFill: Graphics;
}

interface PlayerActor {
  position: Vec2;
  velocity: Vec2;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  facing: number;
  fireCooldown: number;
  dashCooldown: number;
  dashRemaining: number;
  dashDirection: Vec2;
  invulnerable: number;
  hitFlash: number;
  shotCounter: number;
  focusTargetId: string | null;
  focusStacks: number;
  visual: ActorVisual;
}

interface MonsterActor {
  readonly id: string;
  readonly monsterId: MonsterId;
  readonly source: MonsterSpawnSource;
  readonly deploymentOrdinal: number | null;
  readonly role: MonsterRole;
  position: Vec2;
  velocity: Vec2;
  desiredVelocity: Vec2;
  radius: number;
  alive: boolean;
  elite: boolean;
  health: number;
  maxHealth: number;
  damage: number;
  moveSpeed: number;
  experienceValue: number;
  aiState: MonsterAiState;
  aiTimer: number;
  attackElapsed: number;
  attackWarningSeconds: number;
  attackImpactHoldSeconds: number;
  attackTotalSeconds: number;
  attackKind: AttackTelegraphKind;
  aiBucket: number;
  permit: AttackPermit | null;
  attackTarget: Vec2;
  attackHit: boolean;
  facing: number;
  slowMultiplier: number;
  slowRemaining: number;
  frozenRemaining: number;
  burnRemaining: number;
  burnTimer: number;
  burnDamage: number;
  burnSourceSkillId: ActiveSkillId | null;
  frozenBySkillId: ActiveSkillId | null;
  activeSkillCastId: string | null;
  mineDamageMultiplier: number;
  lastDamageAmount: number;
  lastDamageType: DamageType;
  lastDamageSkillId: ActiveSkillId | null;
  summonTimer: number;
  healTimer: number;
  spawnFade: number;
  telegraph: Graphics | null;
  visual: ActorVisual;
}

type BossAttack = 'none' | 'radial' | 'slam' | 'laser' | 'summon';

interface BossActor {
  readonly id: 'boss';
  position: Vec2;
  velocity: Vec2;
  radius: number;
  alive: boolean;
  health: number;
  maxHealth: number;
  phase: 1 | 2 | 3;
  attack: BossAttack;
  attackTimer: number;
  attackElapsed: number;
  attackWarningSeconds: number;
  attackImpactHoldSeconds: number;
  attackTotalSeconds: number;
  attackCooldown: number;
  attackTarget: Vec2;
  attackCounter: number;
  selectedPatternId: string | null;
  selectedPattern: BossPatternDefinition | null;
  selectedPatternCooldownSeconds: number;
  breakRemaining: number;
  breakDuration: number;
  breakVfxClock: number;
  facing: number;
  telegraph: Graphics | null;
  visual: ActorVisual;
  definition: BossEncounterDefinition;
}

interface BulletActor {
  readonly id: string;
  active: boolean;
  enemy: boolean;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  damage: number;
  damageType: DamageType;
  isBasic: boolean;
  remainingRange: number;
  pierceRemaining: number;
  ricochetRemaining: number;
  homing: boolean;
  targetId: string | null;
  color: number;
  sourceSkillId: ActiveSkillId | null;
  trailCooldown: number;
  permitOwnerId: string | null;
  hitIds: Set<string>;
  visual: Container;
  core: Sprite;
  glow: Graphics;
}

interface ExperienceOrb {
  readonly id: string;
  active: boolean;
  position: Vec2;
  value: number;
  velocity: Vec2;
  visual: Container;
  sprite: Sprite;
  glow: Graphics;
}

interface HealthPickup {
  readonly id: string;
  active: boolean;
  position: Vec2;
  velocity: Vec2;
  visual: Container;
  sprite: Sprite;
  glow: Graphics;
  fallback: Graphics;
}

type GameplayEffectKind =
  | 'grenade'
  | 'gravity'
  | 'beam'
  | 'turret'
  | 'mine'
  | 'blade'
  | 'barrier'
  | 'drone';

interface GameplayEffect {
  readonly id: string;
  kind: GameplayEffectKind;
  position: Vec2;
  direction: Vec2;
  radius: number;
  damage: number;
  damageType: DamageType;
  remaining: number;
  duration: number;
  tick: number;
  index: number;
  count: number;
  level: number;
  armed: boolean;
  hitCooldowns: Map<string, number>;
  castId: string;
  pulseCooldown: number;
  chainTriggered: boolean;
  visual: Graphics;
}

interface ImpactVisual {
  display: Container | Graphics | Sprite | Text;
  position: Vec2;
  remaining: number;
  duration: number;
  velocity: Vec2;
  screenSpace: boolean;
  baseAlpha?: number;
  baseScale?: Vec2;
  startScale?: number;
  endScale?: number;
  fadeInFraction?: number;
  fadeOutStart?: number;
  rotationSpeed?: number;
  priority?: VfxPriority;
}

type VfxPriority = 0 | 1 | 2;

interface AtlasVfxOptions {
  rotation?: number;
  rotationSpeed?: number;
  startScale?: number;
  endScale?: number;
  fadeInFraction?: number;
  fadeOutStart?: number;
  tint?: number;
  fallbackColor?: number;
  priority?: VfxPriority;
}

export class GameRuntime {
  private readonly options: GameRuntimeOptions;
  private readonly host: HTMLElement;
  private readonly seed: number | string;
  private app: Application | null = null;
  private textures: RuntimeTextures | null = null;
  private input: InputSystem | null = null;
  private readonly audio = new AudioSystem({ maxVoices: 28 });
  private readonly quality: AdaptiveQualityController;
  private readonly state = new GameStateMachine('menu');
  private readonly attackCoordinator = new AttackCoordinator();
  private director: SpawnDirector;
  private currentStage: number;
  private stageDefinition: StageDefinition;
  private experience = new ExperienceSystem();
  private rng: SeededRng;
  private healthDropRng: SeededRng;
  private build: PlayerBuild;
  private initialBuild: PlayerBuild;
  private status: RuntimeStatus = 'loading';
  private destroyed = false;
  private initialized = false;
  private accumulator = 0;
  private snapshotClock = 0;
  private elapsedSeconds = 0;
  private bossWarningRemaining = 0;
  private idSerial = 0;
  private simulationFrame = 0;
  private kills = 0;
  private appliedUpgradeIds: string[] = [];
  private skillCooldowns: Partial<Record<ActiveSkillId, number>> = {};
  private currentDraft: UpgradeDraft | null = null;
  private currentUpgradeOptions: readonly UpgradeCard[] = [];
  private pendingDash = false;
  private pendingSkills: Array<{ skill: ActiveSkillId | number; aim: Vec2 | null; distance: number }> = [];
  private virtualAttack = false;
  private virtualAimDirection: Vec2 | null = null;
  private virtualSkillAimDirection: Vec2 | null = null;
  private virtualSkillAimDistance = 360;
  private lastAimDirection: Vec2 = { x: 1, y: 0 };
  private lastPointer: Vec2 = { x: 0, y: 0 };
  private pointerAimActive = false;
  private playerScreenPosition: Vec2 = { x: 0, y: 0 };
  private pauseInputGuard = 0;
  private fps = 60;
  private impactSfxClock = 0;
  private shakeStrength = 0;
  private shakeRemaining = 0;
  private barrierFreezeCooldowns = new Map<string, number>();
  private readonly mineBossCastHits = new Set<string>();
  private resolvingFlameDeathExplosion = false;
  private readonly vfxRateLimits = new Map<string, number>();

  private readonly world = new Container();
  private readonly backgroundLayer = new Container();
  private arenaSprite: Sprite | null = null;
  private arenaStageTint: Graphics | null = null;
  private readonly underEffectLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly overEffectLayer = new Container();
  private readonly screenLayer = new Container();
  private player: PlayerActor | null = null;
  private boss: BossActor | null = null;
  private bossWarningText: Text | null = null;
  private monsters: MonsterActor[] = [];
  private readonly bullets: BulletActor[] = [];
  private readonly bulletPool: BulletActor[] = [];
  private readonly orbs: ExperienceOrb[] = [];
  private readonly orbPool: ExperienceOrb[] = [];
  private readonly healthPickups: HealthPickup[] = [];
  private readonly healthPickupPool: HealthPickup[] = [];
  private readonly gameplayEffects: GameplayEffect[] = [];
  private readonly impacts: ImpactVisual[] = [];
  private readonly monsterGrid = new SpatialHash<MonsterActor>(120);
  private readonly queryScratch: MonsterActor[] = [];

  readonly worldWidth: number;
  readonly worldHeight: number;

  constructor(options: GameRuntimeOptions) {
    this.options = options;
    this.host = options.host;
    this.worldWidth = Math.max(1_200, options.worldWidth ?? 2_240);
    this.worldHeight = Math.max(760, options.worldHeight ?? 1_256);
    this.seed = options.seed ?? `${Date.now()}:rift-siege`;
    this.currentStage = clampStage(options.stage ?? 1);
    this.stageDefinition = getStageDefinition(this.currentStage);
    const initialStageSeed = this.stageSeed();
    this.rng = new SeededRng(initialStageSeed);
    this.healthDropRng = new SeededRng(`${initialStageSeed}:health-drops`);
    this.director = new SpawnDirector(initialStageSeed);
    this.initialBuild = makeInitialBuild(options.initialBuild, options.initialSkills);
    this.build = cloneBuild(this.initialBuild);
    this.quality = new AdaptiveQualityController({
      preference: (options.quality ?? 'auto') as QualityPreference,
    });
    this.world.sortableChildren = true;
    this.entityLayer.sortableChildren = true;
  }

  static async create(options: GameRuntimeOptions): Promise<GameRuntime> {
    const runtime = new GameRuntime(options);
    await runtime.init();
    return runtime;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.destroyed) throw new Error('Cannot initialize a destroyed game runtime.');
    try {
      const app = new Application();
      await app.init({
        resizeTo: this.host,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1)),
        background: 0x05080d,
        backgroundAlpha: 1,
        powerPreference: 'high-performance',
      });
      if (this.destroyed) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }
      this.app = app;
      app.canvas.style.display = 'block';
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.touchAction = 'none';
      app.canvas.setAttribute('aria-label', 'Rift Siege game canvas');
      this.host.appendChild(app.canvas);
      const textures = await loadRuntimeTextures(this.options.assetPaths);
      if (this.destroyed) {
        for (const texture of textures.owned) texture.destroy(false);
        return;
      }
      this.textures = textures;
      this.createScene();
      this.input = new InputSystem({ target: app.canvas, preventDefault: true });
      app.ticker.add(this.onTick);
      this.initialized = true;
      this.status = 'ready';
      this.emitSnapshot(true);
      this.options.onReady?.(this);
      if (this.options.autoStart ?? true) this.start();
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.options.onError?.(error);
      throw error;
    }
  }

  start(stage?: number): void {
    this.assertReady();
    if (this.status === 'playing') return;
    if (stage !== undefined) this.setCurrentStage(stage);
    this.resetRun();
    this.status = 'playing';
    this.state.reset('playing');
    void this.audio.unlock();
    this.emitSnapshot(true);
  }

  startStage(stage: number): void {
    this.start(stage);
  }

  restart(): void {
    this.assertReady();
    this.resetRun();
    this.status = 'playing';
    this.state.reset('playing');
    this.emitSnapshot(true);
  }

  pause(): void {
    this.setPaused(true);
  }

  resume(): void {
    this.setPaused(false);
  }

  setPaused(paused: boolean): void {
    if (paused) {
      if (this.status !== 'playing') return;
      if (this.state.can('PAUSE')) this.state.dispatch('PAUSE');
      this.status = 'paused';
      this.virtualAttack = false;
      this.virtualAimDirection = null;
      this.virtualSkillAimDirection = null;
      this.virtualSkillAimDistance = 360;
      this.input?.setVirtualAction('attack', false, 'runtime-ui');
      this.input?.setVirtualMovement({ x: 0, y: 0 });
      this.pendingDash = false;
      this.pendingSkills.length = 0;
    } else {
      if (this.status !== 'paused') return;
      if (this.state.can('RESUME')) this.state.dispatch('RESUME');
      this.status = this.state.phase === 'bossFight' ? 'playing' : 'playing';
    }
    this.pauseInputGuard = 0.12;
    this.options.onPauseChanged?.(paused);
    this.emitSnapshot(true);
  }

  setVirtualMovement(vector: Vec2): void {
    this.input?.setVirtualMovement(vector);
  }

  setVirtualAttack(active: boolean): void {
    this.virtualAttack = active;
    this.input?.setVirtualAction('attack', active, 'runtime-ui');
  }

  setVirtualAimDirection(direction: Vec2 | null): void {
    if (
      direction === null ||
      !Number.isFinite(direction.x) ||
      !Number.isFinite(direction.y) ||
      lengthSquared(direction) < 0.01
    ) {
      this.virtualAimDirection = null;
      this.pointerAimActive = false;
      return;
    }
    this.virtualAimDirection = normalize(direction);
    this.pointerAimActive = false;
    this.lastAimDirection = this.virtualAimDirection;
    if (this.player) {
      this.player.facing = Math.atan2(this.lastAimDirection.y, this.lastAimDirection.x);
    }
  }

  setVirtualSkillAimDirection(_skillId: ActiveSkillId, direction: Vec2 | null, distance = 360): void {
    if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y) || lengthSquared(direction) < 0.01) {
      this.virtualSkillAimDirection = null;
      this.virtualSkillAimDistance = 360;
      return;
    }
    this.virtualSkillAimDirection = normalize(direction);
    this.virtualSkillAimDistance = clamp(distance * 3.2, 72, 540);
  }

  unlockAudio(): Promise<boolean> {
    return this.audio.unlock();
  }

  setAudioSettings(settings: { master?: number; sfx?: number; muted?: boolean }): void {
    if (settings.master !== undefined) this.audio.setMasterVolume(settings.master);
    if (settings.sfx !== undefined) this.audio.setSfxVolume(settings.sfx);
    if (settings.muted !== undefined) this.audio.setMuted(settings.muted);
  }

  triggerDash(): void {
    this.pendingDash = true;
  }

  triggerSkill(skill: ActiveSkillId | number): void {
    this.pendingSkills.push({ skill, aim: this.virtualSkillAimDirection, distance: this.virtualSkillAimDistance });
  }

  selectUpgrade(cardOrId: UpgradeCard | string): boolean {
    if (this.status !== 'levelUp') return false;
    const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
    const card = this.currentUpgradeOptions.find((candidate) => candidate.id === id);
    if (!card) return false;

    const previousPassiveLevel = card.passiveId ? (this.build.passiveLevels[card.passiveId] ?? 0) : 0;
    if (card.recoveryAmount) {
      this.healPlayer(card.recoveryAmount);
    } else {
      this.build = applyUpgradeCard(this.build, card);
      this.appliedUpgradeIds.push(card.id);
      if (card.passiveId) this.applyImmediatePassive(card.passiveId, previousPassiveLevel);
    }
    this.experience.consumeLevelUpSelection();
    this.currentDraft = null;
    this.currentUpgradeOptions = [];

    if (this.experience.queuedLevelUps > 0) {
      this.openLevelUpDraft();
    } else {
      if (this.state.can('CARD_SELECTED')) this.state.dispatch('CARD_SELECTED');
      this.status = 'playing';
    }
    this.audio.play('ui-click');
    this.emitSnapshot(true);
    return true;
  }

  rerollUpgrade(): readonly UpgradeCard[] {
    if (this.status !== 'levelUp' || !this.currentDraft) return this.currentUpgradeOptions;
    try {
      this.currentUpgradeOptions = this.currentDraft.reroll();
      this.options.onLevelUp?.(
        this.experience.nextQueuedLevelUpLevel ?? this.experience.level,
        this.currentUpgradeOptions,
        this.currentDraft.rerollsRemaining,
      );
      this.audio.play('ui-click');
      this.emitSnapshot(true);
    } catch {
      // UI can call this after the final reroll; keeping the existing hand is friendlier.
    }
    return this.currentUpgradeOptions;
  }

  getSnapshot(): RuntimeSnapshot {
    const player = this.player;
    const bossSnapshot: RuntimeBossSnapshot | null =
      this.boss?.alive
        ? {
            name: this.boss.definition.name,
            health: Math.max(0, this.boss.health),
            maxHealth: this.boss.maxHealth,
            phase: this.boss.phase,
            vulnerable: this.boss.breakRemaining > 0,
            breakRemaining: Math.max(0, this.boss.breakRemaining),
            vulnerabilityDamageMultiplier: getBossPacing(this.currentStage, this.boss.phase)
              .vulnerabilityDamageMultiplier,
          }
        : null;
    const activeSkills = this.getEquippedSkills();
    return {
      status: this.status,
      stage: this.currentStage,
      vitals: {
        health: Math.max(0, player?.health ?? 0),
        maxHealth: player?.maxHealth ?? (this.options.playerMaxHealth ?? 100),
        shield: Math.max(0, player?.shield ?? 0),
        maxShield: Math.max(player?.maxShield ?? 0, player?.shield ?? 0),
      },
      progress: {
        deployed: this.director.deployedCount,
        totalDeployments: MAX_DIRECTOR_DEPLOYMENTS,
        alive: this.monsters.reduce((count, monster) => count + (monster.alive ? 1 : 0), 0),
        kills: this.kills,
        level: this.experience.level,
        xp: this.experience.experience,
        xpToNext: this.experience.experienceRequired,
        elitesAlive: this.monsters.reduce(
          (count, monster) => count + (monster.alive && monster.elite ? 1 : 0),
          0,
        ),
      },
      skills: activeSkills.map((id, index): RuntimeSkillSnapshot => {
        const level = this.build.activeSkills[id] ?? 1;
        return {
          id,
          name: skillName(id),
          level,
          cooldownRemaining: Math.max(0, this.skillCooldowns[id] ?? 0),
          cooldownTotal: this.skillCooldown(id, level),
          hotkey: SKILL_KEYS[index] ?? 'R',
          iconSrc: assetUrl(`assets/ui/icons/${id}.webp`),
        };
      }),
      skillCatalog: (Object.keys(ACTIVE_SKILLS) as ActiveSkillId[]).map(
        (id): RuntimeSkillCatalogItem => {
          const slot = activeSkills.indexOf(id);
          const level = this.build.activeSkills[id] ?? 0;
          return {
            id,
            name: skillName(id),
            level,
            equipped: slot >= 0,
            cooldownRemaining: Math.max(0, this.skillCooldowns[id] ?? 0),
            cooldownTotal: this.skillCooldown(id, Math.max(1, level)),
            ...(slot >= 0 ? { hotkey: SKILL_KEYS[slot] ?? 'R' } : {}),
            iconSrc: assetUrl(`assets/ui/icons/${id}.webp`),
          };
        },
      ),
      dashCooldownRemaining: Math.max(0, player?.dashCooldown ?? 0),
      dashCooldownTotal: this.dashCooldownTotal(),
      boss: bossSnapshot,
      showBossWarning: this.status === 'bossWarning',
      elapsedSeconds: this.elapsedSeconds,
      build: cloneBuild(this.build),
      upgradeOptions: this.currentUpgradeOptions,
      rerollsRemaining: this.currentDraft?.rerollsRemaining ?? 0,
      fps: this.fps,
      playerScreenPosition: { ...this.playerScreenPosition },
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.input?.dispose();
    this.input = null;
    await this.audio.dispose();
    this.clearDynamicScene();
    if (this.app) {
      this.app.ticker.remove(this.onTick);
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      this.app = null;
    }
    for (const texture of this.textures?.owned ?? []) texture.destroy(false);
    this.textures = null;
    this.monsters.length = 0;
    this.bullets.length = 0;
    this.bulletPool.length = 0;
    this.orbs.length = 0;
    this.orbPool.length = 0;
    this.healthPickups.length = 0;
    this.healthPickupPool.length = 0;
    this.gameplayEffects.length = 0;
    this.impacts.length = 0;
  }

  private readonly onTick = (ticker: Ticker): void => {
    if (this.destroyed || !this.app) return;
    const deltaSeconds = Math.min(0.1, ticker.deltaMS / 1_000);
    this.quality.update(ticker.deltaMS);
    this.fps = this.quality.monitor.snapshot.fps;
    this.pauseInputGuard = Math.max(0, this.pauseInputGuard - deltaSeconds);

    if (this.input?.wasPressed('pause')) {
      if (this.pauseInputGuard <= 0) {
        if (this.status === 'paused') this.resume();
        else this.pause();
      }
    }

    if (this.status === 'bossWarning') this.updateBossWarning(deltaSeconds);
    if (!this.isSimulationPaused()) {
      this.accumulator += deltaSeconds;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < MAX_FIXED_STEPS) {
        this.fixedUpdate(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
        // A fixed step can open a level-up draft, start the boss warning, or
        // finish the run. Do not consume catch-up steps behind a blocking UI.
        if (this.isSimulationPaused()) {
          this.accumulator = 0;
          break;
        }
      }
      if (steps === MAX_FIXED_STEPS) this.accumulator = 0;
    }

    this.updateVisuals(deltaSeconds);
    this.updateCamera();
    this.snapshotClock += deltaSeconds;
    this.emitSnapshot(false);
    this.input?.endFrame();
  };

  private fixedUpdate(delta: number): void {
    const player = this.player;
    if (!player) return;
    this.simulationFrame += 1;
    this.elapsedSeconds += delta;
    player.fireCooldown = Math.max(0, player.fireCooldown - delta);
    player.dashCooldown = Math.max(0, player.dashCooldown - delta);
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    player.hitFlash = Math.max(0, player.hitFlash - delta);
    this.impactSfxClock = Math.max(0, this.impactSfxClock - delta);
    for (const skillId of this.getEquippedSkills()) {
      this.skillCooldowns[skillId] = Math.max(0, (this.skillCooldowns[skillId] ?? 0) - delta);
    }

    this.updatePlayer(delta);
    this.updateSpawning();
    if (this.isSimulationPaused()) return;
    this.monsterGrid.rebuild(this.monsters);
    this.updateMonsters(delta);
    this.monsterGrid.rebuild(this.monsters);
    this.updateBoss(delta);
    this.updateBullets(delta);
    this.updateGameplayEffects(delta);
    this.updateExperienceOrbs(delta);
    this.updateHealthPickups(delta);
    this.cleanupEntities();

    if (player.health <= 0) this.finishRun(false);
  }

  private createScene(): void {
    const app = this.app;
    const textures = this.textures;
    if (!app || !textures) return;
    this.backgroundLayer.zIndex = -10_000;
    this.underEffectLayer.zIndex = -2_000;
    this.entityLayer.zIndex = 0;
    this.projectileLayer.zIndex = 4_000;
    this.overEffectLayer.zIndex = 6_000;
    this.world.addChild(
      this.backgroundLayer,
      this.underEffectLayer,
      this.entityLayer,
      this.projectileLayer,
      this.overEffectLayer,
    );
    app.stage.sortableChildren = true;
    this.world.zIndex = 0;
    this.screenLayer.zIndex = 100_000;
    app.stage.addChild(this.world, this.screenLayer);

    const initialArena = textures.arenaFronts[0] ?? textures.arena;
    if (initialArena !== Texture.WHITE) {
      const arena = new Sprite(initialArena);
      arena.anchor.set(0.5);
      arena.position.set(this.worldWidth / 2, this.worldHeight / 2);
      arena.width = this.worldWidth;
      arena.height = this.worldHeight;
      this.backgroundLayer.addChild(arena);
      this.arenaSprite = arena;
    } else {
      const arena = new Graphics();
      arena.rect(0, 0, this.worldWidth, this.worldHeight).fill({ color: 0x101923 });
      for (let y = 0; y <= this.worldHeight; y += 96) {
        arena
          .moveTo(0, y)
          .lineTo(this.worldWidth, y)
          .stroke({ width: 1, color: 0x2b3e4c, alpha: 0.34 });
      }
      for (let x = 0; x <= this.worldWidth; x += 96) {
        arena
          .moveTo(x, 0)
          .lineTo(x, this.worldHeight)
          .stroke({ width: 1, color: 0x2b3e4c, alpha: 0.34 });
      }
      arena
        .rect(18, 18, this.worldWidth - 36, this.worldHeight - 36)
        .stroke({ width: 5, color: 0x3f6678, alpha: 0.75 });
      this.backgroundLayer.addChild(arena);
    }

    const arenaShade = new Graphics();
    arenaShade
      .rect(0, 0, this.worldWidth, this.worldHeight)
      .stroke({ width: 22, color: 0x020407, alpha: 0.75 });
    this.backgroundLayer.addChild(arenaShade);

    const arenaStageTint = new Graphics();
    arenaStageTint.rect(0, 0, this.worldWidth, this.worldHeight);
    this.backgroundLayer.addChild(arenaStageTint);
    this.arenaStageTint = arenaStageTint;
    this.applyStageArenaTheme();
  }

  private resetRun(): void {
    this.clearDynamicScene();
    this.applyStageArenaTheme();
    const stageSeed = this.stageSeed();
    this.rng = new SeededRng(stageSeed);
    this.healthDropRng = new SeededRng(`${stageSeed}:health-drops`);
    this.director = new SpawnDirector(stageSeed);
    this.experience = new ExperienceSystem();
    this.attackCoordinator.releaseAll();
    this.build = cloneBuild(this.initialBuild);
    this.accumulator = 0;
    this.snapshotClock = 0;
    this.elapsedSeconds = 0;
    this.bossWarningRemaining = 0;
    this.simulationFrame = 0;
    this.kills = 0;
    this.idSerial = 0;
    this.appliedUpgradeIds = [];
    this.skillCooldowns = {};
    this.currentDraft = null;
    this.currentUpgradeOptions = [];
    this.pendingDash = false;
    this.pendingSkills = [];
    this.virtualAttack = false;
    this.virtualAimDirection = null;
    this.virtualSkillAimDirection = null;
    this.virtualSkillAimDistance = 360;
    this.lastAimDirection = { x: 1, y: 0 };
    this.pointerAimActive = false;
    this.pauseInputGuard = 0;
    this.input?.reset();

    const reinforcedLevel = this.passiveLevel('reinforcedArmor');
    const maxHealth = (this.options.playerMaxHealth ?? 100) + reinforcedLevel * 20;
    const visual = this.createActorVisual(
      this.textures?.playerFrames[0] ?? Texture.WHITE,
      PLAYER_RADIUS,
      0x42cfff,
      false,
      1.35,
    );
    this.player = {
      position: { x: this.worldWidth / 2, y: this.worldHeight / 2 },
      velocity: { x: 0, y: 0 },
      health: maxHealth,
      maxHealth,
      shield: 0,
      maxShield: 0,
      facing: 0,
      fireCooldown: 0,
      dashCooldown: 0,
      dashRemaining: 0,
      dashDirection: { x: 1, y: 0 },
      invulnerable: 0,
      hitFlash: 0,
      shotCounter: 0,
      focusTargetId: null,
      focusStacks: 0,
      visual,
    };
    visual.root.position.set(this.player.position.x, this.player.position.y);
    visual.root.zIndex = this.player.position.y;
    this.entityLayer.addChild(visual.root);
    this.boss = null;
    this.updateCamera();
  }

  private clearDynamicScene(): void {
    const bulletVisuals = new Set([
      ...this.bullets.map((bullet) => bullet.visual),
      ...this.bulletPool.map((bullet) => bullet.visual),
    ]);
    const orbVisuals = new Set([
      ...this.orbs.map((orb) => orb.visual),
      ...this.orbPool.map((orb) => orb.visual),
    ]);
    const healthPickupVisuals = new Set([
      ...this.healthPickups.map((pickup) => pickup.visual),
      ...this.healthPickupPool.map((pickup) => pickup.visual),
    ]);
    for (const visual of [...bulletVisuals, ...orbVisuals, ...healthPickupVisuals]) {
      visual.removeFromParent();
      visual.destroy({ children: true });
    }
    const layers = [
      this.underEffectLayer,
      this.entityLayer,
      this.projectileLayer,
      this.overEffectLayer,
      this.screenLayer,
    ];
    for (const layer of layers) {
      for (const child of layer.removeChildren()) child.destroy({ children: true });
    }
    this.monsters = [];
    this.bullets.length = 0;
    this.bulletPool.length = 0;
    this.orbs.length = 0;
    this.orbPool.length = 0;
    this.healthPickups.length = 0;
    this.healthPickupPool.length = 0;
    this.gameplayEffects.length = 0;
    this.impacts.length = 0;
    this.vfxRateLimits.clear();
    this.mineBossCastHits.clear();
    this.barrierFreezeCooldowns.clear();
    this.bossWarningText = null;
    this.player = null;
    this.boss = null;
  }

  private isSimulationPaused(): boolean {
    return (
      this.status === 'loading' ||
      this.status === 'ready' ||
      this.status === 'paused' ||
      this.status === 'levelUp' ||
      this.status === 'bossWarning' ||
      this.status === 'victory' ||
      this.status === 'defeat'
    );
  }

  private updatePlayer(delta: number): void {
    const player = this.player;
    const input = this.input;
    if (!player || !input) return;

    const movement = input.movement;
    const dashPressed = input.wasPressed('dash') || this.pendingDash;
    this.pendingDash = false;
    if (dashPressed && player.dashCooldown <= 0 && player.dashRemaining <= 0) {
      const dashDirection = lengthSquared(movement) > 0.01 ? normalize(movement) : this.lastAimDirection;
      player.dashDirection = dashDirection;
      player.dashRemaining = DASH_SECONDS;
      player.dashCooldown = this.dashCooldownTotal();
      player.invulnerable = DASH_INVULNERABILITY_SECONDS;
      this.audio.play('dash');
      this.createDashTrail(player.position, dashDirection);
    }

    if (player.dashRemaining > 0) {
      player.dashRemaining = Math.max(0, player.dashRemaining - delta);
      player.velocity.x = player.dashDirection.x * DASH_SPEED;
      player.velocity.y = player.dashDirection.y * DASH_SPEED;
    } else {
      const attacking = input.isHeld('attack') || this.virtualAttack;
      const movementPenalty = attacking
        ? 0.9 + Math.min(0.1, this.passiveLevel('combatMobility') * 0.05)
        : 1;
      const speed =
        PLAYER_SPEED * (1 + this.passiveLevel('lightweightArmor') * 0.08) * movementPenalty;
      player.velocity.x = movement.x * speed;
      player.velocity.y = movement.y * speed;
    }
    player.position.x = clamp(player.position.x + player.velocity.x * delta, 46, this.worldWidth - 46);
    player.position.y = clamp(player.position.y + player.velocity.y * delta, 46, this.worldHeight - 46);

    const pointer = input.pointer;
    if (this.virtualAimDirection) {
      this.lastAimDirection = this.virtualAimDirection;
    } else if (pointer.x !== this.lastPointer.x || pointer.y !== this.lastPointer.y) {
      const worldPointer = this.screenToWorld(pointer);
      const aim = normalize({ x: worldPointer.x - player.position.x, y: worldPointer.y - player.position.y });
      if (lengthSquared(aim) > 0.1) this.lastAimDirection = aim;
      this.lastPointer = pointer;
      this.pointerAimActive = true;
    } else if (lengthSquared(movement) > 0.1 && !input.isHeld('attack')) {
      this.lastAimDirection = normalize(movement);
    }
    player.facing = Math.atan2(this.lastAimDirection.y, this.lastAimDirection.x);

    if ((input.isHeld('attack') || this.virtualAttack) && player.fireCooldown <= 0) {
      this.fireBasicAttack();
    }

    if (input.wasPressed('skill1')) this.useSkillSlot(0);
    if (input.wasPressed('skill2')) this.useSkillSlot(1);
    if (input.wasPressed('skill3')) this.useSkillSlot(2);
    for (const request of this.pendingSkills.splice(0)) {
      if (typeof request.skill === 'number') this.useSkillSlot(request.skill);
      else this.activateSkill(request.skill, request.aim, request.distance);
    }
  }

  private fireBasicAttack(): void {
    const player = this.player;
    if (!player) return;
    const rapidLevel = this.passiveLevel('rapidFire');
    player.fireCooldown = BASE_FIRE_INTERVAL / (1 + rapidLevel * 0.12);
    player.shotCounter += 1;
    const multishot = this.passiveLevel('multishot');
    const count = 1 + multishot;
    const baseDamage = 12 * (1 + this.passiveLevel('reinforcedRounds') * 0.15);
    const criticalChance = 0.05 + this.passiveLevel('precisionSight') * 0.075;
    const largeCaliber = this.passiveLevel('largeCaliber');
    if (this.virtualAttack && !this.virtualAimDirection) {
      if (this.boss?.alive) {
        this.lastAimDirection = normalize(subtract(this.boss.position, player.position));
      } else {
        const autoTarget = this.monsterGrid.nearest(player.position.x, player.position.y, 680);
        if (autoTarget) this.lastAimDirection = normalize(subtract(autoTarget.position, player.position));
      }
      player.facing = Math.atan2(this.lastAimDirection.y, this.lastAimDirection.x);
    }

    for (let index = 0; index < count; index += 1) {
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * 0.095;
      const direction = rotate(this.lastAimDirection, offset);
      const sideShot = index > 0;
      const critical = this.rng.chance(Math.min(0.6, criticalChance));
      const projectile = resolveBasicProjectile({
        baseDamage,
        sideShot,
        critical,
        explosiveRoundsLevel: this.passiveLevel('explosiveRounds'),
      });
      this.spawnBullet({
        enemy: false,
        position: add(player.position, scale(direction, 25)),
        velocity: scale(direction, PLAYER_BULLET_SPEED),
        radius: 4.5 + largeCaliber * 1.25,
        damage: projectile.damage,
        damageType: projectile.damageType,
        isBasic: true,
        remainingRange: PLAYER_BULLET_RANGE,
        pierceRemaining: this.passiveLevel('penetration'),
        ricochetRemaining: this.passiveLevel('ricochet'),
        homing: false,
        targetId: null,
        color: critical ? 0xfff099 : 0x63d8ff,
      });
    }
    this.audio.play('shoot', { playbackRate: 0.96 + this.rng.next() * 0.08, volume: 0.7 });
    this.createMuzzleFlash(add(player.position, scale(this.lastAimDirection, 25)), this.lastAimDirection);
  }

  private updateSpawning(): void {
    if (this.director.normalSpawningComplete) return;
    const aliveDirectorMonsters = this.monsters.reduce(
      (count, monster) => count + (monster.alive && monster.source === 'director' ? 1 : 0),
      0,
    );
    const aliveElites = this.monsters.reduce(
      (count, monster) => count + (monster.alive && monster.elite ? 1 : 0),
      0,
    );
    const plan = this.director.planReinforcement({ aliveDirectorMonsters, aliveElites });
    for (const request of plan.spawns) {
      const stageMonsterId = remapSpawnMonsterForStage({
        stage: this.currentStage,
        requestedMonsterId: request.monsterId,
        deploymentOrdinal: request.deploymentOrdinal,
      }).monsterId;
      this.spawnMonster(
        stageMonsterId,
        request.source,
        request.deploymentOrdinal,
        request.elite,
      );
    }
    if (plan.bossIncoming) this.beginBossWarning();
  }

  private spawnMonster(
    monsterId: MonsterId,
    source: MonsterSpawnSource,
    deploymentOrdinal: number | null,
    elite = false,
    requestedPosition?: Vec2,
  ): MonsterActor {
    const definition = MONSTERS[monsterId];
    const position = requestedPosition ?? this.randomSpawnPosition();
    const healthMultiplier =
      (elite ? ELITE_MULTIPLIERS.maxHealth : 1) * this.stageDefinition.enemyHealthMultiplier;
    const damageMultiplier =
      (elite ? ELITE_MULTIPLIERS.damage : 1) * this.stageDefinition.enemyDamageMultiplier;
    const speedMultiplier =
      (elite ? ELITE_MULTIPLIERS.moveSpeed : 1) * this.stageDefinition.enemySpeedMultiplier;
    const radius = definition.radius * (elite ? ELITE_MULTIPLIERS.scale : 1);
    const texture = this.textures?.enemyFrames[MONSTER_FRAME[monsterId]] ?? Texture.WHITE;
    const visual = this.createActorVisual(
      texture,
      radius,
      ROLE_TINT[definition.role],
      true,
      elite ? 1.35 : 1,
    );
    const actor: MonsterActor = {
      id: this.nextId('monster'),
      monsterId,
      source,
      deploymentOrdinal,
      role: definition.role,
      position,
      velocity: { x: 0, y: 0 },
      desiredVelocity: { x: 0, y: 0 },
      radius,
      alive: true,
      elite,
      health: definition.maxHealth * healthMultiplier,
      maxHealth: definition.maxHealth * healthMultiplier,
      damage: definition.damage * damageMultiplier,
      moveSpeed: definition.moveSpeed * speedMultiplier,
      experienceValue: elite ? ELITE_MULTIPLIERS.experience : definition.experience,
      aiState: 'spawning',
      aiTimer: 0.32,
      attackElapsed: 0,
      attackWarningSeconds: 0,
      attackImpactHoldSeconds: 0,
      attackTotalSeconds: 0,
      attackKind: 'melee',
      aiBucket: this.idSerial % 3,
      permit: null,
      attackTarget: { ...position },
      attackHit: false,
      facing: 0,
      slowMultiplier: 1,
      slowRemaining: 0,
      frozenRemaining: 0,
      burnRemaining: 0,
      burnTimer: 0,
      burnDamage: 0,
      burnSourceSkillId: null,
      frozenBySkillId: null,
      activeSkillCastId: null,
      mineDamageMultiplier: 1,
      lastDamageAmount: 0,
      lastDamageType: 'kinetic',
      lastDamageSkillId: null,
      summonTimer: 2.5 + this.rng.next() * 2,
      healTimer: 0.8 + this.rng.next(),
      spawnFade: 0.32,
      telegraph: null,
      visual,
    };
    visual.root.alpha = 0;
    visual.root.position.set(position.x, position.y);
    visual.root.scale.set(0.65);
    visual.root.zIndex = position.y;
    this.entityLayer.addChild(visual.root);
    this.monsters.push(actor);
    this.createSpawnEffect(position, elite);
    return actor;
  }

  private randomSpawnPosition(): Vec2 {
    const player = this.player;
    const center = player?.position ?? { x: this.worldWidth / 2, y: this.worldHeight / 2 };
    const angle = this.rng.next() * Math.PI * 2;
    const radius = 540 + this.rng.next() * 190;
    return {
      x: clamp(center.x + Math.cos(angle) * radius, 55, this.worldWidth - 55),
      y: clamp(center.y + Math.sin(angle) * radius, 55, this.worldHeight - 55),
    };
  }

  private beginBossWarning(): void {
    if (this.boss || this.status !== 'playing') return;
    if (this.state.can('BOSS_DEPLOYED')) this.state.dispatch('BOSS_DEPLOYED');
    this.status = 'bossWarning';
    this.bossWarningRemaining = BOSS_WARNING_SECONDS;
    const stageBoss = this.requireStageBoss();
    const warning = new Text({
      text: `⚠  차원 균열 폭주  ⚠\n${stageBoss.name} 출현`,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 38,
        fontWeight: '800',
        fill: 0xffd48a,
        stroke: { color: 0x3b0705, width: 7 },
        align: 'center',
        letterSpacing: 4,
      },
    });
    warning.anchor.set(0.5);
    this.screenLayer.addChild(warning);
    this.bossWarningText = warning;
    this.positionBossWarning();
    this.audio.play('warning');
    this.options.onBossWarning?.();
    this.emitSnapshot(true);
  }

  private updateBossWarning(delta: number): void {
    this.bossWarningRemaining = Math.max(0, this.bossWarningRemaining - delta);
    if (this.bossWarningText) {
      const pulse = 1 + Math.sin(this.bossWarningRemaining * 10) * 0.045;
      this.bossWarningText.scale.set(pulse);
      this.bossWarningText.alpha = clamp(this.bossWarningRemaining / 0.25, 0, 1);
      this.positionBossWarning();
    }
    if (this.bossWarningRemaining > 0) return;
    this.bossWarningText?.destroy();
    this.bossWarningText = null;
    this.spawnBoss();
    if (this.state.can('WARNING_COMPLETE')) this.state.dispatch('WARNING_COMPLETE');
    this.status = 'playing';
    this.audio.play('boss-roar');
    this.emitSnapshot(true);
  }

  private positionBossWarning(): void {
    if (!this.app || !this.bossWarningText) return;
    this.bossWarningText.position.set(
      this.app.renderer.screen.width / 2,
      this.app.renderer.screen.height * 0.38,
    );
  }

  private createActorVisual(
    texture: Texture,
    radius: number,
    tint: number,
    healthBar: boolean,
    sizeMultiplier: number,
  ): ActorVisual {
    const root = new Container();
    const shadow = new Graphics();
    shadow.ellipse(0, radius * 0.62, radius * 1.05, radius * 0.42).fill({
      color: 0x000000,
      alpha: 0.48,
    });
    const fallback = new Graphics();
    fallback
      .circle(0, -radius * 0.05, radius)
      .fill({ color: tint })
      .circle(-radius * 0.28, -radius * 0.32, radius * 0.18)
      .fill({ color: 0xf4fbff, alpha: 0.9 })
      .circle(radius * 0.28, -radius * 0.32, radius * 0.18)
      .fill({ color: 0xf4fbff, alpha: 0.9 });
    fallback.visible = texture === Texture.WHITE;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    const spriteHeight = radius * 3.25 * sizeMultiplier;
    sprite.height = spriteHeight;
    sprite.width =
      texture === Texture.WHITE ? spriteHeight : spriteHeight * (texture.width / texture.height);
    sprite.position.y = -radius * 0.42;
    sprite.visible = texture !== Texture.WHITE;
    const healthBack = new Graphics();
    healthBack.roundRect(-radius * 1.15, -radius * 1.72, radius * 2.3, 4, 2).fill({
      color: 0x16090b,
      alpha: 0.88,
    });
    const healthFill = new Graphics();
    healthFill.roundRect(-radius * 1.1, -radius * 1.67, radius * 2.2, 3, 1).fill({
      color: tint,
    });
    healthBack.visible = healthBar;
    healthFill.visible = healthBar;
    root.addChild(shadow, fallback, sprite, healthBack, healthFill);
    return { root, shadow, sprite, fallback, healthBack, healthFill };
  }

  private updateMonsters(delta: number): void {
    const player = this.player;
    if (!player) return;
    const aiStride = this.quality.profile.aiUpdateStride;

    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      const definition = MONSTERS[monster.monsterId];
      monster.spawnFade = Math.max(0, monster.spawnFade - delta);
      if (monster.spawnFade > 0) {
        const progress = 1 - monster.spawnFade / 0.32;
        monster.visual.root.alpha = progress;
        monster.visual.root.scale.set(0.65 + progress * 0.35);
      } else {
        monster.visual.root.alpha = 1;
        monster.visual.root.scale.set(1);
      }

      if (monster.burnRemaining > 0) {
        monster.burnRemaining -= delta;
        monster.burnTimer -= delta;
        if (monster.burnTimer <= 0) {
          monster.burnTimer = 0.5;
          this.damageMonster(
            monster,
            monster.burnDamage,
            'fire',
            false,
            1,
            monster.burnSourceSkillId,
          );
          if (!monster.alive) continue;
        }
      }
      if (monster.slowRemaining > 0) {
        monster.slowRemaining -= delta;
        if (monster.slowRemaining <= 0) monster.slowMultiplier = 1;
      }
      if (monster.frozenRemaining > 0) {
        monster.frozenRemaining -= delta;
        if (monster.frozenRemaining <= 0) monster.frozenBySkillId = null;
        monster.velocity.x = 0;
        monster.velocity.y = 0;
        monster.visual.sprite.tint = 0xa7efff;
        monster.visual.fallback.tint = 0xa7efff;
        this.positionMonsterVisual(monster);
        continue;
      }
      monster.visual.sprite.tint = 0xffffff;
      monster.visual.fallback.tint = 0xffffff;

      if (monster.aiState === 'spawning') {
        monster.aiTimer -= delta;
        if (monster.aiTimer <= 0) monster.aiState = 'chasing';
      } else if (monster.aiState === 'windup') {
        this.updateMonsterWindup(monster, definition, delta);
      } else if (monster.aiState === 'attacking') {
        this.updateMonsterImpact(monster, definition, delta);
      } else if (monster.aiState === 'recovery') {
        monster.aiTimer -= delta;
        monster.velocity.x *= 0.84;
        monster.velocity.y *= 0.84;
        if (monster.aiTimer <= 0) monster.aiState = 'chasing';
      } else if ((this.simulationFrame + monster.aiBucket) % aiStride === 0) {
        this.evaluateMonsterAi(monster, definition, delta * aiStride);
      }

      if (monster.aiState === 'chasing' || monster.aiState === 'repositioning') {
        this.moveMonster(monster, delta);
      }
      this.positionMonsterVisual(monster);
    }
  }

  private evaluateMonsterAi(
    monster: MonsterActor,
    definition: MonsterDefinition,
    _assessmentDelta: number,
  ): void {
    const player = this.player;
    if (!player || !monster.alive) return;
    const toPlayer = subtract(player.position, monster.position);
    const distance = Math.max(0.001, length(toPlayer));
    const direction = scale(toPlayer, 1 / distance);
    monster.facing = Math.atan2(direction.y, direction.x);

    if (monster.monsterId === 'phaseStalker' && distance > 210 && monster.aiTimer <= 0) {
      const flank = rotate(direction, monster.aiBucket % 2 === 0 ? 0.72 : -0.72);
      monster.position.x = clamp(player.position.x - flank.x * 145, 45, this.worldWidth - 45);
      monster.position.y = clamp(player.position.y - flank.y * 145, 45, this.worldHeight - 45);
      monster.aiTimer = 3.8;
      this.createPulse(monster.position, 54, 0xa760ff, 0.36);
    }

    if (monster.role === 'support') {
      if (monster.monsterId === 'healer' || monster.monsterId === 'voidPriest') {
        monster.healTimer -= FIXED_STEP * this.quality.profile.aiUpdateStride;
        if (monster.healTimer <= 0) {
          monster.healTimer = monster.monsterId === 'voidPriest' ? 1.5 : 1;
          if (monster.monsterId === 'voidPriest') this.performVoidEmpower(monster);
          else this.performMonsterHeal(monster);
        }
      } else if (monster.monsterId === 'summoner') {
        monster.summonTimer -= FIXED_STEP * this.quality.profile.aiUpdateStride;
        if (monster.summonTimer <= 0) {
          monster.summonTimer = definition.attackCooldownSeconds;
          this.performSummon(monster);
        }
      }
    }

    if (monster.role === 'ranged' || monster.role === 'support') {
      const desiredRange = Math.max(190, definition.attackRange * 0.78);
      if (distance > definition.attackRange) {
        monster.desiredVelocity = scale(direction, monster.moveSpeed * monster.slowMultiplier);
        monster.aiState = 'chasing';
      } else if (distance < desiredRange * 0.62) {
        monster.desiredVelocity = scale(direction, -monster.moveSpeed * 0.82 * monster.slowMultiplier);
        monster.aiState = 'repositioning';
      } else {
        const lane: AttackLane = monster.role === 'support' ? 'special' : 'ranged';
        if (this.attackCoordinator.getPermit(monster.id) !== null && monster.permit === null) {
          const tangent = { x: -direction.y, y: direction.x };
          const sign = monster.aiBucket % 2 === 0 ? 1 : -1;
          monster.desiredVelocity = scale(tangent, monster.moveSpeed * 0.36 * sign);
          monster.aiState = 'repositioning';
          return;
        }
        const permit = this.attackCoordinator.tryAcquire(monster.id, lane);
        if (permit) this.beginMonsterAttack(monster, definition, permit);
        else {
          const tangent = { x: -direction.y, y: direction.x };
          const sign = monster.aiBucket % 2 === 0 ? 1 : -1;
          monster.desiredVelocity = scale(tangent, monster.moveSpeed * 0.42 * sign);
          monster.aiState = 'repositioning';
        }
      }
      return;
    }

    const attackReach = definition.attackRange + PLAYER_RADIUS + 5;
    if (distance <= attackReach) {
      const lane: AttackLane = monster.role === 'special' ? 'special' : 'melee';
      const permit = this.attackCoordinator.tryAcquire(monster.id, lane);
      if (permit) this.beginMonsterAttack(monster, definition, permit);
      else {
        const tangent = { x: -direction.y, y: direction.x };
        const sign = monster.aiBucket % 2 === 0 ? 1 : -1;
        monster.desiredVelocity = scale(tangent, monster.moveSpeed * 0.35 * sign);
      }
    } else {
      monster.desiredVelocity = scale(direction, monster.moveSpeed * monster.slowMultiplier);
      monster.aiState = 'chasing';
    }
  }

  private moveMonster(monster: MonsterActor, delta: number): void {
    let separationX = 0;
    let separationY = 0;
    const neighbors = this.monsterGrid.queryCircle(
      monster.position.x,
      monster.position.y,
      monster.radius * 2.1 + 14,
      this.queryScratch,
    );
    for (const neighbor of neighbors) {
      if (neighbor === monster || !neighbor.alive) continue;
      const dx = monster.position.x - neighbor.position.x;
      const dy = monster.position.y - neighbor.position.y;
      const distanceSquared = dx * dx + dy * dy;
      const preferred = monster.radius + neighbor.radius + 6;
      if (distanceSquared <= 0.001 || distanceSquared >= preferred * preferred) continue;
      const distance = Math.sqrt(distanceSquared);
      const force = (preferred - distance) / preferred;
      separationX += (dx / distance) * force * monster.moveSpeed * 1.8;
      separationY += (dy / distance) * force * monster.moveSpeed * 1.8;
    }
    monster.velocity.x = lerp(
      monster.velocity.x,
      monster.desiredVelocity.x + separationX,
      Math.min(1, delta * 9),
    );
    monster.velocity.y = lerp(
      monster.velocity.y,
      monster.desiredVelocity.y + separationY,
      Math.min(1, delta * 9),
    );
    const speed = length(monster.velocity);
    const maximum = monster.moveSpeed * monster.slowMultiplier * 1.25;
    if (speed > maximum) monster.velocity = scale(monster.velocity, maximum / speed);
    monster.position.x = clamp(
      monster.position.x + monster.velocity.x * delta,
      monster.radius,
      this.worldWidth - monster.radius,
    );
    monster.position.y = clamp(
      monster.position.y + monster.velocity.y * delta,
      monster.radius,
      this.worldHeight - monster.radius,
    );
  }

  private beginMonsterAttack(
    monster: MonsterActor,
    definition: MonsterDefinition,
    permit: AttackPermit,
  ): void {
    const player = this.player;
    if (!player) return;
    monster.permit = permit;
    monster.aiState = 'windup';
    const ranged = usesRangedMonsterAttack(monster);
    const attackKind: AttackTelegraphKind = ranged
      ? 'ranged'
      : monster.monsterId === 'exploder'
        ? 'area'
        : 'melee';
    const timing = getAttackTelegraphTiming({
      kind: attackKind,
      authoredWindupSeconds: definition.attackWindupSeconds,
      elite: monster.elite,
    });
    monster.aiTimer = timing.warningSeconds;
    monster.attackElapsed = 0;
    monster.attackWarningSeconds = timing.warningSeconds;
    monster.attackImpactHoldSeconds = timing.impactHoldSeconds;
    monster.attackTotalSeconds = timing.totalSeconds;
    monster.attackKind = attackKind;
    monster.attackTarget = { ...player.position };
    monster.attackHit = false;
    monster.velocity = { x: 0, y: 0 };
    this.drawMonsterTelegraph(monster, definition);
  }

  private drawMonsterTelegraph(monster: MonsterActor, definition: MonsterDefinition): void {
    this.clearMonsterTelegraph(monster);
    const telegraph = new Graphics();
    const ranged = monster.attackKind === 'ranged';
    if (ranged) {
      const direction = normalize(subtract(monster.attackTarget, monster.position));
      const end = add(monster.position, scale(direction, 720));
      if (monster.monsterId === 'shockTrooper') {
        const left = add(monster.position, scale(rotate(direction, -0.12), 720));
        const right = add(monster.position, scale(rotate(direction, 0.12), 720));
        telegraph
          .poly([
            monster.position.x,
            monster.position.y,
            left.x,
            left.y,
            right.x,
            right.y,
          ])
          .fill({ color: 0xff3b46, alpha: 0.1 })
          .moveTo(monster.position.x, monster.position.y)
          .lineTo(left.x, left.y)
          .moveTo(monster.position.x, monster.position.y)
          .lineTo(right.x, right.y)
          .stroke({ width: monster.elite ? 5 : 3, color: 0xff4f47, alpha: 0.74 });
      } else {
        telegraph
          .moveTo(monster.position.x, monster.position.y)
          .lineTo(end.x, end.y)
          .stroke({ width: monster.elite ? 6 : 3, color: 0xff4f47, alpha: 0.72 });
      }
      telegraph
        .circle(monster.attackTarget.x, monster.attackTarget.y, 13)
        .stroke({ width: 2, color: 0xffa267, alpha: 0.9 });
    } else {
      const radius = monster.monsterId === 'exploder' ? 92 : definition.attackRange + 22;
      telegraph
        .circle(monster.attackTarget.x, monster.attackTarget.y, radius)
        .fill({ color: 0xff2d30, alpha: 0.1 })
        .stroke({ width: monster.elite ? 5 : 3, color: 0xff4d43, alpha: 0.78 });
    }
    this.underEffectLayer.addChild(telegraph);
    monster.telegraph = telegraph;
  }

  private updateMonsterWindup(
    monster: MonsterActor,
    definition: MonsterDefinition,
    delta: number,
  ): void {
    monster.attackElapsed = Math.min(monster.attackWarningSeconds, monster.attackElapsed + delta);
    monster.aiTimer = Math.max(0, monster.attackWarningSeconds - monster.attackElapsed);
    this.updateTelegraphVisual(
      monster.telegraph,
      monster.attackElapsed / Math.max(0.001, monster.attackWarningSeconds),
      false,
    );
    if (monster.aiTimer > 0) return;
    monster.aiState = 'attacking';
    monster.aiTimer = monster.attackImpactHoldSeconds;
    this.updateTelegraphVisual(monster.telegraph, 1, true);
  }

  private updateMonsterImpact(
    monster: MonsterActor,
    definition: MonsterDefinition,
    delta: number,
  ): void {
    monster.attackElapsed = Math.min(monster.attackTotalSeconds, monster.attackElapsed + delta);
    monster.aiTimer = Math.max(0, monster.attackTotalSeconds - monster.attackElapsed);
    this.updateTelegraphVisual(monster.telegraph, 1, true);
    if (monster.aiTimer > 0) return;
    this.executeMonsterImpact(monster, definition);
  }

  private executeMonsterImpact(monster: MonsterActor, definition: MonsterDefinition): void {
    const player = this.player;
    if (!player) return;
    const ranged = monster.attackKind === 'ranged';
    if (ranged) {
      const direction = normalize(subtract(monster.attackTarget, monster.position));
      const damageType: DamageType =
        monster.monsterId === 'flameCultist'
          ? 'fire'
          : monster.monsterId === 'frostCultist'
            ? 'frost'
            : monster.monsterId === 'lightningArcher'
              ? 'lightning'
              : monster.monsterId === 'toxicSpitter'
                ? 'fire'
                : monster.monsterId === 'shockTrooper'
                  ? 'lightning'
                  : monster.monsterId === 'cryoSentinel'
                    ? 'frost'
                    : monster.monsterId === 'siegeCrawler'
                      ? 'explosive'
                      : monster.monsterId === 'nullifier' || monster.monsterId === 'voidPriest'
                        ? 'gravity'
              : 'kinetic';
      const projectileCount = monster.monsterId === 'shockTrooper' ? 3 : 1;
      const projectileSpeed =
        monster.monsterId === 'marksman'
          ? 470
          : monster.monsterId === 'siegeCrawler'
            ? 270
            : monster.monsterId === 'toxicSpitter'
              ? 300
              : 350;
      for (let shot = 0; shot < projectileCount; shot += 1) {
        const shotDirection = rotate(direction, (shot - (projectileCount - 1) / 2) * 0.12);
        const origin = add(monster.position, scale(shotDirection, monster.radius + 5));
        this.spawnBullet({
          enemy: true,
          position: origin,
          velocity: scale(shotDirection, projectileSpeed),
          radius: monster.monsterId === 'siegeCrawler' ? 10 : monster.elite ? 7 : 5,
          damage: monster.damage * (projectileCount > 1 ? 0.58 : 1),
          damageType,
          isBasic: false,
          remainingRange: 720,
          pierceRemaining: 0,
          homing: false,
          targetId: null,
          color: damageColor(damageType),
          permitOwnerId: monster.id,
        });
        this.createMuzzleFlash(origin, shotDirection, damageColor(damageType), monster.elite ? 1.15 : 0.82);
      }
      this.createTelegraphImpactVfx(monster.attackTarget, 22, 'line');
      if (monster.monsterId === 'toxicSpitter') {
        this.createExplosion(monster.attackTarget, 62, 0xa5ef32, false);
      } else if (monster.monsterId === 'siegeCrawler') {
        this.createExplosion(monster.attackTarget, 84, 0xff7a2f, false);
      }
    } else {
      const radius = monster.monsterId === 'exploder' ? 92 : definition.attackRange + 22;
      const hit = resolveTelegraphedHit({
        elapsedSeconds: monster.attackElapsed,
        totalSeconds: monster.attackTotalSeconds,
        impactHoldSeconds: monster.attackImpactHoldSeconds,
        target: monster.attackTarget,
        playerPosition: player.position,
        impactRadius: radius,
        playerRadius: PLAYER_RADIUS,
      });
      if (hit.canDamage) {
        const shieldBefore = player.shield;
        this.damagePlayer(monster.damage, monster.monsterId === 'exploder' ? 'explosive' : 'kinetic');
        const barrier = this.gameplayEffects.find((effect) => effect.kind === 'barrier');
        if (
          barrier &&
          barrier.level >= 3 &&
          shieldBefore > player.shield &&
          (this.barrierFreezeCooldowns.get(monster.id) ?? 0) <= this.elapsedSeconds
        ) {
          monster.frozenRemaining = Math.max(monster.frozenRemaining, 0.65);
          monster.frozenBySkillId = 'iceBarrier';
          this.barrierFreezeCooldowns.set(monster.id, this.elapsedSeconds + 2);
          this.createSkillAtlasVfx(monster.position, 1, 78, 0.42, {
            startScale: 0.42,
            endScale: 1.08,
            fadeOutStart: 0.46,
            fallbackColor: 0x8eeaff,
            priority: 1,
          });
        }
      }
      this.createExplosion(
        monster.attackTarget,
        radius,
        monster.monsterId === 'exploder' ? 0xff642e : 0xf04c45,
        false,
      );
      this.createTelegraphImpactVfx(monster.attackTarget, radius, 'area');
      if (monster.monsterId === 'exploder') {
        monster.health = 0;
        this.killMonster(monster);
      }
    }
    monster.attackHit = true;
    monster.aiState = 'recovery';
    monster.aiTimer =
      definition.attackCooldownSeconds *
      this.attackCoordinator.cadenceMultiplier(monster.permit?.lane ?? 'melee');
    if (!ranged) this.attackCoordinator.release(monster.id);
    monster.permit = null;
    this.clearMonsterTelegraph(monster);
  }

  private performMonsterHeal(source: MonsterActor): void {
    const targets = this.monsterGrid.queryCircle(source.position.x, source.position.y, 230);
    let healed = 0;
    for (const target of targets) {
      if (!target.alive || target.health >= target.maxHealth || healed >= 8) continue;
      target.health = Math.min(target.maxHealth, target.health + target.maxHealth * 0.04);
      this.updateMonsterHealthBar(target);
      healed += 1;
    }
    if (healed > 0) this.createPulse(source.position, 118, 0x4affaa, 0.55);
  }

  private performVoidEmpower(source: MonsterActor): void {
    const targets = this.monsterGrid.queryCircle(source.position.x, source.position.y, 235);
    let empowered = 0;
    for (const target of targets) {
      if (!target.alive || target === source || empowered >= 6) continue;
      target.health = Math.min(target.maxHealth, target.health + target.maxHealth * 0.025);
      target.slowRemaining = Math.max(0, target.slowRemaining - 0.35);
      this.updateMonsterHealthBar(target);
      empowered += 1;
    }
    if (empowered > 0) this.createPulse(source.position, 138, 0xae5cff, 0.5);
  }

  private performSummon(source: MonsterActor): void {
    const currentSummons = this.aliveSummonCount();
    const count = this.director.allowedSummonCount(currentSummons, 2);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + this.rng.next();
      this.spawnMonster('infected', 'summoner', null, false, {
        x: clamp(source.position.x + Math.cos(angle) * 58, 35, this.worldWidth - 35),
        y: clamp(source.position.y + Math.sin(angle) * 58, 35, this.worldHeight - 35),
      });
    }
    if (count > 0) this.createPulse(source.position, 72, 0xaf5cff, 0.7);
  }

  private clearMonsterTelegraph(monster: MonsterActor): void {
    if (!monster.telegraph) return;
    monster.telegraph.removeFromParent();
    monster.telegraph.destroy();
    monster.telegraph = null;
  }

  private updateTelegraphVisual(
    telegraph: Graphics | null,
    warningProgress: number,
    impact: boolean,
  ): void {
    if (!telegraph) return;
    const progress = clamp(warningProgress, 0, 1);
    const pulse = 0.5 + Math.sin(this.elapsedSeconds * (impact ? 48 : 12 + progress * 22)) * 0.5;
    telegraph.alpha = impact
      ? 0.94
      : lerp(0.36, 0.86, progress) + pulse * lerp(0.04, 0.12, progress);
    telegraph.tint = impact
      ? TELEGRAPH_IMPACT_COLOR
      : lerpRgbColor(TELEGRAPH_WARNING_COLOR, TELEGRAPH_IMPACT_COLOR, progress);
    // Telegraph geometry is authored in world coordinates; keep scale fixed so
    // the warning never drifts away from the actual hit volume.
    telegraph.scale.set(1);
  }

  private createTelegraphImpactVfx(
    position: Vec2,
    radius: number,
    kind: 'area' | 'line' | 'radial',
  ): void {
    if (!this.hasTransientVfxCapacity(1)) return;
    const impact = new Graphics();
    if (kind === 'line') {
      impact
        .circle(0, 0, Math.max(11, radius * 0.45))
        .fill({ color: 0xffe8c7, alpha: 0.88 })
        .circle(0, 0, Math.max(18, radius))
        .stroke({ width: 4, color: 0xff334f, alpha: 0.94 });
    } else {
      impact
        .circle(0, 0, Math.max(12, radius * 0.18))
        .fill({ color: 0xfff0d1, alpha: 0.82 })
        .circle(0, 0, radius)
        .stroke({ width: kind === 'radial' ? 7 : 5, color: 0xff334f, alpha: 0.94 });
    }
    impact.blendMode = 'add';
    impact.position.set(position.x, position.y);
    this.overEffectLayer.addChild(impact);
    this.impacts.push({
      display: impact,
      position: { ...position },
      remaining: kind === 'line' ? 0.2 : 0.28,
      duration: kind === 'line' ? 0.2 : 0.28,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      priority: 1,
      baseScale: { x: 1, y: 1 },
      startScale: 0.42,
      endScale: 1.18,
      fadeOutStart: 0.25,
    });
  }

  private positionMonsterVisual(monster: MonsterActor): void {
    monster.visual.root.position.set(monster.position.x, monster.position.y);
    monster.visual.root.zIndex = monster.position.y;
    if (monster.velocity.x !== 0 && monster.visual.sprite.visible) {
      const magnitude = Math.abs(monster.visual.sprite.scale.x);
      monster.visual.sprite.scale.x = monster.velocity.x < 0 ? -magnitude : magnitude;
    }
  }

  private spawnBoss(): void {
    const player = this.player;
    if (!player || this.boss) return;
    const definition = this.requireStageBoss();
    const position = {
      x: clamp(player.position.x, 180, this.worldWidth - 180),
      y: clamp(player.position.y - 480, 110, this.worldHeight - 110),
    };
    const texture = this.textures?.bossFrames[definition.visualFrame] ?? Texture.WHITE;
    const visual = this.createActorVisual(texture, 58, 0xc35cff, true, 1.65);
    visual.root.position.set(position.x, position.y);
    visual.root.zIndex = position.y;
    this.entityLayer.addChild(visual.root);
    const bossMaxHealth = getBossPacing(this.currentStage, 1).maxHealth;
    this.boss = {
      id: 'boss',
      position,
      velocity: { x: 0, y: 0 },
      radius: 58,
      alive: true,
      health: bossMaxHealth,
      maxHealth: bossMaxHealth,
      phase: 1,
      attack: 'none',
      attackTimer: 0,
      attackElapsed: 0,
      attackWarningSeconds: 0,
      attackImpactHoldSeconds: 0,
      attackTotalSeconds: 0,
      attackCooldown: 1.8,
      attackTarget: { ...player.position },
      attackCounter: 0,
      selectedPatternId: null,
      selectedPattern: null,
      selectedPatternCooldownSeconds: 2.8,
      breakRemaining: 0,
      breakDuration: 0,
      breakVfxClock: 0,
      facing: Math.PI / 2,
      telegraph: null,
      visual,
      definition,
    };
    this.createPulse(position, 180, 0xb94dff, 1.1);
  }

  private updateBoss(delta: number): void {
    const boss = this.boss;
    const player = this.player;
    if (!boss?.alive || !player) return;

    boss.breakRemaining = Math.max(0, boss.breakRemaining - delta);
    if (boss.breakRemaining > 0) {
      boss.breakVfxClock -= delta;
      if (boss.breakVfxClock <= 0) {
        boss.breakVfxClock = 0.32;
        this.createPulse(boss.position, 82, 0x53f3de, 0.36);
      }
    }

    const ratio = boss.health / boss.maxHealth;
    const nextPhase: 1 | 2 | 3 = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (nextPhase !== boss.phase) {
      boss.telegraph?.destroy();
      boss.telegraph = null;
      boss.attack = 'none';
      boss.attackElapsed = 0;
      boss.attackTimer = 0;
      boss.attackTotalSeconds = 0;
      boss.selectedPattern = null;
      this.attackCoordinator.setBossPowerAttack(false);
      boss.phase = nextPhase;
      const phasePacing = getBossPacing(this.currentStage, boss.phase);
      boss.breakRemaining = Math.max(boss.breakRemaining, phasePacing.phaseBreakSeconds);
      boss.breakDuration = boss.breakRemaining;
      boss.breakVfxClock = 0;
      boss.attackCooldown = Math.max(boss.attackCooldown, phasePacing.phaseBreakSeconds);
      this.createBossBreakVfx(boss);
      boss.visual.sprite.tint = nextPhase === 2 ? 0xffd2b8 : 0xffa9d8;
      this.createPulse(boss.position, 210, nextPhase === 2 ? 0xff7b36 : 0xff296e, 1.2);
      const summons = this.currentStage <= 4
        ? nextPhase === 2 ? 2 : 3
        : nextPhase === 2 ? 3 : 5;
      for (let index = 0; index < summons; index += 1) {
        if (this.aliveSummonCount() >= MAX_ALIVE_SUMMONS) break;
        const angle = (index / summons) * Math.PI * 2;
        this.spawnMonster(nextPhase === 2 ? 'razor' : 'ambusher', 'boss', null, false, {
          x: clamp(boss.position.x + Math.cos(angle) * 120, 45, this.worldWidth - 45),
          y: clamp(boss.position.y + Math.sin(angle) * 120, 45, this.worldHeight - 45),
        });
      }
    }

    if (boss.attack !== 'none') {
      boss.attackElapsed = Math.min(boss.attackTotalSeconds, boss.attackElapsed + delta);
      boss.attackTimer = Math.max(0, boss.attackTotalSeconds - boss.attackElapsed);
      const impact = boss.attackElapsed >= boss.attackWarningSeconds;
      this.updateTelegraphVisual(
        boss.telegraph,
        boss.attackElapsed / Math.max(0.001, boss.attackWarningSeconds),
        impact,
      );
      if (boss.attackTimer <= 0) this.executeBossAttack(boss);
    } else {
      boss.attackCooldown -= delta;
      const toPlayer = subtract(player.position, boss.position);
      const playerDistance = Math.max(0.001, length(toPlayer));
      const direction = scale(toPlayer, 1 / playerDistance);
      boss.facing = Math.atan2(direction.y, direction.x);
      const desiredRange = boss.phase === 1 ? 330 : boss.phase === 2 ? 270 : 220;
      const moveDirection =
        playerDistance > desiredRange + 55
          ? direction
          : playerDistance < desiredRange - 55
            ? scale(direction, -1)
            : { x: -direction.y, y: direction.x };
      const breakMovementMultiplier = boss.breakRemaining > 0 ? 0.25 : 1;
      const speed = (68 + boss.phase * 14) * this.stageDefinition.enemySpeedMultiplier * breakMovementMultiplier;
      boss.velocity = scale(moveDirection, speed);
      boss.position.x = clamp(boss.position.x + boss.velocity.x * delta, 75, this.worldWidth - 75);
      boss.position.y = clamp(boss.position.y + boss.velocity.y * delta, 75, this.worldHeight - 75);
      if (boss.attackCooldown <= 0 && boss.breakRemaining <= 0) this.beginBossAttack(boss);
    }
    boss.visual.root.position.set(boss.position.x, boss.position.y);
    boss.visual.root.zIndex = boss.position.y;
    boss.visual.sprite.texture =
      this.textures?.bossFrames[boss.definition.visualFrame] ?? boss.visual.sprite.texture;
    const phaseTint = boss.phase === 1 ? 0xffffff : boss.phase === 2 ? 0xffd2b8 : 0xffa9d8;
    const breakTint = boss.breakRemaining > 0
      ? lerpRgbColor(0x5effdd, 0xc8fff5, (Math.sin(this.elapsedSeconds * 14) + 1) / 2)
      : phaseTint;
    boss.visual.sprite.tint = breakTint;
    boss.visual.fallback.tint = breakTint;
  }

  private beginBossAttack(boss: BossActor): void {
    const player = this.player;
    if (!player) return;
    const selectedPattern = selectBossPattern(
      boss.definition.patterns,
      boss.phase,
      boss.attackCounter,
      boss.selectedPatternId,
    );
    boss.attackCounter += 1;
    boss.selectedPatternId = selectedPattern?.id ?? null;
    boss.selectedPattern = selectedPattern;
    boss.selectedPatternCooldownSeconds = getBossAttackCooldown({
      authoredCooldownSeconds: selectedPattern?.cooldownSeconds ?? 3,
      phase: boss.phase,
    });
    const kind = selectedPattern?.kind ?? 'radialBurst';
    boss.attack =
      kind === 'summon'
        ? 'summon'
        : kind === 'laserSweep' || kind === 'charge' || kind === 'teleportStrike'
        ? 'laser'
        : kind === 'slam' || kind === 'hazardField' || kind === 'shieldPulse'
          ? 'slam'
          : 'radial';
    boss.attackTarget = { ...player.position };
    const authoredWindup = selectedPattern?.windupSeconds ?? (boss.attack === 'laser' ? 0.82 : 0.8);
    const timing = getAttackTelegraphTiming({
      kind: boss.attack === 'laser'
        ? 'bossLine'
        : boss.attack === 'slam'
          ? 'bossArea'
          : 'bossRadial',
      authoredWindupSeconds: authoredWindup,
    });
    boss.attackElapsed = 0;
    boss.attackWarningSeconds = timing.warningSeconds;
    boss.attackImpactHoldSeconds = timing.impactHoldSeconds;
    boss.attackTotalSeconds = timing.totalSeconds;
    boss.attackTimer = timing.totalSeconds;
    this.attackCoordinator.setBossPowerAttack(true);
    const telegraph = new Graphics();
    if (boss.attack === 'slam') {
      const radius = bossSlamRadius(boss);
      telegraph
        .circle(boss.attackTarget.x, boss.attackTarget.y, radius)
        .fill({ color: 0xff351f, alpha: 0.12 })
        .stroke({ width: 6, color: 0xff6b32, alpha: 0.9 });
    } else if (boss.attack === 'laser') {
      const direction = normalize(subtract(boss.attackTarget, boss.position));
      const end = add(boss.position, scale(direction, 1_100));
      telegraph
        .moveTo(boss.position.x, boss.position.y)
        .lineTo(end.x, end.y)
        .stroke({ width: 48, color: 0xea45ff, alpha: 0.15 })
        .moveTo(boss.position.x, boss.position.y)
        .lineTo(end.x, end.y)
        .stroke({ width: 5, color: 0xffb7ff, alpha: 0.82 });
    } else {
      telegraph
        .circle(boss.position.x, boss.position.y, 138)
        .stroke({ width: 7, color: 0xb95cff, alpha: 0.78 });
    }
    this.underEffectLayer.addChild(telegraph);
    boss.telegraph = telegraph;
  }

  private executeBossAttack(boss: BossActor): void {
    const player = this.player;
    if (!player) return;
    const stageDamage = this.stageDefinition.bossDamageMultiplier;
    const selectedPattern = boss.selectedPattern;
    const baseDamage =
      boss.definition.baseDamage * stageDamage * (selectedPattern?.damageMultiplier ?? 1);
    const bossId = boss.definition.id;
    if (boss.attack === 'radial') {
      const count =
        (selectedPattern?.projectileCount ?? 0) > 1
          ? selectedPattern?.projectileCount ?? 1
          : bossId === 'stormWarden'
          ? 10 + boss.phase * 4
          : bossId === 'riftSovereign'
            ? 14 + boss.phase * 5
            : boss.phase === 1 ? 12 : boss.phase === 2 ? 16 : 22;
      const projectileType: DamageType =
        bossId === 'plagueOvermind'
          ? 'fire'
          : bossId === 'stormWarden'
            ? 'lightning'
            : 'gravity';
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + this.elapsedSeconds * 0.4;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        this.spawnBullet({
          enemy: true,
          position: add(boss.position, scale(direction, boss.radius)),
          velocity: scale(direction, 230 + boss.phase * 55),
          radius: 7,
          damage: baseDamage * (0.34 + boss.phase * 0.06),
          damageType: projectileType,
          isBasic: false,
          remainingRange: 920,
          pierceRemaining: 0,
          homing: false,
          targetId: null,
          color: damageColor(projectileType),
        });
      }
      this.createPulse(boss.position, 150, 0xb44cff, 0.65);
      this.createTelegraphImpactVfx(boss.position, 150, 'radial');
    } else if (boss.attack === 'slam') {
      const radius = bossSlamRadius(boss);
      const hit = resolveTelegraphedHit({
        elapsedSeconds: boss.attackElapsed,
        totalSeconds: boss.attackTotalSeconds,
        impactHoldSeconds: boss.attackImpactHoldSeconds,
        target: boss.attackTarget,
        playerPosition: player.position,
        impactRadius: radius,
        playerRadius: PLAYER_RADIUS,
      });
      if (hit.canDamage) {
        this.damagePlayer(baseDamage * (1.05 + boss.phase * 0.16), bossId === 'stormWarden' ? 'frost' : 'explosive');
      }
      this.createExplosion(
        boss.attackTarget,
        radius,
        bossId === 'plagueOvermind' ? 0xb2e52e : bossId === 'stormWarden' ? 0x63dfff : 0xff5a2b,
        false,
      );
      this.createTelegraphImpactVfx(boss.attackTarget, radius, 'area');
      const ringCount = boss.phase === 3 ? 12 : 8;
      for (let index = 0; index < ringCount; index += 1) {
        const angle = (index / ringCount) * Math.PI * 2;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        this.spawnBullet({
          enemy: true,
          position: { ...boss.attackTarget },
          velocity: scale(direction, 250),
          radius: 6,
          damage: baseDamage * 0.28,
          damageType: bossId === 'stormWarden' ? 'frost' : 'fire',
          isBasic: false,
          remainingRange: 450,
          pierceRemaining: 0,
          homing: false,
          targetId: null,
          color: 0xff7b37,
        });
      }
    } else if (boss.attack === 'laser') {
      const attackOrigin = { ...boss.position };
      const direction = normalize(subtract(boss.attackTarget, attackOrigin));
      let postImpactBlink: Vec2 | null = null;
      if (bossId === 'voidMatriarch') {
        const blinkPosition = add(boss.attackTarget, scale(rotate(direction, Math.PI / 2), 118));
        postImpactBlink = {
          x: clamp(blinkPosition.x, 75, this.worldWidth - 75),
          y: clamp(blinkPosition.y, 75, this.worldHeight - 75),
        };
      }
      if (pointNearSegment(player.position, attackOrigin, add(attackOrigin, scale(direction, 1_100)), 24)) {
        this.damagePlayer(baseDamage * (1.15 + boss.phase * 0.12), bossId === 'stormWarden' ? 'lightning' : 'gravity');
      }
      this.createBeamImpact(
        attackOrigin,
        direction,
        1_100,
        bossId === 'stormWarden' ? 0x55dfff : bossId === 'ironColossus' ? 0xff7b2e : 0xed55ff,
        bossId === 'riftSovereign' ? 34 : 24,
      );
      this.createTelegraphImpactVfx(boss.attackTarget, bossId === 'riftSovereign' ? 44 : 32, 'line');
      if (postImpactBlink) {
        boss.position = postImpactBlink;
        this.createPulse(boss.position, 92, 0xb558ff, 0.48);
      }
    } else if (boss.attack === 'summon') {
      this.createPulse(boss.position, selectedPattern?.radius ?? 150, 0x9d5cff, 0.72);
      this.summonBossEntourage(boss, selectedPattern?.projectileCount ?? 2);
    }
    boss.telegraph?.destroy();
    boss.telegraph = null;
    boss.attack = 'none';
    const pacing = getBossPacing(this.currentStage, boss.phase);
    boss.breakRemaining = pacing.postAttackBreakSeconds;
    boss.breakDuration = pacing.postAttackBreakSeconds;
    boss.breakVfxClock = 0;
    boss.attackCooldown = boss.selectedPatternCooldownSeconds;
    this.createBossBreakVfx(boss);
    this.attackCoordinator.setBossPowerAttack(false);
  }

  private summonBossEntourage(boss: BossActor, requestedOverride?: number): void {
    const summonId: MonsterId =
      boss.definition.id === 'plagueOvermind'
        ? 'plagueHound'
        : boss.definition.id === 'stormWarden'
          ? 'cryoSentinel'
          : boss.definition.id === 'voidMatriarch'
            ? 'voidPriest'
            : boss.definition.id === 'riftSovereign'
              ? 'nullifier'
              : 'razor';
    const requested = requestedOverride ?? (boss.phase === 3 ? 3 : 2);
    const count = this.director.allowedSummonCount(this.aliveSummonCount(), requested);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + boss.facing;
      this.spawnMonster(summonId, 'boss', null, false, {
        x: clamp(boss.position.x + Math.cos(angle) * 135, 45, this.worldWidth - 45),
        y: clamp(boss.position.y + Math.sin(angle) * 135, 45, this.worldHeight - 45),
      });
    }
  }

  private createBossBreakVfx(boss: BossActor): void {
    this.createPulse(boss.position, 118, 0x53f3de, 0.52);
    const label = new Text({
      text: 'BREAK!  x1.5 DAMAGE',
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 22,
        fontWeight: '900',
        fill: 0xaaffed,
        stroke: { color: 0x06231f, width: 5 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(boss.position.x, boss.position.y - boss.radius - 28);
    this.overEffectLayer.addChild(label);
    this.impacts.push({
      display: label,
      position: { x: boss.position.x, y: boss.position.y - boss.radius - 28 },
      remaining: 0.78,
      duration: 0.78,
      velocity: { x: 0, y: -18 },
      screenSpace: false,
      fadeOutStart: 0.55,
      priority: 2,
    });
  }

  private spawnBullet(specification: {
    enemy: boolean;
    position: Vec2;
    velocity: Vec2;
    radius: number;
    damage: number;
    damageType: DamageType;
    isBasic: boolean;
    remainingRange: number;
    pierceRemaining: number;
    ricochetRemaining?: number;
    homing: boolean;
    targetId: string | null;
    color: number;
    sourceSkillId?: ActiveSkillId;
    permitOwnerId?: string | null;
  }): BulletActor {
    let bullet = this.bulletPool.pop();
    if (!bullet) {
      const visual = new Container();
      const glow = new Graphics();
      const core = new Sprite(this.textures?.projectile ?? Texture.WHITE);
      core.anchor.set(0.5);
      visual.addChild(glow, core);
      bullet = {
        id: this.nextId('bullet'),
        active: true,
        enemy: specification.enemy,
        position: { ...specification.position },
        velocity: { ...specification.velocity },
        radius: specification.radius,
        damage: specification.damage,
        damageType: specification.damageType,
        isBasic: specification.isBasic,
        remainingRange: specification.remainingRange,
        pierceRemaining: specification.pierceRemaining,
        ricochetRemaining: specification.ricochetRemaining ?? 0,
        homing: specification.homing,
        targetId: specification.targetId,
        color: specification.color,
        sourceSkillId: specification.sourceSkillId ?? null,
        trailCooldown: 0,
        permitOwnerId: specification.permitOwnerId ?? null,
        hitIds: new Set(),
        visual,
        core,
        glow,
      };
    }
    bullet.active = true;
    bullet.enemy = specification.enemy;
    bullet.position = { ...specification.position };
    bullet.velocity = { ...specification.velocity };
    bullet.radius = specification.radius;
    bullet.damage = specification.damage;
    bullet.damageType = specification.damageType;
    bullet.isBasic = specification.isBasic;
    bullet.remainingRange = specification.remainingRange;
    bullet.pierceRemaining = specification.pierceRemaining;
    bullet.ricochetRemaining = specification.ricochetRemaining ?? 0;
    bullet.homing = specification.homing;
    bullet.targetId = specification.targetId;
    bullet.color = specification.color;
    bullet.sourceSkillId = specification.sourceSkillId ?? null;
    bullet.trailCooldown = 0;
    bullet.permitOwnerId = specification.permitOwnerId ?? null;
    bullet.hitIds.clear();
    bullet.glow
      .clear()
      .circle(0, 0, specification.radius * 2.3)
      .fill({ color: specification.color, alpha: 0.26 });
    bullet.core.texture =
      (specification.enemy
        ? this.textures?.enemyProjectile
        : specification.homing
          ? this.textures?.missile
          : this.textures?.projectile) ?? Texture.WHITE;
    bullet.core.tint = specification.color;
    bullet.core.width = specification.radius * (bullet.core.texture === Texture.WHITE ? 2 : 4.2);
    bullet.core.height = specification.radius * (bullet.core.texture === Texture.WHITE ? 2 : 1.9);
    bullet.visual.position.set(specification.position.x, specification.position.y);
    bullet.visual.rotation = Math.atan2(specification.velocity.y, specification.velocity.x);
    bullet.visual.alpha = 1;
    this.projectileLayer.addChild(bullet.visual);
    this.bullets.push(bullet);
    return bullet;
  }

  private updateBullets(delta: number): void {
    const player = this.player;
    if (!player) return;
    for (const bullet of this.bullets) {
      if (!bullet.active) continue;
      if (bullet.homing && !bullet.enemy) {
        let target = bullet.targetId ? this.findMonster(bullet.targetId) : null;
        let bossTargeted = bullet.targetId === this.boss?.id && this.boss.alive;
        if (!target?.alive) {
          const monsterTarget = this.monsterGrid.nearest(
            bullet.position.x,
            bullet.position.y,
            520,
            (candidate) => !bullet.hitIds.has(candidate.id),
          );
          const bossCandidate = this.boss?.alive && !bullet.hitIds.has(this.boss.id) ? this.boss : null;
          bossTargeted = Boolean(
            bossCandidate &&
              (!monsterTarget ||
                distanceSquared(bossCandidate.position, bullet.position) <
                  distanceSquared(monsterTarget.position, bullet.position)),
          );
          target = bossTargeted ? null : monsterTarget;
          bullet.targetId = bossTargeted ? bossCandidate?.id ?? null : target?.id ?? null;
        }
        const homingPosition = bossTargeted ? this.boss?.position : target?.position;
        if (homingPosition) {
          const speed = Math.max(1, length(bullet.velocity));
          const desired = scale(normalize(subtract(homingPosition, bullet.position)), speed);
          bullet.velocity.x = lerp(bullet.velocity.x, desired.x, Math.min(1, delta * 8));
          bullet.velocity.y = lerp(bullet.velocity.y, desired.y, Math.min(1, delta * 8));
        }
      }

      const travel = length(bullet.velocity) * delta;
      bullet.position.x += bullet.velocity.x * delta;
      bullet.position.y += bullet.velocity.y * delta;
      bullet.remainingRange -= travel;
      bullet.visual.position.set(bullet.position.x, bullet.position.y);
      bullet.visual.rotation = Math.atan2(bullet.velocity.y, bullet.velocity.x);
      bullet.trailCooldown -= delta;
      if (bullet.sourceSkillId === 'homingMissiles' && bullet.trailCooldown <= 0) {
        const trailDensity = Math.max(0.2, this.quality.profile.trailDensity);
        this.createMissileTrail(bullet.position, normalize(bullet.velocity));
        bullet.trailCooldown = 0.055 / trailDensity;
      }

      if (bullet.enemy) {
        if (distanceSquared(bullet.position, player.position) <= square(bullet.radius + PLAYER_RADIUS)) {
          this.damagePlayer(bullet.damage, bullet.damageType);
          this.deactivateBullet(bullet);
        }
      } else {
        const candidates = this.monsterGrid.queryCircle(
          bullet.position.x,
          bullet.position.y,
          bullet.radius + 10,
          this.queryScratch,
        );
        for (const monster of candidates) {
          if (!monster.alive || bullet.hitIds.has(monster.id)) continue;
          if (distanceSquared(bullet.position, monster.position) > square(bullet.radius + monster.radius)) {
            continue;
          }
          bullet.hitIds.add(monster.id);
          const incomingAngle = Math.atan2(-bullet.velocity.y, -bullet.velocity.x);
          const frontal =
            monster.monsterId === 'shieldbearer' &&
            isFrontalHit({
              defenderFacingRadians: monster.facing,
              incomingDirectionRadians: incomingAngle,
            });
          let hitDamage = bullet.damage;
          if (bullet.isBasic) {
            const playerActor = this.player;
            if (playerActor) {
              if (playerActor.focusTargetId === monster.id) playerActor.focusStacks += 1;
              else {
                playerActor.focusTargetId = monster.id;
                playerActor.focusStacks = 1;
              }
              const focusLevel = this.passiveLevel('focusedFire');
              hitDamage *= 1 + Math.min(5, playerActor.focusStacks - 1) * focusLevel * 0.025;
            }
          }
          this.damageMonster(
            monster,
            hitDamage,
            bullet.damageType,
            bullet.isBasic,
            frontal ? shieldbearerDirectionalMultiplier(true) : 1,
            bullet.sourceSkillId,
            normalize(bullet.velocity),
          );
          if (bullet.sourceSkillId === 'homingMissiles') {
            this.damageEnemiesInRadius(
              monster.position,
              52,
              bullet.damage * 0.55,
              'explosive',
              monster.id,
              'homingMissiles',
            );
            if ((this.build.activeSkills.homingMissiles ?? 0) >= 5) {
              this.spawnMissileSubmunitions(monster.position, bullet.damage * 0.35, bullet.hitIds);
            }
          }
          const knockback = this.passiveLevel('largeCaliber') * 12;
          if (knockback > 0 && monster.alive) {
            const direction = normalize(bullet.velocity);
            monster.position.x = clamp(
              monster.position.x + direction.x * knockback,
              monster.radius,
              this.worldWidth - monster.radius,
            );
            monster.position.y = clamp(
              monster.position.y + direction.y * knockback,
              monster.radius,
              this.worldHeight - monster.radius,
            );
          }
          if (bullet.pierceRemaining > 0) {
            bullet.pierceRemaining -= 1;
          } else if (bullet.ricochetRemaining > 0) {
            const ricochetTarget = this.monsterGrid.nearest(
              monster.position.x,
              monster.position.y,
              280,
              (candidate) => candidate.alive && !bullet.hitIds.has(candidate.id),
            );
            if (ricochetTarget) {
              const speed = Math.max(PLAYER_BULLET_SPEED * 0.8, length(bullet.velocity));
              bullet.velocity = scale(
                normalize(subtract(ricochetTarget.position, monster.position)),
                speed,
              );
              bullet.targetId = ricochetTarget.id;
              bullet.homing = true;
              bullet.ricochetRemaining -= 1;
              bullet.damage *= 0.72;
              bullet.remainingRange = Math.max(bullet.remainingRange, 320);
            } else {
              this.deactivateBullet(bullet);
              break;
            }
          } else {
            this.deactivateBullet(bullet);
            break;
          }
        }

          const boss = this.boss;
          if (
          bullet.active &&
          boss?.alive &&
          !bullet.hitIds.has(boss.id) &&
          distanceSquared(bullet.position, boss.position) <= square(bullet.radius + boss.radius)
        ) {
          bullet.hitIds.add(boss.id);
          this.damageBoss(
            bullet.damage,
            bullet.damageType,
            bullet.isBasic,
            bullet.sourceSkillId,
            normalize(bullet.velocity),
          );
          if (bullet.sourceSkillId === 'homingMissiles') {
            this.damageEnemiesInRadius(
              boss.position,
              52,
              bullet.damage * 0.55,
              'explosive',
              boss.id,
              'homingMissiles',
            );
          }
          if (
            bullet.sourceSkillId === 'homingMissiles' &&
            (this.build.activeSkills.homingMissiles ?? 0) >= 5
          ) {
            this.spawnMissileSubmunitions(boss.position, bullet.damage * 0.35, bullet.hitIds);
          }
          if (bullet.pierceRemaining > 0) bullet.pierceRemaining -= 1;
          else this.deactivateBullet(bullet);
          }
        }

      if (
        bullet.remainingRange <= 0 ||
        bullet.position.x < -100 ||
        bullet.position.y < -100 ||
        bullet.position.x > this.worldWidth + 100 ||
        bullet.position.y > this.worldHeight + 100
      ) {
        this.deactivateBullet(bullet);
      }
    }
  }

  private deactivateBullet(bullet: BulletActor): void {
    if (!bullet.active) return;
    bullet.active = false;
    if (bullet.permitOwnerId) this.attackCoordinator.release(bullet.permitOwnerId);
    bullet.permitOwnerId = null;
    bullet.visual.removeFromParent();
  }

  private spawnMissileSubmunitions(
    position: Vec2,
    damage: number,
    excluded: ReadonlySet<string>,
  ): void {
    const targets = this.monsters
      .filter((monster) => monster.alive && !excluded.has(monster.id))
      .sort((a, b) => distanceSquared(a.position, position) - distanceSquared(b.position, position))
      .slice(0, 2);
    for (let index = 0; index < 2; index += 1) {
      const target = targets[index];
      const fallbackAngle = (index === 0 ? -1 : 1) * 0.55;
      const direction = target
        ? normalize(subtract(target.position, position))
        : { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) };
      this.spawnBullet({
        enemy: false,
        position: { ...position },
        velocity: scale(direction, 560),
        radius: 4.5,
        damage,
        damageType: 'explosive',
        isBasic: false,
        remainingRange: 420,
        pierceRemaining: 0,
        homing: true,
        targetId: target?.id ?? null,
        color: 0xffc34e,
      });
    }
    this.createSkillAtlasVfx(position, 0, 112, 0.46, {
      startScale: 0.25,
      endScale: 1.08,
      fadeOutStart: 0.5,
      fallbackColor: 0xffa036,
      priority: 2,
    });
  }

  private spawnGlacialShards(position: Vec2, damage: number): void {
    const targets = this.monsters
      .filter((monster) => monster.alive)
      .sort((a, b) => distanceSquared(a.position, position) - distanceSquared(b.position, position))
      .slice(0, 3);
    for (let index = 0; index < 3; index += 1) {
      const target = targets[index];
      const angle = (index / 3) * Math.PI * 2;
      const direction = target
        ? normalize(subtract(target.position, position))
        : { x: Math.cos(angle), y: Math.sin(angle) };
      this.spawnBullet({
        enemy: false,
        position: { ...position },
        velocity: scale(direction, 640),
        radius: 4,
        damage,
        damageType: 'frost',
        isBasic: false,
        remainingRange: 380,
        pierceRemaining: 0,
        homing: false,
        targetId: target?.id ?? null,
        color: 0x9decff,
        sourceSkillId: 'glacialGrenade',
      });
    }
    this.createSkillAtlasVfx(position, 1, 128, 0.54, {
      startScale: 0.26,
      endScale: 1.12,
      fadeOutStart: 0.52,
      fallbackColor: 0x8deaff,
      priority: 2,
    });
  }

  private spawnMineFragments(position: Vec2, damage: number): void {
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2 + this.rng.next() * 0.35;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      this.spawnBullet({
        enemy: false,
        position: { ...position },
        velocity: scale(direction, 610),
        radius: 4.5,
        damage,
        damageType: 'explosive',
        isBasic: false,
        remainingRange: 360,
        pierceRemaining: 0,
        homing: false,
        targetId: null,
        color: 0xffbd54,
      });
    }
  }

  private fireBladeShockwave(position: Vec2, direction: Vec2, damage: number): void {
    const target = this.monsterGrid.nearest(position.x, position.y, 380);
    const targetDirection = target ? normalize(subtract(target.position, position)) : direction;
    this.spawnBullet({
      enemy: false,
      position: { ...position },
      velocity: scale(targetDirection, 720),
      radius: 8,
      damage,
      damageType: 'kinetic',
      isBasic: false,
      remainingRange: 420,
      pierceRemaining: 1,
      homing: false,
      targetId: target?.id ?? null,
      color: 0x91efff,
      sourceSkillId: 'orbitingBlades',
    });
    this.createSkillAtlasVfx(position, 5, 88, 0.38, {
      rotation: Math.atan2(targetDirection.y, targetDirection.x),
      startScale: 0.28,
      endScale: 1.08,
      fadeOutStart: 0.48,
      fallbackColor: 0x8feaff,
      priority: 1,
    });
  }

  private damageMonster(
    monster: MonsterActor,
    amount: number,
    damageType: DamageType,
    isBasic: boolean,
    directionalMultiplier = 1,
    sourceSkillId: ActiveSkillId | null = null,
    impactDirection: Vec2 | null = null,
  ): number {
    if (!monster.alive) return 0;
    const definition = MONSTERS[monster.monsterId];
    const result = resolveDamage({
      amount,
      damageType,
      resistances: definition.resistances,
      immunities: definition.immunities,
      isBasicAttack: isBasic,
      attackPhase: 'active',
      directionalMultiplier,
    });
    if (result.damage <= 0) return 0;
    monster.health -= result.damage;
    monster.lastDamageAmount = result.damage;
    monster.lastDamageType = damageType;
    monster.lastDamageSkillId = sourceSkillId;
    this.updateMonsterHealthBar(monster);
    this.createDamageNumber(monster.position, result.damage, damageType);
    this.createHitSpark(monster.position, damageType, sourceSkillId, impactDirection, monster.id);
    if (this.impactSfxClock <= 0) {
      this.audio.play('impact', { volume: 0.45 });
      this.impactSfxClock = 0.055;
    }
    if (monster.health <= 0) this.killMonster(monster);
    return result.damage;
  }

  private damageBoss(
    amount: number,
    damageType: DamageType,
    isBasic: boolean,
    sourceSkillId: ActiveSkillId | null = null,
    impactDirection: Vec2 | null = null,
  ): number {
    const boss = this.boss;
    if (!boss?.alive) return 0;
    const pacing = getBossPacing(this.currentStage, boss.phase);
    const vulnerable = boss.breakRemaining > 0;
    const encounterResistance = boss.phase === 1 ? 0.05 : boss.phase === 2 ? 0.14 : 0.22;
    const result = resolveDamage({
      amount,
      damageType,
      isBasicAttack: isBasic,
      attackPhase: 'active',
      encounterResistance,
      outgoingMultiplier: vulnerable ? pacing.vulnerabilityDamageMultiplier : 1,
    });
    boss.health -= result.damage;
    boss.visual.healthFill.scale.x = clamp(boss.health / boss.maxHealth, 0, 1);
    this.createDamageNumber(boss.position, result.damage, damageType);
    this.createHitSpark(boss.position, damageType, sourceSkillId, impactDirection, boss.id);
    if (boss.health <= 0) {
      boss.health = 0;
      boss.alive = false;
      this.removeAllMonstersForVictory();
      boss.telegraph?.destroy();
      boss.telegraph = null;
      this.createExplosion(boss.position, 230, 0xd655ff, true);
      this.audio.play('explosion', { volume: 1 });
      this.finishRun(true);
    }
    return result.damage;
  }

  private damagePlayer(amount: number, damageType: DamageType): void {
    const player = this.player;
    if (!player || player.invulnerable > 0 || this.status !== 'playing') return;
    const result = resolveDamage({ amount, damageType, attackPhase: 'active' });
    let remaining = result.damage;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, remaining);
      player.shield -= absorbed;
      remaining -= absorbed;
      if (absorbed > 0) this.createPulse(player.position, 48, 0x74e8ff, 0.32);
    }
    if (remaining > 0) player.health = Math.max(0, player.health - remaining);
    player.hitFlash = 0.16;
    player.invulnerable = 0.4;
    this.createDamageNumber(player.position, result.damage, damageType, true);
    if (remaining > 15) this.createScreenShake(Math.min(11, remaining * 0.22));
  }

  private healPlayer(amount: number): void {
    const player = this.player;
    if (!player) return;
    player.health = Math.min(player.maxHealth, player.health + Math.max(0, amount));
    this.createPulse(player.position, 58, 0x58ffa5, 0.45);
  }

  private updateMonsterHealthBar(monster: MonsterActor): void {
    monster.visual.healthFill.scale.x = clamp(monster.health / monster.maxHealth, 0, 1);
  }

  private killMonster(monster: MonsterActor): void {
    if (!monster.alive) return;
    const deathPosition = { ...monster.position };
    const killedWhileFrozen = monster.frozenBySkillId === 'glacialGrenade';
    const killedWhileBurning =
      monster.burnRemaining > 0 && monster.burnSourceSkillId === 'flameBeam';
    const deathDamage = monster.lastDamageAmount;
    monster.alive = false;
    monster.aiState = 'dead';
    if (monster.permit) this.attackCoordinator.release(monster.id);
    monster.permit = null;
    this.clearMonsterTelegraph(monster);
    this.kills += 1;
    if (monster.source === 'director') {
      const dropsHealth = shouldDropHealthPickup({
        spawnSource: monster.source,
        roll: this.healthDropRng.next(),
      });
      this.spawnExperienceOrb(deathPosition, Math.max(1, Math.round(monster.experienceValue)));
      if (dropsHealth) this.spawnHealthPickup(deathPosition);
    }
    if (monster.monsterId === 'exploder') {
      // The exploder's death burst is visual only. Letting it damage nearby enemies
      // made an ordinary rifle hit recursively erase a whole pack without a skill cast.
      this.createExplosion(monster.position, 95, 0xff5b27, true);
    } else {
      this.createExplosion(monster.position, monster.radius * 1.75, ROLE_TINT[monster.role], false);
    }
    if (
      killedWhileFrozen &&
      (this.build.activeSkills.glacialGrenade ?? 0) >= 5 &&
      monster.lastDamageSkillId !== 'glacialGrenade'
    ) {
      this.spawnGlacialShards(deathPosition, Math.max(12, deathDamage * 0.45));
    }
    if (killedWhileBurning && !this.resolvingFlameDeathExplosion) {
      this.resolvingFlameDeathExplosion = true;
      try {
        this.damageEnemiesInRadius(
          deathPosition,
          70,
          Math.max(18, deathDamage * 1.6),
          'fire',
          monster.id,
          'flameBeam',
        );
      } finally {
        this.resolvingFlameDeathExplosion = false;
      }
      this.createSkillAtlasVfx(deathPosition, 2, 142, 0.58, {
        startScale: 0.3,
        endScale: 1.14,
        fadeOutStart: 0.55,
        fallbackColor: 0xff5a22,
        priority: 2,
      });
    }
  }

  private damageEnemiesInRadius(
    center: Vec2,
    radius: number,
    damage: number,
    damageType: DamageType,
    excludeId?: string,
    sourceSkillId: ActiveSkillId | null = null,
    mineCastId?: string,
  ): number {
    let hits = 0;
    const candidates = this.monsterGrid.queryCircle(center.x, center.y, radius);
    for (const monster of candidates) {
      if (!monster.alive || monster.id === excludeId) continue;
      if (distance(center, monster.position) > radius + monster.radius) continue;
      const sameMineCastAlreadyHit =
        sourceSkillId === 'landmines' &&
        mineCastId !== undefined &&
        monster.activeSkillCastId === mineCastId;
      this.damageMonster(
        monster,
        damage * (sameMineCastAlreadyHit ? 0.55 : 1),
        damageType,
        false,
        1,
        sourceSkillId,
        normalize(subtract(monster.position, center)),
      );
      if (sourceSkillId === 'landmines' && mineCastId !== undefined) {
        monster.activeSkillCastId = mineCastId;
      }
      hits += 1;
    }
    const boss = this.boss;
    if (boss?.alive && boss.id !== excludeId && distance(center, boss.position) <= radius + boss.radius) {
      const bossMineKey = mineCastId ? `${mineCastId}:${boss.id}` : '';
      const sameMineCastAlreadyHit =
        sourceSkillId === 'landmines' && bossMineKey !== '' && this.mineBossCastHits.has(bossMineKey);
      this.damageBoss(
        damage * (sameMineCastAlreadyHit ? 0.55 : 1),
        damageType,
        false,
        sourceSkillId,
        normalize(subtract(boss.position, center)),
      );
      if (sourceSkillId === 'landmines' && bossMineKey !== '') this.mineBossCastHits.add(bossMineKey);
      hits += 1;
    }
    return hits;
  }

  private spawnExperienceOrb(position: Vec2, value: number): void {
    let orb = this.orbPool.pop();
    if (!orb) {
      const visual = new Container();
      const glow = new Graphics();
      const sprite = new Sprite(this.textures?.experience ?? Texture.WHITE);
      sprite.anchor.set(0.5);
      visual.addChild(glow, sprite);
      orb = {
        id: this.nextId('xp'),
        active: true,
        position: { ...position },
        value,
        velocity: { x: 0, y: 0 },
        visual,
        sprite,
        glow,
      };
    }
    orb.active = true;
    orb.position = {
      x: position.x + (this.rng.next() - 0.5) * 18,
      y: position.y + (this.rng.next() - 0.5) * 18,
    };
    orb.value = value;
    orb.velocity = { x: 0, y: 0 };
    orb.glow.clear().circle(0, 0, 13).fill({ color: 0x2fbbff, alpha: 0.25 });
    orb.sprite.texture =
      (value >= 8 ? this.textures?.eliteExperience : this.textures?.experience) ?? Texture.WHITE;
    orb.sprite.tint = value >= 8 ? 0xafffff : 0x42c8ff;
    orb.sprite.width = value >= 8 ? 20 : 13;
    orb.sprite.height = value >= 8 ? 25 : 17;
    orb.visual.position.set(orb.position.x, orb.position.y);
    orb.visual.alpha = 1;
    this.overEffectLayer.addChild(orb.visual);
    this.orbs.push(orb);
  }

  private updateExperienceOrbs(delta: number): void {
    const player = this.player;
    if (!player) return;
    const magnetRadius = 90 * (1 + this.passiveLevel('xpMagnet') * 0.35);
    for (const orb of this.orbs) {
      if (!orb.active) continue;
      const toPlayer = subtract(player.position, orb.position);
      const playerDistance = length(toPlayer);
      if (playerDistance < magnetRadius) {
        const direction = playerDistance > 0 ? scale(toPlayer, 1 / playerDistance) : { x: 0, y: 0 };
        const acceleration = 520 + (magnetRadius - playerDistance) * 7;
        orb.velocity.x += direction.x * acceleration * delta;
        orb.velocity.y += direction.y * acceleration * delta;
        const speed = length(orb.velocity);
        if (speed > 680) orb.velocity = scale(orb.velocity, 680 / speed);
        orb.position.x += orb.velocity.x * delta;
        orb.position.y += orb.velocity.y * delta;
      }
      orb.visual.position.set(orb.position.x, orb.position.y + Math.sin(this.elapsedSeconds * 6) * 3);
      orb.visual.rotation += delta * 1.8;
      if (distanceSquared(orb.position, player.position) <= square(PLAYER_RADIUS + 12)) {
        orb.active = false;
        orb.visual.removeFromParent();
        const result = this.experience.addExperience(orb.value);
        this.audio.play('pickup', { volume: 0.5, playbackRate: 0.95 + this.rng.next() * 0.25 });
        if (result.levelsGained > 0 && this.status === 'playing') this.openLevelUpDraft();
      }
    }
  }

  private spawnHealthPickup(position: Vec2): void {
    let pickup = this.healthPickupPool.pop();
    if (!pickup) {
      const visual = new Container();
      const glow = new Graphics();
      const fallback = new Graphics();
      const sprite = new Sprite(this.textures?.healthPickup ?? Texture.WHITE);
      sprite.anchor.set(0.5);
      visual.addChild(glow, fallback, sprite);
      pickup = {
        id: this.nextId('health'),
        active: true,
        position: { ...position },
        velocity: { x: 0, y: 0 },
        visual,
        sprite,
        glow,
        fallback,
      };
    }
    pickup.active = true;
    pickup.position = {
      x: position.x + (this.rng.next() - 0.5) * 16,
      y: position.y + (this.rng.next() - 0.5) * 16,
    };
    pickup.velocity = { x: 0, y: 0 };
    pickup.glow
      .clear()
      .circle(0, 0, 21)
      .fill({ color: 0x37ff8b, alpha: 0.13 })
      .circle(0, 0, 15)
      .stroke({ width: 2, color: 0x8dffba, alpha: 0.68 });
    pickup.fallback
      .clear()
      .roundRect(-12, -12, 24, 24, 6)
      .fill({ color: 0x063d29, alpha: 0.96 })
      .stroke({ width: 2, color: 0x6dffa8, alpha: 0.95 })
      .rect(-3, -9, 6, 18)
      .rect(-9, -3, 18, 6)
      .fill({ color: 0xc8ffdc, alpha: 0.98 });
    const texture = this.textures?.healthPickup ?? Texture.WHITE;
    pickup.sprite.texture = texture;
    pickup.sprite.visible = texture !== Texture.WHITE;
    pickup.fallback.visible = texture === Texture.WHITE;
    pickup.sprite.tint = 0xffffff;
    pickup.sprite.width = 32;
    pickup.sprite.height = 32;
    pickup.visual.position.set(pickup.position.x, pickup.position.y);
    pickup.visual.scale.set(1);
    pickup.visual.alpha = 1;
    this.overEffectLayer.addChild(pickup.visual);
    this.healthPickups.push(pickup);
    this.createPulse(pickup.position, 38, 0x55ff9b, 0.32);
  }

  private updateHealthPickups(delta: number): void {
    const player = this.player;
    if (!player) return;
    for (const pickup of this.healthPickups) {
      if (!pickup.active) continue;
      const toPlayer = subtract(player.position, pickup.position);
      const playerDistance = length(toPlayer);
      if (playerDistance < HEALTH_PICKUP_MAGNET_RADIUS) {
        const direction = playerDistance > 0 ? scale(toPlayer, 1 / playerDistance) : { x: 0, y: 0 };
        const acceleration = 640 + (HEALTH_PICKUP_MAGNET_RADIUS - playerDistance) * 8;
        pickup.velocity.x += direction.x * acceleration * delta;
        pickup.velocity.y += direction.y * acceleration * delta;
        const speed = length(pickup.velocity);
        if (speed > 760) pickup.velocity = scale(pickup.velocity, 760 / speed);
        pickup.position.x += pickup.velocity.x * delta;
        pickup.position.y += pickup.velocity.y * delta;
      }
      const pulse = Math.sin(this.elapsedSeconds * 7.5);
      pickup.visual.position.set(pickup.position.x, pickup.position.y + pulse * 4);
      pickup.visual.scale.set(1 + pulse * 0.055);
      pickup.visual.rotation += delta * 0.65;
      pickup.glow.alpha = 0.72 + pulse * 0.18;
      if (
        distanceSquared(pickup.position, player.position) <=
        square(PLAYER_RADIUS + HEALTH_PICKUP_COLLECT_RADIUS)
      ) {
        pickup.active = false;
        pickup.visual.removeFromParent();
        const healthBefore = player.health;
        const healAmount = calculateHealthPickupHeal(player.maxHealth);
        if (healthBefore < player.maxHealth) this.healPlayer(healAmount);
        else this.createPulse(player.position, 42, 0x55ff9b, 0.28);
        this.audio.play('pickup', { volume: 0.62, playbackRate: 1.18 });
      }
    }
  }

  private openLevelUpDraft(): void {
    if (this.experience.queuedLevelUps <= 0) return;
    if (this.status !== 'levelUp') {
      if (this.state.can('LEVEL_UP')) this.state.dispatch('LEVEL_UP');
      this.status = 'levelUp';
    }
    this.currentDraft = new UpgradeDraft(
      {
        playerLevel: this.experience.nextQueuedLevelUpLevel ?? this.experience.level,
        build: cloneBuild(this.build),
        cardCount: 3,
      },
      this.rng,
      3,
    );
    this.currentUpgradeOptions = this.currentDraft.deal();
    this.audio.play('level-up');
    this.options.onLevelUp?.(
      this.experience.nextQueuedLevelUpLevel ?? this.experience.level,
      this.currentUpgradeOptions,
      this.currentDraft.rerollsRemaining,
    );
    this.emitSnapshot(true);
  }

  private cleanupEntities(): void {
    for (let index = this.monsters.length - 1; index >= 0; index -= 1) {
      const monster = this.monsters[index];
      if (!monster || monster.alive) continue;
      monster.visual.root.removeFromParent();
      monster.visual.root.destroy({ children: true });
      this.monsters.splice(index, 1);
    }
    for (let index = this.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets[index];
      if (!bullet || bullet.active) continue;
      this.bullets.splice(index, 1);
      this.bulletPool.push(bullet);
    }
    for (let index = this.orbs.length - 1; index >= 0; index -= 1) {
      const orb = this.orbs[index];
      if (!orb || orb.active) continue;
      this.orbs.splice(index, 1);
      this.orbPool.push(orb);
    }
    for (let index = this.healthPickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.healthPickups[index];
      if (!pickup || pickup.active) continue;
      this.healthPickups.splice(index, 1);
      this.healthPickupPool.push(pickup);
    }
  }

  private findMonster(id: string): MonsterActor | null {
    return this.monsters.find((monster) => monster.id === id && monster.alive) ?? null;
  }

  private useSkillSlot(index: number): void {
    const skillId = this.getEquippedSkills()[index];
    if (skillId) this.activateSkill(skillId);
  }

  private activateSkill(skillId: ActiveSkillId, forcedAim: Vec2 | null = null, forcedDistance = 360): boolean {
    const player = this.player;
    const level = this.build.activeSkills[skillId] ?? 0;
    if (!player || level <= 0 || (this.skillCooldowns[skillId] ?? 0) > 0) return false;
    const definition = ACTIVE_SKILLS[skillId];
    const levelDefinition = definition.levels[level - 1] ?? definition.levels[0];
    if (!levelDefinition) return false;
    const skillAim = forcedAim ?? this.virtualSkillAimDirection;
    const worldPointer = skillAim
      ? add(player.position, scale(skillAim, forcedAim ? forcedDistance : this.virtualSkillAimDistance))
      : this.virtualAimDirection
      ? add(player.position, scale(this.virtualAimDirection, 360))
      : this.pointerAimActive
      ? this.screenToWorld(this.input?.pointer ?? this.lastPointer)
      : add(player.position, scale(this.lastAimDirection, 360));
    const rawTarget = clampPointToRange(player.position, worldPointer, 540);
    const target = {
      x: clamp(rawTarget.x, 35, this.worldWidth - 35),
      y: clamp(rawTarget.y, 35, this.worldHeight - 35),
    };
    const direction = normalize(subtract(target, player.position));
    const aimDirection = lengthSquared(direction) > 0.1 ? direction : this.lastAimDirection;
    const damageMultiplier = levelDefinition.damageMultiplier;

    switch (skillId) {
      case 'homingMissiles': {
        const count = levelDefinition.projectileCount ?? 3;
        const reservedTargets = this.monsters
          .filter((monster) => monster.alive)
          .sort(
            (a, b) =>
              distanceSquared(a.position, player.position) -
              distanceSquared(b.position, player.position),
          )
          .slice(0, count);
        this.createDirectionalBurst(player.position, aimDirection, 0xffa23a, 74, 0.34, 2);
        for (let index = 0; index < count; index += 1) {
          const spread = (index - (count - 1) / 2) * 0.15;
          const launchDirection = rotate(aimDirection, spread);
          const targetMonster = reservedTargets[index] ?? reservedTargets[0] ?? null;
          const bossIsVulnerable = Boolean(this.boss?.alive && this.boss.breakRemaining > 0);
          const bossIsCloser =
            this.boss?.alive &&
            (bossIsVulnerable || !targetMonster ||
              distanceSquared(this.boss.position, player.position) <
                distanceSquared(targetMonster.position, player.position));
          this.spawnBullet({
            enemy: false,
            position: add(player.position, scale(launchDirection, 30)),
            velocity: scale(launchDirection, 420),
            radius: 7,
            damage: 44 * damageMultiplier,
            damageType: 'explosive',
            isBasic: false,
            remainingRange: 1_150,
            pierceRemaining: 0,
            homing: true,
            targetId: bossIsCloser ? this.boss?.id ?? null : targetMonster?.id ?? null,
            color: 0xff9a36,
            sourceSkillId: 'homingMissiles',
          });
        }
        break;
      }
      case 'glacialGrenade': {
        const count = levelDefinition.projectileCount ?? 1;
        const grenadeRadius = 104 * (levelDefinition.radiusMultiplier ?? 1);
        const perpendicular = { x: -aimDirection.y, y: aimDirection.x };
        for (let index = 0; index < count; index += 1) {
          const grenadeTarget = add(target, scale(perpendicular, (index - (count - 1) / 2) * 92));
          this.addGameplayEffect({
            kind: 'grenade',
            position: {
              x: clamp(grenadeTarget.x, 35, this.worldWidth - 35),
              y: clamp(grenadeTarget.y, 35, this.worldHeight - 35),
            },
            direction: aimDirection,
            radius: grenadeRadius,
            damage: 70 * damageMultiplier,
            damageType: 'frost',
            remaining: 0.72 + index * 0.1,
            duration: 0.72 + index * 0.1,
            level,
            index,
            count,
          });
        }
        this.createDirectionalBurst(player.position, aimDirection, 0x8deaff, 54, 0.3, 1);
        this.createSkillAtlasVfx(target, 1, grenadeRadius * (count > 1 ? 1.75 : 1.35), 0.48, {
          startScale: 0.32,
          endScale: 1.04,
          fadeInFraction: 0.08,
          fadeOutStart: 0.46,
          fallbackColor: 0x8deaff,
          priority: 2,
        });
        break;
      }
      case 'gravityWell': {
        const gravityRadius = 126 * (levelDefinition.radiusMultiplier ?? 1);
        this.addGameplayEffect({
          kind: 'gravity',
          position: target,
          direction: aimDirection,
          radius: gravityRadius,
          damage: 11 * damageMultiplier,
          damageType: 'gravity',
          remaining: levelDefinition.durationSeconds ?? 3,
          duration: levelDefinition.durationSeconds ?? 3,
          level,
          index: 0,
          count: 1,
        });
        this.createAtlasVfx(target, 3, gravityRadius * 1.65, 0.62, {
          rotation: -0.18,
          rotationSpeed: -1.2,
          startScale: 0.24,
          endScale: 1.08,
          fadeInFraction: 0.12,
          fadeOutStart: 0.55,
          fallbackColor: 0xb85cff,
          priority: 2,
        });
        break;
      }
      case 'flameBeam': {
        this.addGameplayEffect({
          kind: 'beam',
          position: { ...player.position },
          direction: aimDirection,
          radius: 25 * (levelDefinition.radiusMultiplier ?? 1),
          damage: 12 * damageMultiplier,
          damageType: 'fire',
          remaining: levelDefinition.durationSeconds ?? 2,
          duration: levelDefinition.durationSeconds ?? 2,
          level,
          index: 0,
          count: 1,
        });
        this.createAtlasVfx(add(player.position, scale(aimDirection, 42)), 4, 112, 0.46, {
          rotation: Math.atan2(aimDirection.y, aimDirection.x),
          rotationSpeed: 0,
          startScale: 0.38,
          endScale: 1.18,
          fadeInFraction: 0.06,
          fadeOutStart: 0.48,
          fallbackColor: 0xff6b28,
          priority: 2,
        });
        break;
      }
      case 'chainLightning':
        this.castChainLightning(levelDefinition.projectileCount ?? 4, 58 * damageMultiplier);
        break;
      case 'autoTurret': {
        const count = levelDefinition.projectileCount ?? 1;
        for (let index = 0; index < count; index += 1) {
          const perpendicular = { x: -aimDirection.y, y: aimDirection.x };
          const offset = count === 1 ? 0 : (index - 0.5) * 54;
          const turretPosition = add(target, scale(perpendicular, offset));
          this.addGameplayEffect({
            kind: 'turret',
            position: turretPosition,
            direction: aimDirection,
            radius: 23,
            damage: 17 * damageMultiplier,
            damageType: 'kinetic',
            remaining: levelDefinition.durationSeconds ?? 8,
            duration: levelDefinition.durationSeconds ?? 8,
            level,
            index,
            count,
          });
          this.createSkillAtlasVfx(turretPosition, 6, 112, 0.64, {
            startScale: 0.25,
            endScale: 1.12,
            fadeInFraction: 0.12,
            fadeOutStart: 0.62,
            fallbackColor: 0x66e7ff,
            priority: 2,
          });
        }
        break;
      }
      case 'landmines': {
        const count = levelDefinition.projectileCount ?? 3;
        const mineRadius = 62 * (levelDefinition.radiusMultiplier ?? 1);
        const mineCastId = this.nextId('cast-landmines');
        for (let index = 0; index < count; index += 1) {
          const angle = (index / count) * Math.PI * 2;
          this.addGameplayEffect({
            kind: 'mine',
            position: {
              x: clamp(target.x + Math.cos(angle) * 58, 30, this.worldWidth - 30),
              y: clamp(target.y + Math.sin(angle) * 58, 30, this.worldHeight - 30),
            },
            direction: { x: Math.cos(angle), y: Math.sin(angle) },
            radius: mineRadius,
            damage: 52 * damageMultiplier,
            damageType: 'explosive',
            remaining: 18,
            duration: 18,
            level,
            index,
            count,
            castId: mineCastId,
          });
        }
        break;
      }
      case 'orbitingBlades': {
        const count = levelDefinition.projectileCount ?? 2;
        const bladeCastId = this.nextId('cast-blades');
        this.createSkillAtlasVfx(player.position, 5, 126, 0.52, {
          rotation: Math.atan2(aimDirection.y, aimDirection.x),
          rotationSpeed: 0,
          startScale: 0.32,
          endScale: 1.18,
          fadeInFraction: 0.08,
          fadeOutStart: 0.5,
          fallbackColor: 0x78eaff,
          priority: 2,
        });
        this.createPulse(player.position, 88, 0x65dfff, 0.42);
        for (let index = 0; index < count; index += 1) {
          this.addGameplayEffect({
            kind: 'blade',
            position: { ...player.position },
            direction: aimDirection,
            radius: 18,
            damage: 22 * damageMultiplier,
            damageType: 'kinetic',
            remaining: levelDefinition.durationSeconds ?? 5,
            duration: levelDefinition.durationSeconds ?? 5,
            level,
            index,
            count,
            castId: bladeCastId,
          });
        }
        break;
      }
      case 'iceBarrier': {
        const capacity = 50 * damageMultiplier;
        player.shield = Math.max(player.shield, capacity);
        player.maxShield = Math.max(player.maxShield, capacity);
        this.removeGameplayEffects('barrier');
        this.addGameplayEffect({
          kind: 'barrier',
          position: { ...player.position },
          direction: aimDirection,
          radius: 48,
          damage: capacity,
          damageType: 'frost',
          remaining: levelDefinition.durationSeconds ?? 6,
          duration: levelDefinition.durationSeconds ?? 6,
          level,
          index: 0,
          count: 1,
        });
        this.createAtlasVfx(player.position, 6, 126, 0.56, {
          rotationSpeed: 0.24,
          startScale: 0.3,
          endScale: 1.22,
          fadeInFraction: 0.1,
          fadeOutStart: 0.58,
          fallbackColor: 0x8eeaff,
          priority: 2,
        });
        break;
      }
      case 'attackDrone': {
        const count = levelDefinition.projectileCount ?? 1;
        for (let index = 0; index < count; index += 1) {
          const droneEffect = this.addGameplayEffect({
            kind: 'drone',
            position: { ...player.position },
            direction: aimDirection,
            radius: 17,
            damage: 15 * damageMultiplier,
            damageType: 'kinetic',
            remaining: levelDefinition.durationSeconds ?? 10,
            duration: levelDefinition.durationSeconds ?? 10,
            level,
            index,
            count,
          });
          this.createSkillAtlasVfx(droneEffect.position, 7, 118, 0.68, {
            startScale: 0.24,
            endScale: 1.1,
            fadeInFraction: 0.12,
            fadeOutStart: 0.64,
            fallbackColor: 0xffd557,
            priority: 2,
          });
        }
        break;
      }
    }

    this.skillCooldowns[skillId] = this.skillCooldown(skillId, level);
    this.audio.play('skill', { playbackRate: 0.94 + level * 0.025 });
    this.emitSnapshot(true);
    return true;
  }

  private addGameplayEffect(specification: {
    kind: GameplayEffectKind;
    position: Vec2;
    direction: Vec2;
    radius: number;
    damage: number;
    damageType: DamageType;
    remaining: number;
    duration: number;
    level: number;
    index: number;
    count: number;
    castId?: string;
  }): GameplayEffect {
    const visual = new Graphics();
    switch (specification.kind) {
      case 'grenade':
        visual
          .circle(0, 0, specification.radius)
          .fill({ color: 0x68dfff, alpha: 0.09 })
          .stroke({ width: 3, color: 0xb5f5ff, alpha: 0.82 })
          .circle(0, 0, 11)
          .fill({ color: 0x9ceeff, alpha: 0.95 })
          .moveTo(-specification.radius * 0.9, 0)
          .lineTo(-specification.radius * 0.67, 0)
          .moveTo(specification.radius * 0.67, 0)
          .lineTo(specification.radius * 0.9, 0)
          .moveTo(0, -specification.radius * 0.9)
          .lineTo(0, -specification.radius * 0.67)
          .stroke({ width: 5, color: 0xe6fbff, alpha: 0.9 });
        break;
      case 'gravity':
        visual
          .circle(0, 0, specification.radius)
          .fill({ color: 0x6217a8, alpha: 0.18 })
          .stroke({ width: 4, color: 0xb460ff, alpha: 0.72 })
          .circle(0, 0, specification.radius * 0.48)
          .stroke({ width: 2, color: 0xd39aff, alpha: 0.55 })
          .poly([
            specification.radius * 0.44,
            -specification.radius * 0.08,
            specification.radius * 0.82,
            -specification.radius * 0.2,
            specification.radius * 0.68,
            specification.radius * 0.1,
          ])
          .fill({ color: 0xe0b1ff, alpha: 0.74 });
        break;
      case 'beam':
        break;
      case 'turret':
        visual
          .circle(0, 5, 22)
          .fill({ color: 0x172430, alpha: 0.95 })
          .stroke({ width: 3, color: 0x58d7ff })
          .rect(-5, -28, 10, 34)
          .fill({ color: 0xb6f1ff });
        break;
      case 'mine':
        visual
          .circle(0, 0, 15)
          .fill({ color: 0x26282c })
          .stroke({ width: 3, color: 0xff9a32 })
          .circle(0, 0, 4)
          .fill({ color: 0xff522d });
        break;
      case 'blade':
        visual
          .poly([-18, 0, 0, -7, 18, 0, 0, 7])
          .fill({ color: 0xe2f7ff })
          .stroke({ width: 2, color: 0x58d6ff });
        break;
      case 'barrier':
        visual
          .circle(0, 0, specification.radius)
          .fill({ color: 0x58d9ff, alpha: 0.1 })
          .stroke({ width: 5, color: 0xa9f2ff, alpha: 0.8 })
          .poly([
            specification.radius,
            0,
            specification.radius * 0.5,
            specification.radius * 0.86,
            -specification.radius * 0.5,
            specification.radius * 0.86,
            -specification.radius,
            0,
            -specification.radius * 0.5,
            -specification.radius * 0.86,
            specification.radius * 0.5,
            -specification.radius * 0.86,
          ])
          .stroke({ width: 2, color: 0xe5fcff, alpha: 0.58 });
        break;
      case 'drone':
        visual
          .poly([-18, 0, -7, -11, 9, -8, 18, 0, 9, 8, -7, 11])
          .fill({ color: 0x26445a })
          .stroke({ width: 3, color: 0x6ee4ff })
          .circle(0, 0, 4)
          .fill({ color: 0xffdf5e });
        break;
    }
    const propTexture =
      specification.kind === 'turret'
        ? this.textures?.turret
        : specification.kind === 'mine'
          ? this.textures?.landmine
          : specification.kind === 'drone'
            ? this.textures?.drone
            : undefined;
    if (propTexture && propTexture !== Texture.WHITE) {
      const prop = new Sprite(propTexture);
      prop.anchor.set(0.5);
      const size = specification.kind === 'turret' ? 64 : specification.kind === 'mine' ? 44 : 52;
      prop.width = size;
      prop.height = size;
      prop.position.y = specification.kind === 'turret' ? -8 : 0;
      visual.addChild(prop);
    }
    visual.position.set(specification.position.x, specification.position.y);
    const layer =
      specification.kind === 'mine' ||
      specification.kind === 'gravity' ||
      specification.kind === 'grenade'
        ? this.underEffectLayer
        : this.overEffectLayer;
    layer.addChild(visual);
    const effect: GameplayEffect = {
      id: this.nextId('effect'),
      kind: specification.kind,
      position: { ...specification.position },
      direction: { ...specification.direction },
      radius: specification.radius,
      damage: specification.damage,
      damageType: specification.damageType,
      remaining: specification.remaining,
      duration: specification.duration,
      tick: 0,
      index: specification.index,
      count: specification.count,
      level: specification.level,
      armed: false,
      hitCooldowns: new Map(),
      castId: specification.castId ?? this.nextId('cast'),
      pulseCooldown: 0,
      chainTriggered: false,
      visual,
    };
    this.gameplayEffects.push(effect);
    return effect;
  }

  private updateGameplayEffects(delta: number): void {
    const player = this.player;
    if (!player) return;
    for (const effect of this.gameplayEffects) {
      effect.remaining -= delta;
      effect.tick -= delta;
      effect.pulseCooldown -= delta;
      for (const [id, cooldown] of effect.hitCooldowns) {
        if (cooldown <= delta) effect.hitCooldowns.delete(id);
        else effect.hitCooldowns.set(id, cooldown - delta);
      }

      switch (effect.kind) {
        case 'grenade': {
          const progress = 1 - effect.remaining / effect.duration;
          effect.visual.scale.set(0.84 + progress * 0.16);
          effect.visual.rotation += delta * 2;
          if (effect.remaining <= 0) {
            const candidates = this.monsterGrid.queryCircle(
              effect.position.x,
              effect.position.y,
              effect.radius,
            );
            for (const monster of candidates) {
              if (!monster.alive) continue;
              this.damageMonster(monster, effect.damage, 'frost', false, 1, 'glacialGrenade');
              monster.slowMultiplier = 0.6;
              monster.slowRemaining = 3.2;
              if (effect.level >= 3 && distance(effect.position, monster.position) < effect.radius * 0.48) {
                monster.frozenRemaining = 1.5;
                monster.frozenBySkillId = 'glacialGrenade';
              }
            }
            if (this.boss?.alive && distance(effect.position, this.boss.position) < effect.radius) {
              this.damageBoss(effect.damage, 'frost', false, 'glacialGrenade');
            }
            this.createExplosion(effect.position, effect.radius, 0x7de5ff, true, 2);
            this.audio.play('explosion', { volume: 0.62, playbackRate: 1.25 });
          }
          break;
        }
        case 'gravity': {
          effect.visual.rotation -= delta * 0.85;
          const candidates = this.monsterGrid.queryCircle(
            effect.position.x,
            effect.position.y,
            effect.radius,
          );
          for (const monster of candidates) {
            if (!monster.alive) continue;
            const toCenter = subtract(effect.position, monster.position);
            const pull = normalize(toCenter);
            monster.position.x += pull.x * 85 * delta;
            monster.position.y += pull.y * 85 * delta;
            if (effect.tick <= 0) {
              this.damageMonster(monster, effect.damage, 'gravity', false, 1, 'gravityWell', pull);
            }
          }
          if (effect.tick <= 0) {
            if (this.boss?.alive && distance(effect.position, this.boss.position) < effect.radius) {
              this.damageBoss(effect.damage * 0.55, 'gravity', false, 'gravityWell');
            }
            effect.tick = 0.5;
          }
          if (effect.remaining <= 0) {
            this.createGravityCollapse(effect.position, effect.radius);
            if (effect.level >= 5) {
              this.damageEnemiesInRadius(
                effect.position,
                effect.radius * 0.75,
                effect.damage * 2,
                'gravity',
                undefined,
                'gravityWell',
              );
              this.createExplosion(effect.position, effect.radius, 0xb04dff, true, 3);
            }
          }
          break;
        }
        case 'beam': {
          effect.position = { ...player.position };
          effect.visual.position.set(effect.position.x, effect.position.y);
          effect.visual
            .clear()
            .moveTo(0, 0)
            .lineTo(effect.direction.x * 620, effect.direction.y * 620)
            .stroke({ width: effect.radius * 1.7, color: 0xff5b20, alpha: 0.22 })
            .moveTo(0, 0)
            .lineTo(effect.direction.x * 620, effect.direction.y * 620)
            .stroke({ width: effect.radius * 0.62, color: 0xffcf65, alpha: 0.88 });
          if (effect.tick <= 0) {
            this.damageEnemiesAlongSegment(
              effect.position,
              add(effect.position, scale(effect.direction, 620)),
              effect.radius,
              effect.damage,
              'fire',
              (monster) => {
                monster.burnRemaining = 3;
                monster.burnTimer = Math.min(monster.burnTimer, 0.5);
                monster.burnDamage = effect.damage * 0.2;
                monster.burnSourceSkillId = 'flameBeam';
              },
              'flameBeam',
            );
            effect.tick = 0.18;
          }
          break;
        }
        case 'turret': {
          effect.visual.rotation = Math.sin(this.elapsedSeconds * 1.6 + effect.index) * 0.08;
          if (effect.tick <= 0) {
            const target = this.monsterGrid.nearest(effect.position.x, effect.position.y, 480);
            const bossTarget =
              this.boss?.alive &&
              distance(this.boss.position, effect.position) <= 480 &&
              (this.boss.breakRemaining > 0 || !target ||
                distanceSquared(this.boss.position, effect.position) <
                  distanceSquared(target.position, effect.position))
                ? this.boss
                : null;
            const targetPosition = bossTarget?.position ?? target?.position;
            if (targetPosition) {
              const direction = normalize(subtract(targetPosition, effect.position));
              effect.direction = direction;
              effect.visual.rotation = Math.atan2(direction.y, direction.x) + Math.PI / 2;
              this.spawnBullet({
                enemy: false,
                position: add(effect.position, scale(direction, 24)),
                velocity: scale(direction, 650),
                radius: 4,
                damage: effect.damage * (effect.level >= 5 ? 0.75 : 1),
                damageType: 'kinetic',
                isBasic: false,
                remainingRange: 560,
                pierceRemaining: effect.level >= 3 ? 1 : 0,
                homing: false,
                targetId: bossTarget?.id ?? target?.id ?? null,
                color: 0x74e8ff,
                sourceSkillId: 'autoTurret',
              });
              this.createMuzzleFlash(
                add(effect.position, scale(direction, 25)),
                direction,
                0x86efff,
                1.08,
              );
            }
            effect.tick = effect.level >= 2 ? 0.4 : 0.5;
          }
          break;
        }
        case 'mine': {
          if (effect.remaining <= 0 && !effect.chainTriggered) break;
          if (!effect.armed && effect.remaining < effect.duration - 0.45) {
            effect.armed = true;
            effect.visual.alpha = 1;
          }
          effect.visual.alpha = effect.armed ? 0.72 + Math.sin(this.elapsedSeconds * 8) * 0.25 : 0.45;
          if (effect.armed) {
            const target = this.monsterGrid.nearest(effect.position.x, effect.position.y, 38);
            const forcedChainDetonation = effect.chainTriggered && effect.remaining <= 0.13;
            if (target || forcedChainDetonation) {
              this.damageEnemiesInRadius(
                effect.position,
                effect.radius,
                effect.damage,
                'explosive',
                undefined,
                'landmines',
                effect.castId,
              );
              this.createExplosion(effect.position, effect.radius, 0xff9b32, true, 1);
              this.createSkillAtlasVfx(effect.position, 4, effect.radius * 2.45, 0.58, {
                startScale: 0.38,
                endScale: 1.16,
                fadeInFraction: 0.06,
                fadeOutStart: 0.52,
                fallbackColor: 0xffa12f,
                priority: 2,
              });
              this.audio.play('explosion', { volume: 0.58 });
              effect.remaining = 0;
              if (effect.level >= 5) {
                this.spawnMineFragments(effect.position, effect.damage * 0.3);
                for (const sibling of this.gameplayEffects) {
                  if (
                    sibling !== effect &&
                    sibling.kind === 'mine' &&
                    sibling.castId === effect.castId &&
                    sibling.remaining > 0
                  ) {
                    sibling.armed = true;
                    sibling.chainTriggered = true;
                    sibling.remaining = Math.min(sibling.remaining, 0.12 + sibling.index * 0.04);
                  }
                }
              }
            }
          }
          break;
        }
        case 'blade': {
          const angle =
            this.elapsedSeconds * (2.9 + effect.level * 0.12) +
            (effect.index / Math.max(1, effect.count)) * Math.PI * 2;
          effect.position = {
            x: player.position.x + Math.cos(angle) * 82,
            y: player.position.y + Math.sin(angle) * 82,
          };
          effect.visual.position.set(effect.position.x, effect.position.y);
          effect.visual.rotation = angle + Math.PI / 2;
          if (effect.tick <= 0) {
            const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
            this.createBladeTrail(effect.position, tangent);
            effect.tick = 0.1 / Math.max(0.35, this.quality.profile.trailDensity);
          }
          if (effect.level >= 5) {
            if (effect.pulseCooldown <= 0) {
              this.fireBladeShockwave(effect.position, { x: -Math.sin(angle), y: Math.cos(angle) }, effect.damage * 0.45);
              effect.pulseCooldown = 1;
            }
          }
          const candidates = this.monsterGrid.queryCircle(effect.position.x, effect.position.y, 24);
          for (const monster of candidates) {
            if (!monster.alive || this.sharedBladeHitCooldown(effect.castId, monster.id)) continue;
            const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
            this.damageMonster(
              monster,
              effect.damage,
              'kinetic',
              false,
              1,
              'orbitingBlades',
              tangent,
            );
            this.setSharedBladeHitCooldown(effect.castId, monster.id, 0.3);
          }
          if (this.boss?.alive && distance(effect.position, this.boss.position) < 24 + this.boss.radius) {
            if (!this.sharedBladeHitCooldown(effect.castId, 'boss')) {
              this.damageBoss(
                effect.damage,
                'kinetic',
                false,
                'orbitingBlades',
                { x: -Math.sin(angle), y: Math.cos(angle) },
              );
              this.setSharedBladeHitCooldown(effect.castId, 'boss', 0.3);
            }
          }
          break;
        }
        case 'barrier': {
          effect.position = { ...player.position };
          effect.visual.position.set(player.position.x, player.position.y);
          effect.visual.rotation += delta * 0.3;
          if (player.shield <= 0) effect.remaining = 0;
          if (effect.remaining <= 0) {
            const shatterDamage = effect.level >= 5 ? effect.damage * 1.3 : 0;
            if (shatterDamage > 0) {
              this.damageEnemiesInRadius(
                player.position,
                112,
                shatterDamage,
                'frost',
                undefined,
                'iceBarrier',
              );
              for (const monster of this.monsterGrid.queryCircle(player.position.x, player.position.y, 112)) {
                monster.frozenRemaining = Math.max(monster.frozenRemaining, 0.9);
                monster.frozenBySkillId = 'iceBarrier';
              }
            }
            player.shield = 0;
            player.maxShield = 0;
            this.createExplosion(player.position, 94, 0x8eeaff, true, 6);
          }
          break;
        }
        case 'drone': {
          const angle =
            this.elapsedSeconds * 1.5 +
            (effect.index / Math.max(1, effect.count)) * Math.PI * 2;
          const desired = {
            x: player.position.x + Math.cos(angle) * 68,
            y: player.position.y - 52 + Math.sin(angle) * 24,
          };
          effect.position.x = lerp(effect.position.x, desired.x, Math.min(1, delta * 8));
          effect.position.y = lerp(effect.position.y, desired.y, Math.min(1, delta * 8));
          effect.visual.position.set(effect.position.x, effect.position.y);
          effect.visual.rotation = Math.sin(this.elapsedSeconds * 3 + effect.index) * 0.12;
          if (effect.tick <= 0) {
            const target = this.monsterGrid.nearest(effect.position.x, effect.position.y, 560);
            const bossTarget =
              this.boss?.alive &&
              distance(this.boss.position, effect.position) <= 560 &&
              (this.boss.breakRemaining > 0 || !target ||
                distanceSquared(this.boss.position, effect.position) <
                  distanceSquared(target.position, effect.position))
                ? this.boss
                : null;
            const targetPosition = bossTarget?.position ?? target?.position;
            if (targetPosition) {
              const direction = normalize(subtract(targetPosition, effect.position));
              this.spawnBullet({
                enemy: false,
                position: add(effect.position, scale(direction, 20)),
                velocity: scale(direction, 720),
                radius: 4.5,
                damage: effect.damage * (effect.level >= 5 ? 0.7 : 1),
                damageType: 'kinetic',
                isBasic: false,
                remainingRange: 650,
                pierceRemaining: effect.level >= 3 ? 1 : 0,
                homing: false,
                targetId: bossTarget?.id ?? target?.id ?? null,
                color: 0xffe25d,
                sourceSkillId: 'attackDrone',
              });
              this.createMuzzleFlash(
                add(effect.position, scale(direction, 19)),
                direction,
                0xffdd64,
                0.82,
              );
            }
            effect.tick = 0.46;
          }
          break;
        }
      }
    }

    for (let index = this.gameplayEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.gameplayEffects[index];
      if (!effect || effect.remaining > 0) continue;
      if (effect.kind === 'turret') this.createCompanionDismissVfx(effect.position, 'autoTurret');
      if (effect.kind === 'drone') this.createCompanionDismissVfx(effect.position, 'attackDrone');
      effect.visual.removeFromParent();
      effect.visual.destroy();
      this.gameplayEffects.splice(index, 1);
    }
  }

  private castChainLightning(maxTargets: number, damage: number): void {
    const player = this.player;
    if (!player) return;
    this.createDirectionalBurst(player.position, this.lastAimDirection, 0x6fc8ff, 68, 0.38, 2);
    const hit = new Set<string>();
    const points: Vec2[] = [{ ...player.position }];
    let origin = { ...player.position };
    let remainingDamage = damage;

    for (let index = 0; index < maxTargets; index += 1) {
      const candidates: Array<MonsterActor | BossActor> = this.monsters.filter((monster) => {
        if (!monster.alive || MONSTERS[monster.monsterId].immunities.includes('lightning')) return false;
        return true;
      });
      if (this.boss?.alive) candidates.push(this.boss);
      const target = selectNextChainLightningTarget({
        origin,
        candidates,
        alreadyHitIds: hit,
        maxDistance: index === 0 ? CHAIN_LIGHTNING_INITIAL_RANGE : CHAIN_LIGHTNING_HOP_RANGE,
        ...(index === 0
          ? {
              aimDirection: this.lastAimDirection,
              minimumAimDot: CHAIN_LIGHTNING_INITIAL_AIM_DOT,
            }
          : {}),
      });
      if (!target) break;

      hit.add(target.id);
      points.push({ ...target.position });
      const impactDirection = normalize(subtract(target.position, origin));
      if (target.id === 'boss') {
        this.damageBoss(remainingDamage, 'lightning', false, 'chainLightning', impactDirection);
      } else {
        this.damageMonster(
          target as MonsterActor,
          remainingDamage,
          'lightning',
          false,
          1,
          'chainLightning',
          impactDirection,
        );
      }
      origin = { ...target.position };
      remainingDamage *= 0.9;
    }
    if (points.length > 1) {
      const lightning = new Graphics();
      lightning.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0);
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const point = points[index];
        if (!previous || !point) continue;
        const middle = midpoint(previous, point);
        lightning
          .lineTo(middle.x + (this.rng.next() - 0.5) * 26, middle.y + (this.rng.next() - 0.5) * 26)
          .lineTo(point.x, point.y);
      }
      lightning.stroke({ width: 7, color: 0x5abfff, alpha: 0.33 });
      lightning.stroke({ width: 2, color: 0xe5fbff, alpha: 1 });
      this.overEffectLayer.addChild(lightning);
      this.impacts.push({
        display: lightning,
        position: { x: 0, y: 0 },
        remaining: 0.34,
        duration: 0.34,
        velocity: { x: 0, y: 0 },
        screenSpace: false,
      });
      this.createSkillAtlasVfx(points.at(-1) ?? player.position, 3, 98, 0.54, {
        rotationSpeed: 0.55,
        startScale: 0.34,
        endScale: 1.16,
        fadeInFraction: 0.06,
        fadeOutStart: 0.55,
        fallbackColor: 0x6fbfff,
        priority: 2,
      });
    } else {
      const missEnd = add(player.position, scale(this.lastAimDirection, 180));
      this.createLightningMiss(player.position, missEnd);
      this.createSkillAtlasVfx(missEnd, 3, 76, 0.46, {
        startScale: 0.35,
        endScale: 1.08,
        fadeInFraction: 0.08,
        fadeOutStart: 0.5,
        fallbackColor: 0x6fbfff,
        priority: 2,
      });
    }
  }

  private damageEnemiesAlongSegment(
    start: Vec2,
    end: Vec2,
    width: number,
    damage: number,
    damageType: DamageType,
    onHit?: (monster: MonsterActor) => void,
    sourceSkillId: ActiveSkillId | null = null,
  ): number {
    const center = midpoint(start, end);
    const radius = distance(start, end) / 2 + width + 30;
    const candidates = this.monsterGrid.queryCircle(center.x, center.y, radius);
    let hits = 0;
    for (const monster of candidates) {
      if (!monster.alive || !pointNearSegment(monster.position, start, end, width + monster.radius)) {
        continue;
      }
      this.damageMonster(
        monster,
        damage,
        damageType,
        false,
        1,
        sourceSkillId,
        normalize(subtract(end, start)),
      );
      onHit?.(monster);
      hits += 1;
    }
    if (this.boss?.alive && pointNearSegment(this.boss.position, start, end, width + this.boss.radius)) {
      this.damageBoss(
        damage,
        damageType,
        false,
        sourceSkillId,
        normalize(subtract(end, start)),
      );
      hits += 1;
    }
    return hits;
  }

  private removeGameplayEffects(kind: GameplayEffectKind): void {
    for (let index = this.gameplayEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.gameplayEffects[index];
      if (!effect || effect.kind !== kind) continue;
      effect.visual.removeFromParent();
      effect.visual.destroy();
      this.gameplayEffects.splice(index, 1);
    }
  }

  private sharedBladeHitCooldown(castId: string, targetId: string): boolean {
    const key = `${castId}:${targetId}`;
    return this.gameplayEffects.some(
      (effect) => effect.kind === 'blade' && effect.castId === castId && effect.hitCooldowns.has(key),
    );
  }

  private setSharedBladeHitCooldown(castId: string, targetId: string, seconds: number): void {
    const key = `${castId}:${targetId}`;
    for (const effect of this.gameplayEffects) {
      if (effect.kind === 'blade' && effect.castId === castId) {
        effect.hitCooldowns.set(key, seconds);
      }
    }
  }

  private updateVisuals(delta: number): void {
    const player = this.player;
    if (player) {
      player.visual.root.position.set(player.position.x, player.position.y);
      player.visual.root.zIndex = player.position.y;
      const normalizedAngle = ((player.facing + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      const frameIndex = Math.round(normalizedAngle * 8) % 8;
      player.visual.sprite.texture =
        this.textures?.playerFrames[frameIndex] ?? player.visual.sprite.texture;
      player.visual.sprite.tint = player.hitFlash > 0 ? 0xff867c : 0xffffff;
      player.visual.fallback.tint = player.hitFlash > 0 ? 0xff867c : 0xffffff;
      const bob = player.dashRemaining > 0 ? 0 : Math.sin(this.elapsedSeconds * 9) * 1.3;
      player.visual.sprite.position.y = -PLAYER_RADIUS * 0.42 + bob;
    }

    for (let index = this.impacts.length - 1; index >= 0; index -= 1) {
      const impact = this.impacts[index];
      if (!impact) continue;
      impact.remaining -= delta;
      impact.position.x += impact.velocity.x * delta;
      impact.position.y += impact.velocity.y * delta;
      const progress = clamp(1 - impact.remaining / impact.duration, 0, 1);
      const fadeInFraction = impact.fadeInFraction ?? 0;
      const fadeIn = fadeInFraction > 0 ? clamp(progress / fadeInFraction, 0, 1) : 1;
      const fadeOutStart = impact.fadeOutStart ?? 0;
      const fadeOut =
        progress <= fadeOutStart
          ? 1
          : 1 - (progress - fadeOutStart) / Math.max(0.001, 1 - fadeOutStart);
      impact.display.alpha = (impact.baseAlpha ?? 1) * fadeIn * clamp(fadeOut, 0, 1);
      if (!impact.screenSpace) impact.display.position.set(impact.position.x, impact.position.y);
      if (impact.baseScale) {
        const scaleFactor = lerp(impact.startScale ?? 1, impact.endScale ?? 1, progress);
        impact.display.scale.set(
          impact.baseScale.x * scaleFactor,
          impact.baseScale.y * scaleFactor,
        );
      }
      const rotationSpeed =
        impact.rotationSpeed ?? (impact.display instanceof Sprite ? 1.3 : 0);
      impact.display.rotation += delta * rotationSpeed;
      if (impact.remaining <= 0) {
        impact.display.removeFromParent();
        impact.display.destroy({ children: true });
        this.impacts.splice(index, 1);
      }
    }

    this.shakeRemaining = Math.max(0, this.shakeRemaining - delta);
  }

  private updateCamera(): void {
    const app = this.app;
    const player = this.player;
    if (!app || !player) return;
    const viewWidth = app.renderer.screen.width;
    const viewHeight = app.renderer.screen.height;
    const compactLandscape = viewWidth > viewHeight && viewHeight <= 600;
    const minimumScale = compactLandscape ? 0.54 : 0.72;
    const cameraScale = clamp(Math.min(viewWidth / 1_280, viewHeight / 720), minimumScale, 1.18);
    this.world.scale.set(cameraScale);
    const scaledWidth = this.worldWidth * cameraScale;
    const scaledHeight = this.worldHeight * cameraScale;
    let worldX = viewWidth / 2 - player.position.x * cameraScale;
    let worldY = viewHeight / 2 - player.position.y * cameraScale;
    worldX =
      scaledWidth <= viewWidth
        ? (viewWidth - scaledWidth) / 2
        : clamp(worldX, viewWidth - scaledWidth, 0);
    worldY =
      scaledHeight <= viewHeight
        ? (viewHeight - scaledHeight) / 2
        : clamp(worldY, viewHeight - scaledHeight, 0);
    if (this.shakeRemaining > 0 && this.quality.profile.screenShake) {
      const falloff = Math.min(1, this.shakeRemaining / 0.24);
      worldX += (this.rng.next() - 0.5) * this.shakeStrength * 2 * falloff;
      worldY += (this.rng.next() - 0.5) * this.shakeStrength * 2 * falloff;
    }
    this.world.position.set(worldX, worldY);
    this.playerScreenPosition = {
      x: worldX + player.position.x * cameraScale,
      y: worldY + player.position.y * cameraScale,
    };
    this.positionBossWarning();
  }

  private screenToWorld(point: Vec2): Vec2 {
    const scaleX = this.world.scale.x || 1;
    const scaleY = this.world.scale.y || 1;
    return {
      x: (point.x - this.world.position.x) / scaleX,
      y: (point.y - this.world.position.y) / scaleY,
    };
  }

  private createMuzzleFlash(
    position: Vec2,
    direction: Vec2,
    color = 0xfff0a6,
    sizeMultiplier = 1,
  ): void {
    if (!this.hasTransientVfxCapacity(0)) return;
    const flash = new Graphics();
    flash
      .poly([
        0,
        -7 * sizeMultiplier,
        28 * sizeMultiplier,
        0,
        0,
        7 * sizeMultiplier,
        7 * sizeMultiplier,
        0,
      ])
      .fill({ color, alpha: 0.95 });
    flash.rotation = Math.atan2(direction.y, direction.x);
    flash.position.set(position.x, position.y);
    this.overEffectLayer.addChild(flash);
    this.impacts.push({
      display: flash,
      position: { ...position },
      remaining: 0.11,
      duration: 0.11,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      priority: 0,
    });
  }

  private createDashTrail(position: Vec2, direction: Vec2): void {
    const trail = new Graphics();
    trail
      .moveTo(position.x, position.y)
      .lineTo(position.x - direction.x * 105, position.y - direction.y * 105)
      .stroke({ width: 24, color: 0x43d6ff, alpha: 0.2 })
      .moveTo(position.x, position.y)
      .lineTo(position.x - direction.x * 105, position.y - direction.y * 105)
      .stroke({ width: 6, color: 0xc9f8ff, alpha: 0.72 });
    this.underEffectLayer.addChild(trail);
    this.impacts.push({
      display: trail,
      position: { x: 0, y: 0 },
      remaining: 0.24,
      duration: 0.24,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
    });
    this.createAtlasVfx(position, 7, 96, 0.38, {
      rotation: Math.atan2(direction.y, direction.x),
      rotationSpeed: 0,
      startScale: 0.42,
      endScale: 1.2,
      fadeInFraction: 0.05,
      fadeOutStart: 0.4,
      fallbackColor: 0x72e8ff,
      priority: 2,
    });
  }

  private createSpawnEffect(position: Vec2, elite: boolean): void {
    const portal = new Graphics();
    portal
      .circle(0, 0, elite ? 46 : 31)
      .fill({ color: elite ? 0xff9a39 : 0x8d42e8, alpha: 0.13 })
      .stroke({ width: elite ? 5 : 3, color: elite ? 0xffbf63 : 0xbc78ff, alpha: 0.72 });
    portal.position.set(position.x, position.y);
    this.underEffectLayer.addChild(portal);
    this.impacts.push({
      display: portal,
      position: { ...position },
      remaining: 0.52,
      duration: 0.52,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
    });
  }

  private createExplosion(
    position: Vec2,
    radius: number,
    color: number,
    strong: boolean,
    atlasFrame = 1,
  ): void {
    const explosion = new Graphics();
    explosion
      .circle(0, 0, radius * 0.78)
      .fill({ color, alpha: strong ? 0.28 : 0.16 })
      .circle(0, 0, radius)
      .stroke({ width: strong ? 6 : 3, color, alpha: 0.84 });
    explosion.position.set(position.x, position.y);
    this.overEffectLayer.addChild(explosion);
    this.impacts.push({
      display: explosion,
      position: { ...position },
      remaining: strong ? 0.48 : 0.28,
      duration: strong ? 0.48 : 0.28,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
    });
    this.createAtlasVfx(position, atlasFrame, radius * 2.35, strong ? 0.58 : 0.38, {
      rotation: this.rng.next() * Math.PI * 2,
      rotationSpeed: strong ? 0.55 : 0.25,
      startScale: strong ? 0.28 : 0.4,
      endScale: strong ? 1.2 : 1.08,
      fadeInFraction: 0.06,
      fadeOutStart: strong ? 0.48 : 0.35,
      fallbackColor: color,
      priority: strong ? 2 : 1,
    });
    if (strong) this.createScreenShake(Math.min(12, radius * 0.055));
  }

  private createPulse(position: Vec2, radius: number, color: number, duration: number): void {
    const pulse = new Graphics();
    pulse
      .circle(0, 0, radius * 0.72)
      .fill({ color, alpha: 0.1 })
      .circle(0, 0, radius)
      .stroke({ width: 4, color, alpha: 0.72 });
    pulse.position.set(position.x, position.y);
    this.underEffectLayer.addChild(pulse);
    this.impacts.push({
      display: pulse,
      position: { ...position },
      remaining: duration,
      duration,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
    });
  }

  private createBeamImpact(
    position: Vec2,
    direction: Vec2,
    lengthValue: number,
    color: number,
    width: number,
  ): void {
    const beam = new Graphics();
    beam
      .moveTo(position.x, position.y)
      .lineTo(position.x + direction.x * lengthValue, position.y + direction.y * lengthValue)
      .stroke({ width: width * 2.2, color, alpha: 0.2 })
      .moveTo(position.x, position.y)
      .lineTo(position.x + direction.x * lengthValue, position.y + direction.y * lengthValue)
      .stroke({ width, color: 0xf6ddff, alpha: 0.9 });
    this.overEffectLayer.addChild(beam);
    this.impacts.push({
      display: beam,
      position: { x: 0, y: 0 },
      remaining: 0.32,
      duration: 0.32,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
    });
  }

  private createDamageNumber(
    position: Vec2,
    amount: number,
    damageType: DamageType,
    playerDamage = false,
  ): void {
    if (this.impacts.filter((impact) => impact.display instanceof Text).length >= this.quality.profile.maxDamageNumbers) {
      return;
    }
    const label = new Text({
      text: `${Math.max(1, Math.round(amount))}`,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: playerDamage ? 22 : 17,
        fontWeight: '800',
        fill: playerDamage ? 0xffd2cf : damageColor(damageType),
        stroke: { color: 0x071017, width: 4 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(position.x, position.y - 30);
    this.overEffectLayer.addChild(label);
    this.impacts.push({
      display: label,
      position: { x: position.x, y: position.y - 30 },
      remaining: 0.62,
      duration: 0.62,
      velocity: { x: (this.rng.next() - 0.5) * 18, y: -42 },
      screenSpace: false,
    });
  }

  private createHitSpark(
    position: Vec2,
    damageType: DamageType,
    sourceSkillId: ActiveSkillId | null = null,
    impactDirection: Vec2 | null = null,
    targetKey = 'world',
  ): void {
    if (sourceSkillId === 'landmines') return;
    const interval =
      sourceSkillId === 'flameBeam' ? 0.28 : sourceSkillId === 'gravityWell' ? 0.18 : 0.035;
    const rateKey = `hit:${sourceSkillId ?? damageType}:${targetKey}`;
    if (!this.shouldEmitVfx(rateKey, interval)) return;
    const rotation = impactDirection
      ? Math.atan2(impactDirection.y, impactDirection.x)
      : this.rng.next() * Math.PI * 2;

    switch (sourceSkillId) {
      case 'homingMissiles':
        this.createExplosion(position, 42, 0xff8a2f, false, 1);
        this.createSkillAtlasVfx(position, 0, 98, 0.48, {
          rotation,
          rotationSpeed: 0.35,
          startScale: 0.32,
          endScale: 1.16,
          fadeInFraction: 0.05,
          fadeOutStart: 0.5,
          fallbackColor: 0xff8a2f,
          priority: 2,
        });
        return;
      case 'flameBeam':
        this.createSkillAtlasVfx(position, 2, 74, 0.4, {
          rotationSpeed: 0.18,
          startScale: 0.45,
          endScale: 1.08,
          fadeInFraction: 0.06,
          fadeOutStart: 0.48,
          fallbackColor: 0xff5425,
          priority: 1,
        });
        return;
      case 'chainLightning':
        this.createSkillAtlasVfx(position, 3, 72, 0.42, {
          rotation,
          rotationSpeed: 0.5,
          startScale: 0.38,
          endScale: 1.1,
          fadeInFraction: 0.05,
          fadeOutStart: 0.52,
          fallbackColor: 0x66bfff,
          priority: 1,
        });
        return;
      case 'orbitingBlades':
        this.createSkillAtlasVfx(position, 5, 78, 0.36, {
          rotation,
          rotationSpeed: 0,
          startScale: 0.5,
          endScale: 1.14,
          fadeInFraction: 0.04,
          fadeOutStart: 0.44,
          fallbackColor: 0x7deaff,
          priority: 1,
        });
        return;
      case 'autoTurret':
        this.createAtlasVfx(position, 0, 52, 0.3, {
          rotation,
          rotationSpeed: 0,
          startScale: 0.45,
          endScale: 1.12,
          fadeOutStart: 0.36,
          tint: 0x78e7ff,
          fallbackColor: 0x78e7ff,
          priority: 1,
        });
        return;
      case 'attackDrone':
        this.createAtlasVfx(position, 0, 58, 0.32, {
          rotation,
          rotationSpeed: 0,
          startScale: 0.42,
          endScale: 1.14,
          fadeOutStart: 0.38,
          tint: 0xffdc66,
          fallbackColor: 0xffdc66,
          priority: 1,
        });
        return;
      default:
        break;
    }

    const frame =
      damageType === 'frost'
        ? 2
        : damageType === 'gravity'
          ? 3
          : damageType === 'fire'
            ? 4
            : damageType === 'lightning'
              ? 5
              : 0;
    this.createAtlasVfx(position, frame, damageType === 'kinetic' ? 44 : 62, 0.3, {
      rotation,
      rotationSpeed: frame === 4 ? 0 : 0.65,
      startScale: 0.48,
      endScale: 1.08,
      fadeInFraction: 0.04,
      fadeOutStart: 0.34,
      fallbackColor: damageColor(damageType),
      priority: 0,
    });
  }

  private createAtlasVfx(
    position: Vec2,
    frameIndex: number,
    size: number,
    duration: number,
    options: AtlasVfxOptions = {},
  ): void {
    const texture = this.textures?.vfxFrames[frameIndex];
    this.createTextureVfx(texture, position, size, duration, options);
  }

  private createSkillAtlasVfx(
    position: Vec2,
    frameIndex: number,
    size: number,
    duration: number,
    options: AtlasVfxOptions = {},
  ): void {
    const texture = this.textures?.skillVfxFrames[frameIndex];
    this.createTextureVfx(texture, position, size, duration, options);
  }

  private createTextureVfx(
    texture: Texture | undefined,
    position: Vec2,
    size: number,
    duration: number,
    options: AtlasVfxOptions,
  ): void {
    const priority = options.priority ?? 1;
    if (!this.hasTransientVfxCapacity(priority)) return;
    if (!texture || texture === Texture.WHITE) {
      this.createFallbackVfx(
        position,
        size,
        duration,
        options.fallbackColor ?? 0xdffaff,
        options,
      );
      return;
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.tint = options.tint ?? 0xffffff;
    sprite.width = size;
    sprite.height = size;
    sprite.rotation = options.rotation ?? 0;
    sprite.position.set(position.x, position.y);
    const baseScale = { x: sprite.scale.x, y: sprite.scale.y };
    const startScale = options.startScale ?? 1;
    sprite.scale.set(baseScale.x * startScale, baseScale.y * startScale);
    if ((options.fadeInFraction ?? 0) > 0) sprite.alpha = 0;
    this.overEffectLayer.addChild(sprite);
    this.impacts.push({
      display: sprite,
      position: { ...position },
      remaining: duration,
      duration,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      baseAlpha: 1,
      baseScale,
      startScale,
      endScale: options.endScale ?? 1,
      fadeInFraction: options.fadeInFraction ?? 0,
      fadeOutStart: options.fadeOutStart ?? 0,
      rotationSpeed: options.rotationSpeed ?? 0.45,
      priority,
    });
  }

  private createFallbackVfx(
    position: Vec2,
    size: number,
    duration: number,
    color: number,
    options: AtlasVfxOptions,
  ): void {
    const burst = new Graphics();
    const radius = size * 0.34;
    burst
      .circle(0, 0, radius * 0.34)
      .fill({ color, alpha: 0.75 })
      .circle(0, 0, radius)
      .stroke({ width: Math.max(2, size * 0.045), color, alpha: 0.9 })
      .moveTo(-radius * 1.25, 0)
      .lineTo(radius * 1.25, 0)
      .moveTo(0, -radius * 1.25)
      .lineTo(0, radius * 1.25)
      .stroke({ width: Math.max(2, size * 0.035), color, alpha: 0.74 });
    burst.blendMode = 'add';
    burst.rotation = options.rotation ?? 0;
    burst.position.set(position.x, position.y);
    const startScale = options.startScale ?? 1;
    burst.scale.set(startScale);
    if ((options.fadeInFraction ?? 0) > 0) burst.alpha = 0;
    this.overEffectLayer.addChild(burst);
    this.impacts.push({
      display: burst,
      position: { ...position },
      remaining: duration,
      duration,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      baseAlpha: 1,
      baseScale: { x: 1, y: 1 },
      startScale,
      endScale: options.endScale ?? 1,
      fadeInFraction: options.fadeInFraction ?? 0,
      fadeOutStart: options.fadeOutStart ?? 0,
      rotationSpeed: options.rotationSpeed ?? 0.45,
      priority: options.priority ?? 1,
    });
  }

  private hasTransientVfxCapacity(priority: VfxPriority): boolean {
    const limit = clamp(Math.floor(this.quality.profile.maxParticles * 0.18), 36, 132);
    const active = this.impacts.reduce(
      (count, impact) => count + (impact.display instanceof Text ? 0 : 1),
      0,
    );
    return active < limit + (priority === 2 ? 12 : 0);
  }

  private shouldEmitVfx(key: string, interval: number): boolean {
    const readyAt = this.vfxRateLimits.get(key) ?? -1;
    if (this.elapsedSeconds < readyAt) return false;
    this.vfxRateLimits.set(key, this.elapsedSeconds + interval);
    if (this.vfxRateLimits.size > 384) {
      for (const [candidate, candidateReadyAt] of this.vfxRateLimits) {
        if (candidateReadyAt <= this.elapsedSeconds) this.vfxRateLimits.delete(candidate);
      }
    }
    return true;
  }

  private createDirectionalBurst(
    position: Vec2,
    direction: Vec2,
    color: number,
    size: number,
    duration: number,
    priority: VfxPriority,
  ): void {
    if (!this.hasTransientVfxCapacity(priority)) return;
    const burst = new Graphics();
    burst
      .circle(0, 0, size * 0.18)
      .fill({ color, alpha: 0.68 })
      .poly([
        -size * 0.12,
        -size * 0.17,
        size * 0.7,
        0,
        -size * 0.12,
        size * 0.17,
        size * 0.08,
        0,
      ])
      .fill({ color, alpha: 0.86 });
    burst.blendMode = 'add';
    burst.rotation = Math.atan2(direction.y, direction.x);
    burst.position.set(position.x, position.y);
    this.overEffectLayer.addChild(burst);
    this.impacts.push({
      display: burst,
      position: { ...position },
      remaining: duration,
      duration,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      baseScale: { x: 1, y: 1 },
      startScale: 0.42,
      endScale: 1.14,
      fadeInFraction: 0.06,
      fadeOutStart: 0.42,
      rotationSpeed: 0,
      priority,
    });
  }

  private createMissileTrail(position: Vec2, direction: Vec2): void {
    if (!this.hasTransientVfxCapacity(0)) return;
    const trail = new Graphics();
    trail
      .moveTo(0, 0)
      .lineTo(-direction.x * 28, -direction.y * 28)
      .stroke({ width: 11, color: 0xff6a22, alpha: 0.18 })
      .moveTo(0, 0)
      .lineTo(-direction.x * 22, -direction.y * 22)
      .stroke({ width: 4, color: 0xffd36b, alpha: 0.82 });
    trail.blendMode = 'add';
    trail.position.set(position.x, position.y);
    this.projectileLayer.addChild(trail);
    this.impacts.push({
      display: trail,
      position: { ...position },
      remaining: 0.2,
      duration: 0.2,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      baseScale: { x: 1, y: 1 },
      startScale: 1,
      endScale: 0.38,
      fadeOutStart: 0.08,
      rotationSpeed: 0,
      priority: 0,
    });
  }

  private createBladeTrail(position: Vec2, direction: Vec2): void {
    if (!this.hasTransientVfxCapacity(0)) return;
    const trail = new Graphics();
    trail
      .moveTo(-direction.x * 28, -direction.y * 28)
      .lineTo(direction.x * 14, direction.y * 14)
      .stroke({ width: 10, color: 0x56dfff, alpha: 0.18 })
      .moveTo(-direction.x * 23, -direction.y * 23)
      .lineTo(direction.x * 11, direction.y * 11)
      .stroke({ width: 3, color: 0xe3fbff, alpha: 0.84 });
    trail.blendMode = 'add';
    trail.position.set(position.x, position.y);
    this.overEffectLayer.addChild(trail);
    this.impacts.push({
      display: trail,
      position: { ...position },
      remaining: 0.18,
      duration: 0.18,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      baseScale: { x: 1, y: 1 },
      startScale: 1,
      endScale: 0.62,
      fadeOutStart: 0.12,
      rotationSpeed: 0,
      priority: 0,
    });
  }

  private createGravityCollapse(position: Vec2, radius: number): void {
    this.createAtlasVfx(position, 3, radius * 1.85, 0.58, {
      rotationSpeed: 1.8,
      startScale: 1.18,
      endScale: 0.16,
      fadeInFraction: 0,
      fadeOutStart: 0.58,
      fallbackColor: 0xba63ff,
      priority: 2,
    });
    this.createPulse(position, radius * 0.84, 0xbc69ff, 0.38);
  }

  private createLightningMiss(start: Vec2, end: Vec2): void {
    if (!this.hasTransientVfxCapacity(2)) return;
    const miss = new Graphics();
    const middle = midpoint(start, end);
    miss
      .moveTo(start.x, start.y)
      .lineTo(middle.x - 12, middle.y + 9)
      .lineTo(end.x, end.y)
      .stroke({ width: 12, color: 0x489dff, alpha: 0.2 })
      .moveTo(start.x, start.y)
      .lineTo(middle.x - 12, middle.y + 9)
      .lineTo(end.x, end.y)
      .stroke({ width: 3, color: 0xe8fbff, alpha: 0.94 });
    this.overEffectLayer.addChild(miss);
    this.impacts.push({
      display: miss,
      position: { x: 0, y: 0 },
      remaining: 0.3,
      duration: 0.3,
      velocity: { x: 0, y: 0 },
      screenSpace: false,
      fadeOutStart: 0.38,
      priority: 2,
    });
  }

  private createCompanionDismissVfx(
    position: Vec2,
    sourceSkillId: 'autoTurret' | 'attackDrone',
  ): void {
    const turret = sourceSkillId === 'autoTurret';
    const color = turret ? 0x65e5ff : 0xffd75e;
    this.createSkillAtlasVfx(position, turret ? 6 : 7, turret ? 96 : 104, 0.52, {
      rotationSpeed: turret ? -0.5 : 0.65,
      startScale: 1.06,
      endScale: 0.2,
      fadeOutStart: 0.18,
      fallbackColor: color,
      priority: 2,
    });
    this.createPulse(position, turret ? 32 : 38, color, 0.34);
  }

  private createScreenShake(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeRemaining = Math.max(this.shakeRemaining, 0.24);
  }

  private finishRun(victory: boolean): void {
    if (this.status === 'victory' || this.status === 'defeat') return;
    this.status = victory ? 'victory' : 'defeat';
    if (victory && this.state.can('BOSS_DIED')) this.state.dispatch('BOSS_DIED');
    if (!victory && this.state.can('PLAYER_DIED')) this.state.dispatch('PLAYER_DIED');
    this.attackCoordinator.releaseAll();
    const playerHealth = Math.max(0, this.player?.health ?? 0);
    const playerMaxHealth = Math.max(1, this.player?.maxHealth ?? (this.options.playerMaxHealth ?? 100));
    const healthRatio = Math.max(0, Math.min(1, playerHealth / playerMaxHealth));
    const result: RuntimeResult = {
      victory,
      stage: this.currentStage,
      stars: calculateStageStars({ victory, hpRatio: healthRatio }),
      playerHealth,
      playerMaxHealth,
      healthRatio,
      deployed: this.director.deployedCount,
      kills: this.kills,
      finalLevel: this.experience.level,
      durationSeconds: this.elapsedSeconds,
      bossDefeated: victory,
      bossName: this.boss?.definition.name ?? this.requireStageBoss().name,
      equippedSkills: this.getEquippedSkills(),
      upgrades: [...this.appliedUpgradeIds],
    };
    if (victory) this.options.onVictory?.(result);
    else this.options.onDefeat?.(result);
    this.emitSnapshot(true);
  }

  private setCurrentStage(stage: number): void {
    this.currentStage = clampStage(stage);
    this.stageDefinition = getStageDefinition(this.currentStage);
    this.applyStageArenaTheme();
  }

  private applyStageArenaTheme(): void {
    const textures = this.textures;
    if (!textures) return;
    const frontIndex = Math.min(4, Math.floor((this.currentStage - 1) / 4));
    const texture = textures.arenaFronts[frontIndex] ?? textures.arena;
    if (this.arenaSprite && texture !== Texture.WHITE) this.arenaSprite.texture = texture;

    const stageWithinFront = (this.currentStage - 1) % 4;
    const tintPalette = [0x10283a, 0x386b15, 0x69bfff, 0x7e35b5, 0xb51f50] as const;
    this.arenaStageTint?.clear()
      .rect(0, 0, this.worldWidth, this.worldHeight)
      .fill({
        color: tintPalette[frontIndex] ?? 0x10283a,
        alpha: stageWithinFront * 0.025,
      });
  }

  private requireStageBoss(): BossEncounterDefinition {
    const definition = getStageBoss(this.currentStage);
    if (!definition) throw new Error(`No boss encounter configured for stage ${this.currentStage}.`);
    return definition;
  }

  private stageSeed(): string {
    return `${String(this.seed)}:stage:${this.currentStage}`;
  }

  private aliveSummonCount(): number {
    return this.monsters.reduce(
      (count, monster) => count + (monster.alive && monster.source !== 'director' ? 1 : 0),
      0,
    );
  }

  private removeAllMonstersForVictory(): void {
    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      monster.alive = false;
      monster.aiState = 'dead';
      this.attackCoordinator.release(monster.id);
      this.clearMonsterTelegraph(monster);
      this.createExplosion(monster.position, monster.radius * 1.5, 0xb254e8, false, 3);
    }
    for (const bullet of this.bullets) {
      if (bullet.enemy) this.deactivateBullet(bullet);
    }
    // Victory freezes fixed updates, so perform the normal removal pass now instead
    // of leaving defeated enemies and inactive hostile projectiles on the result screen.
    this.cleanupEntities();
  }

  private applyImmediatePassive(passiveId: PassiveUpgradeId, previousLevel: number): void {
    const player = this.player;
    if (!player) return;
    if (passiveId === 'reinforcedArmor') {
      const levelsAdded = Math.max(1, (this.build.passiveLevels[passiveId] ?? 0) - previousLevel);
      player.maxHealth += levelsAdded * 20;
      player.health = Math.min(player.maxHealth, player.health + levelsAdded * 20);
    } else if (passiveId === 'emergencyRepair') {
      this.healPlayer(30);
    }
  }

  private skillCooldown(skillId: ActiveSkillId, level: number): number {
    const definition = ACTIVE_SKILLS[skillId];
    const levelDefinition = definition.levels[Math.max(0, level - 1)] ?? definition.levels[0];
    const coolantReduction = Math.min(0.4, this.passiveLevel('coolantUnit') * 0.08);
    return definition.baseCooldownSeconds * (levelDefinition?.cooldownMultiplier ?? 1) * (1 - coolantReduction);
  }

  private dashCooldownTotal(): number {
    return BASE_DASH_COOLDOWN * (1 - this.passiveLevel('enhancedDash') * 0.15);
  }

  private passiveLevel(id: PassiveUpgradeId): number {
    return this.build.passiveLevels[id] ?? 0;
  }

  private getEquippedSkills(): ActiveSkillId[] {
    return (Object.keys(this.build.activeSkills) as ActiveSkillId[])
      .filter((id) => (this.build.activeSkills[id] ?? 0) > 0)
      .slice(0, 3);
  }

  private emitSnapshot(force: boolean): void {
    if (!force && this.snapshotClock < SNAPSHOT_INTERVAL) return;
    this.snapshotClock = 0;
    this.options.onSnapshot?.(this.getSnapshot());
  }

  private nextId(prefix: string): string {
    this.idSerial += 1;
    return `${prefix}-${this.idSerial}`;
  }

  private assertReady(): void {
    if (!this.initialized || !this.app || !this.textures) {
      throw new Error('GameRuntime.init() must finish before this operation.');
    }
    if (this.destroyed) throw new Error('The game runtime has been destroyed.');
  }
}

function makeInitialBuild(
  provided: PlayerBuild | undefined,
  initialSkills: readonly ActiveSkillId[] | undefined,
): PlayerBuild {
  if (provided) return cloneBuild(provided);
  const activeSkills: Partial<Record<ActiveSkillId, number>> = {};
  for (const skillId of (initialSkills ?? DEFAULT_SKILLS).slice(0, 3)) activeSkills[skillId] = 1;
  return { activeSkills, passiveLevels: {} };
}

function cloneBuild(build: PlayerBuild): PlayerBuild {
  return {
    activeSkills: { ...build.activeSkills },
    passiveLevels: { ...build.passiveLevels },
  };
}

function skillName(id: ActiveSkillId): string {
  return ACTIVE_SKILLS[id].name;
}

function damageColor(type: DamageType): number {
  switch (type) {
    case 'explosive':
      return 0xff9d3d;
    case 'fire':
      return 0xff633a;
    case 'frost':
      return 0x7ee9ff;
    case 'lightning':
      return 0x7cbcff;
    case 'gravity':
      return 0xc77aff;
    default:
      return 0xe9f7ff;
  }
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(vector: Vec2, multiplier: number): Vec2 {
  return { x: vector.x * multiplier, y: vector.y * multiplier };
}

function rotate(vector: Vec2, radians: number): Vec2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector);
  return magnitude <= 0.0001 ? { x: 0, y: 0 } : scale(vector, 1 / magnitude);
}

function length(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

function lengthSquared(vector: Vec2): number {
  return vector.x * vector.x + vector.y * vector.y;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceSquared(a: Vec2, b: Vec2): number {
  return square(a.x - b.x) + square(a.y - b.y);
}

function square(value: number): number {
  return value * value;
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function usesRangedMonsterAttack(monster: MonsterActor): boolean {
  return (
    monster.role === 'ranged' ||
    monster.role === 'support' ||
    monster.monsterId === 'cryoSentinel' ||
    monster.monsterId === 'siegeCrawler'
  );
}

function bossSlamRadius(boss: BossActor): number {
  if ((boss.selectedPattern?.radius ?? 0) > 0) return boss.selectedPattern?.radius ?? 130;
  if (boss.definition.id === 'plagueOvermind') return 185;
  return boss.phase === 3 ? 165 : 130;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function lerpRgbColor(from: number, to: number, amount: number): number {
  const progress = clamp(amount, 0, 1);
  const fromRed = (from >> 16) & 0xff;
  const fromGreen = (from >> 8) & 0xff;
  const fromBlue = from & 0xff;
  const toRed = (to >> 16) & 0xff;
  const toGreen = (to >> 8) & 0xff;
  const toBlue = to & 0xff;
  return (
    (Math.round(lerp(fromRed, toRed, progress)) << 16) |
    (Math.round(lerp(fromGreen, toGreen, progress)) << 8) |
    Math.round(lerp(fromBlue, toBlue, progress))
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampPointToRange(origin: Vec2, point: Vec2, maximumRange: number): Vec2 {
  const difference = subtract(point, origin);
  const magnitude = length(difference);
  return magnitude <= maximumRange || magnitude <= 0.001
    ? { ...point }
    : add(origin, scale(difference, maximumRange / magnitude));
}

function pointNearSegment(point: Vec2, start: Vec2, end: Vec2, width: number): boolean {
  const segment = subtract(end, start);
  const segmentLengthSquared = lengthSquared(segment);
  if (segmentLengthSquared <= 0.001) return distance(point, start) <= width;
  const t = clamp(dot(subtract(point, start), segment) / segmentLengthSquared, 0, 1);
  const closest = add(start, scale(segment, t));
  return distanceSquared(point, closest) <= width * width;
}
