// Hay, riding lessons and cookouts.
import { addXp } from './levels';
import { earn, spend, stat } from './state';
import { seasonIndex, seasonOf } from './time';
import { charm, hasBuilding, no, ok, type Result } from './build';
import type { GameState, SimEvent } from './types';

// ── hay: cut and bale pasture you own or rent, once a season, spring to fall ─
export const HAY_PER_ACRE = 3;
export const BALE_COST = 4; // $ per acre: fuel and twine
const rentedIn = (s: GameState, id?: number) => !!id && s.leases.some((l) => l.id === id && l.dir === 'in');
/** Pasture you can bale: yours (not leased out) or rented in, no building on it. */
export const hayable = (s: GameState, i: number) => {
  const t = s.tiles[i];
  return t.t === 'pasture' && !t.b && !t.landmark && (t.owned ? !t.lease || rentedIn(s, t.lease) : rentedIn(s, t.lease));
};
const balable = (s: GameState, i: number) => hayable(s, i) && s.flags[`hay_${i}`] !== seasonIndex(s.time.day) + 1;
export const hayReady = (s: GameState) => (seasonOf(s.time.day) === 3 ? [] : s.tiles.map((_, i) => i).filter((i) => balable(s, i)));

export function baleHay(s: GameState, ev?: SimEvent[]): Result {
  if (seasonOf(s.time.day) === 3) return no('Pasture is dormant in winter. Bale hay spring through fall.');
  const tiles = hayReady(s);
  if (!tiles.length) return no(s.tiles.some((_, i) => hayable(s, i)) ? 'Already baled this season. The grass grows back next season.' : 'You need pasture (owned or rented) to bale hay');
  let acres = 0, bales = 0;
  for (const i of tiles) {
    if (!spend(s, BALE_COST, 'Hay')) break;
    s.flags[`hay_${i}`] = seasonIndex(s.time.day) + 1;
    bales += Math.max(1, Math.round(HAY_PER_ACRE * s.tiles[i].soil));
    acres++;
  }
  if (!acres) return no('Not enough money for fuel and twine');
  s.inventory.hay = (s.inventory.hay ?? 0) + bales;
  stat(s, 'hayBales', bales);
  addXp(s, acres * 1.5, ev);
  return ok(`Baled ${bales} bales of hay on ${acres} acre${acres > 1 ? 's' : ''}`);
}

// ── riding lessons at the Horse Stable ─────────────────────────────────────
export const LESSONS_PER_DAY = 3;
export const LESSON_PAY = 55;
export const lessonsToday = (s: GameState) => (Math.floor((s.flags.lessons ?? 0) / 10) === s.time.day ? (s.flags.lessons ?? 0) % 10 : 0);
export function teachLesson(s: GameState, ev?: SimEvent[]): Result {
  const stable = s.buildings.find((b) => b.type === 'horse_stable');
  if (!stable) return no('Build a Horse Stable first');
  const hr = s.time.minute / 60;
  if (hr < 8 || hr >= 19) return no('Students come for lessons 8 AM to 7 PM');
  const n = lessonsToday(s);
  if (n >= LESSONS_PER_DAY) return no(`That's all ${LESSONS_PER_DAY} lessons for today`);
  s.flags.lessons = s.time.day * 10 + n + 1;
  const pay = Math.round(LESSON_PAY * stable.level * charm(s));
  earn(s, pay, 'Riding lessons');
  stat(s, 'lessons');
  addXp(s, 10, ev);
  return ok(`🐴 Taught a riding lesson: +$${pay}`);
}

// ── cookouts at the Outdoor Kitchen ─────────────────────────────────────────
export const canCookout = (s: GameState) => hasBuilding(s, 'outdoor_kitchen') && s.flags.cookout !== s.time.day;
export function hostCookout(s: GameState, ev?: SimEvent[]): Result {
  if (!hasBuilding(s, 'outdoor_kitchen')) return no('Build an Outdoor Kitchen first');
  if (s.flags.cookout === s.time.day) return no('One cookout a day. The neighbors are full!');
  s.flags.cookout = s.time.day;
  const meat = ['venison', 'fowl', 'fish'].find((k) => (s.inventory[k] ?? 0) >= 4);
  if (meat) s.inventory[meat] -= 4;
  addXp(s, meat ? 40 : 20, ev);
  stat(s, 'cookouts');
  return ok(meat ? '🍖 Cookout! The neighbors loved the grill. Big XP' : '🌭 Cookout with hot dogs. Bring 4 lb of venison, fowl or fish for a bigger one');
}
