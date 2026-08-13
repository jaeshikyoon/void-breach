import { expect, test, type Locator, type Page } from '@playwright/test';

interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VIEWPORT = { width: 1404, height: 648 } as const;

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectContained(locator: Locator): Promise<ElementRect> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'visible element must expose a bounding box').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORT.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height + 0.5);
  return box!;
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

test.describe('large mobile HUD at 1404x648', () => {
  test.use({ viewport: VIEWPORT, screen: VIEWPORT, hasTouch: true, isMobile: false });

  test('keeps compact combat chrome around an unobstructed center', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.game-loading')).toBeHidden({ timeout: 20_000 });
    await page.getByTestId('start-game').click();
    await expect(page.getByTestId('deployment-hud')).toBeVisible();

    await expect(page.getByTestId('mobile-controls')).toBeVisible();
    await expect(page.getByTestId('desktop-controls-help')).toBeHidden();
    await expect(page.getByTestId('desktop-skill-tray')).toBeHidden();

    const topLeft = page.locator('.ui-hud__top-left');
    const topCenter = page.getByTestId('hud-top-center');
    const deployment = page.getByTestId('deployment-hud');
    const topRight = page.locator('.ui-hud__top-right');
    const xp = page.locator('.ui-hud__xp');
    const joystick = page.getByTestId('mobile-joystick');
    const dodge = page.getByTestId('mobile-dodge');
    const attack = page.getByTestId('mobile-attack');
    const skillFan = page.getByTestId('mobile-skill-fan');

    const topLeftBox = await expectContained(topLeft);
    const topCenterBox = await expectContained(topCenter);
    const deploymentBox = await expectContained(deployment);
    const topRightBox = await expectContained(topRight);
    const xpBox = await expectContained(xp);
    const stageBox = await expectContained(page.getByTestId('current-stage'));
    const pauseBox = await expectContained(page.locator('.ui-icon-button--pause'));
    const joystickBox = await expectContained(joystick);
    const dodgeBox = await expectContained(dodge);
    const attackBox = await expectContained(attack);
    const skillFanBox = await expectContained(skillFan);
    const skillSlotBoxes: ElementRect[] = [];
    await expect(skillFan.getByRole('listitem')).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      skillSlotBoxes.push(await expectContained(page.getByTestId(`mobile-skill-slot-${index}`)));
    }

    expect(topLeftBox.width).toBeLessThanOrEqual(184.5);
    expect(topLeftBox.height).toBeLessThanOrEqual(65.5);
    expect(topCenterBox.width).toBeLessThanOrEqual(200.5);
    expect(topCenterBox.height).toBeLessThanOrEqual(46.5);
    expect(deploymentBox.width).toBeLessThanOrEqual(200.5);
    expect(deploymentBox.height).toBeLessThanOrEqual(46.5);
    expect(xpBox.width).toBeLessThanOrEqual(184.5);
    expect(xpBox.height).toBeLessThanOrEqual(30.5);
    expect(topRightBox.width).toBeLessThanOrEqual(100.5);
    expect(topRightBox.height).toBeLessThanOrEqual(44.5);
    expect(stageBox.height).toBeLessThanOrEqual(32.5);
    expect(pauseBox.width).toBeLessThanOrEqual(44.5);
    expect(pauseBox.height).toBeLessThanOrEqual(44.5);

    const meterLabels = page.locator('.ui-meter__label');
    await expect(meterLabels).toHaveCount(2);
    for (const label of await meterLabels.all()) {
      expect(await label.evaluate((element) => getComputedStyle(element).fontSize)).toBe('0px');
      await expect(label.locator('svg')).toBeVisible();
    }

    await expect(deployment).toHaveAttribute('data-deployed', '20');
    await expect(deployment).toHaveAttribute('data-total', '200');
    await expect(deployment).toHaveAttribute('data-alive', '20');
    await expect(deployment.locator('.ui-deployment__header')).toBeHidden();
    await expect(deployment.locator('.ui-deployment__footer > span').nth(1)).toBeHidden();
    await expect(page.locator('.ui-xp__labels > span')).toBeHidden();
    const encounterInfo = page.locator('.ui-encounter-info');
    await expect(encounterInfo).toHaveCount(1);
    expect(await encounterInfo.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: style.width,
        height: style.height,
        clipPath: style.clipPath,
      };
    })).toEqual({ width: '1px', height: '1px', clipPath: 'inset(50%)' });
    await expect(page.locator('.ui-threat-chip')).toBeHidden();

    const nonOverlappingPairs: readonly [ElementRect, ElementRect][] = [
      [topLeftBox, topCenterBox],
      [topLeftBox, topRightBox],
      [topCenterBox, topRightBox],
      [topLeftBox, xpBox],
      [xpBox, joystickBox],
      [joystickBox, dodgeBox],
      [joystickBox, attackBox],
    ];
    for (const [first, second] of nonOverlappingPairs) {
      expect(overlapArea(first, second)).toBe(0);
    }
    for (const slotBox of skillSlotBoxes) {
      expect(overlapArea(slotBox, joystickBox)).toBe(0);
      expect(overlapArea(slotBox, dodgeBox)).toBe(0);
      expect(overlapArea(slotBox, attackBox)).toBe(0);
    }

    const clearCenter: ElementRect = {
      x: VIEWPORT.width * 0.25,
      y: VIEWPORT.height * 0.2,
      width: VIEWPORT.width * 0.5,
      height: VIEWPORT.height * 0.5,
    };
    for (const rect of [
      topLeftBox,
      topCenterBox,
      topRightBox,
      xpBox,
      joystickBox,
      dodgeBox,
      attackBox,
      ...skillSlotBoxes,
    ]) {
      expect(overlapArea(rect, clearCenter)).toBe(0);
    }
    expect(clearCenter.width * clearCenter.height)
      .toBeGreaterThanOrEqual(VIEWPORT.width * VIEWPORT.height * 0.24);
    expect(pageErrors).toEqual([]);
  });
});
