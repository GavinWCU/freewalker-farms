import { buildAt, expect, game, home, newFarm, saveNow, tapTile, test } from './helpers';

// The full Section 10 journey, then close the page and come back.
test('container → field → farm stand → buy land → lease → Continue restores everything', async ({ page, context }) => {
  await newFarm(page, 'Flow Farm');
  const c = home(6, 6);
  await buildAt(page, 'container', c.x, c.y);

  const f = home(0, 1);
  await tapTile(page, f.x, f.y);
  await page.getByTestId('act-till').click();
  await page.getByTestId('plant-corn').click();
  await page.evaluate(() => (window as any).__game.fastForward(1440 * 9));
  await page.getByTestId('bubble-field').first().click({ force: true });
  expect(await game<number>(page, 's.inventory.corn')).toBeGreaterThan(0);

  // Farm Stand unlocks at level 5 (granted here to keep the test short).
  await page.evaluate(() => { const g = (window as any).__game; (window as any).__sim.addXp(g.s, (window as any).__sim.xpForLevel(5)); });
  const st = home(2, 0);
  await buildAt(page, 'farm_stand', st.x, st.y, '2 · Basecamp');
  await tapTile(page, st.x, st.y);
  await page.getByTestId('manage-stand').click();
  await expect(page.getByTestId('stand-dialog')).toBeVisible();
  await page.getByTestId('stock-corn').click();
  await page.getByTestId('price-corn').fill('20');
  await page.getByTestId('price-corn').dispatchEvent('change');
  await page.locator('[data-testid=stand-dialog] .close').click();
  const before = await game<number>(page, 's.money');
  await page.evaluate(() => (window as any).__game.fastForward(1440));
  expect(await game<number>(page, 's.stand.last.revenue')).toBeGreaterThan(0);
  expect(await game<number>(page, 's.money')).toBeGreaterThan(before);

  const n = home(-1, 3);
  await tapTile(page, n.x, n.y);
  await page.getByTestId('buy-parcel').click();
  await expect(page.getByTestId('hud-acres')).toContainText('81 acres');

  const p = home(9, 3);
  await tapTile(page, p.x, p.y);
  await page.getByTestId('lease-out').click();
  await page.getByTestId('accept-offer-0').click();
  expect(await game(page, "s.leases.length")).toBe(1);

  await page.evaluate(() => { (window as any).__game.paused = true; });
  await saveNow(page);
  const saved = await game<string>(page, 'JSON.stringify(s)');
  await page.close();

  const again = await context.newPage();
  await again.goto('/');
  await expect(again.getByTestId('continue')).toContainText('Flow Farm');
  await expect(again.getByTestId('continue-info')).toContainText('81 acres');
  const restored = await again.evaluate(() => { (document.querySelector('[data-testid=continue]') as HTMLElement).click(); const g = (window as any).__game; g.paused = true; return JSON.stringify(g.s); });
  expect(restored).toBe(saved);
});
