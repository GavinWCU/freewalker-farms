import { expect, nameFarm, newFarm, tapTile, test } from './helpers';

test('patch notes show once after loading in, only what is new, and can be reopened', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ff-notes-seen', '1.3'); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/');
  await page.getByTestId('new-0').click();
  await nameFarm(page, 'Notes Farm');
  const notes = page.getByTestId('patch-notes');
  await expect(notes).toContainText('Fast forward');
  await expect(notes).not.toContainText('Battery saver'); // already seen
  await page.getByTestId('notes-ok').click();
  await expect(notes).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__game?.saveCount > 0);
  await page.reload();
  await page.getByTestId('continue').click();
  await page.waitForTimeout(500);
  await expect(notes).toHaveCount(0); // not again
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByTestId('whats-new').click();
  await expect(notes).toContainText('Battery saver'); // full history from the menu
});

test('fast forward runs the clock faster', async ({ page }) => {
  await newFarm(page);
  const rate = async () => page.evaluate(async () => {
    const s = (window as any).__game.s, t = (x: any) => x.time.day * 1440 + x.time.minute;
    const a = t(s); await new Promise((r) => setTimeout(r, 2000)); return (t(s) - a) / 2;
  });
  const normal = await rate();
  const speed = page.getByTestId('speed');
  await speed.click(); await expect(speed).toContainText('2×');
  await speed.click(); await expect(speed).toContainText('5×');
  await speed.click(); await expect(speed).toContainText('10×');
  const fast = await rate();
  expect(fast).toBeGreaterThan(normal * 6);
  await speed.click(); await expect(speed).toContainText('1×');
});

test('sell an acre you bought', async ({ page }) => {
  await newFarm(page);
  const at = await page.evaluate(() => {
    const g = (window as any).__game, S = (window as any).__sim, s = g.s;
    s.money = 1e6;
    const i = s.tiles.findIndex((_: any, j: number) => S.isBuyable(s, j));
    S.buyParcel(s, i); g.dirty = true;
    return S.xy(s, i);
  });
  await tapTile(page, at.x, at.y);
  await page.getByTestId('sell-parcel').click();
  await page.getByTestId('ask-ok').click();
  await expect.poll(() => page.evaluate(([x, y]) => { const s = (window as any).__game.s; return s.tiles[y * s.w + x].owned; }, [at.x, at.y])).toBe(false);
});
