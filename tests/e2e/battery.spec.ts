import { expect, newFarm, test } from './helpers';

/** Counts real draws of the 3D scene over `ms`. */
const drawsPerSec = (page: import('@playwright/test').Page, ms = 3000) => page.evaluate(async (ms) => {
  const R = (window as any).__game.view.renderer; let n = 0; const orig = R.render.bind(R);
  R.render = (a: any, b: any) => { n++; orig(a, b); };
  await new Promise((r) => setTimeout(r, ms)); R.render = orig; return n / (ms / 1000);
}, ms);

test('battery saver: draws at most 30 fps, and barely at all behind a menu', async ({ page }) => {
  await page.addInitScript(() => { localStorage.removeItem('ff-low'); localStorage.setItem('ff-quality', 'battery'); });
  await newFarm(page);
  expect(await drawsPerSec(page)).toBeLessThanOrEqual(32);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(await drawsPerSec(page)).toBeLessThanOrEqual(3);
});

test('the graphics switch cycles Battery saver → High quality → Lowest and is remembered', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.removeItem('ff-low'); localStorage.removeItem('ff-quality'); sessionStorage.setItem('seeded', '1'); } });
  await newFarm(page);
  const quality = async () => { await page.getByRole('button', { name: 'Menu' }).click(); return page.getByTestId('quality'); };
  await expect(await quality()).toContainText('Battery saver'); // the default
  await page.getByTestId('quality').click();
  await expect(await quality()).toContainText('High quality');
  expect(await page.evaluate(() => (window as any).__game.view.fps)).toBe(60);
  await page.getByTestId('quality').click();
  await expect(await quality()).toContainText('Lowest');
  expect(await page.evaluate(() => localStorage.getItem('ff-quality'))).toBe('low');
  await page.reload();
  await page.getByTestId('continue').click();
  await expect(await quality()).toContainText('Lowest');
});
