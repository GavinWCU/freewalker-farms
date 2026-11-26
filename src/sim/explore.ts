import { addXp } from './levels';
import { hooks } from './sim';
import { chance, hash2, nextRandom, pick, randInt } from './rng';
import { earn, log, spend, stat } from './state';
import { seasonOf } from './time';
import { fieldAction, farmable, fieldState } from './farming';
import { buildingAt, no, ok, type Result } from './build';
import { N4, idx, inBounds, isLand, tileAt, xy } from './world';
import type { GameState, SimEvent, Tile, Vehicle } from './types';

// ── vehicles & movement ─────────────────────────────────────────────────────
export const VEHICLES: Record<Vehicle, { name: string; icon: string; speed: number; price: number; level: number }> = {
  foot: { name: 'On foot', icon: '🚶', speed: 1.6, price: 0, level: 1 },
  truck: { name: 'Pickup truck', icon: '🛻', speed: 3.6, price: 0, level: 1 },
  tractor: { name: 'Small tractor', icon: '🚜', speed: 1.5, price: 0, level: 1 },
  atv: { name: 'ATV', icon: '🏍️', speed: 3, price: 2500, level: 1 },
};

export function buyVehicle(s: GameState, v: Vehicle): Result {
  if (s.vehicles.includes(v)) return no('You already have one');
  if (!spend(s, VEHICLES[v].price, 'Equipment')) return no('Not enough money');
  s.vehicles.push(v);
  return ok(`Bought an ${VEHICLES[v].name}! Build trails to ride faster.`);
}

export function setVehicle(s: GameState, v: Vehicle): Result {
  if (!s.vehicles.includes(v)) return no(`You don't own a ${VEHICLES[v].name.toLowerCase()}`);
  const cur = s.player.vehicle;
  if (cur === v) return ok('');
  if (v !== 'foot') {
    const p = s.parked[v];
    if (p && Math.hypot(p.x - s.player.x, p.y - s.player.y) > 1.5) return no(`Walk over to your ${VEHICLES[v].name.toLowerCase()} first`);
    if (p) { s.player.x = p.x; s.player.y = p.y; }
  }
  if (cur !== 'foot') s.parked[cur] = { x: s.player.x, y: s.player.y };
  if (v !== 'foot') delete s.parked[v];
  s.player.vehicle = v;
  return ok(v === 'foot' ? 'Hopped out' : `${VEHICLES[v].icon} ${VEHICLES[v].name}${v === 'truck' ? ' — Ace jumps in the back' : ''}`);
}

function speedOn(t: Tile, v: Vehicle) {
  if (t.path === 'gravel' || t.t === 'road') return v === 'truck' ? 1.5 : 1.2;
  if (t.path === 'trail') return v === 'atv' ? 1.5 : 1.15;
  if (t.t === 'timber') return v === 'truck' ? 0.5 : 0.8;
  return 1;
}
const walkable = (t: Tile | undefined) => !!t && (t.t !== 'water');

/** Moves the player by an input direction for `dt` real seconds. */
export function movePlayer(s: GameState, dx: number, dy: number, dt: number, ev: SimEvent[] = []) {
  const len = Math.hypot(dx, dy);
  if (!len) return ev;
  const p = s.player;
  const here = tileAt(s, Math.floor(p.x), Math.floor(p.y))!;
  const step = VEHICLES[p.vehicle].speed * speedOn(here, p.vehicle) * Math.min(dt, 0.1);
  const before = idx(s, Math.floor(p.x), Math.floor(p.y));
  const nx = p.x + (dx / len) * step, ny = p.y + (dy / len) * step;
  const ok = (x: number, y: number) => inBounds(s, Math.floor(x), Math.floor(y)) && (walkable(tileAt(s, Math.floor(x), Math.floor(y))) || dockAt(s, x, y));
  if (ok(nx, ny)) { p.x = nx; p.y = ny; }
  else if (ok(nx, p.y)) p.x = nx;
  else if (ok(p.x, ny)) p.y = ny;
  p.x = Math.round(p.x * 1000) / 1000; p.y = Math.round(p.y * 1000) / 1000;
  const after = idx(s, Math.floor(p.x), Math.floor(p.y));
  if (after !== before) enterTile(s, after, ev);
  discover(s, ev);
  return ev;
}
/** Docks reach one tile out over the water. */
function dockAt(s: GameState, x: number, y: number) {
  return s.buildings.some((b) => b.type === 'fishing_dock' && Math.abs(b.x + 0.5 - x) < 1.4 && Math.abs(b.y + 0.5 - y) < 1.4);
}

export const TRACTOR_MODES = ['harvest', 'till', 'water', 'plant'] as const;

