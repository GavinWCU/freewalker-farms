import { CROP } from './content/crops';
import { addXp } from './levels';
import { hooks } from './sim';
import { log, spend, stat } from './state';
import { seasonOf } from './time';
import { isWet } from './weather';
import { hasBuilding, no, ok, type Result } from './build';
import { N4, xy, idx, inBounds } from './world';
import type { GameState, SimEvent, Tile } from './types';

export const TILL_COST = 20;
export const BREAK_GROUND_COST = 300;

/** Can you farm this tile: your own (not leased out) cropland, or cropland you lease in. */
export function farmable(s: GameState, i: number) {
  const t = s.tiles[i];
  if (t.t !== 'crop' || t.b || t.path) return false;
  if (t.owned) return !t.lease;
  return !!t.lease && s.leases.some((l) => l.id === t.lease && l.dir === 'in');
}

export type FieldAction = 'till' | 'plant' | 'water' | 'harvest';

export function fieldState(t: Tile): FieldAction | 'growing' | null {
  if (!t.f?.tilled) return 'till';
  if (!t.f.crop) return 'plant';
  if (t.f.growth >= 1) return 'harvest';
  return t.f.watered ? 'growing' : 'water';
}

export const tractorCapacity = (s: GameState) => (!s.vehicles.includes('tractor') ? 1 : s.upgrades.includes('big_tractor') ? 40 : 12);

/** Connected tiles that want the same action, starting at i (flood fill, capped). */
export function fieldGroup(s: GameState, i: number, cap: number): number[] {
  const want = fieldState(s.tiles[i]);
  const out: number[] = [], seen = new Set([i]), q = [i];
  while (q.length && out.length < cap) {
    const c = q.shift()!;
    out.push(c);
    const { x, y } = xy(s, c);
    for (const [dx, dy] of N4) {
      if (!inBounds(s, x + dx, y + dy)) continue;
      const n = idx(s, x + dx, y + dy);
      if (seen.has(n) || !farmable(s, n)) continue;
      const st = fieldState(s.tiles[n]);
      if (st !== want && !(want === 'water' && st === 'water')) continue;
      seen.add(n); q.push(n);
    }
  }
  return out;
}

export function till(s: GameState, i: number): Result {
  const t = s.tiles[i];
  if (!farmable(s, i)) return no('You can only till your cropland');
  if (t.f?.tilled) return no('Already tilled');
  const cost = hasBuilding(s, 'tool_rack') ? 0 : TILL_COST;
  if (!spend(s, cost, 'Field work')) return no('Not enough money');
  t.f = { tilled: true, crop: null, growth: 0, watered: false };
  t.trees = 0; t.rock = false;
  return ok('Tilled');
}

export function plant(s: GameState, i: number, cropId: string): Result {
  const t = s.tiles[i], c = CROP[cropId];
  if (!c) return no('Unknown crop');
  if (!farmable(s, i) || !t.f?.tilled) return no('Till the ground first');
  if (t.f.crop) return no('Already planted');
  if (s.level < c.level) return no(`${c.name} unlocks at level ${c.level}`);
  if (!c.seasons.includes(seasonOf(s.time.day))) return no(`${c.name} can't be planted this season`);
  if (!spend(s, c.seed, 'Seed')) return no('Not enough money for seed');
  t.f.crop = cropId; t.f.growth = 0; t.f.watered = isWet(s.weather) || autoWatered(s, i);
  stat(s, 'planted');
  return ok(`Planted ${c.name}`);
}

export function water(s: GameState, i: number): Result {
  const f = s.tiles[i].f;
  if (!f?.crop || f.growth >= 1) return no('Nothing to water');
  if (f.watered) return no('Already watered today');
  f.watered = true;
  return ok('Watered');
}

