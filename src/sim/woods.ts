import { addXp } from './levels';
import { hooks } from './sim';
import { chance, nextRandom } from './rng';
import { log, stat } from './state';
import { buildingAt, no, ok, type Result } from './build';
import { isLakefront, isLand } from './world';
import type { GameState, SimEvent } from './types';

// ── lumber ──────────────────────────────────────────────────────────────────
export const LOGS_PER_TREE = 3;

/** Trees on this tile you're allowed to cut (0 if none or not yours). */
export function choppable(s: GameState, i: number) {
  const t = s.tiles[i];
  if (!t.owned || t.lease || t.landmark || buildingAt(s, i)) return 0;
  return t.trees;
}

export function chopTrees(s: GameState, i: number, ev?: SimEvent[]): Result {
  const n = choppable(s, i);
  if (!n) return no('No trees here you can cut');
  const logs = n * LOGS_PER_TREE;
  s.tiles[i].trees = 0;
  s.inventory.lumber = (s.inventory.lumber ?? 0) + logs;
  stat(s, 'trees_cut', n);
  addXp(s, 4 * n, ev);
  return ok(`🪓 Cut ${n} tree${n > 1 ? 's' : ''}: +${logs} logs`);
}

// Your timber grows back slowly: each season some cut-over woods regrow a tree.
hooks.season.push((s) => {
  for (const t of s.tiles) if (t.owned && t.t === 'timber' && !t.b && !t.lease && t.trees < 4 && chance(s, 0.35)) t.trees++;
});

// ── hunting: deer, turkey, pheasants and ducks, all year ───────────────────
export type HuntSpot = 'woods' | 'field' | 'shore';
export interface GameAnimal {
  id: string; name: string; icon: string; min: number; max: number;
  where: Partial<Record<HuntSpot, number>>;  // how often it shows up at each kind of spot
  bag: number;                               // daily limit
  meat: 'venison' | 'fowl'; yieldPct: number; // lb of meat per lb of animal
  buck?: boolean; flies?: boolean;
}
export const GAME: GameAnimal[] = [
  { id: 'doe', name: 'Whitetail doe', icon: '🦌', min: 85, max: 150, where: { woods: 30, field: 10, shore: 6 }, bag: 1, meat: 'venison', yieldPct: 0.4 },
  { id: 'whitetail', name: 'Whitetail buck', icon: '🦌', min: 130, max: 260, where: { woods: 24, field: 7, shore: 4 }, bag: 1, meat: 'venison', yieldPct: 0.4, buck: true },
  { id: 'mule', name: 'Mule deer buck', icon: '🦌', min: 150, max: 290, where: { woods: 5, field: 12 }, bag: 1, meat: 'venison', yieldPct: 0.4, buck: true },
  { id: 'turkey', name: 'Wild turkey', icon: '🦃', min: 12, max: 25, where: { woods: 22, field: 12 }, bag: 1, meat: 'fowl', yieldPct: 0.6 },
  { id: 'pheasant', name: 'Rooster pheasant', icon: '🐓', min: 2, max: 3.6, where: { field: 40, woods: 6 }, bag: 3, meat: 'fowl', yieldPct: 0.6, flies: true },
  { id: 'duck', name: 'Mallard duck', icon: '🦆', min: 2, max: 3.4, where: { shore: 70, field: 4 }, bag: 6, meat: 'fowl', yieldPct: 0.6, flies: true },
];
export const GAME_BY_ID: Record<string, GameAnimal> = Object.fromEntries(GAME.map((g) => [g.id, g]));

export function huntSpot(s: GameState, i: number): HuntSpot | null {
  const t = s.tiles[i];
  if (!isLand(t) || !(t.owned || t.lease) || buildingAt(s, i) || t.f?.crop) return null;
  if (isLakefront(s, i)) return 'shore';
  if (t.t === 'timber' || t.trees) return 'woods';
  return 'field';
}

/** How many of this animal you've taken today. */
export const bagged = (s: GameState, id: string) => { const v = s.flags[`bag_${id}`] ?? 0; return Math.floor(v / 100) === s.time.day ? v % 100 : 0; };
export const bagFull = (s: GameState, id: string) => bagged(s, id) >= GAME_BY_ID[id].bag;

/** What steps out (or flushes) at this spot. Picks among animals you can still take today. */
export function spotGame(s: GameState, i: number): string | null {
  const spot = huntSpot(s, i);
  if (!spot) return null;
  const pool = GAME.filter((g) => g.where[spot] && !bagFull(s, g.id));
  if (!pool.length) return null;
  const w = pool.map((g) => g.where[spot]!);
  let r = nextRandom(s) * w.reduce((a, b) => a + b, 0), k = 0;
  while (r > w[k]) r -= w[k++];
  return pool[k].id;
}

/** One shot at `id`. `skill` (0..1) comes from the aiming game. Daily bag limits per animal. */
export function takeShot(s: GameState, i: number, skill: number, id: string, ev: SimEvent[] = []): Result & { game?: string; lb?: number; points?: number; record?: boolean } {
  const spot = huntSpot(s, i);
  const g = GAME_BY_ID[id];
  if (!spot || !g) return no('Hunt on your own land');
  if (bagFull(s, id)) return no(`You've reached today's limit of ${g.bag} ${g.name.toLowerCase()}${g.bag > 1 ? 's' : ''}`);
  const m = s.time.minute, golden = (m >= 5 * 60 && m < 9 * 60) || (m >= 16 * 60 && m < 20 * 60);
  if (skill < 0.2 || nextRandom(s) > 0.3 + skill * 0.55 + (golden ? 0.15 : 0)) return no(`Missed — the ${g.name.toLowerCase()} got away`);
  const lb = Math.round((g.min + (g.max - g.min) * Math.pow(nextRandom(s), 2 - skill)) * 10) / 10;
  const points = g.buck ? 4 + 2 * Math.floor(nextRandom(s) * (2 + skill * 3)) : 0;
  const record = lb > (s.hunting.records[id] ?? 0);
  if (record) s.hunting.records[id] = lb;
  if (points > (s.hunting.bestPoints ?? 0)) s.hunting.bestPoints = points;
  s.hunting.harvested++;
  s.flags[`bag_${id}`] = s.time.day * 100 + bagged(s, id) + 1;
  s.inventory[g.meat] = (s.inventory[g.meat] ?? 0) + Math.max(1, Math.round(lb * g.yieldPct));
  addXp(s, 8 + lb / 10, ev);
  log(s, `Harvested a ${g.name.toLowerCase()}, ${lb} lb${points ? `, ${points} points` : ''}.`);
  return { ok: true, msg: `${g.name}, ${lb} lb${points ? ` · ${points}-point rack` : ''}${record ? ' — new personal record! 🏆' : ''}`, game: id, lb, points, record };
}
