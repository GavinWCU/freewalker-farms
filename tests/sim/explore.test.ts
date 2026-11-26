import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  advance, buyVehicle, castLine, collectGift, deserialize, fishingSpot, homeToWorld, idx, movePlayer, newGame, setVehicle,
  till, plant, SAVE_VERSION,
} from '../../src/sim';

describe('vehicles', () => {
  it('walks, drives faster, and never drives into the lake', () => {
    const s = newGame(1);
    const x0 = s.player.x;
    for (let k = 0; k < 10; k++) movePlayer(s, 1, 0, 0.1);
    const walked = s.player.x - x0;
    s.player.x = x0;
    s.parked.truck = { x: s.player.x, y: s.player.y };
    expect(setVehicle(s, 'truck').ok).toBe(true);
    for (let k = 0; k < 10; k++) movePlayer(s, 1, 0, 0.1);
    expect(s.player.x - x0).toBeGreaterThan(walked * 1.5);
    // head for the lake (south-east) for a long time
    for (let k = 0; k < 600; k++) movePlayer(s, 1, 1, 0.1);
    const t = s.tiles[idx(s, Math.floor(s.player.x), Math.floor(s.player.y))];
    expect(t.t).not.toBe('water');
  });
  it('must walk to a parked vehicle, and the ATV is bought', () => {
    const s = newGame(1);
    s.parked.truck = { x: s.player.x + 5, y: s.player.y };
    expect(setVehicle(s, 'truck').ok).toBe(false);
    expect(setVehicle(s, 'atv').ok).toBe(false);
    expect(buyVehicle(s, 'atv').ok).toBe(true);
    expect(setVehicle(s, 'atv').ok).toBe(true);
    expect(setVehicle(s, 'foot').ok).toBe(true);
    expect(s.parked.atv).toBeDefined();
  });
  it('driving the tractor across a field works it', () => {
    const s = newGame(1);
    const a = homeToWorld(0, 2);
    for (let c = 0; c < 4; c++) { const i = idx(s, a.x + c, a.y); till(s, i); plant(s, i, 'corn'); s.tiles[i].f!.growth = 1; }
    s.player = { x: a.x - 0.5, y: a.y + 0.5, vehicle: 'tractor', tractorMode: 'harvest' };
    for (let k = 0; k < 60; k++) movePlayer(s, 1, 0, 0.1);
    expect(s.inventory.corn).toBeGreaterThan(0);
    expect(s.tiles[idx(s, a.x + 1, a.y)].f!.crop).toBeNull();
  });
});

describe('fishing', () => {
  it('casts from the shore, catches fish and keeps personal records', () => {
    const s = newGame(2);
    const shore = s.tiles.findIndex((_, i) => fishingSpot(s, i) === 'shore');
    expect(shore).toBeGreaterThan(0);
    let caught = 0;
    for (let k = 0; k < 40; k++) if (castLine(s, shore, 0.9).ok) caught++;
    expect(caught).toBeGreaterThan(10);
    expect(Object.keys(s.fishing.records).length).toBeGreaterThan(1);
    expect(s.inventory.fish).toBeGreaterThan(0);
    expect(castLine(s, idx(s, 2, 2), 1).ok).toBe(false); // not your shore
  });
});

describe('exploring and Ace', () => {
  it('walking over a hidden spot finds a treasure to collect', () => {
    const s = newGame(3);
    const sp = s.spots[0];
    s.player.x = sp.x - 0.3; s.player.y = sp.y;
    movePlayer(s, 1, 0, 0.1);
    expect(sp.found).toBe(true);
    expect(s.gifts.length).toBe(1);
    const m = s.money;
    expect(collectGift(s, 0).ok).toBe(true);
    expect(s.money).toBeGreaterThan(m);
  });
  it('Ace digs things up over time', () => {
    const s = newGame(3);
    advance(s, 1440 * 30);
    expect(s.gifts.length + s.spots.filter((p) => p.found).length).toBeGreaterThan(0);
  });
  it('migrates a v1 save: parked vehicles, hidden spots, gifts', () => {
    const s = deserialize(readFileSync('tests/fixtures/save-v1.json', 'utf8'));
    expect(s.saveVersion).toBe(SAVE_VERSION);
    expect(s.spots.length).toBeGreaterThan(10);
    expect(s.gifts).toEqual([]);
    expect(s.parked.truck).toBeDefined();
  });
});