export function harvestYield(s: GameState, i: number) {
  const t = s.tiles[i], c = CROP[t.f!.crop!];
  const bumper = s.events.some((e) => e.kind === 'bumper' && e.until > s.time.day) ? 1.5 : 1;
  const combine = s.upgrades.includes('combine') ? 1.15 : 1;
  return Math.max(1, Math.round(c.yield * t.soil * bumper * combine));
}

export function harvest(s: GameState, i: number, ev?: SimEvent[]): Result {
  const t = s.tiles[i];
  if (!t.f?.crop || t.f.growth < 1) return no('Not ready yet');
  const c = CROP[t.f.crop];
  const n = harvestYield(s, i);
  s.inventory[c.item] = (s.inventory[c.item] ?? 0) + n;
  t.f.crop = null; t.f.growth = 0; t.f.watered = false;
  stat(s, 'harvested'); stat(s, `made_${c.item}`, n);
  addXp(s, 6, ev);
  const { x, y } = xy(s, i);
  ev?.push({ type: 'harvest', item: c.item, amount: n, x, y });
  return ok(`+${n} ${c.item}`);
}

/** Do an action on a tile, or on its whole connected field with the tractor. */
export function fieldAction(s: GameState, i: number, action: FieldAction, crop?: string, whole = false, ev?: SimEvent[]): Result {
  const tiles = whole ? fieldGroup(s, i, tractorCapacity(s)) : [i];
  let done = 0, last: Result = no('Nothing to do');
  for (const j of tiles) {
    const r = action === 'till' ? till(s, j) : action === 'plant' ? plant(s, j, crop ?? '') : action === 'water' ? water(s, j) : harvest(s, j, ev);
    if (r.ok) done++;
    else if (done === 0) last = r;
    if (!r.ok && /money/i.test(r.msg)) { last = r; break; }
  }
  if (!done) return last;
  const verb = { till: 'Tilled', plant: 'Planted', water: 'Watered', harvest: 'Harvested' }[action];
  return ok(`${verb} ${done} acre${done > 1 ? 's' : ''}`);
}

/** Windmills water fields within 2 tiles; workshop sprinklers water everything. */
export function autoWatered(s: GameState, i: number) {
  if (s.upgrades.includes('sprinklers')) return true;
  const { x, y } = xy(s, i);
  return s.buildings.some((b) => b.type === 'windmill' && Math.abs(b.x - x) <= 2 && Math.abs(b.y - y) <= 2);
}

/** Convert pasture you own into cropland. */
export function breakGround(s: GameState, i: number): Result {
  const t = s.tiles[i];
  if (!t.owned || t.lease || t.t !== 'pasture' || t.b || t.landmark) return no('Only open pasture can be broken');
  if (!spend(s, BREAK_GROUND_COST, 'Field work')) return no('Not enough money');
  t.t = 'crop'; t.trees = 0; t.rock = false;
  return ok('Broke new ground — this acre is cropland now');
}

// ── growth ──────────────────────────────────────────────────────────────────
hooks.hour.push((s) => {
  const season = seasonOf(s.time.day);
  const drought = s.events.some((e) => e.kind === 'drought' && e.until > s.time.day);
  for (const t of s.tiles) {
    const f = t.f;
    if (!f?.crop || f.growth >= 1) continue;
    const c = CROP[f.crop];
    if (!c.seasons.includes(season)) continue;
    const rate = f.watered ? 1 : drought ? 0.3 : 0.6;
    f.growth = Math.min(1, f.growth + rate / (c.days * 24));
  }
});

hooks.day.push((s, ev) => {
  const wet = isWet(s.weather);
  const season = seasonOf(s.time.day);
  let withered = 0;
  s.tiles.forEach((t, i) => {
    const f = t.f;
    if (!f?.crop) return;
    if (season === 3 && f.growth < 1) { f.crop = null; f.growth = 0; withered++; return; }
    f.watered = wet || autoWatered(s, i);
  });
  if (withered) { log(s, `Winter frost took ${withered} unfinished acres.`); ev.push({ type: 'toast', text: `Frost! ${withered} unfinished acres withered.` }); }
});
