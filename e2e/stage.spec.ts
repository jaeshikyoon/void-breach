import { expect, test, type Page } from '@playwright/test';

const DATABASE_NAME = 'rift-siege-game';
const STORE_NAME = 'game-data';
const PROFILE_KEY = 'profile';

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function waitForStartScreen(page: Page) {
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('start-stage-selector')).toBeVisible();
  await expect(page.getByTestId('start-stage-current')).toBeVisible();
  await expect(page.getByTestId('start-game')).toBeVisible();
  await expect(page.getByTestId('open-stage-select')).toHaveCount(0);
}

async function openFreshApp(page: Page) {
  await page.goto('/');
  await waitForStartScreen(page);
}

async function seedStageProfile(
  page: Page,
  stageStars: number[],
  stageBestDurationSeconds: Array<number | null> = [],
) {
  await page.evaluate(
    async ({ databaseName, storeName, profileKey, stars, bestDurations }) => {
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
              version: 3,
              stageStars: stars,
              stageBestDurationSeconds: bestDurations,
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
    {
      databaseName: DATABASE_NAME,
      storeName: STORE_NAME,
      profileKey: PROFILE_KEY,
      stars: stageStars,
      bestDurations: stageBestDurationSeconds,
    },
  );
}

async function expectInlineStage(
  page: Page,
  stage: number,
  stars: number,
  unlockedStages: number,
) {
  const selector = page.getByTestId('start-stage-selector');
  const current = page.getByTestId('start-stage-current');
  const start = page.getByTestId('start-game');
  await expect(selector).toHaveAttribute('data-stage', String(stage));
  await expect(selector).toHaveAttribute('data-stage-stars', String(stars));
  await expect(selector).toHaveAttribute('data-unlocked-stages', String(unlockedStages));
  await expect(current).toContainText(new RegExp(`STAGE\\s*${String(stage).padStart(2, '0')}\\s*\\/\\s*20`));
  await expect(current).toHaveAttribute('aria-live', 'polite');
  await expect(start).toHaveAttribute('data-stage', String(stage));
  await expect(start).toHaveAttribute('aria-label', `스테이지 ${stage} 전투 시작`);
}

async function expectStageHud(page: Page, stage: number) {
  const currentStage = page.getByTestId('current-stage');
  await expect(currentStage).toBeVisible();
  await expect(currentStage).toHaveAttribute('aria-label', `현재 스테이지 ${stage}`);
  await expect(currentStage).toContainText(String(stage).padStart(2, '0'));
  await expect(page.locator('.ui-deployment')).toBeVisible();
}

test.describe('inline stage selector at 1672x937', () => {
  test.use({
    viewport: { width: 1672, height: 937 },
    screen: { width: 1672, height: 937 },
  });

  test('starts fresh at stage one with both navigation boundaries locked', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await openFreshApp(page);

    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
      width: 1672,
      height: 937,
    });
    await expectInlineStage(page, 1, 0, 1);
    await expect(page.getByTestId('start-stage-selector')).not.toHaveAttribute(
      'data-stage-best-seconds',
      /.+/,
    );
    await expect(page.getByTestId('start-stage-best-time')).toContainText('BEST CLEAR —');
    await expect(page.getByTestId('start-stage-prev')).toBeDisabled();
    await expect(page.getByTestId('start-stage-next')).toBeDisabled();

    await page.getByTestId('start-game').click();
    await expectStageHud(page, 1);
    expect(pageErrors).toEqual([]);
  });

  test('restores latest unlocked stage two and starts the stage selected with inline arrows', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await openFreshApp(page);
    await seedStageProfile(
      page,
      [1, ...Array.from({ length: 19 }, () => 0)],
      [83.456, ...Array.from({ length: 19 }, () => null)],
    );
    await page.reload();
    await waitForStartScreen(page);

    await expectInlineStage(page, 2, 0, 2);
    await expect(page.getByTestId('start-stage-selector')).not.toHaveAttribute(
      'data-stage-best-seconds',
      /.+/,
    );
    await expect(page.getByTestId('start-stage-best-time')).toContainText('BEST CLEAR —');
    const previous = page.getByTestId('start-stage-prev');
    const next = page.getByTestId('start-stage-next');
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();

    await previous.click();
    await expectInlineStage(page, 1, 1, 2);
    await expect(page.getByTestId('start-stage-selector')).toHaveAttribute(
      'data-stage-best-seconds',
      '83.456',
    );
    await expect(page.getByTestId('start-stage-best-time')).toContainText('BEST CLEAR 01:23');
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.click();
    await expectInlineStage(page, 2, 0, 2);
    await expect(page.getByTestId('start-stage-selector')).not.toHaveAttribute(
      'data-stage-best-seconds',
      /.+/,
    );
    await expect(page.getByTestId('start-stage-best-time')).toContainText('BEST CLEAR —');
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();
    await page.getByTestId('start-game').click();
    await expectStageHud(page, 2);
    expect(pageErrors).toEqual([]);
  });
});

test.describe('inline stage selector at 844x390 mobile landscape', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });

  test('keeps inline selection visible and starts mobile stage one controls', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await openFreshApp(page);

    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({
      width: 844,
      height: 390,
    });
    await expectInlineStage(page, 1, 0, 1);
    await expect(page.getByTestId('start-stage-prev')).toBeVisible();
    await expect(page.getByTestId('start-stage-next')).toBeVisible();
    await expect(page.getByTestId('start-stage-prev')).toBeDisabled();
    await expect(page.getByTestId('start-stage-next')).toBeDisabled();
    await page.getByTestId('start-game').click();

    await expectStageHud(page, 1);
    await expect(page.getByRole('application', { name: '이동 조이스틱' })).toBeVisible();
    await expect(page.getByRole('button', { name: /기본 공격/i })).toContainText('FIRE');
    await expect(page.locator('canvas')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
