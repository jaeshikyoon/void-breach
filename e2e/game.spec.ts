import { expect, test, type Page } from '@playwright/test';

const START_BUTTON = /전투 시작/i;

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openReadyGame(page: Page) {
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();

  const startButton = page.getByRole('button', { name: START_BUTTON });
  await expect(startButton).toHaveCount(1);
  await expect(startButton).toBeVisible();
  return { canvas, startButton };
}

async function startAndAssertFirstDeployment(page: Page) {
  const { canvas, startButton } = await openReadyGame(page);
  await startButton.click();
  await expect(canvas).toBeVisible();

  const deployment = page.locator('.ui-deployment');
  await expect(deployment).toBeVisible();
  await expect(deployment).toContainText('MONSTERS DEPLOYED');
  await expect(deployment).toContainText(/20\s*\/\s*200/);
  await expect(deployment).toContainText(/ALIVE\s*20/);
}

test.describe('desktop combat shell', () => {
  test('initializes the start screen and Pixi canvas without a page error', async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);
    const { startButton } = await openReadyGame(page);

    await expect(startButton).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });

  test('starts with the first 20-monster deployment alive', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await startAndAssertFirstDeployment(page);

    const skillTray = page.getByTestId('desktop-skill-tray');
    await expect(skillTray).toBeVisible();
    await expect(skillTray.getByRole('listitem')).toHaveCount(3);
    for (const key of ['q', 'e', 'r']) {
      const slot = page.getByTestId(`desktop-skill-slot-${key}`);
      await expect(slot).toBeVisible();
      await expect(slot).toHaveAttribute('data-skill-state', 'empty');
      await expect(slot).toContainText('미장착');
    }
    expect(pageErrors).toEqual([]);
  });

  test('Escape pauses and resumes exactly one time per key press', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await startAndAssertFirstDeployment(page);

    const pauseDialog = page.getByRole('dialog', { name: 'PAUSED' });
    await page.keyboard.press('Escape');
    await expect(pauseDialog).toBeVisible();

    // The runtime intentionally debounces the same physical Escape press for
    // 120 ms so keydown/input layers cannot double-toggle the modal.
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await expect(pauseDialog).toBeHidden();
    expect(pageErrors).toEqual([]);
  });
});

test.describe('mobile landscape controls', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });

  test('shows the joystick, FIRE control, and game canvas', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await startAndAssertFirstDeployment(page);

    const joystick = page.getByRole('application', { name: '이동 조이스틱' });
    const fireButton = page.getByRole('button', { name: /기본 공격/i });

    await expect(page.locator('canvas')).toBeVisible();
    await expect(joystick).toBeVisible();
    await expect(fireButton).toBeVisible();
    await expect(fireButton).toContainText('FIRE');
    expect(pageErrors).toEqual([]);
  });
});
