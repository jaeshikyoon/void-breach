import {
  MAX_STAGE,
  STAGE_COUNT,
  calculateStageStars,
  normalizeStageStars,
  type StageResultForStars,
  type StageStarRating,
} from '../stages';

export type GraphicsPreference = 'auto' | 'high' | 'balanced' | 'low';

export interface StoredAudioSettings {
  master: number;
  sfx: number;
  muted: boolean;
}

export interface StoredGraphicsSettings {
  quality: GraphicsPreference;
  screenShake: boolean;
  damageNumbers: boolean;
}

export interface StoredControlSettings {
  aimAssist: boolean;
  floatingJoystick: boolean;
  haptics: boolean;
}

export interface GameProfile {
  version: number;
  bestKills: number;
  bestLevel: number;
  bossKills: number;
  fastestClearMs: number | null;
  recentSkills: string[];
  stageStars: number[];
  /** Fastest victorious clear in seconds for each stage; null means uncleared/unrecorded. */
  stageBestDurationSeconds: Array<number | null>;
  tutorialCompleted: boolean;
  audio: StoredAudioSettings;
  graphics: StoredGraphicsSettings;
  controls: StoredControlSettings;
  updatedAt: number;
}

export type StorageMode = 'indexeddb' | 'memory';

export interface GameStorageOptions {
  databaseName?: string;
  storeName?: string;
  version?: number;
}

export interface CompletedRun {
  kills: number;
  level: number;
  bossDefeated: boolean;
  clearTimeMs?: number;
  skills?: readonly string[];
}

export interface CompletedStage extends StageResultForStars {
  stage: number;
  clearDurationSeconds?: number;
}

export type GameProfilePatch = Omit<
  Partial<GameProfile>,
  'audio' | 'graphics' | 'controls'
> & {
  audio?: Partial<StoredAudioSettings>;
  graphics?: Partial<StoredGraphicsSettings>;
  controls?: Partial<StoredControlSettings>;
};

const PROFILE_KEY = 'profile';
export const CURRENT_GAME_PROFILE_VERSION = 3;

export const DEFAULT_GAME_PROFILE: Readonly<GameProfile> = Object.freeze<GameProfile>({
  version: CURRENT_GAME_PROFILE_VERSION,
  bestKills: 0,
  bestLevel: 1,
  bossKills: 0,
  fastestClearMs: null,
  recentSkills: [],
  stageStars: Array.from({ length: STAGE_COUNT }, () => 0),
  stageBestDurationSeconds: Array.from({ length: STAGE_COUNT }, () => null),
  tutorialCompleted: false,
  audio: { master: 0.8, sfx: 0.9, muted: false },
  graphics: { quality: 'auto', screenShake: true, damageNumbers: true },
  controls: { aimAssist: true, floatingJoystick: true, haptics: true },
  updatedAt: 0,
});

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeGameProfile(value?: Partial<GameProfile> | null): GameProfile {
  return {
    ...clone(DEFAULT_GAME_PROFILE),
    ...value,
    version: CURRENT_GAME_PROFILE_VERSION,
    recentSkills: [...(value?.recentSkills ?? DEFAULT_GAME_PROFILE.recentSkills)],
    stageStars: normalizeStageStars(value?.stageStars),
    stageBestDurationSeconds: normalizeStageBestDurationSeconds(value?.stageBestDurationSeconds),
    audio: { ...DEFAULT_GAME_PROFILE.audio, ...value?.audio },
    graphics: { ...DEFAULT_GAME_PROFILE.graphics, ...value?.graphics },
    controls: { ...DEFAULT_GAME_PROFILE.controls, ...value?.controls },
  };
}

/** IndexedDB key/value store that transparently falls back to session memory. */
export class GameStorage {
  private readonly databaseName: string;
  private readonly storeName: string;
  private readonly version: number;
  private readonly memory = new Map<string, unknown>();
  private databasePromise: Promise<IDBDatabase | null> | null = null;
  private storageMode: StorageMode = 'indexeddb';
  private profileWriteQueue: Promise<void> = Promise.resolve();

