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

const LOW_HEIGHT_DESKTOPS: readonly ViewportSize[] = [
  { width: 1404, height: 648 },
  { width: 1366, height: 650 },
  { width: 1280, height: 600 },
];

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function visibleRect(locator: Locator): Promise<ElementRect> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'visible element must expose a bounding box').not.toBeNull();
  return box!;
}

function expectRectContained(child: ElementRect, parent: ElementRect) {
  expect(child.x).toBeGreaterThanOrEqual(parent.x - 0.5);
  expect(child.y).toBeGreaterThanOrEqual(parent.y - 0.5);
  expect(child.x + child.width).toBeLessThanOrEqual(parent.x + parent.width + 0.5);
  expect(child.y + child.height).toBeLessThanOrEqual(parent.y + parent.height + 0.5);
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

async function reachNaturalFirstLevelUp(page: Page) {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const start = page.getByTestId('start-game');
  await expect(start).toBeVisible();
  await expect(page.locator('.game-loading')).toBeHidden({ timeout: 20_000 });
  await start.click();
  await expect(page.getByTestId('deployment-hud')).toBeVisible();

  const canvasBox = await visibleRect(canvas);
  const center = {
    x: canvasBox.x + canvasBox.width * 0.5,
    y: canvasBox.y + canvasBox.height * 0.5,
  };
  const aimRadius = Math.min(canvasBox.width, canvasBox.height) * 0.34;
  const combatPattern = [
    { movement: 'ArrowRight', aim: { x: -1, y: 0 } },
    { movement: 'ArrowDown', aim: { x: 0, y: -1 } },
    { movement: 'ArrowLeft', aim: { x: 1, y: 0 } },
    { movement: 'ArrowUp', aim: { x: 0, y: 1 } },
  ] as const;
  await page.mouse.move(
    center.x + combatPattern[0].aim.x * aimRadius,
    center.y + combatPattern[0].aim.y * aimRadius,
  );
  await page.mouse.down();
  const modal = page.getByTestId('levelup-modal');
  const result = page.getByTestId('result-stage');
  let activeMovement: string | null = null;
  try {
    for (let step = 0; step < 24 && !(await modal.isVisible()); step += 1) {
      expect(await result.isVisible(), 'the natural level-up route must not end in defeat').toBe(false);
      const phase = combatPattern[step % combatPattern.length];
      if (activeMovement) await page.keyboard.up(activeMovement);
      activeMovement = phase.movement;
      await page.keyboard.down(activeMovement);
      await page.mouse.move(
        center.x + phase.aim.x * aimRadius,
        center.y + phase.aim.y * aimRadius,
      );
      await page.keyboard.press('Space');
      await page.waitForTimeout(1_500);
    }
    await expect(modal).toBeVisible({ timeout: 5_000 });
  } finally {
    if (activeMovement) await page.keyboard.up(activeMovement);
    await page.mouse.up();
  }
  return modal;
}

for (const viewport of LOW_HEIGHT_DESKTOPS) {
  test.describe(`low-height desktop level-up at ${viewport.width}x${viewport.height}`, () => {
    test.use({
      viewport,
      screen: viewport,
      hasTouch: false,
      isMobile: false,
    });

    test('keeps the natural level-two protocol picker fully visible and concise', async ({ page }) => {
      test.setTimeout(75_000);
      const pageErrors = watchPageErrors(page);
      await page.addInitScript(() => {
        Date.now = () => 1_700_000_000_000;
      });

      const modal = await reachNaturalFirstLevelUp(page);
      await expect(modal).toHaveAttribute('data-layout', 'responsive');
      const viewportRect = { x: 0, y: 0, width: viewport.width, height: viewport.height };
      const modalBox = await visibleRect(modal);
      const panel = page.locator('.ui-levelup');
      const panelBox = await visibleRect(panel);
      const header = panel.locator('.ui-levelup__header');
      const headerBox = await visibleRect(header);
      const cardsRegion = panel.locator('.ui-levelup__cards');
      const cardsRegionBox = await visibleRect(cardsRegion);
      const footer = panel.locator('.ui-levelup__footer');
      const footerBox = await visibleRect(footer);
      const reroll = page.getByTestId('levelup-reroll');
      const rerollBox = await visibleRect(reroll);

      for (const rect of [modalBox, panelBox, headerBox, cardsRegionBox, footerBox, rerollBox]) {
        expectRectContained(rect, viewportRect);
      }
      for (const rect of [headerBox, cardsRegionBox, footerBox, rerollBox]) {
        expectRectContained(rect, panelBox);
      }
      expect(panelBox.height).toBeLessThanOrEqual(470.5);
      expect(headerBox.height).toBeLessThanOrEqual(45.5);
      expect(footerBox.height).toBeLessThanOrEqual(42.5);
      expect(rerollBox.height).toBeGreaterThanOrEqual(38);
      expect(overlapArea(headerBox, cardsRegionBox)).toBe(0);
      expect(overlapArea(cardsRegionBox, footerBox)).toBe(0);

      const overlayScroll = await modal.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      expect(['auto', 'scroll']).toContain(overlayScroll.overflowY);
      expect(overlayScroll.scrollHeight).toBeLessThanOrEqual(overlayScroll.clientHeight + 1);

      const cards = panel.locator('.ui-upgrade-card');
      await expect(cards).toHaveCount(3);
      // The first card is auto-focused and intentionally scales by 1.005.
      // Move focus and hover before measuring the untransformed three-card grid.
      await reroll.focus();
      await expect(reroll).toBeFocused();
      await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
      const cardBoxes: ElementRect[] = [];
      const titles: string[] = [];
      const optionIds: string[] = [];
      let essentialDescriptionCount = 0;

      for (let index = 0; index < 3; index += 1) {
        const card = page.getByTestId(`upgrade-card-${index}`);
        const cardBox = await visibleRect(card);
        cardBoxes.push(cardBox);
        expectRectContained(cardBox, viewportRect);
        expectRectContained(cardBox, cardsRegionBox);
        expect(cardBox.height).toBeLessThanOrEqual(350.5);

        const optionId = await card.getAttribute('data-option-id');
        expect(optionId).toBeTruthy();
        optionIds.push(optionId!);

        const art = page.getByTestId(`upgrade-card-art-${index}`);
        const title = page.getByTestId(`upgrade-card-title-${index}`);
        const level = card.locator('.ui-upgrade-card__level');
        const effect = page.getByTestId(`upgrade-card-effect-${index}`);
        const category = card.locator('.ui-upgrade-card__category');
        for (const child of [art, title, level, effect, category]) {
          expectRectContained(await visibleRect(child), cardBox);
        }
        const artBox = await visibleRect(art);
        expect(artBox.height).toBeGreaterThanOrEqual(119.5);
        expect(artBox.height).toBeLessThanOrEqual(120.5);

        const image = art.locator('img');
        await expect(image).toHaveCount(1);
        await expect(image).toBeVisible();
        expect(await image.evaluate((element: HTMLImageElement) => (
          element.complete && element.naturalWidth > 0 && element.naturalHeight > 0
        ))).toBe(true);

        const titleText = (await title.innerText()).trim();
        const fullTitle = await title.getAttribute('data-full-title');
        const effectText = (await effect.innerText()).trim();
        expect(titleText.length).toBeGreaterThan(0);
        expect(fullTitle?.length).toBeGreaterThan(0);
        expect(titleText).not.toMatch(/\s+lv\.?\s*\d+\s*$/iu);
        expect(effectText.length).toBeGreaterThan(0);
        titles.push(titleText);

        await expect(card.locator('.ui-upgrade-card__header kbd')).toBeHidden();
        await expect(card.locator('.ui-upgrade-card__rarity')).toBeHidden();
        await expect(card.locator('.ui-upgrade-card__new')).toBeHidden();
        await expect(card.locator('.ui-upgrade-card__current')).toBeHidden();
        await expect(page.getByTestId(`upgrade-card-select-${index}`)).toBeHidden();
        await expect(effect.locator('span')).toBeHidden();

        const isNewActive = await card.getAttribute('data-upgrade-category') === 'active'
          && await card.getAttribute('data-is-new') === 'true';
        const description = card.locator('.ui-upgrade-card__description');
        if (isNewActive) {
          essentialDescriptionCount += 1;
          await expect(description).toBeVisible();
          await expect(description).toHaveClass(/is-mobile-essential/);
          expectRectContained(await visibleRect(description), cardBox);
        } else {
          await expect(description).toBeHidden();
        }

        const visibleCopy = (await card.innerText())
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        expect(visibleCopy).not.toContain('NEW');
        expect(visibleCopy).not.toContain('CURRENT');
        expect(visibleCopy).not.toContain('SELECT PROTOCOL');
        expect(visibleCopy).not.toContain('UPGRADE EFFECT');
        expect(visibleCopy).not.toContain('LOCKED');
        expect(visibleCopy.filter((line) => line === titleText)).toHaveLength(1);
        expect(visibleCopy.filter((line) => line === effectText)).toHaveLength(1);

        await card.focus();
        await expect(card).toBeFocused();
      }

      expect(new Set(optionIds).size).toBe(3);
      expect(new Set(titles).size).toBe(3);
      expect(essentialDescriptionCount).toBe(2);
      for (const cardBox of cardBoxes.slice(1)) {
        expect(Math.abs(cardBox.y - cardBoxes[0].y)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(cardBox.width - cardBoxes[0].width)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(cardBox.height - cardBoxes[0].height)).toBeLessThanOrEqual(0.5);
      }

      await expect(header.locator('.ui-eyebrow')).toBeHidden();
      await expect(header.locator('#level-up-description')).toBeHidden();
      await expect(header.locator('.ui-levelup__status')).toBeHidden();
      await expect(footer.locator('p')).toBeHidden();
      await expect(reroll).toBeEnabled();
      await reroll.focus();
      await expect(reroll).toBeFocused();

      await page.getByTestId('upgrade-card-0').click();
      await expect(modal).toBeHidden();
      await expect(page.getByTestId('deployment-hud')).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  });
}

test.describe('low-height coarse pointer compatibility', () => {
  const viewport = { width: 1404, height: 648 };
  test.use({
    viewport,
    screen: viewport,
    hasTouch: true,
    isMobile: true,
  });

  test('uses the same compact level-up geometry at screenshot dimensions', async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors = watchPageErrors(page);
    await page.addInitScript(() => {
      Date.now = () => 1_700_000_000_000;
    });
    await page.goto('/');
    await page.getByTestId('start-game').click();
    const attack = page.getByTestId('mobile-attack');
    const attackBox = await visibleRect(attack);
    await page.mouse.move(attackBox.x + attackBox.width / 2, attackBox.y + attackBox.height / 2);
    await page.mouse.down();
    const modal = page.getByTestId('levelup-modal');
    try {
      await expect(modal).toBeVisible({ timeout: 45_000 });
    } finally {
      await page.mouse.up();
    }

    const panelBox = await visibleRect(page.locator('.ui-levelup'));
    expect(panelBox.height).toBeLessThanOrEqual(470.5);
    const cards = page.locator('.ui-upgrade-card');
    await expect(cards).toHaveCount(3);
    await page.getByTestId('levelup-reroll').focus();
    for (let index = 0; index < 3; index += 1) {
      const cardBox = await visibleRect(page.getByTestId(`upgrade-card-${index}`));
      expect(cardBox.height).toBeLessThanOrEqual(350.5);
      expectRectContained(cardBox, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }
    const overlayScroll = await modal.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(overlayScroll.scrollHeight).toBeLessThanOrEqual(overlayScroll.clientHeight + 1);
    expect(pageErrors).toEqual([]);
  });
});
