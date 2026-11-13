import { test, expect, devices } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateTour } from '../../src/tour-loader.js';

test('tour opens in the garden, on the garden map', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#header h1')).toHaveText('Beskydská chalupa Trojanovice');
  await expect(page.locator('.psv-caption-content')).toHaveText('Před chalupou', { timeout: 30_000 });
  await expect(page.locator('.psv-map')).toBeVisible();
  await expect(page.locator('.floor-tabs button.is-active')).toHaveText('Zahrada');
});

test('a link leads to the next room', async ({ page }) => {
  await page.goto('/?house=trojanovice&room=chodba2');
  await expect(page.locator('.psv-caption-content')).toHaveText('Chodba u kuchyně', { timeout: 30_000 });
  // The doorway to the living room is straight ahead.
  const link = page.locator('.tour-link[data-to="obyvak"]');
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/room=obyvak/, { timeout: 30_000 });
  await expect(page.locator('.psv-caption-content')).toHaveText('Obývací pokoj', { timeout: 30_000 });
});

test('deep link opens the requested room', async ({ page }) => {
  await page.goto('/?house=trojanovice&room=koupelna');
  // Link arrows only exist in the DOM while inside the field of view, so assert on the caption instead.
  await expect(page.locator('.psv-caption-content')).toHaveText('Koupelna', { timeout: 30_000 });
  await expect(page).toHaveURL(/room=koupelna/);
});

test('room on the upper floor shows the minimap', async ({ page }) => {
  await page.goto('/?house=trojanovice&room=loznice2');
  await expect(page.locator('.psv-caption-content')).toHaveText('Ložnice 2', { timeout: 30_000 });
  await expect(page.locator('.psv-map')).toBeVisible();
});

test('plan has a tab for each floor', async ({ page }) => {
  await page.goto('/?house=trojanovice&room=loznice2');
  await expect(page.locator('.psv-caption-content')).toHaveText('Ložnice 2', { timeout: 30_000 });
  const active = page.locator('.floor-tabs button.is-active');
  await expect(active).toHaveText('Podkroví');
  await page.locator('.floor-tabs button', { hasText: 'Přízemí' }).click();
  await expect(active).toHaveText('Přízemí');
  // Looking at another floor does not leave the room.
  await expect(page.locator('.psv-caption-content')).toHaveText('Ložnice 2');
});

test('unknown house shows czech error', async ({ page }) => {
  await page.goto('/?house=neexistuje');
  await expect(page.locator('.error-screen')).toHaveText('Prohlídka „neexistuje“ neexistuje.');
});

test('editor exports a valid tour.json', async ({ page }) => {
  page.on('dialog', (d) => d.dismiss());
  await page.goto('/?house=trojanovice&edit');
  await expect(page.locator('.editor-panel')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-action="export"]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('tour.json');
  const json = JSON.parse(await readFile(await download.path(), 'utf8'));
  const { tour } = validateTour(json);
  expect(tour.rooms).toHaveLength(22);
});

test.describe('on a phone', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);

  test('minimap is small and a tap opens the full plan', async ({ page }) => {
    await page.goto('/?house=trojanovice&room=chodba');
    const map = page.locator('.psv-map');
    await expect(map).toBeVisible({ timeout: 30_000 });
    const box = await map.boundingBox();
    expect(box.width).toBeLessThanOrEqual(150);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.psv-map--maximized')).toHaveCount(1);
    await expect(page).toHaveURL(/room=chodba/);
  });
});
