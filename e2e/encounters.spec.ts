import { expect, test, type Page, type Response } from '@playwright/test';
import { STAGE_MONSTER_POOLS, getStageBoss } from '../src/game/data';
import { mapStageIntel } from '../src/game/uiMappers';

const DATABASE_NAME = 'rift-siege-game';
const STORE_NAME = 'game-data';
const PROFILE_KEY = 'profile';

const REQUIRED_RUNTIME_ASSETS = [
  '/assets/game/arena.webp',
  '/assets/game/arena-plague.webp',
  '/assets/game/arena-cryo.webp',
  '/assets/game/arena-void.webp',
  '/assets/game/arena-rift.webp',
  '/assets/game/player-sheet.webp',
  '/assets/game/enemies-sheet.webp',
  '/assets/game/enemies-expansion.webp',
  '/assets/game/bosses-sheet.webp',
  '/assets/game/props/bullet.webp',
  '/assets/game/props/xp-crystal.webp',
  '/assets/game/vfx-atlas.webp',
  '/assets/game/skill-vfx-atlas-v2-clean.webp',
  '/assets/game/props/missile.webp',
  '/assets/game/props/enemy-projectile.webp',
  '/assets/game/props/elite-crystal.webp',
  '/assets/game/props/landmine.webp',
  '/assets/game/props/turret.webp',
  '/assets/game/props/drone.webp',
] as const;

interface BrowserDiagnostics {
  pageErrors: string[];
  failedGameRequests: string[];
  gameAssetStatuses: Map<string, number>;
}

function watchBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    pageErrors: [],
    failedGameRequests: [],
    gameAssetStatuses: new Map(),
  };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/assets/game/')) {
      diagnostics.failedGameRequests.push(`${path}: ${request.failure()?.errorText ?? 'unknown error'}`);
    }
  });
  page.on('response', (response: Response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/assets/game/')) diagnostics.gameAssetStatuses.set(path, response.status());
  });
  return diagnostics;
}

async function waitForStartScreen(page: Page) {
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('start-stage-selector')).toBeVisible();
  await expect(page.getByTestId('start-game')).toBeVisible();
  await expect(page.getByTestId('open-stage-select')).toHaveCount(0);
}

async function seedAllStagesUnlocked(page: Page) {
  await page.evaluate(
    async ({ databaseName, storeName, profileKey }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName);
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).put(
            {
              version: 2,
              stageStars: Array.from({ length: 20 }, (_, index) => index < 19 ? 1 : 0),
              updatedAt: Date.now(),
            },
            profileKey,
          );
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        };
      });
    },
    { databaseName: DATABASE_NAME, storeName: STORE_NAME, profileKey: PROFILE_KEY },
  );
}

function expectCleanBrowser(diagnostics: BrowserDiagnostics) {
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.failedGameRequests).toEqual([]);
  for (const [path, status] of diagnostics.gameAssetStatuses) {
    expect(status, `${path} should load without an HTTP error`).toBeLessThan(400);
  }
}

test.describe('campaign encounter presentation at 1672x937', () => {
  test.use({
    viewport: { width: 1672, height: 937 },
    screen: { width: 1672, height: 937 },
  });

  test('starts the latest unlocked stage twenty inline and loads its encounter art', async ({ page }) => {
    const diagnostics = watchBrowserDiagnostics(page);
    await page.goto('/');
    await waitForStartScreen(page);
    await seedAllStagesUnlocked(page);
    await page.reload();
    await waitForStartScreen(page);

    const stage = 20;
    const intel = mapStageIntel(stage);
    const boss = getStageBoss(stage);
    expect(boss?.name).toBe(intel.bossName);
    const selector = page.getByTestId('start-stage-selector');
    await expect(selector).toHaveAttribute('data-stage', String(stage));
    await expect(selector).toHaveAttribute('data-unlocked-stages', String(stage));
    await expect(page.getByTestId('start-stage-prev')).toBeEnabled();
    await expect(page.getByTestId('start-stage-next')).toBeDisabled();
    await expect(page.getByTestId('current-stage')).toHaveCount(0);
    const start = page.getByTestId('start-game');
    await expect(start).toHaveAttribute('data-stage', String(stage));
    await expect(start).toHaveAttribute('aria-label', '스테이지 20 전투 시작');
    await start.click();

    const currentStage = page.getByTestId('current-stage');
    await expect(currentStage).toBeVisible();
    await expect(currentStage).toContainText('20');
    await expect(currentStage).toHaveAttribute('data-front-name', intel.frontName);
    await expect(currentStage).toHaveAttribute('data-boss-name', intel.bossName);

    const encounterInfo = page.getByTestId('encounter-info');
    await expect(encounterInfo).toBeVisible();
    await expect(encounterInfo).toHaveAttribute('data-front-name', intel.frontName);
    await expect(encounterInfo).toHaveAttribute('data-boss-name', intel.bossName);
    await expect(encounterInfo).toHaveAttribute(
      'data-threat-count',
      String(STAGE_MONSTER_POOLS[stage - 1]?.monsters.length),
    );
    await expect(encounterInfo).toContainText(intel.frontName);
    await expect(encounterInfo).toContainText(intel.bossName);

    await expect.poll(() => diagnostics.gameAssetStatuses.size).toBeGreaterThanOrEqual(
      REQUIRED_RUNTIME_ASSETS.length,
    );
    for (const path of REQUIRED_RUNTIME_ASSETS) {
      expect(diagnostics.gameAssetStatuses.get(path), `${path} should be requested`).toBe(200);
    }
    expectCleanBrowser(diagnostics);
  });
});
