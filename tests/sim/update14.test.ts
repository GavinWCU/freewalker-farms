import { describe, expect, it } from 'vitest';
import {
  build, buyParcel, cantSell, castLine, fishingSpot, homeToWorld, idx, isBuyable, leaseOut, newGame, salePrice, sellParcel,
  DAYS_PER_SEASON, SALE_SHARE, acreValue,
} from '../../src/sim';
import type { GameState } from '../../src/sim';

/** Buys a chain of `n` acres heading away from the home 80; returns them in order (nearest first). */
function buyChain(s: GameState, n: number) {
  s.money = 1e7;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = s.tiles.findIndex((_, j) => isBuyable(s, j) && s.tiles[j].t !== 'water' && (out.length === 0 || neighbors(s, j, out[out.length - 1])));
    expect(buyParcel(s, i).ok).toBe(true);
    out.push(i);
  }
  return out;
}
const neighbors = (s: GameState, a: number, b: number) => Math.abs((a % s.w) - (b % s.w)) + Math.abs(Math.floor(a / s.w) - Math.floor(b / s.w)) === 1;

describe('selling land', () => {
  it('sells an acre you bought for market value minus closing costs', () => {
    const s = newGame(8); s.flags.calm = 1;
    const [i] = buyChain(s, 1);
    const price = salePrice(s, i);
    expect(price).toBe(Math.round((acreValue(s, i) * SALE_SHARE) / 10) * 10);
    const m = s.money, bought = s.landBought;
    expect(sellParcel(s, i).ok).toBe(true);
    expect(s.tiles[i].owned).toBe(false);
    expect(s.money).toBe(m + price);
    expect(s.landBought).toBe(bought - 1);
    expect(isBuyable(s, i)).toBe(true); // can buy it back later
  });
  it('never sells the original 80', () => {
    const s = newGame(8);
    const p = homeToWorld(3, 3);
    expect(sellParcel(s, idx(s, p.x, p.y)).ok).toBe(false);
    expect(cantSell(s, idx(s, p.x, p.y))).toMatch(/family/);
  });
  it("won't sell land with a building or a lease, or land that would cut off other acres", () => {
    const s = newGame(8); s.level = 20;
    const [a, b] = buyChain(s, 2);
    expect(cantSell(s, a)).toMatch(/cut off/); // b only connects through a
    expect(sellParcel(s, b).ok).toBe(true);
    // a building on it
    const { x, y } = { x: a % s.w, y: Math.floor(a / s.w) };
    if (build(s, 'garden_bed', x, y).ok) {
      expect(cantSell(s, a)).toMatch(/building/);
    }
    // a lease on it
    const s2 = newGame(8);
    const [c] = buyChain(s2, 1);
    leaseOut(s2, [c], { tenant: 'farmer', name: 'T', ratePerAcre: 100, seasons: 1 });
    expect(cantSell(s2, c)).toMatch(/lease/);
  });
});

describe('ice fishing', () => {
  it('fish bite in winter, mostly winter species', () => {
    const s = newGame(2);
    s.time.day = 3 * DAYS_PER_SEASON + 2; s.time.minute = 10 * 60;
    const shore = s.tiles.findIndex((_, i) => fishingSpot(s, i) === 'shore');
    const got: string[] = [];
    for (let k = 0; k < 120; k++) { const r = castLine(s, shore, 0.9); if (r.ok) got.push(r.fish!); }
    expect(got.length).toBeGreaterThan(30);
    const winterKinds = got.filter((f) => ['perch', 'bluegill', 'crappie', 'walleye', 'pike'].includes(f)).length;
    expect(winterKinds / got.length).toBeGreaterThan(0.75);
  });
});
