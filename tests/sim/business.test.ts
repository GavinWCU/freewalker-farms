import { describe, expect, it } from 'vitest';
import {
  addXp, advance, build, buyCalves, hire, homeToWorld, newGame, sellCattle, setPrice, stock, upgrade, xpForLevel,
  CATTLE_MATURE, standName, unstock, canBuild,
} from '../../src/sim';
import type { GameState } from '../../src/sim';

function withStand(seed: number) {
  const s = newGame(seed);
  addXp(s, xpForLevel(5));
  const p = homeToWorld(2, 0);
  expect(build(s, 'farm_stand', p.x, p.y).ok).toBe(true);
  s.inventory.eggs = 40; s.inventory.vegetables = 40;
  expect(stock(s, 'eggs', 40).ok).toBe(true);
  expect(stock(s, 'vegetables', 40).ok).toBe(true);
  return s;
}
const sold = (s: GameState) => 80 - Object.values(s.stand.stock).reduce((n, q) => n + q.qty, 0);

describe('farm stand', () => {
  it('must sit beside the county road', () => {
    const s = newGame(1);
    addXp(s, xpForLevel(5));
    const inland = homeToWorld(2, 4);
    expect(canBuild(s, 'farm_stand', inland.x, inland.y).ok).toBe(false);
  });
  it('sells more at fair prices than at high prices', () => {
    let cheap = 0, dear = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const a = withStand(seed), b = withStand(seed);
      setPrice(a, 'eggs', 6); setPrice(a, 'vegetables', 30);
      setPrice(b, 'eggs', 12); setPrice(b, 'vegetables', 60);
      advance(a, 1440); advance(b, 1440);
      cheap += sold(a); dear += sold(b);
    }
    expect(cheap).toBeGreaterThan(dear * 1.5);
  });
  it('keeps a daily sales summary', () => {
    const s = withStand(3);
    advance(s, 1440);
    expect(s.stand.last).not.toBeNull();
    expect(s.stand.last!.customers).toBeGreaterThan(0);
    expect(s.stand.last!.revenue).toBeGreaterThan(0);
    expect(s.ledger.some((l) => (l.income['Farm Stand'] ?? 0) > 0)).toBe(true);
  });
  it('has limited shelf space and returns stock to the barn', () => {
    const s = withStand(3);
    for (const it of ['honey', 'apples', 'flowers']) s.inventory[it] = 5;
    expect(stock(s, 'honey', 5).ok).toBe(true);
    expect(stock(s, 'apples', 5).ok).toBe(true);
    expect(stock(s, 'flowers', 5).ok).toBe(false); // 4 kinds on a level-1 stand
    expect(unstock(s, 'honey').ok).toBe(true);
    expect(s.inventory.honey).toBe(5);
  });
  it('upgrades to the Freewalker Farm Market, which makes Freewalker Goods', () => {
    const s = withStand(3);
    s.money = 1e6;
    addXp(s, xpForLevel(13));
    const b = s.buildings.find((q) => q.type === 'farm_stand')!;
    expect(upgrade(s, b.id).ok).toBe(true);
    expect(upgrade(s, b.id).ok).toBe(true);
    expect(standName(s)).toBe('Freewalker Farm Market');
    expect(hire(s, 'cashier').ok).toBe(true);
    advance(s, 1440);
    expect(s.inventory.goods).toBeGreaterThan(0);
  });
});

describe('workers and cattle', () => {
  it('a ranch hand collects from buildings each morning', () => {
    const s = newGame(2);
    addXp(s, xpForLevel(5));
    const p = homeToWorld(6, 6);
    build(s, 'chicken_coop', p.x, p.y);
    expect(hire(s, 'ranchhand').ok).toBe(true);
    advance(s, 1440 * 2);
    expect(s.inventory.eggs).toBeGreaterThan(0);
    expect(s.ledger.some((l) => (l.expense.Wages ?? 0) > 0)).toBe(true);
  });
  it('raises calves on pasture and sells grown cattle', () => {
    const s = newGame(2);
    addXp(s, xpForLevel(9));
    s.money = 50000;
    const p = homeToWorld(7, 5);
    expect(build(s, 'cattle_corral', p.x, p.y).ok).toBe(true);
    expect(buyCalves(s, 4).ok).toBe(true);
    expect(sellCattle(s).ok).toBe(false);
    advance(s, 1440 * CATTLE_MATURE);
    const m = s.money;
    expect(sellCattle(s).ok).toBe(true);
    expect(s.money).toBeGreaterThan(m);
    expect(s.cattle.length).toBe(0);
  });
});
