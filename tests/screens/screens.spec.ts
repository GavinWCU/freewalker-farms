import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'screenshots';
const shots: { file: string; title: string; note: string }[] = [];

async function snap(page: Page, file: string, title: string, note: string) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${file}` });
  shots.push({ file, title, note });
}

/** Builds a believable mid-game farm through the sim (fast, deterministic). */
async function midGame(page: Page, minute: number) {
  await page.evaluate((minute) => {
    const g = (window as any).__game, s = g.s, S = (window as any).__sim;
    s.flags.tutorial = 99;
    S.addXp(s, S.xpForLevel(12)); s.money = 400000;
    const B = (t: string, c: number, r: number) => { const p = S.homeToWorld(c, r); return S.build(s, t, p.x, p.y); };
    B('farm_sign', 4, 0); B('farm_stand', 2, 0); B('container', 6, 5); B('camper', 7, 5); B('cabin', 6, 6); B('chicken_coop', 7, 6);
    B('black_barn', 5, 3); B('greenhouse', 4, 5); B('beehives', 5, 6); B('windmill', 5, 5); B('fishing_dock', 7, 7); B('bell_post', 4, 6);
    B('silo', 5, 2); B('cattle_corral', 7, 3); B('solar_panels', 8, 6); B('kims_garden', 4, 7);
    const field = (c: number, r: number, crop: string, grown: number) => {
      const p = S.homeToWorld(c, r), i = S.idx(s, p.x, p.y);
      S.fieldAction(s, i, 'till', null, true); S.fieldAction(s, i, 'plant', crop, true);
      for (const j of S.fieldGroup(s, i, 40)) if (s.tiles[j].f?.crop === crop) s.tiles[j].f.growth = grown;
    };
    field(0, 0, 'wheat', 1); field(0, 4, 'corn', 0.7); field(3, 6, 'soybeans', 1);
    S.buyCalves(s, 6); for (const c of s.cattle) c.age = 20;
    for (const b of s.buildings) if (b.type === 'chicken_coop' || b.type === 'beehives') b.ready = 4;
    const ring: number[] = [];
    for (let c = 7; c < 10; c++) for (let r = 0; r < 3; r++) if (c === 7 || r === 0 || c === 9 || r === 2) { const p = S.homeToWorld(c, r + 1); ring.push(S.idx(s, p.x, p.y)); }
    S.drawPaths(s, ring, 'trail'); S.checkLoops(s); S.checkMilestones(s);
    const n = S.homeToWorld(-1, 2); S.buyParcel(s, S.idx(s, n.x, n.y));
    s.inventory.eggs = 30; s.inventory.honey = 12; s.inventory.vegetables = 20; s.inventory.pumpkins = 10;
    for (const it of ['eggs', 'honey', 'vegetables', 'pumpkins']) S.stock(s, it, 99);
    s.time.minute = minute; g.dirty = true; g.view.focus(24.5, 17.5);
    g.paused = true;
  }, minute);
}

async function start(page: Page) {
  await page.goto('/');
  await page.waitForTimeout(1500);
}

test('capture screenshots', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await start(page);
  await snap(page, '01-title.png', 'Title screen', 'Continue / New Game slots, tagline and closing line.');
  await page.getByTestId('new-0').click();
  await page.getByTestId('ask-input').fill('Freewalker Farms');
  await page.getByTestId('ask-ok').click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { const g = (window as any).__game; g.s.time.minute = 9 * 60; g.paused = true; g.view.focus(23.5, 16.5); });
  await snap(page, '02-start.png', 'Day one on the 80', 'The inherited 80 acres, Ace, the pickup and the small tractor, with the tutorial card.');

  await midGame(page, 13 * 60);
  await page.evaluate(() => (window as any).__game.closeSheet());
  await snap(page, '03-midgame.png', 'Mid-game farm', 'Basecamp 3, fields with ready bubbles, cattle, Leonard’s Loop, the first neighbor parcel.');

  await page.evaluate(() => {
    const g = (window as any).__game, S = (window as any).__sim, s = g.s;
    S.advance(s, 1440); s.time.minute = 13 * 60; g.paused = true; g.dirty = true;
    const b = s.buildings.find((q: any) => q.type === 'farm_stand'); g.view.focus(b.x + 1.5, b.y + 2.5);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = (window as any).__game; const b = g.s.buildings.find((q: any) => q.type === 'farm_stand'); g.openTile({ x: b.x, y: b.y }); });
  await page.getByTestId('manage-stand').click();
  await snap(page, '04-farm-stand.png', 'The Farm Stand', 'Stocking shelves, setting prices, and the daily sales summary.');
  await page.locator('[data-testid=stand-dialog] .close').click();

  await page.evaluate(() => { const g = (window as any).__game, S = (window as any).__sim, s = g.s; const i = s.tiles.findIndex((t: any, k: number) => t.t === 'crop' && !t.lease && S.isBuyable(s, k)); const p = S.xy(s, i); g.view.focus(p.x + 0.5, p.y + 2); g.openTile(p); });
  await snap(page, '05-land-buy.png', 'Buying neighbor land', 'A for-sale parcel: price, soil, and the option to rent it instead.');

  await page.evaluate(() => { const g = (window as any).__game, S = (window as any).__sim; const p = S.homeToWorld(9, 5); g.view.focus(p.x, p.y + 1); g.openTile(p); });
  await page.getByTestId('lease-out').click();
  await snap(page, '06-lease.png', 'Leasing land out', 'Two or three tenant offers with rent per acre per season and lease length.');
  await page.locator('[data-testid=lease-dialog] .close').click();
  await page.evaluate(() => (window as any).__game.closeSheet());

  await page.evaluate(() => { const g = (window as any).__game; g.s.time.minute = 19 * 60 + 5; g.dirty = true; g.view.focus(25.5, 18.5); });
  await snap(page, '07-golden-hour.png', 'Golden Hour', 'Every evening 6–8 PM: warm low sun, long shadows, the Golden Hour badge.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { const g = (window as any).__game; g.s.time.minute = 11 * 60; g.dirty = true; g.view.resize(); g.view.focus(23.5, 17); });
  await snap(page, '08-phone.png', 'Phone size', 'The same farm on a phone-sized screen.');

  const cards = shots.map((s) => `<figure><a href="${s.file}"><img src="${s.file}" alt="${s.title}"></a><figcaption><b>${s.title}</b><br>${s.note}</figcaption></figure>`).join('\n');
  writeFileSync(`${OUT}/index.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Freewalker Farms — Screenshots</title>
<style>body{margin:0;padding:24px;background:#f6ead2;font-family:system-ui,sans-serif;color:#4a2f17}h1{margin:0 0 16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}
figure{margin:0;background:#fff8ea;border:3px solid #4a2f17;border-radius:16px;padding:10px;box-shadow:0 4px 0 rgba(0,0,0,.2)}img{width:100%;border-radius:10px;display:block;max-height:420px;object-fit:contain;background:#a7d8f0}figcaption{padding-top:8px;font-size:14px}</style></head>
<body><h1>Freewalker Farms — contact sheet</h1><main>${cards}</main></body></html>`);
});
