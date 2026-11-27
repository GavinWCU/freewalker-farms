import { SAVE_VERSION } from './state';
import type { GameState } from './types';
import { generateSpots } from './explore';
import { homeToWorld } from './world';
import { START } from './map/home80';

// Save format: the GameState itself, with `saveVersion`. Each migration takes
// a save from version n to n+1 by adding/renaming fields with safe defaults.
// Never edit an old migration; add a new one and bump SAVE_VERSION.
export const MIGRATIONS: Record<number, (s: any) => void> = {
  // v1 -> v2: vehicles remember where they're parked; hidden treasures and Ace's finds.
  1: (s) => {
    const p = homeToWorld(START.col, START.row);
    s.parked ??= { truck: { x: p.x + 1.1, y: p.y + 1 }, tractor: { x: p.x - 0.1, y: p.y + 1 } };
    for (const v of Object.keys(s.parked)) if (v === s.player.vehicle) delete s.parked[v];
    s.gifts ??= [];
    if (!s.spots?.length) s.spots = generateSpots(s.seed, s.tiles, s.w);
  },
  // v2 -> v3: deer hunting record book. (Lumber and the wind turbine need no new saved fields.)
  2: (s) => {
    s.hunting ??= { records: {}, harvested: 0, bestPoints: 0 };
  },
  // v3 -> v4: a buffalo herd. (Town visits, insurance, hay, lessons and decor keep their state in flags/inventory.)
  3: (s) => {
    s.buffalo ??= [];
  },
};

export function migrate(raw: any): GameState {
  if (!raw || typeof raw !== 'object') throw new Error('Save is not an object');
  const v0 = Number(raw.saveVersion);
  if (!Number.isInteger(v0) || v0 < 1) throw new Error('Save has no version');
  if (v0 > SAVE_VERSION) throw new Error(`Save is from a newer version (${v0})`);
  for (let v = v0; v < SAVE_VERSION; v++) { MIGRATIONS[v]?.(raw); raw.saveVersion = v + 1; }
  validate(raw);
  return raw as GameState;
}

export function validate(s: any) {
  const need = ['seed', 'rng', 'time', 'money', 'tiles', 'buildings', 'inventory', 'player', 'leases', 'loan', 'stand'];
  for (const k of need) if (s[k] === undefined) throw new Error(`Save is missing "${k}"`);
  if (!Array.isArray(s.tiles) || s.tiles.length !== s.w * s.h) throw new Error('Save map is damaged');
  if (typeof s.money !== 'number' || !isFinite(s.money)) throw new Error('Save money is damaged');
}

export const serialize = (s: GameState) => JSON.stringify(s);
export const deserialize = (json: string) => migrate(JSON.parse(json));