  constructor(options: GameStorageOptions = {}) {
    this.databaseName = options.databaseName ?? 'rift-siege-game';
    this.storeName = options.storeName ?? 'game-data';
    this.version = options.version ?? 1;
    if (typeof indexedDB === 'undefined') this.storageMode = 'memory';
  }

  get mode(): StorageMode {
    return this.storageMode;
  }

  async ready(): Promise<StorageMode> {
    await this.open();
    return this.storageMode;
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    const database = await this.open();
    if (!database) {
      return this.memory.has(key) ? clone(this.memory.get(key) as T) : clone(fallback);
    }
    try {
      const value = await this.request<T | undefined>('readonly', (store) => store.get(key));
      return value === undefined ? clone(fallback) : value;
    } catch {
      this.useMemoryFallback();
      return this.memory.has(key) ? clone(this.memory.get(key) as T) : clone(fallback);
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const snapshot = clone(value);
    this.memory.set(key, snapshot);
    const database = await this.open();
    if (!database) return;
    try {
      await this.request<IDBValidKey>('readwrite', (store) => store.put(snapshot, key));
    } catch {
      this.useMemoryFallback();
    }
  }

  async update<T>(key: string, fallback: T, updater: (current: T) => T): Promise<T> {
    const current = await this.get(key, fallback);
    const next = updater(clone(current));
    await this.set(key, next);
    return clone(next);
  }

  async remove(key: string): Promise<void> {
    this.memory.delete(key);
    const database = await this.open();
    if (!database) return;
    try {
      await this.request<undefined>('readwrite', (store) => store.delete(key));
    } catch {
      this.useMemoryFallback();
    }
  }

  async clear(): Promise<void> {
    this.memory.clear();
    const database = await this.open();
    if (!database) return;
    try {
      await this.request<undefined>('readwrite', (store) => store.clear());
    } catch {
      this.useMemoryFallback();
    }
  }

  async loadProfile(): Promise<GameProfile> {
    const stored = await this.get<Partial<GameProfile> | null>(PROFILE_KEY, null);
    const normalized = normalizeGameProfile(stored);
    if (stored && profileNeedsMigration(stored)) await this.set(PROFILE_KEY, normalized);
    return normalized;
  }

  async saveProfile(profile: GameProfile): Promise<GameProfile> {
    const normalized = normalizeGameProfile({ ...profile, updatedAt: Date.now() });
    await this.set(PROFILE_KEY, normalized);
    return clone(normalized);
  }

  async patchProfile(patch: GameProfilePatch): Promise<GameProfile> {
    return this.updateProfileAtomically((current) =>
      normalizeGameProfile({
        ...current,
        ...patch,
        audio: { ...current.audio, ...patch.audio },
        graphics: { ...current.graphics, ...patch.graphics },
        controls: { ...current.controls, ...patch.controls },
      }),
    );
  }

  async recordRun(run: CompletedRun): Promise<GameProfile> {
    const validClearTime =
      run.bossDefeated && Number.isFinite(run.clearTimeMs) && (run.clearTimeMs ?? 0) > 0
        ? Math.round(run.clearTimeMs!)
        : null;
    return this.updateProfileAtomically((current) => {
      const fastestClearMs =
        validClearTime === null
          ? current.fastestClearMs
          : current.fastestClearMs === null
            ? validClearTime
            : Math.min(current.fastestClearMs, validClearTime);
      return {
        ...current,
        bestKills: Math.max(current.bestKills, Math.max(0, Math.floor(run.kills))),
        bestLevel: Math.max(current.bestLevel, Math.max(1, Math.floor(run.level))),
        bossKills: current.bossKills + (run.bossDefeated ? 1 : 0),
        fastestClearMs,
        recentSkills: run.skills ? [...run.skills] : current.recentSkills,
      };
    });
  }

  /** Saves only an improvement, with queued read-modify-write semantics. */
  async recordStageResult(result: CompletedStage): Promise<GameProfile> {
    if (!Number.isInteger(result.stage) || result.stage < 1 || result.stage > MAX_STAGE) {
      throw new RangeError(`Stage must be an integer from 1 to ${MAX_STAGE}; received ${result.stage}.`);
    }
    const earnedStars = calculateStageStars(result);
    const validClearDuration =
      result.victory &&
      Number.isFinite(result.clearDurationSeconds) &&
      (result.clearDurationSeconds ?? 0) > 0
        ? roundDurationSeconds(result.clearDurationSeconds!)
        : null;
    return this.updateProfileAtomically((current) => {
      const stageStars = normalizeStageStars(current.stageStars);
      const stageBestDurationSeconds = normalizeStageBestDurationSeconds(current.stageBestDurationSeconds);
      const index = result.stage - 1;
      stageStars[index] = Math.max(stageStars[index] ?? 0, earnedStars) as StageStarRating;
      const previousDuration = stageBestDurationSeconds[index] ?? null;
      if (validClearDuration !== null) {
        stageBestDurationSeconds[index] = previousDuration === null
          ? validClearDuration
          : Math.min(previousDuration, validClearDuration);
      }
      return { ...current, stageStars, stageBestDurationSeconds };
    });
  }

  async resetProfile(): Promise<GameProfile> {
    return this.updateProfileAtomically(() => normalizeGameProfile());
  }

  close(): void {
    void this.databasePromise?.then((database) => database?.close());
    this.databasePromise = null;
  }

  private open(): Promise<IDBDatabase | null> {
    if (this.storageMode === 'memory' || typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve) => {
      let settled = false;
      try {
        const request = indexedDB.open(this.databaseName, this.version);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(this.storeName)) {
            database.createObjectStore(this.storeName);
          }
        };
        request.onsuccess = () => {
          settled = true;
          const database = request.result;
          database.onversionchange = () => database.close();
          resolve(database);
        };
        request.onerror = () => {
          settled = true;
          this.useMemoryFallback();
          resolve(null);
        };
        request.onblocked = () => {
          if (!settled) {
            settled = true;
            this.useMemoryFallback();
            resolve(null);
          }
        };
      } catch {
        this.useMemoryFallback();
        resolve(null);
      }
    });
    return this.databasePromise;
  }

  private request<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    return this.open().then(
      (database) =>
        new Promise<T>((resolve, reject) => {
          if (!database) {
            reject(new Error('IndexedDB is unavailable.'));
            return;
          }
          const transaction = database.transaction(this.storeName, mode);
          const request = operation(transaction.objectStore(this.storeName));
          request.onsuccess = () => resolve(clone(request.result as T));
          request.onerror = () => reject(request.error ?? transaction.error);
          transaction.onabort = () => reject(transaction.error);
        }),
    );
  }

  private updateProfileAtomically(updater: (current: GameProfile) => GameProfile): Promise<GameProfile> {
    const operation = this.profileWriteQueue.then(async () => {
      const current = await this.loadProfile();
      return this.saveProfile(updater(clone(current)));
    });
    this.profileWriteQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private useMemoryFallback(): void {
    this.storageMode = 'memory';
  }
}

function profileNeedsMigration(value: Partial<GameProfile>): boolean {
  return value.version !== CURRENT_GAME_PROFILE_VERSION ||
    !hasNormalizedStageStars(value.stageStars) ||
    !hasNormalizedStageBestDurations(value.stageBestDurationSeconds);
}

function hasNormalizedStageStars(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length === STAGE_COUNT &&
    value.every((stars) => Number.isInteger(stars) && stars >= 0 && stars <= 3);
}

/** Produces a detached, exactly twenty-entry array of positive seconds or null. */
export function normalizeStageBestDurationSeconds(value: unknown): Array<number | null> {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: STAGE_COUNT }, (_, index) => {
    const duration = source[index];
    return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
      ? roundDurationSeconds(duration)
      : null;
  });
}

function hasNormalizedStageBestDurations(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length === STAGE_COUNT &&
    value.every((duration) =>
      duration === null || (typeof duration === 'number' && Number.isFinite(duration) && duration > 0)
    );
}

function roundDurationSeconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export { GameStorage as SaveSystem };
