import { expect, test, type Locator, type Page } from '@playwright/test';

interface ViewportSize {
  width: number;
  height: number;
}

interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const LANDSCAPE_VIEWPORTS: readonly ViewportSize[] = [
  { width: 844, height: 390 },
  { width: 740, height: 360 },
  { width: 667, height: 375 },
];

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openAndStart(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const start = page.getByTestId('start-game');
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('.ui-deployment')).toBeVisible();
  await expect(page.getByTestId('mobile-controls')).toBeVisible();
}

async function visibleRect(locator: Locator): Promise<ElementRect> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'visible element must expose a bounding box').not.toBeNull();
  return box!;
}

async function expectContained(locator: Locator, viewport: ViewportSize) {
  const box = await visibleRect(locator);
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.y).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  return box;
}

function overlapArea(first: ElementRect, second: ElementRect): number {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
  );
  return width * height;
}

for (const viewport of LANDSCAPE_VIEWPORTS) {
  test.describe(`mobile combat layout at ${viewport.width}x${viewport.height}`, () => {
    test.use({
      viewport,
      screen: viewport,
      hasTouch: true,
      isMobile: true,
    });

    test('contains HUD, controls, skill fan, directional attack, and pause modal', async ({ page, context }) => {
      const pageErrors = watchPageErrors(page);
      if (viewport.width === 667) {
        const session = await context.newCDPSession(page);
        await session.send('Emulation.setSafeAreaInsetsOverride', {
          insets: { top: 0, right: 44, bottom: 0, left: 44 },
        });
      }
      await openAndStart(page);

      const hudTopLeft = page.locator('.ui-hud__top-left');
      const hudTopCenter = page.locator('.ui-hud__top-center');
      const hudTopRight = page.locator('.ui-hud__top-right');
      const hudXp = page.locator('.ui-hud__xp');
      const joystick = page.getByTestId('mobile-joystick');
      const dodge = page.getByTestId('mobile-dodge');
      const attack = page.getByTestId('mobile-attack');
      const skillFan = page.getByTestId('mobile-skill-fan');

      const topLeftBox = await expectContained(hudTopLeft, viewport);
      const topCenterBox = await expectContained(hudTopCenter, viewport);
      const topRightBox = await expectContained(hudTopRight, viewport);
      const xpBox = await expectContained(hudXp, viewport);
      const joystickBox = await expectContained(joystick, viewport);
      const dodgeBox = await expectContained(dodge, viewport);
      const attackBox = await expectContained(attack, viewport);
      await expectContained(skillFan, viewport);

      expect(overlapArea(topLeftBox, topCenterBox)).toBe(0);
      expect(overlapArea(topCenterBox, topRightBox)).toBe(0);
      expect(overlapArea(xpBox, joystickBox)).toBe(0);
      expect(overlapArea(joystickBox, attackBox)).toBe(0);
      expect(overlapArea(joystickBox, dodgeBox)).toBe(0);
      if (viewport.width === 667) {
        expect(topLeftBox.x).toBeGreaterThanOrEqual(51.5);
        expect(viewport.width - (topRightBox.x + topRightBox.width)).toBeGreaterThanOrEqual(51.5);
        expect(joystickBox.x).toBeGreaterThanOrEqual(58.5);
        expect(viewport.width - (attackBox.x + attackBox.width)).toBeGreaterThanOrEqual(55.5);
      }

      await expect(skillFan.getByRole('listitem')).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        const slot = page.getByTestId(`mobile-skill-slot-${index}`);
        const slotBox = await expectContained(slot, viewport);
        await expect(slot).toHaveAttribute('data-slot', String(index));
        await expect(slot).toHaveAttribute('data-skill-state', /empty|ready|cooldown/);
        await expect(slot.locator('.ui-touch-skill__icon')).toHaveCount(1);
        expect(overlapArea(slotBox, attackBox)).toBe(0);
        expect(overlapArea(slotBox, dodgeBox)).toBe(0);
      }

      await expect(attack).toHaveAttribute('data-aiming', 'false');
      await page.mouse.move(
        attackBox.x + attackBox.width / 2,
        attackBox.y + attackBox.height / 2,
      );
      await page.mouse.down();
      await expect(attack).toHaveAttribute('data-aiming', 'false');
      await page.mouse.move(
        attackBox.x + attackBox.width / 2 + 10,
        attackBox.y + attackBox.height / 2,
      );
      await expect(attack).toHaveAttribute('data-aiming', 'false');
      await page.mouse.move(
        attackBox.x + attackBox.width / 2 + 20,
        attackBox.y + attackBox.height / 2,
      );
      await expect(attack).toHaveAttribute('data-aiming', 'true');
      await page.mouse.up();
      await expect(attack).toHaveAttribute('data-aiming', 'false');

      const hud = page.locator('.ui-hud');
      await hud.evaluate((element) => element.classList.add('ui-hud--boss-active'));
      await expect(hudXp).toBeHidden();
      await hud.evaluate((element) => element.classList.remove('ui-hud--boss-active'));
      await expect(hudXp).toBeVisible();

      await page.locator('.ui-icon-button--pause').click();
      const pauseDialog = page.getByRole('dialog', { name: 'PAUSED' });
      await expectContained(pauseDialog, viewport);
      await expectContained(page.locator('.ui-pause-panel'), viewport);
      expect(pageErrors).toEqual([]);
    });
  });
}

test.describe('portrait orientation recovery', () => {
  const portrait = { width: 390, height: 844 };
  test.use({
    viewport: portrait,
    screen: portrait,
    hasTouch: true,
    isMobile: true,
  });

  test('offers fullscreen landscape mode and keeps a manual fallback after denial', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: () => Promise.reject(new DOMException('Denied in test', 'NotAllowedError')),
      });
      try {
        Object.defineProperty(window.screen, 'orientation', {
          configurable: true,
          value: {
            type: 'portrait-primary',
            angle: 0,
            lock: () => Promise.reject(new DOMException('Denied in test', 'NotAllowedError')),
          },
        });
      } catch {
        // Fullscreen rejection alone exercises the supported manual fallback.
      }
    });

    await page.goto('/');
    await expect(page.locator('canvas')).toHaveCount(1);
    const overlay = page.getByTestId('orientation-overlay');
    const action = page.getByTestId('orientation-action');
    const status = page.getByTestId('orientation-status');
    await expectContained(overlay, portrait);
    const actionBox = await expectContained(action, portrait);
    expect(actionBox.width).toBeGreaterThanOrEqual(44);
    expect(actionBox.height).toBeGreaterThanOrEqual(44);
    await expect(action).toHaveAttribute(
      'aria-label',
      '전체 화면으로 전환하고 가로 모드 시도',
    );
    await expect(status).toHaveAttribute('data-state', 'idle');

    await action.click();

    await expect(status).toHaveAttribute('data-state', /manual|error/);
    await expect(status).not.toHaveText('');
    await expect(action).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });
});
