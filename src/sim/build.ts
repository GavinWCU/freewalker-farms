import { BASECAMP_KEYS, BUILDING, upgradeCost } from './content/buildings';
import { addXp } from './levels';
import { earn, log, spend, stat } from './state';
import { advance, hooks } from './sim';
import { chance } from './rng';
import { seasonOf } from './time';
import { COUNTY_ROAD_Y } from './map/home80';
import { isLakefront, isLand, idx, inBounds } from './world';
import type { Building, GameState, PathKind, SimEvent } from './types';

export interface Result { ok: boolean; msg: string }
export const ok = (msg: string): Result => ({ ok: true, msg });
export const no = (msg: string): Result => ({ ok: false, msg });

export const buildingAt = (s: GameState, i: number) => (s.tiles[i].b ? s.buildings.find((b) => b.id === s.tiles[i].b) : undefined);
export const hasBuilding = (s: GameState, type: string) => s.buildings.some((b) => b.type === type);
export const countBuilding = (s: GameState, type: string) => s.buildings.filter((b) => b.type === type).length;

export function basecampLevel(s: GameState) {
  let lvl = 0;
  for (let n = 1; n <= 4; n++) if (hasBuilding(s, BASECAMP_KEYS[n])) lvl = n;
  return lvl;
}

/** Tile can host something of yours: owned land, not leased out or in. */
export function usable(s: GameState, i: number) {
  const t = s.tiles[i];
  return t.owned && isLand(t) && !t.lease;
}

export function canPlace(s: GameState, type: string, x: number, y: number, ignoreId?: number): Result {
  const def = BUILDING[type];
  if (!def) return no('Unknown building');
  if (!inBounds(s, x, y)) return no('Off the map');
  const i = idx(s, x, y), t = s.tiles[i];
  if (!t.owned) return no('You need to own this land');
  if (!isLand(t)) return no('Not buildable');
  if (t.lease) return no('This parcel is leased');
  if (t.b && t.b !== ignoreId) return no('Something is already built here');
  if (t.landmark === 'ridge' || t.landmark === 'sentinel') return no('Leave the landmark as it is');
  if (t.f?.crop) return no('Harvest or clear the crop first');
  if (def.place === 'road' && y !== COUNTY_ROAD_Y + 1 && y !== COUNTY_ROAD_Y - 1) return no('Must be beside the county road');
  if (def.place === 'lakefront' && !isLakefront(s, i)) return no('Must be on the lake shore');
  if (def.place === 'pasture' && t.t !== 'pasture') return no('Must be on pasture');
  return ok('');
}

export function canBuild(s: GameState, type: string, x: number, y: number): Result {
  const def = BUILDING[type];
  if (!def) return no('Unknown building');
  if (s.level < def.level) return no(`Unlocks at level ${def.level}`);
  if (def.unique && hasBuilding(s, type)) return no('You already have one');
  if (s.money < def.cost) return no('Not enough money');
  return canPlace(s, type, x, y);
}

export function build(s: GameState, type: string, x: number, y: number, ev?: SimEvent[]): Result {
  const r = canBuild(s, type, x, y);
  if (!r.ok) return r;
  const def = BUILDING[type];
  spend(s, def.cost, 'Construction');
  const b: Building = { id: s.nextId++, type, x, y, level: 1, ready: 0, progress: 0 };
  s.buildings.push(b);
  const t = s.tiles[idx(s, x, y)];
  t.b = b.id; t.trees = 0; t.rock = false; t.f = undefined;
  if (type === 'farm_sign') t.path = 'gravel';
  addXp(s, Math.max(10, def.cost / 50), ev);
  stat(s, 'built');
  log(s, `Built ${def.name}.`);
  ev?.push({ type: 'built', text: def.name, x, y });
  return ok(`Built ${def.name}!`);
}

