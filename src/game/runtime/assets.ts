import { Assets, Rectangle, Texture } from 'pixi.js';
import { assetUrl } from '../assetUrl';
import type { RuntimeAssetPaths } from './types';

const publicAsset = (path: string): string => assetUrl(path);

export const DEFAULT_RUNTIME_ASSETS: RuntimeAssetPaths = {
  arena: [publicAsset('assets/game/arena.webp')],
  arenaFronts: [
    [publicAsset('assets/game/arena.webp')],
    [publicAsset('assets/game/arena-plague.webp')],
    [publicAsset('assets/game/arena-cryo.webp')],
    [publicAsset('assets/game/arena-void.webp')],
    [publicAsset('assets/game/arena-rift.webp')],
  ],
  playerSheet: [publicAsset('assets/game/player-sheet.webp')],
  enemySheet: [publicAsset('assets/game/enemies-sheet.webp')],
  enemyExpansionSheet: [publicAsset('assets/game/enemies-expansion.webp')],
  bossSheet: [publicAsset('assets/game/bosses-sheet.webp'), publicAsset('assets/game/boss.webp')],
  projectile: [publicAsset('assets/game/props/bullet.webp')],
  experience: [publicAsset('assets/game/props/xp-crystal.webp')],
  healthPickup: [publicAsset('assets/game/health-pickup.webp')],
  vfxAtlas: [publicAsset('assets/game/vfx-atlas.webp')],
  skillVfxAtlas: [publicAsset('assets/game/skill-vfx-atlas-v2-clean.webp')],
};

export interface RuntimeTextures {
  arena: Texture;
  arenaFronts: readonly Texture[];
  playerFrames: readonly Texture[];
  enemyFrames: readonly Texture[];
  bossFrames: readonly Texture[];
  projectile: Texture;
  experience: Texture;
  healthPickup: Texture;
  missile: Texture;
  enemyProjectile: Texture;
  eliteExperience: Texture;
  landmine: Texture;
  turret: Texture;
  drone: Texture;
  vfxFrames: readonly Texture[];
  skillVfxFrames: readonly Texture[];
  owned: readonly Texture[];
}

export async function loadRuntimeTextures(
  overrides: Partial<RuntimeAssetPaths> = {},
): Promise<RuntimeTextures> {
  const paths: RuntimeAssetPaths = {
    arena: overrides.arena ?? DEFAULT_RUNTIME_ASSETS.arena,
    arenaFronts:
      overrides.arenaFronts ??
      (overrides.arena ? [overrides.arena] : DEFAULT_RUNTIME_ASSETS.arenaFronts ?? [DEFAULT_RUNTIME_ASSETS.arena]),
    playerSheet: overrides.playerSheet ?? DEFAULT_RUNTIME_ASSETS.playerSheet,
    enemySheet: overrides.enemySheet ?? DEFAULT_RUNTIME_ASSETS.enemySheet,
    enemyExpansionSheet:
      overrides.enemyExpansionSheet ?? DEFAULT_RUNTIME_ASSETS.enemyExpansionSheet ?? [],
    bossSheet: overrides.bossSheet ?? DEFAULT_RUNTIME_ASSETS.bossSheet,
    projectile: overrides.projectile ?? DEFAULT_RUNTIME_ASSETS.projectile,
    experience: overrides.experience ?? DEFAULT_RUNTIME_ASSETS.experience,
    healthPickup: overrides.healthPickup ?? DEFAULT_RUNTIME_ASSETS.healthPickup ?? [],
    vfxAtlas: overrides.vfxAtlas ?? DEFAULT_RUNTIME_ASSETS.vfxAtlas,
    skillVfxAtlas: overrides.skillVfxAtlas ?? DEFAULT_RUNTIME_ASSETS.skillVfxAtlas ?? [],
  };

  const [
    arena,
    arenaFronts,
    player,
    enemies,
    enemyExpansion,
    boss,
    projectile,
    experience,
    healthPickup,
    vfxAtlas,
    skillVfxAtlas,
    missile,
    enemyProjectile,
    eliteExperience,
    landmine,
    turret,
    drone,
  ] = await Promise.all([
    loadFirst(paths.arena),
    Promise.all((paths.arenaFronts ?? []).map((candidates) => loadFirst(candidates))),
    loadFirst(paths.playerSheet),
    loadFirst(paths.enemySheet),
    loadFirst(paths.enemyExpansionSheet ?? []),
    loadFirst(paths.bossSheet),
    loadFirst(paths.projectile),
    loadFirst(paths.experience),
    loadFirst(paths.healthPickup ?? []),
    loadFirst(paths.vfxAtlas),
    loadFirst(paths.skillVfxAtlas ?? []),
    loadFirst([publicAsset('assets/game/props/missile.webp')]),
    loadFirst([publicAsset('assets/game/props/enemy-projectile.webp')]),
    loadFirst([publicAsset('assets/game/props/elite-crystal.webp')]),
    loadFirst([publicAsset('assets/game/props/landmine.webp')]),
    loadFirst([publicAsset('assets/game/props/turret.webp')]),
    loadFirst([publicAsset('assets/game/props/drone.webp')]),
  ]);

  const owned: Texture[] = [];
  const playerFrames = sliceGrid(player, 4, 2, owned);
  const enemyFrames = sliceGrid(enemies, 4, 3, owned);
  const expansionFrames = sliceGrid(enemyExpansion, 4, 2, owned);
  const bossFrames = sliceGrid(boss, 5, 1, owned);
  const vfxFrames = sliceGrid(vfxAtlas, 4, 2, owned);
  const skillVfxFrames = sliceGrid(skillVfxAtlas, 4, 2, owned);
  return {
    arena,
    arenaFronts: arenaFronts.length > 0 ? arenaFronts : [arena],
    playerFrames,
    enemyFrames: [...enemyFrames, ...expansionFrames],
    bossFrames,
    projectile,
    experience,
    healthPickup,
    missile,
    enemyProjectile,
    eliteExperience,
    landmine,
    turret,
    drone,
    vfxFrames,
    skillVfxFrames,
    owned,
  };
}

async function loadFirst(candidates: readonly string[]): Promise<Texture> {
  for (const path of candidates) {
    try {
      const texture = await withTimeout(Assets.load<Texture>(path), 5_000);
      if (texture.width > 1 && texture.height > 1) return texture;
    } catch {
      // Imagegen assets may be added after the runtime; the renderer has a visible fallback.
    }
  }
  return Texture.WHITE;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => reject(new Error(`Asset decoding exceeded ${timeoutMs}ms.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function sliceGrid(
  source: Texture,
  columns: number,
  rows: number,
  owned: Texture[],
): readonly Texture[] {
  if (source === Texture.WHITE || source.width < columns || source.height < rows) {
    return Array.from({ length: columns * rows }, () => Texture.WHITE);
  }
  const frameWidth = Math.floor(source.width / columns);
  const frameHeight = Math.floor(source.height / rows);
  const frames: Texture[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const texture = new Texture({
        source: source.source,
        frame: new Rectangle(column * frameWidth, row * frameHeight, frameWidth, frameHeight),
      });
      frames.push(texture);
      owned.push(texture);
    }
  }
  return frames;
}
