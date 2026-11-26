import { buildAt, expect, game, home, newFarm, tapTile, test } from './helpers';

test('levels table, Sentinel Tree, Buffalo Ridge and ringing the Bell Post', async ({ page }) => {
  await newFarm(page);
  await page.getByTestId('hud-level').click();
  await expect(page.getByTestId('levels')).toContainText('Legacy Builder');
  await page.locator('[data-testid=levels] .close').click();

  const t = home(6, 3);
  await tapTile(page, t.x, t.y);
  await page.getByTestId('visit-sentinel').click();
  expect(await game(page, "s.achievements.includes('visit_sentinel')")).toBe(true);

  const r = home(8, 1);
  await tapTile(page, r.x, r.y);
  await page.getByTestId('ridge-view').click();
  expect(await game(page, "s.achievements.includes('visit_ridge')")).toBe(true);

  await page.evaluate(() => { const g = (window as any).__game; (window as any).__sim.addXp(g.s, (window as any).__sim.xpForLevel(7)); g.s.money = 50000; });
  const c = home(6, 6);
  await buildAt(page, 'container', c.x, c.y);
  const b = home(5, 6);
  await buildAt(page, 'bell_post', b.x, b.y, '2 · Basecamp');
  await page.evaluate(() => { (window as any).__game.dirty = true; });
  await page.getByTestId('bubble-bell').click({ force: true });
  expect(await game(page, 's.bell.length')).toBe(0);
  expect(await game<number>(page, 's.stats.bellRung')).toBe(1);
});