/** Driving the tractor across your field works it as you go. */
function enterTile(s: GameState, i: number, ev: SimEvent[]) {
  stat(s, 'tilesDriven');
  if (s.tiles[i].path === 'trail') s.flags.trailToday = s.time.day;
  if (s.player.vehicle !== 'tractor' || !farmable(s, i)) return;
  const [mode, crop] = s.player.tractorMode.split(':');
  const st = fieldState(s.tiles[i]);
  if (mode === 'harvest' && st === 'harvest') fieldAction(s, i, 'harvest', undefined, false, ev);
  else if (mode === 'till' && st === 'till') fieldAction(s, i, 'till');
  else if (mode === 'water' && st === 'water') fieldAction(s, i, 'water');
  else if (mode === 'plant' && st === 'plant' && crop) fieldAction(s, i, 'plant', crop);
  else return;
  const { x, y } = xy(s, i);
  ev.push({ type: 'worked', x, y });
}

// ── hidden treasures & Ace ──────────────────────────────────────────────────
export const TREASURES: Record<string, { name: string; icon: string; value: number }> = {
  arrowhead: { name: 'Flint arrowhead', icon: '🪨', value: 120 },
  horseshoe: { name: 'Old horseshoe', icon: '🧲', value: 40 },
  bottle: { name: 'Antique bottle', icon: '🍶', value: 90 },
  nickel: { name: 'Buffalo nickel', icon: '🪙', value: 150 },
  key: { name: 'Rusty skeleton key', icon: '🗝️', value: 60 },
  spike: { name: 'Railroad spike', icon: '🔩', value: 35 },
  coin: { name: 'Pioneer silver dollar', icon: '💰', value: 400 },
  fossil: { name: 'Mammoth tooth fossil', icon: '🦴', value: 600 },
  knife: { name: "Leonard's pocketknife", icon: '🔪', value: 250 },
  bell: { name: 'Old school bell clapper', icon: '🔔', value: 180 },
};

/** Seeds hidden spots across the whole world (home and neighbor land). */
export function generateSpots(seed: number, tiles: Tile[], w: number) {
  const ids = Object.keys(TREASURES);
  const out: GameState['spots'] = [];
  for (let k = 0; out.length < 24 && k < 2000; k++) {
    const i = Math.floor(hash2(k, 5, seed) * tiles.length);
    if (!isLand(tiles[i])) continue;
    out.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5, item: ids[Math.floor(hash2(k, 6, seed) * ids.length)], found: false });
  }
  return out;
}

function discover(s: GameState, ev: SimEvent[]) {
  for (const sp of s.spots) {
    if (sp.found || Math.hypot(sp.x - s.player.x, sp.y - s.player.y) > 0.6) continue;
    findTreasure(s, sp, 'you', ev);
  }
}
function findTreasure(s: GameState, sp: GameState['spots'][number], who: 'you' | 'Ace', ev: SimEvent[]) {
  sp.found = true;
  const t = TREASURES[sp.item];
  s.gifts.push({ x: sp.x, y: sp.y, item: sp.item, value: t.value });
  log(s, `${who === 'Ace' ? 'Ace dug up' : 'You found'} ${t.name.toLowerCase()}.`);
  ev.push({ type: 'toast', text: `${who === 'Ace' ? '🐕 Ace dug up' : '✨ You found'} ${t.icon} ${t.name}!` });
}
export function collectGift(s: GameState, k: number, ev?: SimEvent[]): Result {
  const g = s.gifts[k];
  if (!g) return no('Already collected');
  s.gifts.splice(k, 1);
  earn(s, g.value, 'Finds & treasures');
  s.stats[`found_${g.item}`] = (s.stats[`found_${g.item}`] ?? 0) + 1;
  stat(s, 'treasures');
  addXp(s, 25, ev);
  return ok(`${TREASURES[g.item]?.icon ?? '🎁'} ${TREASURES[g.item]?.name ?? 'Treasure'}: +$${g.value}`);
}

// Ace roams with you and digs now and then.
hooks.hour.push((s, ev) => {
  if (s.player.vehicle === 'truck' || s.time.minute < 7 * 60 || s.time.minute > 19 * 60) return;
  const near = s.spots.find((sp) => !sp.found && Math.hypot(sp.x - s.player.x, sp.y - s.player.y) < 3);
  if (near && chance(s, 0.35)) { findTreasure(s, near, 'Ace', ev); return; }
  if (chance(s, 0.02)) {
    const item = pick(s, ['horseshoe', 'spike', 'bottle', 'key']);
    s.gifts.push({ x: s.player.x + 0.4, y: s.player.y + 0.4, item, value: Math.round(TREASURES[item].value * 0.5) });
    ev.push({ type: 'toast', text: `🐕 Ace is digging… he found ${TREASURES[item].name.toLowerCase()}!` });
  }
});

// ── fishing ─────────────────────────────────────────────────────────────────
export const FISH: { id: string; name: string; min: number; max: number; weight: number; dock?: boolean; seasons?: number[]; night?: boolean }[] = [
  { id: 'bluegill', name: 'Bluegill', min: 0.2, max: 1.2, weight: 30 },
  { id: 'perch', name: 'Yellow perch', min: 0.3, max: 1.5, weight: 22 },
  { id: 'crappie', name: 'Crappie', min: 0.4, max: 2.5, weight: 18, seasons: [0, 2] },
  { id: 'bass', name: 'Largemouth bass', min: 1, max: 9, weight: 14 },
  { id: 'catfish', name: 'Channel catfish', min: 2, max: 25, weight: 10, night: true },
  { id: 'walleye', name: 'Walleye', min: 1.5, max: 11, weight: 8, dock: true },
  { id: 'wiper', name: 'Wiper', min: 3, max: 18, weight: 4, dock: true, seasons: [1, 2] },
  { id: 'pike', name: 'Northern pike', min: 4, max: 26, weight: 3, dock: true },
];

