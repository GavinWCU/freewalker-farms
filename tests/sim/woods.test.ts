import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  advance, build, chopTrees, choppable, deserialize, homeToWorld, huntSpot, newGame, sell, takeShot, spotGame, bagged, GAME_BY_ID,
  DAYS_PER_SEASON, LOGS_PER_TREE, SAVE_VERSION,
} from '../../src/sim';

/** First owned tile with trees and nothing on it. */
const treeTile = (s: ReturnType<typeof newGame>) => s.tiles.findIndex((_, i) => choppable(s, i) > 0);
/** Jump the clock to a day in the given season (0 spring .. 3 winter), at 7am. */
const toSeason = (s: ReturnType<typeof newGame>, season: number) => { s.time.day = season * DAYS_PER_SEASON + 2; s.time.minute = 7 * 60; };

describe('lumber', () => {
  it('cuts trees on your land into logs and sells them', () => {
    const s = newGame(5);
    const i = treeTile(s);
    expect(i).toBeGreaterThanOrEqual(0);
    const n = s.tiles[i].trees;
    expect(chopTrees(s, i).ok).toBe(true);
    expect(s.tiles[i].trees).toBe(0);
    expect(s.inventory.lumber).toBe(n * LOGS_PER_TREE);
    const m = s.money;
    expect(sell(s, 'lumber', 99).ok).toBe(true);
    expect(s.money).toBeGreaterThan(m);
    expect(chopTrees(s, i).ok).toBe(false);
  });
  it("can't cut neighbor trees or the Sentinel Tree", () => {
    const s = newGame(5);
    const neighbor = s.tiles.findIndex((t) => !t.owned && t.trees > 0);
    expect(chopTrees(s, neighbor).ok).toBe(false);
    const sentinel = s.tiles.findIndex((t) => t.landmark === 'sentinel');
    expect(choppable(s, sentinel)).toBe(0);
  });
  it('owned timber grows back over the seasons', () => {
    const s = newGame(5); s.flags.calm = 1;
    const i = s.tiles.findIndex((t) => !t.owned && t.t === 'timber');
    s.tiles[i].owned = true; s.tiles[i].trees = 0;
    advance(s, 1440 * DAYS_PER_SEASON * 12);
    expect(s.tiles[i].trees).toBeGreaterThan(0);
  });
});

describe('wind turbine', () => {
  it('earns wind power income every day', () => {
    const s = newGame(5); s.flags.calm = 1; s.level = 10; s.money = 50000;
    const p = homeToWorld(6, 6);
    expect(build(s, 'wind_turbine', p.x, p.y).ok).toBe(true);
    advance(s, 1440 * 3);
    const income = s.ledger.reduce((a, l) => a + (l.income['Wind power'] ?? 0), 0);
    expect(income).toBeGreaterThan(0);
  });
});

describe('hunting', () => {
  const spotOf = (s: ReturnType<typeof newGame>, kind: string) => s.tiles.findIndex((_, k) => huntSpot(s, k) === kind);
  /** Keeps shooting `id` with perfect aim until one lands (misses are random). */
  const land = (s: ReturnType<typeof newGame>, i: number, id: string) => {
    let r = takeShot(s, i, 1, id);
    for (let k = 0; !r.ok && /Missed/.test(r.msg) && k < 40; k++) r = takeShot(s, i, 1, id);
    return r;
  };
  it('is open every season, on your own land only', () => {
    const s = newGame(5);
    const i = spotOf(s, 'woods');
    for (const season of [0, 1, 2, 3]) {
      toSeason(s, season);
      expect(land(s, i, 'turkey').ok).toBe(true);
      s.time.day += 1; // new day, new bag
    }
    const neighbor = s.tiles.findIndex((t) => !t.owned && !t.lease && t.t === 'timber');
    expect(huntSpot(s, neighbor)).toBeNull();
  });
  it('woods, fields and the lakeshore each have their own game', () => {
    const s = newGame(5);
    const seen = (kind: string) => { const i = spotOf(s, kind); const out = new Set<string>(); for (let k = 0; k < 300; k++) out.add(spotGame(s, i)!); return out; };
    expect(seen('shore').has('duck')).toBe(true);
    expect(seen('field').has('pheasant')).toBe(true);
    const woods = seen('woods');
    expect(woods.has('turkey') && woods.has('doe')).toBe(true);
    expect(woods.has('duck')).toBe(false);
  });
  it('a deer gives venison, a record and a rack; birds give wild fowl', () => {
    const s = newGame(5);
    const r = land(s, spotOf(s, 'woods'), 'whitetail');
    expect(r.ok).toBe(true);
    expect(s.inventory.venison).toBeGreaterThan(0);
    expect(s.hunting.records.whitetail).toBe(r.lb);
    expect(s.hunting.bestPoints).toBeGreaterThanOrEqual(4);
    expect(land(s, spotOf(s, 'shore'), 'duck').ok).toBe(true);
    expect(s.inventory.fowl).toBeGreaterThan(0);
    expect(s.hunting.harvested).toBe(2);
  });
  it('daily bag limits per animal, reset the next day', () => {
    const s = newGame(5);
    const shore = spotOf(s, 'shore');
    for (let k = 0; k < GAME_BY_ID.duck.bag; k++) expect(land(s, shore, 'duck').ok).toBe(true);
    expect(takeShot(s, shore, 1, 'duck').msg).toMatch(/limit/);
    expect(bagged(s, 'duck')).toBe(GAME_BY_ID.duck.bag);
    expect(land(s, shore, 'doe').ok).toBe(true); // other animals still open
    s.time.day += 1;
    expect(bagged(s, 'duck')).toBe(0);
    expect(land(s, shore, 'duck').ok).toBe(true);
  });
  it('a bad shot always misses', () => {
    const s = newGame(5);
    const i = spotOf(s, 'field');
    for (let k = 0; k < 10; k++) expect(takeShot(s, i, 0, 'pheasant').ok).toBe(false);
  });
});

describe('save v3', () => {
  it('loads the frozen v2 save fixture with an empty hunting record book', () => {
    const raw = readFileSync('tests/fixtures/save-v2.json', 'utf8');
    expect(JSON.parse(raw).saveVersion).toBe(2);
    const s = deserialize(raw);
    expect(s.saveVersion).toBe(SAVE_VERSION);
    expect(s.farmName).toBe('Fixture Farm v2');
    expect(s.buildings.length).toBe(1);
    expect(s.hunting).toEqual({ records: {}, harvested: 0, bestPoints: 0 });
    advance(s, 1440 * 40);
    expect(s.money).toBeGreaterThanOrEqual(0);
  });
  it('still loads the v1 fixture all the way up', () => {
    const s = deserialize(readFileSync('tests/fixtures/save-v1.json', 'utf8'));
    expect(s.saveVersion).toBe(SAVE_VERSION);
    expect(s.hunting.harvested).toBe(0);
  });
});
