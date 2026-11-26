import { describe, expect, it } from 'vitest';
import * as sim from '../../src/sim';
import type { GameState } from '../../src/sim';

/** A simple auto-player: farms, collects, sells, builds, buys land, leases, borrows. */
function autoplay(s: GameState) {
  const season = sim.seasonOf(s.time.day);
  s.tiles.forEach((t, i) => {
    if (!sim.farmable(s, i)) return;
    const st = sim.fieldState(t);
    if (st === 'harvest') sim.fieldAction(s, i, 'harvest', undefined, true);
    else if (st === 'till' && s.money > 2000) sim.fieldAction(s, i, 'till', undefined, true);
    else if (st === 'plant' && s.money > 3000) {
      const crop = sim.CROPS.find((c) => c.seasons.includes(season) && s.level >= c.level);
      if (crop) sim.fieldAction(s, i, 'plant', crop.id, true);
    } else if (st === 'water') sim.fieldAction(s, i, 'water', undefined, true);
  });
  for (const b of s.buildings) sim.collect(s, b.id);
  for (const it of sim.ITEMS) if ((s.inventory[it.id] ?? 0) > 0) sim.sell(s, it.id, s.inventory[it.id]);
  // build something new now and then
  const want = sim.BUILDINGS.find((d) => s.level >= d.level && s.money > d.cost * 2 && !(d.unique && sim.hasBuilding(s, d.id)) && sim.countBuilding(s, d.id) < 2);
  if (want) {
    const spot = s.tiles.findIndex((_, i) => { const { x, y } = sim.xy(s, i); return sim.canBuild(s, want.id, x, y).ok; });
    if (spot >= 0) { const { x, y } = sim.xy(s, spot); sim.build(s, want.id, x, y); }
  }
  for (const b of s.buildings) if (s.money > 50000) sim.upgrade(s, b.id);
  // grow the land
  if (s.money > 20000) {
    const i = s.tiles.findIndex((_, k) => sim.isBuyable(s, k));
    if (i >= 0 && sim.landPrice(s, i) < s.money / 3) sim.buyParcel(s, i);
  }
  if (s.auction && s.money > 200000) sim.buyAuction(s);
  // lease out some pasture, rent in a field, take and repay loans
  if (s.time.day % 40 === 0) {
    const i = s.tiles.findIndex((t, k) => t.owned && t.t === 'pasture' && !t.lease && !t.b && !t.landmark && k % 3 === 0);
    if (i >= 0) { const tiles = sim.leaseBlock(s, i, true); const o = sim.leaseOffers(s, tiles)[0]; if (o) sim.leaseOut(s, tiles, o); }
  }
  if (s.time.day % 55 === 0 && s.money > 5000) { const i = s.tiles.findIndex((t, k) => t.t === 'crop' && !t.lease && sim.isBuyable(s, k)); if (i >= 0) sim.leaseIn(s, [i], 3); }
  if (s.time.day % 90 === 0 && s.loan.principal === 0) sim.borrow(s, Math.min(20000, sim.loanLimit(s)));
  if (s.loan.principal > 0 && s.money > s.loan.principal * 3) sim.repay(s, s.loan.principal);
  if (s.level >= 5 && s.workers.ranchhand === 0) sim.hire(s, 'ranchhand');
  if (sim.hasBuilding(s, 'cattle_corral') && s.cattle.length < 5 && s.money > 20000) sim.buyCalves(s, 2);
  sim.sellCattle(s);
  for (let k = s.gifts.length - 1; k >= 0; k--) sim.collectGift(s, k);
}

function check(s: GameState) {
  for (const [k, v] of Object.entries(s.inventory)) expect(v, `inventory ${k}`).toBeGreaterThanOrEqual(0);
  for (const q of Object.values(s.stand.stock)) expect(q.qty).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(s.money)).toBe(true);
  expect(s.money).toBeGreaterThanOrEqual(0);
  // money adds up: start + everything earned − everything spent
  expect(s.money).toBeCloseTo(sim.START_MONEY + (s.stats.earned ?? 0) - (s.stats.spent ?? 0), 0);
  // acres add up
  expect(sim.acresOwned(s)).toBe(80 + (s.stats.acresBought ?? 0));
  const leaseIds = new Set(s.leases.map((l) => l.id));
  s.tiles.forEach((t) => {
    if (t.lease !== undefined) expect(leaseIds.has(t.lease)).toBe(true);
    if (t.b) { expect(t.owned).toBe(true); expect(t.lease).toBeUndefined(); }
    if (t.f?.crop) expect(t.f.tilled).toBe(true);
  });
  for (const l of s.leases) for (const i of l.tiles) {
    expect(s.tiles[i].lease).toBe(l.id);
    expect(s.tiles[i].owned).toBe(l.dir === 'out');
  }
  for (const b of s.buildings) expect(s.tiles[b.y * s.w + b.x].b).toBe(b.id);
  expect(s.ledger.length).toBeLessThanOrEqual(12);
  expect(s.log.length).toBeLessThanOrEqual(60);
}

describe('100 seeded game-years', () => {
  it('runs a century with an auto-player without breaking any rule', () => {
    const s = sim.newGame(1874, 'Century Farm');
    const years = 100;
    for (let d = 0; d < years * sim.DAYS_PER_YEAR; d++) {
      for (let h = 0; h < 4; h++) { sim.advance(s, 360); if (h === 1) autoplay(s); }
      if (d % 9 === 0) check(s);
    }
    check(s);
    expect(sim.yearOf(s.time.day)).toBe(years + 1);
    expect(sim.acresOwned(s)).toBeGreaterThan(80);
    expect(s.level).toBeGreaterThan(5);
    expect(s.buildings.length).toBeGreaterThan(5);
    console.log(`after ${years} years: ${sim.acresOwned(s)} acres, level ${s.level}, $${Math.round(s.money).toLocaleString()}, ${s.buildings.length} buildings, ${s.leases.length} leases`);
  }, 600_000);
});