export function fishingSpot(s: GameState, i: number): 'dock' | 'shore' | null {
  const t = s.tiles[i];
  if (buildingAt(s, i)?.type === 'fishing_dock') return 'dock';
  const { x, y } = xy(s, i);
  if (isLand(t) && (t.owned || t.lease) && N4.some(([dx, dy]) => tileAt(s, x + dx, y + dy)?.t === 'water')) return 'shore';
  return null;
}

/** One cast. `skill` (0..1) comes from the reel-in timing game. */
export function castLine(s: GameState, i: number, skill: number, ev: SimEvent[] = []): Result & { fish?: string; lb?: number; record?: boolean } {
  const spot = fishingSpot(s, i);
  if (!spot) return no('Fish from your shore or a dock');
  if (seasonOf(s.time.day) === 3) return no('The lake is iced over until spring');
  if (skill < 0.15 || nextRandom(s) > 0.4 + skill * 0.6) return { ...no('It got away!'), fish: undefined };
  const night = s.time.minute < 6 * 60 || s.time.minute > 20 * 60;
  const season = seasonOf(s.time.day);
  const pool = FISH.filter((f) => (!f.seasons || f.seasons.includes(season)));
  const w = pool.map((f) => f.weight * (f.dock ? (spot === 'dock' ? 2 : 0.3) : 1) * (f.night && night ? 3 : 1));
  let r = nextRandom(s) * w.reduce((a, b) => a + b, 0), k = 0;
  while (r > w[k]) r -= w[k++];
  const f = pool[k];
  const lb = Math.round((f.min + (f.max - f.min) * Math.pow(nextRandom(s), 2.2 - skill)) * 10) / 10;
  const record = lb > (s.fishing.records[f.id] ?? 0);
  if (record) s.fishing.records[f.id] = lb;
  s.fishing.caught++;
  s.inventory.fish = (s.inventory.fish ?? 0) + Math.max(1, Math.round(lb));
  addXp(s, 5 + lb, ev);
  return { ok: true, msg: `${f.name}, ${lb} lb${record ? ' — new personal record! 🏆' : ''}`, fish: f.id, lb, record };
}

// ── random events ───────────────────────────────────────────────────────────
export const OPPORTUNITIES = [
  { text: 'A film crew rented Lake Stillwater for a day of shooting', cash: 1500 },
  { text: 'The county paid a conservation grant for your pasture', cash: 2000 },
  { text: 'A neighbor paid you to help bring in their hay', cash: 600 },
  { text: 'The church picnic bought out a crate of everything', cash: 400 },
  { text: 'A photographer paid to shoot a wedding at the Sentinel Tree', cash: 900 },
];

hooks.day.push((s, ev) => {
  if (s.flags.calm) return; // tests that check exact amounts switch random events off
  const season = seasonOf(s.time.day);
  const active = (k: string) => s.events.some((e) => e.kind === k && e.until > s.time.day);
  if (s.weather === 'storm') {
    let hit = 0;
    for (const t of s.tiles) if (t.f?.crop && t.f.growth < 1 && chance(s, 0.15)) { t.f.growth = Math.max(0, t.f.growth - 0.25); hit++; }
    ev.push({ type: 'toast', text: `⛈️ Storm! ${hit ? `${hit} acres of crops were knocked back` : 'Your crops rode it out'}` });
  }
  if (season === 1 && !active('drought') && chance(s, 0.05)) {
    s.events.push({ kind: 'drought', until: s.time.day + randInt(s, 4, 7) });
    ev.push({ type: 'toast', text: '🌵 Drought! No rain for days — water your crops' });
    log(s, 'A drought set in.');
  }
  if (season < 3 && !active('bumper') && chance(s, 0.03)) {
    s.events.push({ kind: 'bumper', until: s.time.day + 4 });
    ev.push({ type: 'toast', text: '🌽 Bumper crop! Harvests yield 50% more for 4 days' });
  }
  if (chance(s, 0.04)) {
    const o = pick(s, OPPORTUNITIES);
    earn(s, o.cash, 'Opportunities');
    ev.push({ type: 'toast', text: `💡 ${o.text}: +$${o.cash.toLocaleString()}` });
    log(s, o.text);
  }
  if (chance(s, 0.03)) {
    const item = pick(s, ['pumpkins', 'apples', 'honey', 'corn', 'wheat']);
    s.market[item] = 1.55;
    ev.push({ type: 'toast', text: `📈 A big buyer is in town: ${item} prices are way up today` });
  }
});
