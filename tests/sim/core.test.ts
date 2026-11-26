import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { acresOwned, advance, isLakefront, landmarkTile, newGame, seasonOf, xy, DAYS_PER_YEAR, START_MONEY } from '../../src/sim';
import { COUNTY_ROAD_Y } from '../../src/sim/map/home80';

describe('starting state', () => {
  const s = newGame(42);
  it('has $25,000, 80 acres: 43 crop + 37 pasture, plus owned lake', () => {
    expect(s.money).toBe(START_MONEY);
    const own = s.tiles.filter((t) => t.owned);
    expect(own.filter((t) => t.t === 'crop').length).toBe(43);
    expect(own.filter((t) => t.t === 'pasture').length).toBe(37);
    expect(own.filter((t) => t.t === 'water').length).toBeGreaterThan(0);
    expect(acresOwned(s)).toBe(80);
  });
  it('has no buildings, a pickup and a small tractor', () => {
    expect(s.buildings).toEqual([]);
    expect(s.vehicles).toContain('truck');
    expect(s.vehicles).toContain('tractor');
  });
  it('touches the county road and the lake; neighbors on all sides', () => {
    const owned = s.tiles.map((t, i) => (t.owned ? i : -1)).filter((i) => i >= 0).map((i) => xy(s, i));
    expect(owned.some((p) => p.y === COUNTY_ROAD_Y + 1)).toBe(true);
    expect(s.tiles.some((t, i) => t.owned && isLakefront(s, i))).toBe(true);
    const xs = owned.map((p) => p.x), ys = owned.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThan(COUNTY_ROAD_Y);
    expect(Math.max(...xs)).toBeLessThan(s.w - 1);
    expect(Math.max(...ys)).toBeLessThan(s.h - 1);
  });
  it('Buffalo Ridge is the highest owned point', () => {
    const r = s.tiles[landmarkTile(s, 'ridge')];
    expect(r.landmark).toBe('ridge');
    for (const t of s.tiles) if (t.owned && t !== r) expect(t.h).toBeLessThan(r.h);
    expect(s.tiles[landmarkTile(s, 'sentinel')].landmark).toBe('sentinel');
  });
  it('leaves room to grow past 1,000 acres', () => {
    const buyable = s.tiles.filter((t) => !t.owned && t.t !== 'water' && t.t !== 'road').length;
    expect(buyable + 80).toBeGreaterThanOrEqual(1000);
  });
});

describe('time and seasons', () => {
  it('runs a day as 1440 minutes and cycles four seasons per year', () => {
    const s = newGame(1);
    advance(s, 1440);
    expect(s.time.day).toBe(2);
    expect(s.time.minute).toBe(360);
    const seen = new Set<number>();
    for (let d = 0; d < DAYS_PER_YEAR; d++) { seen.add(seasonOf(s.time.day)); advance(s, 1440); }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
  it('fractional steps add up to the same clock', () => {
    const a = newGame(3), b = newGame(3);
    advance(a, 600);
    for (let i = 0; i < 250; i++) advance(b, 2.4);
    expect(b.time).toEqual(a.time);
    expect(b.rng).toBe(a.rng);
  });
  it('is deterministic from the seed', () => {
    const a = newGame(7), b = newGame(7);
    advance(a, 1440 * 50); advance(b, 1440 * 50);
    expect(a).toEqual(b);
  });
});

describe('sim purity', () => {
  it('src/sim never touches the DOM, Three.js, Math.random or the wall clock', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    for (const f of walk('src/sim')) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from 'three'|\bdocument\.|\bwindow\.|Math\.random|Date\.now|new Date\(/);
    }
  });
});