export function moveBuilding(s: GameState, id: number, x: number, y: number): Result {
  const b = s.buildings.find((q) => q.id === id);
  if (!b) return no('No such building');
  const r = canPlace(s, b.type, x, y, id);
  if (!r.ok) return r;
  delete s.tiles[idx(s, b.x, b.y)].b;
  b.x = x; b.y = y;
  const t = s.tiles[idx(s, x, y)];
  t.b = id; t.trees = 0; t.rock = false; t.f = undefined;
  return ok(`Moved ${BUILDING[b.type].name}`);
}

export const maxLevel = (type: string) => BUILDING[type].maxLevel ?? (BUILDING[type].produces || BUILDING[type].income ? 3 : 1);

export function upgradeInfo(s: GameState, b: Building): { cost: number; need?: string } | null {
  const def = BUILDING[b.type];
  if (b.level >= maxLevel(b.type)) return null;
  const cost = upgradeCost(def, b.level);
  if (b.type === 'farm_stand') {
    if (b.level === 1 && s.level < 8) return { cost: 6000, need: 'Level 8' };
    if (b.level === 2 && s.level < 13) return { cost: 45000, need: 'Level 13' };
    return { cost: b.level === 1 ? 6000 : 45000 };
  }
  if (b.level === 2 && !hasBuilding(s, 'lab')) return { cost, need: "Paige's Engineering Lab" };
  return { cost };
}

export function upgrade(s: GameState, id: number, ev?: SimEvent[]): Result {
  const b = s.buildings.find((q) => q.id === id);
  if (!b) return no('No such building');
  const info = upgradeInfo(s, b);
  if (!info) return no('Already fully upgraded');
  if (info.need) return no(`Needs ${info.need}`);
  if (!spend(s, info.cost, 'Construction')) return no('Not enough money');
  b.level++;
  addXp(s, info.cost / 40, ev);
  const name = b.type === 'farm_stand' && b.level === 3 ? 'Freewalker Farm Market' : BUILDING[b.type].name;
  log(s, `Upgraded ${name} to level ${b.level}.`);
  return ok(b.type === 'farm_stand' && b.level === 3 ? 'The Freewalker Farm Market is open!' : `${name} upgraded to level ${b.level}`);
}

/** Demolish: refunds a third of the build cost. */
export function demolish(s: GameState, id: number): Result {
  const b = s.buildings.find((q) => q.id === id);
  if (!b) return no('No such building');
  const def = BUILDING[b.type];
  s.buildings = s.buildings.filter((q) => q !== b);
  delete s.tiles[idx(s, b.x, b.y)].b;
  earn(s, Math.round(def.cost / 3), 'Salvage');
  return ok(`Removed ${def.name}`);
}

// ── paths and fences (drawn by dragging) ────────────────────────────────────
export const PATH_COST: Record<PathKind, number> = { gravel: 40, trail: 10 };
export const FENCE_COST = 15;

export function drawPaths(s: GameState, tiles: number[], kind: PathKind | 'fence' | 'remove'): Result {
  let n = 0, cost = 0;
  for (const i of new Set(tiles)) {
    const t = s.tiles[i];
    if (!usable(s, i) || t.b) continue;
    if (kind === 'remove') { if (t.path || t.fence) { delete t.path; delete t.fence; n++; } continue; }
    if (kind === 'fence') { if (t.fence) continue; if (!spend(s, FENCE_COST, 'Construction')) break; t.fence = true; cost += FENCE_COST; n++; continue; }
    if (t.path === kind || t.f?.crop) continue;
    if (!spend(s, PATH_COST[kind], 'Construction')) break;
    t.path = kind; t.f = undefined; t.trees = 0; t.rock = false;
    cost += PATH_COST[kind]; n++;
  }
  if (!n) return no('Nothing to change there');
  if (kind !== 'remove') addXp(s, n);
  return ok(kind === 'remove' ? `Cleared ${n} tiles` : `${n} tiles of ${kind === 'gravel' ? 'gravel road' : kind} for $${cost}`);
}

