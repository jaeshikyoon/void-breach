import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 1404, height: 768 },
  screen: { width: 1404, height: 768 },
  hasTouch: true,
  isMobile: true,
});

test('keeps protocol cards image-first on tall mobile landscape', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  const attack = page.getByTestId('mobile-attack');
  await expect(attack).toBeVisible();
  const attackBox = await attack.boundingBox();
  expect(attackBox).not.toBeNull();
  await page.mouse.move(attackBox!.x + attackBox!.width / 2, attackBox!.y + attackBox!.height / 2);
  await page.mouse.down();
  const modal = page.getByTestId('levelup-modal');
  try {
    await expect(modal).toBeVisible({ timeout: 45_000 });
  } finally {
    await page.mouse.up();
  }
  const cards = page.locator('[data-testid^="upgrade-card-"]:not([data-testid*="-art-"]):not([data-testid*="-title-"]):not([data-testid*="-effect-"]):not([data-testid*="-select-"])');
  await expect(cards).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const card = page.getByTestId(`upgrade-card-${index}`);
    const art = page.getByTestId(`upgrade-card-art-${index}`);
    const body = card.locator('.ui-upgrade-card__body');
    const metrics = await card.evaluate((element) => {
      const artElement = element.querySelector('.ui-upgrade-card__art')!;
      const bodyElement = element.querySelector('.ui-upgrade-card__body')!;
      const image = element.querySelector('.ui-upgrade-card__art img')!;
      const rect = (node: Element) => node.getBoundingClientRect();
      return {
        card: rect(element),
        art: rect(artElement),
        body: rect(bodyElement),
        objectFit: getComputedStyle(image).objectFit,
        titleSize: Number.parseFloat(getComputedStyle(element.querySelector('h3')!).fontSize),
        effectSize: Number.parseFloat(getComputedStyle(element.querySelector('.ui-upgrade-card__effect')!).fontSize),
      };
    });
    expect(metrics.art.height / metrics.card.height).toBeGreaterThanOrEqual(.64);
    expect(metrics.art.height / metrics.card.height).toBeLessThanOrEqual(.76);
    expect(metrics.body.height / metrics.card.height).toBeGreaterThanOrEqual(.20);
    expect(metrics.objectFit).toBe('contain');
    expect(metrics.titleSize).toBeGreaterThanOrEqual(15);
    expect(metrics.effectSize).toBeGreaterThanOrEqual(11);
    await expect(art).toBeVisible();
    await expect(body).toBeVisible();
  }
});
