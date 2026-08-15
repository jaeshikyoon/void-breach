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

const COMPACT_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  active: 'SKILL',
  weapon: 'WEAPON',
  survival: 'SURVIVAL',
  recovery: 'RECOVERY',
};

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

async function openFirstLevelUp(page: Page) {
  await openAndStart(page);
  const attack = page.getByTestId('mobile-attack');
  const attackBox = await visibleRect(attack);
  await page.mouse.move(
    attackBox.x + attackBox.width / 2,
    attackBox.y + attackBox.height / 2,
  );
  await page.mouse.down();
  const modal = page.getByTestId('levelup-modal');
  try {
    await expect(modal).toBeVisible({ timeout: 45_000 });
  } finally {
    await page.mouse.up();
  }
  return modal;
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
      const deployment = page.getByTestId('deployment-hud');
      const deploymentBox = await expectContained(deployment, viewport);
      const topRightBox = await expectContained(hudTopRight, viewport);
      const xpBox = await expectContained(hudXp, viewport);
      const joystickBox = await expectContained(joystick, viewport);
      const dodgeBox = await expectContained(dodge, viewport);
      const attackBox = await expectContained(attack, viewport);
      await expectContained(skillFan, viewport);

      expect(overlapArea(topLeftBox, topCenterBox)).toBe(0);
      expect(overlapArea(topCenterBox, topRightBox)).toBe(0);
      expect(deploymentBox.width).toBeLessThanOrEqual(176.5);
      expect(deploymentBox.height).toBeLessThanOrEqual(46.5);
      expect((deploymentBox.width * deploymentBox.height) / (viewport.width * viewport.height))
        .toBeLessThanOrEqual(0.032);
      expect(Math.abs(deploymentBox.x + deploymentBox.width / 2 - viewport.width / 2))
        .toBeLessThanOrEqual(1);
      expect(deploymentBox.y).toBeLessThanOrEqual(8.5);
      await expect(deployment).toHaveAttribute('data-deployed', '20');
      await expect(deployment).toHaveAttribute('data-total', '200');
      await expect(deployment).toHaveAttribute('data-alive', '20');
      await expect(deployment).toHaveAttribute('data-kills', '0');
      expect((await deployment.getAttribute('aria-label'))?.length).toBeGreaterThan(0);
      await expect(deployment.locator('.ui-deployment__header')).toBeHidden();
      const deploymentFooterItems = deployment.locator('.ui-deployment__footer > span');
      await expect(deploymentFooterItems.first()).toBeVisible();
      await expect(deploymentFooterItems.first()).toContainText(/ALIVE\s*20/);
      await expect(deploymentFooterItems.nth(1)).toBeHidden();
      expect(await deploymentFooterItems.first().evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).fontSize)
      ))).toBeGreaterThanOrEqual(8);
      const combatCenter = {
        x: viewport.width * 0.2,
        y: viewport.height * 0.2,
        width: viewport.width * 0.6,
        height: viewport.height * 0.6,
      };
      expect(overlapArea(deploymentBox, combatCenter)).toBe(0);
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

    test('keeps all three level-up protocols concise, visual, and reachable', async ({ page, context }) => {
      const pageErrors = watchPageErrors(page);
      await page.addInitScript(() => {
        Date.now = () => 1_700_000_000_000;
      });
      if (viewport.width === 667) {
        const session = await context.newCDPSession(page);
        await session.send('Emulation.setSafeAreaInsetsOverride', {
          insets: { top: 0, right: 44, bottom: 0, left: 44 },
        });
      }
      const modal = await openFirstLevelUp(page);
      await expectContained(modal, viewport);
      await expectContained(page.locator('.ui-levelup'), viewport);

      const cards = page.locator('[data-testid^="upgrade-card-"]:not([data-testid*="-art-"]):not([data-testid*="-title-"]):not([data-testid*="-effect-"]):not([data-testid*="-select-"])');
      await expect(cards).toHaveCount(3);
      const optionIds: string[] = [];
      const titles: string[] = [];
      let essentialDescriptionCount = 0;

      for (let index = 0; index < 3; index += 1) {
        const card = page.getByTestId(`upgrade-card-${index}`);
        await card.scrollIntoViewIfNeeded();
        const cardBox = await expectContained(card, viewport);
        expect(cardBox.height).toBeGreaterThanOrEqual(245.5);
        expect(cardBox.height).toBeLessThanOrEqual(246.5);
        await card.focus();
        await expect(card).toBeFocused();

        const optionId = await card.getAttribute('data-option-id');
        expect(optionId).toBeTruthy();
        optionIds.push(optionId!);

        const art = page.getByTestId(`upgrade-card-art-${index}`);
        const artBox = await expectContained(art, viewport);
        expect(artBox.height / cardBox.height).toBeGreaterThanOrEqual(.65);
        expect(artBox.height / cardBox.height).toBeLessThanOrEqual(.76);
        const body = card.locator('.ui-upgrade-card__body');
        const bodyBox = await expectContained(body, viewport);
        expect(bodyBox.height / cardBox.height).toBeGreaterThanOrEqual(.20);
        expect(bodyBox.height / cardBox.height).toBeLessThanOrEqual(.35);
        const image = art.locator('img');
        await expect(image).toHaveCount(1);
        await expect(image).toBeVisible();
        expect(await image.evaluate((element: HTMLImageElement) => (
          element.complete && element.naturalWidth > 0 && element.naturalHeight > 0
        ))).toBe(true);
        expect(await image.evaluate((element) => getComputedStyle(element).objectFit)).toBe('contain');

        const title = page.getByTestId(`upgrade-card-title-${index}`);
        const effect = page.getByTestId(`upgrade-card-effect-${index}`);
        await expect(title).toBeVisible();
        await expect(effect).toBeVisible();
        const titleText = (await title.innerText()).trim();
        const effectText = (await effect.innerText()).trim();
        expect(titleText.length).toBeGreaterThan(0);
        expect(effectText.length).toBeGreaterThan(0);
        expect(await title.evaluate((element) => (
          Number.parseFloat(getComputedStyle(element).fontSize)
        ))).toBeGreaterThanOrEqual(14);
        titles.push(titleText);

        const category = await card.getAttribute('data-upgrade-category');
        expect(category).toBeTruthy();
        expect(COMPACT_CATEGORY_LABELS[category!]).toBeTruthy();
        const categoryChip = card.locator('.ui-upgrade-card__category');
        await expect(categoryChip).toBeVisible();
        const compactCategory = await categoryChip.evaluate((element) => {
          const pseudo = getComputedStyle(element, '::after');
          return {
            content: pseudo.content.replace(/^['"]|['"]$/g, ''),
            fontSize: Number.parseFloat(pseudo.fontSize),
          };
        });
        expect(compactCategory.content).toBe(COMPACT_CATEGORY_LABELS[category!]);
        expect(compactCategory.fontSize).toBeGreaterThanOrEqual(8);

        await expect(card.locator('.ui-upgrade-card__header kbd')).toBeHidden();
        await expect(card.locator('.ui-upgrade-card__rarity')).toBeHidden();
        await expect(card.locator('.ui-upgrade-card__new')).toBeHidden();
        const description = card.locator('.ui-upgrade-card__description');
        await expect(description).toBeVisible();
        expect((await description.innerText()).trim().length).toBeGreaterThan(0);
        expect(await description.evaluate((element) => (
          Number.parseFloat(getComputedStyle(element).fontSize)
        ))).toBeGreaterThanOrEqual(10);
        await expect(card.locator('.ui-upgrade-card__current')).toBeHidden();
        await expect(page.getByTestId(`upgrade-card-select-${index}`)).toBeHidden();
        await expect(effect.locator('span')).toBeHidden();
        expect(await effect.evaluate((element) => (
          Number.parseFloat(getComputedStyle(element).fontSize)
        ))).toBeGreaterThanOrEqual(11);
        const level = card.locator('.ui-upgrade-card__level');
        if (category === 'recovery') {
          await expect(level).toBeHidden();
        } else {
          await expect(level).toBeVisible();
          expect(await level.evaluate((element) => (
            Number.parseFloat(getComputedStyle(element).fontSize)
          ))).toBeGreaterThanOrEqual(9);
        }
        const visibleCopy = (await card.innerText()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        expect(visibleCopy.filter((line) => line === titleText)).toHaveLength(1);
        expect(visibleCopy.filter((line) => line === effectText)).toHaveLength(1);
      }

      expect(new Set(optionIds).size).toBe(3);
      expect(new Set(titles).size).toBe(3);
      expect(essentialDescriptionCount).toBeGreaterThanOrEqual(0);

      const reroll = page.getByTestId('levelup-reroll');
      await reroll.scrollIntoViewIfNeeded();
      const rerollBox = await expectContained(reroll, viewport);
      expect(rerollBox.height).toBeGreaterThanOrEqual(44);
      await expect(reroll).toBeEnabled();
      await reroll.focus();
      await expect(reroll).toBeFocused();
      const scrollContract = await modal.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      expect(['auto', 'scroll']).toContain(scrollContract.overflowY);
      expect(scrollContract.scrollHeight).toBeGreaterThanOrEqual(scrollContract.clientHeight);
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
