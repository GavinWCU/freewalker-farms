import { hash2, valueNoise } from './rng';
import { COUNTY_ROAD_Y, HOME_ORIGIN, HOME_ROWS, LAKE, LANDMARKS, WORLD_H, WORLD_W } from './map/home80';
import type { GameState, Terrain, Tile } from './types';

export const idx = (s: { w: number }, x: number, y: number) => y * s.w + x;
export const inBounds = (s: { w: number; h: number }, x: number, y: number) => x >= 0 && y >= 0 && x < s.w && y < s.h;
export const tileAt = (s: GameState, x: number, y: number): Tile | undefined => (inBounds(s, x, y) ? s.tiles[idx(s, x, y)] : undefined);
export const xy = (s: { w: number }, i: number) => ({ x: i % s.w, y: Math.floor(i / s.w) });

export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function homeToWorld(col: number, row: number) {
  return { x: HOME_ORIGIN.x + col, y: HOME_ORIGIN.y + row };
}

export function landmarkTile(s: GameState, name: keyof typeof LANDMARKS) {
  const l = LANDMARKS[name];
  const p = homeToWorld(l.col, l.row);
  return idx(s, p.x, p.y);
}

/** Builds the world: the home 80 from the map file, neighbor land from seeded noise. */
export function generateTiles(seed: number): Tile[] {
  const tiles: Tile[] = [];
  const homeChar = (x: number, y: number) => HOME_ROWS[y - HOME_ORIGIN.y]?.[x - HOME_ORIGIN.x] ?? '.';
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const c = homeChar(x, y);
      const home = c === 'C' || c === 'P' || c === 'W';
      const lakeD = ((x - LAKE.cx) / LAKE.rx) ** 2 + ((y - LAKE.cy) / LAKE.ry) ** 2;
      let t: Terrain;
      if (home) t = c === 'C' ? 'crop' : c === 'P' ? 'pasture' : 'water';
      else if (y === COUNTY_ROAD_Y) t = 'road';
      else if (lakeD < 1) t = 'water';
      else {
        const a = valueNoise(x, y, seed, 7), b = valueNoise(x, y, seed + 17, 5);
        t = b > 0.68 ? 'timber' : a > 0.56 ? 'pasture' : 'crop';
      }
      const roll = valueNoise(x, y, seed + 5, 4);
      const h = t === 'water' ? -0.3 : t === 'road' ? 0.02 : t === 'pasture' ? 0.1 + roll * 0.55 : t === 'timber' ? 0.15 + roll * 0.4 : 0.04 + roll * 0.08;
      const r = hash2(x, y, seed + 99);
      tiles.push({
        t, h: Math.round(h * 100) / 100,
        soil: Math.round((0.75 + valueNoise(x, y, seed + 31, 6) * 0.5 + (t === 'crop' ? 0.05 : 0)) * 100) / 100,
        owned: home, home,
        trees: t === 'timber' ? 3 + (r > 0.5 ? 1 : 0) : t === 'pasture' && r > 0.82 ? 1 : 0,
        rock: (t === 'pasture' || t === 'crop') && !home && hash2(x, y, seed + 7) > 0.9,
      });
    }
  }
  const at = (col: number, row: number) => tiles[(HOME_ORIGIN.y + row) * WORLD_W + HOME_ORIGIN.x + col];
  // Home cropland is good, flat ground; a few boulders and trees on the pasture.
  HOME_ROWS.forEach((r, row) => [...r].forEach((c, col) => {
    const t = at(col, row);
    if (c === 'C') t.soil = Math.max(t.soil, 1.05);
    if (c === 'P') { t.trees = hash2(col, row, 3) > 0.8 ? 1 : 0; t.rock = hash2(col, row, 4) > 0.85; }
  }));
  // Buffalo Ridge: the highest point, with the ground rising toward it.
  const ridge = at(LANDMARKS.ridge.col, LANDMARKS.ridge.row);
  const peak = Math.max(...tiles.filter((t) => t.home).map((t) => t.h)) + 0.6;
  HOME_ROWS.forEach((r, row) => [...r].forEach((c, col) => {
    if (c !== 'P') return;
    const d = Math.hypot(col - LANDMARKS.ridge.col, row - LANDMARKS.ridge.row);
    if (d > 0 && d < 3) at(col, row).h = Math.round(Math.max(at(col, row).h, peak - 0.35 * d) * 100) / 100;
  }));
  ridge.h = Math.round(peak * 100) / 100;
  ridge.landmark = 'ridge'; ridge.trees = 0; ridge.rock = false;
  const sentinel = at(LANDMARKS.sentinel.col, LANDMARKS.sentinel.row);
  sentinel.landmark = 'sentinel'; sentinel.trees = 0; sentinel.rock = false;
  const ent = at(LANDMARKS.entrance.col, LANDMARKS.entrance.row);
  ent.landmark = 'entrance'; ent.path = 'gravel'; ent.trees = 0; ent.rock = false;
  return tiles;
}

/** A land tile next to water. */
export function isLakefront(s: GameState, i: number): boolean {
  const { x, y } = xy(s, i);
  return s.tiles[i].t !== 'water' && N4.some(([dx, dy]) => tileAt(s, x + dx, y + dy)?.t === 'water');
}

export const isLand = (t: Tile) => t.t !== 'water' && t.t !== 'road';

/** Acres owned = owned land tiles (owned lake water is not counted). */
export const acresOwned = (s: GameState) => s.tiles.reduce((n, t) => n + (t.owned && isLand(t) ? 1 : 0), 0);
