import { expect, game, home, newFarm, tapTile, test } from './helpers';

test('buy a neighbor parcel, lease one out, rent one in, take a loan', async ({ page }) => {
  await newFarm(page);
  const n = home(-1, 3);
  await tapTile(page, n.x, n.y);
  await page.getByTestId('buy-parcel').click();
  await expect(page.getByTestId('hud-acres')).toContainText('81 acres');
  expect(await game(page, `s.tiles[${n.y} * s.w + ${n.x}].owned`)).toBe(true);

  const p = home(9, 3);
  await tapTile(page, p.x, p.y);
  await page.getByTestId('lease-out').click();
  await expect(page.getByTestId('lease-dialog')).toBeVisible();
  await page.getByTestId('accept-offer-0').click();
  expect(await game(page, "s.leases.filter(l => l.dir === 'out').length")).toBe(1);
  await tapTile(page, p.x, p.y);
  await expect(page.getByTestId('lease-info')).toContainText('Leased to');

  const r = await game<{ x: number; y: number }>(page, "(() => { const i = s.tiles.findIndex((t, k) => (t.t === 'crop' || t.t === 'pasture') && !t.lease && __sim.isBuyable(s, k)); return __sim.xy(s, i); })()");
  await tapTile(page, r.x, r.y);
  await page.getByTestId('lease-in-1').click();
  expect(await game(page, "s.leases.filter(l => l.dir === 'in').length")).toBe(1);

  await page.getByTestId('btn-land').click();
  await page.getByTestId('loan-amount').fill('5000');
  await page.getByTestId('borrow').click();
  expect(await game(page, 's.loan.principal')).toBe(5000);
});
