import { readFileSync } from 'node:fs';
import { buildAt, expect, game, home, newFarm, saveNow, tapTile, test } from './helpers';

test('new game, build a container, farm a field, and Continue restores it exactly', async ({ page }) => {
  await newFarm(page);
  const c = home(6, 6);
  await buildAt(page, 'container', c.x, c.y);
  expect(await game(page, "s.buildings.map(b => b.type)")).toEqual(['container']);

  const f = home(0, 1);
  await tapTile(page, f.x, f.y);
  await page.getByTestId('act-till').click();
  await page.getByTestId('plant-corn').click();
  expect(await game(page, `s.tiles[${f.y} * s.w + ${f.x}].f.crop`)).toBe('corn');
  await page.evaluate(() => (window as any).__game.fastForward(1440 * 9));
  await page.getByTestId('bubble-field').first().click({ force: true });
  expect(await game<number>(page, 's.inventory.corn')).toBeGreaterThan(0);

  await page.evaluate(() => { (window as any).__game.paused = true; });
  await saveNow(page);
  const before = await game<string>(page, 'JSON.stringify(s)');
  await page.reload();
  await expect(page.getByTestId('continue-info')).toContainText('80 acres');
  const after = await page.evaluate(() => { (document.querySelector('[data-testid=continue]') as HTMLElement).click(); return new Promise<string>((r) => setTimeout(() => { const g = (window as any).__game; g.paused = true; r(JSON.stringify(g.s)); }, 0)); });
  const a = JSON.parse(before), b = JSON.parse(after);
  expect(b.time.day).toBe(a.time.day);
  delete a.time; delete b.time;
  expect(b).toEqual(a);
});

test('a corrupted newest save falls back to the previous one', async ({ page }) => {
  await newFarm(page);
  await page.evaluate(() => { const g = (window as any).__game; g.paused = true; g.s.money = 11111; });
  await saveNow(page);
  await page.evaluate(() => { (window as any).__game.s.money = 22222; });
  await saveNow(page);
  // Corrupt the newest rotation entry directly in IndexedDB.
  await page.evaluate(() => new Promise<void>((res) => {
    const req = indexedDB.open('freewalker-farms', 1);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
      const m = st.get('slot0/meta');
      m.onsuccess = () => { st.put('{"corrupt": tru', `slot0/r${JSON.parse(m.result).head}`); };
      tx.oncomplete = () => res();
    };
  }));
  await page.reload();
  await expect(page.getByTestId('fallback-notice')).toBeVisible();
  await page.getByTestId('continue').click();
  expect(await game(page, 's.money')).toBe(11111);
});

test('export then import a save', async ({ page, browser }) => {
  await newFarm(page, 'Export Farm');
  await page.evaluate(() => { const g = (window as any).__game; g.paused = true; g.s.money = 4321; });
  await saveNow(page);
  await page.getByTestId('btn-menu').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export').click();
  const path = await (await dl).path();
  const text = readFileSync(path!, 'utf8');
  expect(JSON.parse(text).farmName).toBe('Export Farm');
  // Import it on "another device": a fresh browser profile.
  const other = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await other.addInitScript(() => localStorage.setItem('ff-low', '1'));
  await other.goto('http://localhost:4173/');
  const chooser = other.waitForEvent('filechooser');
  await other.getByTestId('title-import').click();
  await (await chooser).setFiles(path!);
  await expect(other.getByTestId('continue')).toContainText('Export Farm');
  await other.getByTestId('continue').click();
  expect(await game(other, 's.money')).toBe(4321);
  await other.context().close();
});

test('loads an old-version (v1) save fixture', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('title-import').click();
  await (await chooser).setFiles('tests/fixtures/save-v1.json');
  await expect(page.getByTestId('continue')).toContainText('Fixture Farm');
  await page.getByTestId('continue').click();
  expect(await game(page, 's.buildings.length')).toBeGreaterThan(0);
});