// ── production & income ─────────────────────────────────────────────────────
export const readyCap = (b: Building) => (BUILDING[b.type].produces?.amount ?? 0) * b.level * 4;

hooks.hour.push((s) => {
  const season = seasonOf(s.time.day);
  for (const b of s.buildings) {
    const p = BUILDING[b.type].produces;
    if (!p || (p.seasons && !p.seasons.includes(season))) continue;
    if (b.ready >= readyCap(b)) continue;
    b.progress += 1 / p.hours;
    if (b.progress >= 1 - 1e-9) { b.progress = 0; b.ready = Math.min(readyCap(b), b.ready + p.amount * b.level); }
  }
});

/** Decor draws visitors: +3% per piece, up to +30%. */
export const charm = (s: GameState) => 1 + Math.min(0.3, s.buildings.filter((b) => BUILDING[b.type].decor).length * 0.03);
const CROWD = { sunny: 1, cloudy: 0.9, rain: 0.55, storm: 0.25, snow: 0.8 };

hooks.day.push((s) => {
  const extras = 1 + countBuilding(s, 'landscaping') * 0.1;
  const season = seasonOf(s.time.day);
  for (const b of s.buildings) {
    const inc = BUILDING[b.type].income;
    if (!inc) continue;
    if (b.type === 'buffalo_storage') continue; // paid monthly
    if (inc.seasons && !inc.seasons.includes(season)) continue;
    let amt = inc.perDay * b.level;
    if (inc.business === 'Farmtainment' || inc.business === 'Riding lessons') amt *= CROWD[s.weather] * extras * charm(s);
    if (b.type === 'guest_cabin') amt *= (chance(s, 0.75) ? 1 : 0.4) * extras;
    if (b.type === 'equipment_shed') amt *= chance(s, 0.6) ? 1 : 0.3;
    if (b.type === 'solar_panels' && s.upgrades.includes('solar_grid')) amt *= 1.5;
    earn(s, Math.round(amt), inc.business);
  }
});
hooks.month.push((s) => {
  for (const b of s.buildings) if (b.type === 'buffalo_storage') earn(s, BUILDING[b.type].income!.perDay * 3 * b.level, 'Buffalo Storage');
});

export function collect(s: GameState, id: number, ev?: SimEvent[]): Result {
  const b = s.buildings.find((q) => q.id === id);
  const p = b && BUILDING[b.type].produces;
  if (!b || !p || b.ready <= 0) return no('Nothing ready yet');
  const n = b.ready;
  s.inventory[p.item] = (s.inventory[p.item] ?? 0) + n;
  // Kim's Garden alternates flowers with vegetables.
  if (b.type === 'kims_garden') s.inventory.vegetables = (s.inventory.vegetables ?? 0) + Math.ceil(n / 2);
  b.ready = 0;
  addXp(s, 2 + n / 2, ev);
  stat(s, `made_${p.item}`, n);
  ev?.push({ type: 'collect', item: p.item, amount: n, x: b.x, y: b.y });
  return ok(`+${n} ${p.item}`);
}

/** Sleep through the night in a camper, cabin or farmhouse. */
export function canSleep(s: GameState) {
  const bed = s.buildings.some((b) => b.type === 'camper' || b.type === 'cabin' || b.type === 'farmhouse');
  return bed && (s.time.minute >= 20 * 60 || s.time.minute < 5 * 60);
}
export function sleep(s: GameState): { r: Result; ev: SimEvent[] } {
  if (!canSleep(s)) return { r: no('You can sleep after 8 PM in a camper, cabin or farmhouse'), ev: [] };
  const mins = (s.time.minute >= 6 * 60 ? 1440 - s.time.minute + 360 : 360 - s.time.minute);
  const ev = advance(s, mins);
  return { r: ok('Good morning! ☀️'), ev };
}
