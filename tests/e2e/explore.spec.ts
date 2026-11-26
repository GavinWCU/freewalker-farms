import { expect, game, newFarm, tapTile, test } from './helpers';

test('drive with the keyboard and the joystick, switch vehicles, go fishing, collect a find', async ({ page }) => {
  await newFarm(page);
  const x0 = await game<number>(page, 's.player.x');
  await page.keyboard.down('d');
  await page.waitForTimeout(800);
  await page.keyboard.up('d');
  expect(await game<number>(page, 's.player.x')).not.toBe(x0);

  // joystick drag
  const stick = page.getByTestId('joystick');
  const b = (await stick.boundingBox())!;
  const before = await game<number>(page, 's.player.y');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 3 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  expect(await game<number>(page, 's.player.y')).not.toBe(before);

  await page.evaluate(() => { const g = (window as any).__game; const p = g.s.parked.truck; g.s.player.x = p.x; g.s.player.y = p.y; });
  await page.getByTestId('vehicle-truck').click();
  expect(await game(page, 's.player.vehicle')).toBe('truck');

  const shore = await game<{ x: number; y: number }>(page, '__sim.xy(s, s.tiles.findIndex((_, k) => __sim.fishingSpot(s, k) === "shore"))');
  await tapTile(page, shore.x, shore.y);
  await page.getByTestId('go-fishing').click();
  await page.getByTestId('fish-reel').click();
  await expect(page.getByTestId('fish-result')).toContainText(/lb|away/);

  await page.locator('[data-testid=fishing] .close').click();
  await page.evaluate(() => { const g = (window as any).__game; g.s.gifts.push({ x: g.s.player.x, y: g.s.player.y, item: 'nickel', value: 150 }); g.dirty = true; });
  const m = await game<number>(page, 's.money');
  await page.getByTestId('bubble-gift').first().click({ force: true });
  expect(await game<number>(page, 's.money')).toBe(m + 150);
});
