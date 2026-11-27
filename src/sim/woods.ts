import { addXp } from './levels';
import { hooks } from './sim';
import { chance, nextRandom } from './rng';
import { log, stat } from './state';
import { seasonOf } from './time';
import { buildingAt, no, ok, type Result } from './build';
import { isLand } from './world';
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

// ── deer hunting ────────────────────────────────────────────────────────────
export const DEER: { id: string; name: string; min: number; max: number; weight: number; buck?: boolean; open?: boolean }[] = [
  { id: 'doe', name: 'Whitetail doe', min: 85, max: 150, weight: 45 },
  { id: 'whitetail', name: 'Whitetail buck', min: 130, max: 260, weight: 35, buck: true },
  { id: 'mule', name: 'Mule deer buck', min: 150, max: 290, weight: 20, buck: true, open: true },
];
/** Hunting is open in fall and winter. */
export const HUNT_SEASONS = [2, 3];

export function huntSpot(s: GameState, i: number): 'woods' | 'field' | null {
  const t = s.tiles[i];
  if (!isLand(t) || !(t.owned || t.lease) || buildingAt(s, i) || t.f?.crop) return null;
  if (t.t === 'timber' || t.trees) return 'woods';
  if (t.t === 'pasture') return 'field';
  return null;
}

/** One shot. `skill` (0..1) comes from the aiming game. One deer per day (your tag). */
export function takeShot(s: GameState, i: number, skill: number, ev: SimEvent[] = []): Result & { deer?: string; lb?: number; points?: number; record?: boolean } {
  const spot = huntSpot(s, i);
  if (!spot) return no('Hunt in your own woods or pasture');
  if (!HUNT_SEASONS.includes(seasonOf(s.time.day))) return no('Deer season opens in the fall');
  if (s.flags.deerTag === s.time.day) return no("You've filled today's tag — come back tomorrow");
  const m = s.time.minute, golden = (m >= 5 * 60 && m < 9 * 60) || (m >= 16 * 60 && m < 20 * 60);
  if (skill < 0.2 || nextRandom(s) > 0.3 + skill * 0.55 + (golden ? 0.15 : 0)) return no('Missed — the deer bounded off');
  const w = DEER.map((d) => d.weight * (d.open && spot === 'field' ? 2 : d.open ? 0.5 : 1));
  let r = nextRandom(s) * w.reduce((a, b) => a + b, 0), k = 0;
  while (r > w[k]) r -= w[k++];
  const d = DEER[k];
  const lb = Math.round(d.min + (d.max - d.min) * Math.pow(nextRandom(s), 2 - skill));
  const points = d.buck ? 4 + 2 * Math.floor(nextRandom(s) * (2 + skill * 3)) : 0;
  const best = s.hunting.records[d.id] ?? 0;
  const record = lb > best;
  if (record) s.hunting.records[d.id] = lb;
  if (points > (s.hunting.bestPoints ?? 0)) s.hunting.bestPoints = points;
  s.hunting.harvested++;
  s.flags.deerTag = s.time.day;
  s.inventory.venison = (s.inventory.venison ?? 0) + Math.round(lb * 0.4);
  addXp(s, 15 + lb / 10, ev);
  log(s, `Harvested a ${d.name.toLowerCase()}, ${lb} lb${points ? `, ${points} points` : ''}.`);
  return { ok: true, msg: `${d.name}, ${lb} lb${points ? ` · ${points}-point rack` : ''}${record ? ' — new personal record! 🏆' : ''}`, deer: d.id, lb, points, record };
}
