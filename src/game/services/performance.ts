export type QualityTier = 'high' | 'balanced' | 'low';
export type QualityPreference = 'auto' | QualityTier;

export interface QualityProfile {
  tier: QualityTier;
  maxParticles: number;
  maxDamageNumbers: number;
  trailDensity: number;
  effectResolution: number;
  screenShake: boolean;
  softShadows: boolean;
  cullMargin: number;
  aiUpdateStride: number;
}

export const QUALITY_PROFILES: Readonly<Record<QualityTier, Readonly<QualityProfile>>> = {
  high: Object.freeze({
    tier: 'high',
    maxParticles: 700,
    maxDamageNumbers: 80,
    trailDensity: 1,
    effectResolution: 1,
    screenShake: true,
    softShadows: true,
    cullMargin: 180,
    aiUpdateStride: 1,
  }),
  balanced: Object.freeze({
    tier: 'balanced',
    maxParticles: 380,
    maxDamageNumbers: 48,
    trailDensity: 0.65,
    effectResolution: 0.8,
    screenShake: true,
    softShadows: false,
    cullMargin: 120,
    aiUpdateStride: 2,
  }),
  low: Object.freeze({
    tier: 'low',
    maxParticles: 180,
    maxDamageNumbers: 24,
    trailDensity: 0.35,
    effectResolution: 0.6,
    screenShake: false,
    softShadows: false,
    cullMargin: 60,
    aiUpdateStride: 3,
  }),
};

export interface PerformanceSnapshot {
  fps: number;
  averageFrameMs: number;
  worstFrameMs: number;
  p95FrameMs: number;
  sampleCount: number;
  jankRatio: number;
}

export interface PerformanceMonitorOptions {
  windowSize?: number;
  jankThresholdMs?: number;
}

export class PerformanceMonitor {
  private readonly samples: number[];
  private readonly jankThresholdMs: number;
  private cursor = 0;
  private count = 0;
  private sum = 0;

  constructor(options: PerformanceMonitorOptions = {}) {
    const windowSize = Math.max(30, Math.floor(options.windowSize ?? 180));
    this.samples = new Array<number>(windowSize).fill(0);
    this.jankThresholdMs = options.jankThresholdMs ?? 25;
  }

  recordFrame(deltaMs: number): PerformanceSnapshot {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return this.snapshot;
    // Long background gaps should not cause a quality downgrade after resume.
    const sample = Math.min(deltaMs, 100);
    if (this.count === this.samples.length) this.sum -= this.samples[this.cursor]!;
    else this.count += 1;
    this.samples[this.cursor] = sample;
    this.sum += sample;
    this.cursor = (this.cursor + 1) % this.samples.length;
    return this.snapshot;
  }

  get snapshot(): PerformanceSnapshot {
    if (this.count === 0) {
      return {
        fps: 60,
        averageFrameMs: 16.67,
        worstFrameMs: 16.67,
        p95FrameMs: 16.67,
        sampleCount: 0,
        jankRatio: 0,
      };
    }
    const values = this.samples.slice(0, this.count).sort((a, b) => a - b);
    const averageFrameMs = this.sum / this.count;
    const p95Index = Math.min(values.length - 1, Math.floor(values.length * 0.95));
    const jankFrames = values.filter((value) => value >= this.jankThresholdMs).length;
    return {
      fps: Math.min(240, 1_000 / averageFrameMs),
      averageFrameMs,
      worstFrameMs: values[values.length - 1]!,
      p95FrameMs: values[p95Index]!,
      sampleCount: this.count,
      jankRatio: jankFrames / this.count,
    };
  }

  reset(): void {
    this.samples.fill(0);
    this.cursor = 0;
    this.count = 0;
    this.sum = 0;
  }
}

export interface AdaptiveQualityOptions {
  preference?: QualityPreference;
  initialTier?: QualityTier;
  minimumSamples?: number;
  downgradeFps?: number;
  upgradeFps?: number;
  downgradeHoldMs?: number;
  upgradeHoldMs?: number;
  changeCooldownMs?: number;
}

export type QualityListener = (profile: Readonly<QualityProfile>) => void;

