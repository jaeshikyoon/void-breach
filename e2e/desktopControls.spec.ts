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

const DESKTOP_VIEWPORTS: readonly ViewportSize[] = [
  { width: 1672, height: 937 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

const CONTROL_CONTRACTS = [
  { id: 'move', key: 'WASD', action: '이동' },
  { id: 'aim', key: '마우스', action: '조준' },
  { id: 'fire', key: 'LMB', action: '사격' },
  { id: 'dodge', key: 'SPACE', action: '회피' },
  { id: 'skills', key: 'Q · E · R', action: '스킬' },
  { id: 'pause', key: 'ESC', action: '일시정지' },
] as const;

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function startGame(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const start = page.getByTestId('start-game');
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.getByTestId('deployment-hud')).toBeVisible();
}

async function visibleRect(locator: Locator): Promise<ElementRect> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'visible element must expose a bounding box').not.toBeNull();
  return box!;
}

function expectRectContained(rect: ElementRect, viewport: ViewportSize) {
  expect(rect.x).toBeGreaterThanOrEqual(-0.5);
  expect(rect.y).toBeGreaterThanOrEqual(-0.5);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 0.5);
}

function expectChildContained(child: ElementRect, parent: ElementRect) {
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

for (const viewport of DESKTOP_VIEWPORTS) {
  test.describe(`desktop controls help at ${viewport.width}x${viewport.height}`, () => {
    test.use({
      viewport,
      screen: viewport,
      hasTouch: false,
      isMobile: false,
    });

    test('shows all six controls inside the viewport without covering combat HUD', async ({ page }) => {
      const pageErrors = watchPageErrors(page);
      await startGame(page);

      const help = page.getByTestId('desktop-controls-help');
      await expect(help).toBeVisible();
      await expect(help).toHaveAccessibleName('PC 전투 조작 안내');
      await expect(help.locator('.ui-desktop-control')).toHaveCount(CONTROL_CONTRACTS.length);
      const helpBox = await visibleRect(help);
      expectRectContained(helpBox, viewport);
      const controlBoxes: ElementRect[] = [];

      for (const control of CONTROL_CONTRACTS) {
        const item = page.getByTestId(`desktop-control-${control.id}`);
        await expect(item).toBeVisible();
        await expect(item.locator('kbd')).toHaveText(control.key);
        await expect(item.locator('b')).toHaveText(control.action);
        expect(await item.locator('kbd').evaluate((element) => (
          Number.parseFloat(getComputedStyle(element).fontSize)
        ))).toBeGreaterThanOrEqual(8);
        expect(await item.locator('b').evaluate((element) => (
          Number.parseFloat(getComputedStyle(element).fontSize)
        ))).toBeGreaterThanOrEqual(9);
        const itemBox = await visibleRect(item);
        controlBoxes.push(itemBox);
        expectRectContained(itemBox, viewport);
        expectChildContained(itemBox, helpBox);
      }

      if (viewport.width === 1366) {
        expect(helpBox.x + helpBox.width).toBeLessThanOrEqual(370.5);
        const rowCenters = controlBoxes.map((box) => Math.round(box.y + box.height / 2));
        expect(new Set(rowCenters).size).toBe(2);
        expect(new Set(rowCenters.slice(0, 3)).size).toBe(1);
        expect(new Set(rowCenters.slice(3)).size).toBe(1);
        expect(rowCenters[3]).toBeGreaterThan(rowCenters[0]);
      }

      const overflow = await help.evaluate((element) => ({
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 1);

      const hudRegions = [
        page.locator('.ui-hud__top-left'),
        page.locator('.ui-hud__top-center'),
        page.locator('.ui-hud__top-right'),
        page.locator('.ui-hud__xp'),
        page.locator('.ui-hud__skills'),
      ];
      for (const region of hudRegions) {
        expect(overlapArea(helpBox, await visibleRect(region))).toBe(0);
      }
      const trayBox = await visibleRect(page.getByTestId('desktop-skill-tray'));
      expect(overlapArea(helpBox, trayBox)).toBe(0);
      expect(trayBox.x - (helpBox.x + helpBox.width)).toBeGreaterThanOrEqual(12);
      expect(pageErrors).toEqual([]);
    });
  });
}

test.describe('desktop controls help on coarse mobile input', () => {
  const viewport = { width: 844, height: 390 };
  test.use({
    viewport,
    screen: viewport,
    hasTouch: true,
    isMobile: true,
  });

  test('stays hidden while mobile controls are active', async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await startGame(page);

    await expect(page.getByTestId('mobile-controls')).toBeVisible();
    const help = page.getByTestId('desktop-controls-help');
    await expect(help).toHaveCount(1);
    await expect(help).toBeHidden();
    for (const control of CONTROL_CONTRACTS) {
      await expect(page.getByTestId(`desktop-control-${control.id}`)).toBeHidden();
    }
    expect(pageErrors).toEqual([]);
  });
});
