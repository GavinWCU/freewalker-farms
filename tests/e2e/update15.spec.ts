import { expect, game, newFarm, tapTile, test } from './helpers';
import type { Page } from '@playwright/test';

/** Builds something straight through the sim (the build menu itself is covered elsewhere) and returns its tile. */
async function place(page: Page, type: string, terrain: string) {
  return page.evaluate(([type, terrain]) => {
    const g = (window as any).__game, S = (window as any).__sim, s = g.s;
    s.money = 1e6; s.level = 20; s.time.minute = 10 * 60;
    const i = s.tiles.findIndex((t: any, j: number) => t.owned && t.t === terrain && !t.b && S.canBuild(s, type, j % s.w, Math.floor(j / s.w)).ok);
    const r = S.build(s, type, i % s.w, Math.floor(i / s.w)); g.dirty = true;
    if (!r.ok) throw new Error(r.msg);
    return { x: i % s.w, y: Math.floor(i / s.w) };
  }, [type, terrain]);
}

test('an old v3 save loads and keeps its farm', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('title-import').click();
  await (await chooser).setFiles('tests/fixtures/save-v3.json');
  await expect(page.getByTestId('continue')).toContainText('Fixture Farm v3');
  await page.getByTestId('continue').click();
  expect(await game(page, 's.saveVersion')).toBe(4);
  expect(await game(page, 's.cattle.length')).toBe(3);
  expect(await game(page, 's.buffalo.length')).toBe(0);
  expect(await game(page, 's.buildings.some((b) => b.type === "wind_turbine")')).toBe(true);
  await page.evaluate(() => (window as any).__game.fastForward(1440 * 3));
  expect(await game(page, 'Number.isFinite(s.money)')).toBe(true);
});

test('drive to town: cash the subsidy check, sell to the chef, buy insurance, drive home', async ({ page }) => {
  await newFarm(page);
  const t0 = await game<number>(page, 's.time.day * 1440 + s.time.minute');
  await page.getByTestId('btn-town').click();
  await expect(page.getByTestId('town-street')).toBeVisible();
  for (const shop of ['store', 'diner', 'bank', 'post', 'insurance']) await expect(page.getByTestId(`shop-${shop}`)).toBeVisible();
  // Post office
  const m0 = await game<number>(page, 's.money');
  await page.getByTestId('shop-post').click();
  await page.getByTestId('cash-subsidy').click();
  expect(await game<number>(page, 's.money')).toBeGreaterThan(m0);
  await expect(page.getByTestId('cash-subsidy')).toHaveCount(0);
  await page.getByTestId('post').getByRole('button', { name: 'Close' }).click();
  // Diner
  const item = await page.evaluate(() => { const g = (window as any).__game, S = (window as any).__sim; const o = S.chefOrders(g.s)[0]; g.s.inventory[o.item] = 50; return o.item; });
  await page.getByTestId('shop-diner').click();
  await page.getByTestId(`chef-${item}`).click();
  expect(await game<number>(page, `s.inventory.${item}`)).toBeLessThan(50);
  await page.getByTestId('diner').getByRole('button', { name: 'Close' }).click();
  // Insurance
  await page.getByTestId('shop-insurance').click();
  await page.getByTestId('buy-insurance').click();
  await expect(page.getByTestId('insurance')).toContainText('You are covered');
  await page.getByTestId('insurance').getByRole('button', { name: 'Close' }).click();
  // General store
  await page.getByTestId('shop-store').click();
  await page.getByTestId('store-hay').click();
  expect(await game<number>(page, 's.inventory.hay')).toBe(1);
  await page.getByTestId('store').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('leave-town').click();
  await expect(page.getByTestId('town')).toHaveCount(0);
  expect(await game<number>(page, 's.time.day * 1440 + s.time.minute')).toBeGreaterThanOrEqual(t0 + 60);
});

test('camera: take a picture and find it in the album', async ({ page }) => {
  await newFarm(page);
  await page.getByTestId('btn-camera').click();
  await expect(page.getByTestId('camera')).toBeVisible();
  await expect(page.getByTestId('btn-build')).toBeHidden(); // HUD hidden while framing
  await page.getByTestId('shutter').click();
  await page.getByTestId('camera-album').click();
  const img = page.getByTestId('album-photo').first();
  await expect(img).toBeVisible();
  // Not a blank frame: the picture has real variety in it.
  const spread = await img.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const c = document.createElement('canvas'); c.width = 64; c.height = 48;
    const x = c.getContext('2d')!; x.drawImage(el, 0, 0, 64, 48);
    const d = x.getImageData(0, 0, 64, 48).data; const seen = new Set<number>();
    for (let k = 0; k < d.length; k += 4) seen.add((d[k] >> 4) * 256 + (d[k + 1] >> 4) * 16 + (d[k + 2] >> 4));
    return { w: el.naturalWidth, colors: seen.size };
  });
  expect(spread.w).toBeGreaterThan(200);
  expect(spread.colors).toBeGreaterThan(20);
  // Photos stay out of the farm save, and survive a reload.
  expect(await game<number>(page, 'JSON.stringify(s).length')).toBeLessThan(400000);
  await page.reload();
  await page.getByTestId('continue').click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByTestId('menu-album').click();
  await expect(page.getByTestId('album-photo')).toHaveCount(1);
});

test('buffalo paddock, riding lessons and baling hay', async ({ page }) => {
  await newFarm(page);
  const pen = await place(page, 'buffalo_paddock', 'pasture');
  await tapTile(page, pen.x, pen.y);
  await page.getByTestId('buy-buffalo').click();
  expect(await game<number>(page, 's.buffalo.length')).toBe(1);
  const stable = await place(page, 'horse_stable', 'pasture');
  await tapTile(page, stable.x, stable.y);
  const m = await game<number>(page, 's.money');
  await page.getByTestId('teach-lesson').click();
  expect(await game<number>(page, 's.money')).toBeGreaterThan(m);
  const field = await page.evaluate(() => { const g = (window as any).__game, S = (window as any).__sim, s = g.s; const i = s.tiles.findIndex((_: any, j: number) => S.hayable(s, j) && S.seasonOf(s.time.day) !== 3); return { x: i % s.w, y: Math.floor(i / s.w) }; });
  await tapTile(page, field.x, field.y);
  await page.getByTestId('bale-hay').click();
  expect(await game<number>(page, 's.inventory.hay')).toBeGreaterThan(0);
});
