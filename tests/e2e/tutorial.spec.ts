import { expect, nameFarm, test } from './helpers';

test('a new farm walks through the beginner tutorial', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-0').click();
  await nameFarm(page, 'Tutorial Farm');
  const tut = page.getByTestId('tutorial');
  await expect(tut).toContainText('Welcome to the 80');
  await page.getByTestId('tutorial-next').click();
  await expect(tut).toContainText('Till a field');
  // Doing the step advances the tour.
  await page.evaluate(() => { const g = (window as any).__game, S = (window as any).__sim; const p = S.homeToWorld(0, 0); S.till(g.s, S.idx(g.s, p.x, p.y)); });
  await expect(tut).toContainText('Plant a crop');
  await page.getByTestId('tutorial-skip').click();
  await expect(tut).toBeHidden();
});
