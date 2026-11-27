import { test as base, expect, type Page } from '@playwright/test';

/** Functional tests run in low-quality mode: software WebGL in CI is slow. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => { localStorage.setItem('ff-low', '1'); if (!localStorage.getItem('ff-notes-seen')) localStorage.setItem('ff-notes-seen', '999'); });
    await use(page);
  },
});
export { expect };

export const HOME = { x: 19, y: 13 }; // world tile of the home 80's top-left (see src/sim/map/home80.ts)
export const home = (col: number, row: number) => ({ x: HOME.x + col, y: HOME.y + row });

export async function newFarm(page: Page, name = 'E2E Farm') {
  await page.goto('/');
  await page.getByTestId('new-0').click();
  await nameFarm(page, name);
  await expect(page.getByTestId('title')).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__game?.saveCount > 0);
  await page.getByTestId('tutorial-skip').click();
}

/** Fills in the in-game "Name your farm" dialog. */
export async function nameFarm(page: Page, name: string) {
  await page.getByTestId('ask-input').fill(name);
  await page.getByTestId('ask-ok').click();
}

/** Taps the centre of a world tile, after making sure it is on screen. */
export async function tapTile(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => { const g = (window as any).__game; g.closeSheet(); g.view.focus(x + 0.5, y + 0.5); }, [x, y]);
  await page.waitForTimeout(100);
  const p = await page.evaluate(([x, y]) => (window as any).__game.tileScreen(x, y), [x, y]);
  await page.mouse.click(p.x, p.y);
}

export const game = <T>(page: Page, f: string) => page.evaluate(`(() => { const g = window.__game, s = g.s; return ${f}; })()`) as Promise<T>;

export async function saveNow(page: Page) {
  const before = await game<number>(page, 'g.saveCount');
  await page.evaluate(() => (window as any).__game.save());
  await page.waitForFunction((n) => (window as any).__game.saveCount > n, before);
}

/** Opens the build menu and places a building on a tile. */
export async function buildAt(page: Page, type: string, x: number, y: number, tier?: string) {
  await page.getByTestId('btn-build').click();
  if (tier) await page.getByRole('button', { name: tier }).click();
  await page.getByTestId(`build-${type}`).click();
  await tapTile(page, x, y);
  await page.getByTestId('confirm-place').click();
  await expect(page.getByTestId('banner')).toHaveCount(0);
}
