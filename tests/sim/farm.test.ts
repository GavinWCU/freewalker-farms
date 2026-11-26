import { describe, expect, it } from 'vitest';
import {
  advance, build, canBuild, collect, fieldAction, harvest, homeToWorld, idx, newGame, plant, sell, till, upgrade,
  basecampLevel, addXp, xpForLevel, drawPaths, DAYS_PER_SEASON, moveBuilding,
} from '../../src/sim';
import type { GameState } from '../../src/sim';

const cropTile = (s: GameState, col = 0, row = 2) => { const p = homeToWorld(col, row); return idx(s, p.x, p.y); };

describe('crop growth by season', () => {
  it('grows in season, faster when watered, and is ready after its days', () => {
    const s = newGame(5);
    const a = cropTile(s, 0, 2), b = cropTile(s, 0, 3);
    for (const i of [a, b]) { expect(till(s, i).ok).toBe(true); expect(plant(s, i, 'corn').ok).toBe(true); }
    s.weather = 'sunny';
    s.tiles[a].f!.watered = true; s.tiles[b].f!.watered = false;
    advance(s, 60 * 12);
    expect(s.tiles[a].f!.growth).toBeGreaterThan(s.tiles[b].f!.growth);
    for (let d = 0; d < 8 && s.tiles[a].f!.growth < 1; d++) { s.tiles[a].f!.watered = true; advance(s, 1440); }
    expect(s.tiles[a].f!.growth).toBe(1);
    const before = s.inventory.corn ?? 0;
    expect(harvest(s, a).ok).toBe(true);
    expect(s.inventory.corn).toBeGreaterThan(before);
  });
  it('refuses out-of-season planting and stops growth out of season', () => {
    const s = newGame(5);
    addXp(s, xpForLevel(3));
    const i = cropTile(s);
    till(s, i);
    advance(s, 1440 * DAYS_PER_SEASON * 2); // to Fall
    expect(plant(s, i, 'corn').ok).toBe(false);
    expect(plant(s, i, 'wheat').ok).toBe(true);
  });
  it('winter frost withers unfinished crops', () => {
    const s = newGame(5);
    addXp(s, xpForLevel(3));
    const i = cropTile(s);
    till(s, i); s.time.day = DAYS_PER_SEASON * 2 + 1; plant(s, i, 'wheat');
    s.time.day = DAYS_PER_SEASON * 3; s.time.minute = 1439;
    advance(s, 2);
    expect(s.tiles[i].f!.crop).toBeNull();
  });
  it('the tractor works a whole connected field at once', () => {
    const s = newGame(5);
    const r = fieldAction(s, cropTile(s), 'till', undefined, true);
    expect(r.ok).toBe(true);
    expect(s.tiles.filter((t) => t.f?.tilled).length).toBe(12);
  });
});

describe('building', () => {
  it('places a container on owned land and charges for it', () => {
    const s = newGame(1);
    const p = homeToWorld(6, 6);
    expect(build(s, 'container', p.x, p.y).ok).toBe(true);
    expect(s.money).toBe(25000 - 1500);
    expect(basecampLevel(s)).toBe(1);
    expect(build(s, 'container', p.x + 1, p.y).ok).toBe(false); // unique
  });
  it('rejects neighbor land, water, level-locked and road-only placement', () => {
    const s = newGame(1);
    expect(canBuild(s, 'camper', 2, 2).ok).toBe(false);
    const lake = homeToWorld(9, 8);
    expect(canBuild(s, 'tool_rack', lake.x, lake.y).ok).toBe(false);
    const p = homeToWorld(6, 6);
    expect(canBuild(s, 'cabin', p.x, p.y).msg).toMatch(/level/);
    expect(canBuild(s, 'farm_sign', p.x, p.y).ok).toBe(false);
    const road = homeToWorld(4, 0);
    expect(canBuild(s, 'farm_sign', road.x, road.y).ok).toBe(true);
  });
  it('production buildings fill up and are collected', () => {
    const s = newGame(1);
    addXp(s, xpForLevel(2));
    const p = homeToWorld(6, 6);
    build(s, 'chicken_coop', p.x, p.y);
    advance(s, 1440);
    const b = s.buildings[0];
    expect(b.ready).toBeGreaterThan(0);
    expect(collect(s, b.id).ok).toBe(true);
    expect(s.inventory.eggs).toBeGreaterThan(0);
    expect(sell(s, 'eggs', 99).ok).toBe(true);
    expect(s.inventory.eggs).toBe(0);
  });
  it('moves and upgrades buildings', () => {
    const s = newGame(1);
    addXp(s, xpForLevel(2));
    const p = homeToWorld(6, 6);
    build(s, 'chicken_coop', p.x, p.y);
    const b = s.buildings[0];
    expect(moveBuilding(s, b.id, p.x + 1, p.y).ok).toBe(true);
    expect(s.tiles[idx(s, p.x, p.y)].b).toBeUndefined();
    expect(upgrade(s, b.id).ok).toBe(true);
    expect(b.level).toBe(2);
    expect(upgrade(s, b.id).msg).toMatch(/Lab/);
  });
  it('draws gravel roads and fences by dragging over tiles', () => {
    const s = newGame(1);
    const tiles = [0, 1, 2].map((k) => { const p = homeToWorld(6, k + 4); return idx(s, p.x, p.y); });
    expect(drawPaths(s, tiles, 'gravel').ok).toBe(true);
    expect(tiles.every((i) => s.tiles[i].path === 'gravel')).toBe(true);
    expect(drawPaths(s, tiles, 'fence').ok).toBe(true);
    expect(s.money).toBe(25000 - 3 * 40 - 3 * 15);
  });
});

describe('levels', () => {
  it('levels up as XP crosses thresholds', () => {
    const s = newGame(1);
    const ev: any[] = [];
    addXp(s, xpForLevel(5), ev);
    expect(s.level).toBe(5);
    expect(ev.filter((e) => e.type === 'levelup').length).toBe(4);
    addXp(s, 1e7);
    expect(s.level).toBe(20);
  });
});