/** Hysteresis-based quality selection, intended to be fed once per frame. */
export class AdaptiveQualityController {
  readonly monitor: PerformanceMonitor;
  private preference: QualityPreference;
  private tier: QualityTier;
  private readonly minimumSamples: number;
  private readonly downgradeFps: number;
  private readonly upgradeFps: number;
  private readonly downgradeHoldMs: number;
  private readonly upgradeHoldMs: number;
  private readonly changeCooldownMs: number;
  private readonly listeners = new Set<QualityListener>();
  private slowForMs = 0;
  private fastForMs = 0;
  private cooldownMs = 0;

  constructor(options: AdaptiveQualityOptions = {}) {
    this.preference = options.preference ?? 'auto';
    this.tier =
      this.preference === 'auto'
        ? (options.initialTier ?? detectInitialQuality())
        : this.preference;
    this.minimumSamples = options.minimumSamples ?? 90;
    this.downgradeFps = options.downgradeFps ?? 48;
    this.upgradeFps = options.upgradeFps ?? 57;
    this.downgradeHoldMs = options.downgradeHoldMs ?? 2_500;
    this.upgradeHoldMs = options.upgradeHoldMs ?? 10_000;
    this.changeCooldownMs = options.changeCooldownMs ?? 8_000;
    this.monitor = new PerformanceMonitor();
  }

  get currentTier(): QualityTier {
    return this.tier;
  }

  get profile(): Readonly<QualityProfile> {
    return QUALITY_PROFILES[this.tier];
  }

  get currentPreference(): QualityPreference {
    return this.preference;
  }

  update(deltaMs: number): Readonly<QualityProfile> {
    const metrics = this.monitor.recordFrame(deltaMs);
    const assessmentDelta = Math.min(Math.max(deltaMs, 0), 100);
    this.cooldownMs = Math.max(0, this.cooldownMs - assessmentDelta);
    if (this.preference !== 'auto' || metrics.sampleCount < this.minimumSamples) return this.profile;

    if (metrics.fps < this.downgradeFps || metrics.jankRatio > 0.2) {
      this.slowForMs += assessmentDelta;
      this.fastForMs = 0;
    } else if (metrics.fps > this.upgradeFps && metrics.p95FrameMs < 19) {
      this.fastForMs += assessmentDelta;
      this.slowForMs = 0;
    } else {
      this.slowForMs = Math.max(0, this.slowForMs - assessmentDelta * 0.5);
      this.fastForMs = Math.max(0, this.fastForMs - assessmentDelta * 0.5);
    }

    if (this.cooldownMs === 0 && this.slowForMs >= this.downgradeHoldMs) {
      this.changeTier(this.lower(this.tier));
    } else if (this.cooldownMs === 0 && this.fastForMs >= this.upgradeHoldMs) {
      this.changeTier(this.higher(this.tier));
    }
    return this.profile;
  }

  setPreference(preference: QualityPreference): void {
    this.preference = preference;
    if (preference !== 'auto') this.changeTier(preference, true);
    else this.resetAssessment();
  }

  subscribe(listener: QualityListener, emitImmediately = true): () => void {
    this.listeners.add(listener);
    if (emitImmediately) listener(this.profile);
    return () => this.listeners.delete(listener);
  }

  resetAssessment(): void {
    this.monitor.reset();
    this.slowForMs = 0;
    this.fastForMs = 0;
    this.cooldownMs = 0;
  }

  private changeTier(next: QualityTier, force = false): void {
    this.slowForMs = 0;
    this.fastForMs = 0;
    if (next === this.tier && !force) return;
    this.tier = next;
    this.cooldownMs = this.changeCooldownMs;
    for (const listener of this.listeners) listener(this.profile);
  }

  private lower(tier: QualityTier): QualityTier {
    if (tier === 'high') return 'balanced';
    return 'low';
  }

  private higher(tier: QualityTier): QualityTier {
    if (tier === 'low') return 'balanced';
    return 'high';
  }
}

/** Conservative first-run tier; adaptive monitoring can raise it later. */
export function detectInitialQuality(): QualityTier {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'balanced';
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigatorWithMemory.deviceMemory ?? 4;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const touchDevice = navigator.maxTouchPoints > 0;

  if (reducedMotion || cores <= 4 || memory <= 3) return 'low';
  if (!touchDevice && cores >= 8 && memory >= 8) return 'high';
  return 'balanced';
}
