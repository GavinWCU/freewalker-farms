import { ITEM } from './content/items';
import { addXp } from './levels';
import { hooks } from './sim';
import { chance, nextRandom, randInt } from './rng';
import { earn, log, spend, stat } from './state';
import { countBuilding, hasBuilding, no, ok, type Result } from './build';
import { farmable, fieldGroup, harvest, plant, tractorCapacity } from './farming';
import { collect } from './build';
import { BUILDING } from './content/buildings';
import { CROP } from './content/crops';
import { seasonOf } from './time';
import { xy } from './world';
import type { Building, GameState, SimEvent } from './types';

// ── Farm Stand / Freewalker Farm Market ─────────────────────────────────────
export const standBuilding = (s: GameState): Building | undefined => s.buildings.find((b) => b.type === 'farm_stand');
export const isMarket = (s: GameState) => (standBuilding(s)?.level ?? 0) >= 3;
export const SHELVES = [0, 4, 6, 9];        // item kinds per stand level
export const SHELF_UNITS = [0, 40, 80, 150]; // units per kind
export const standName = (s: GameState) => (isMarket(s) ? 'Freewalker Farm Market' : 'Farm Stand');

export function stock(s: GameState, item: string, qty: number): Result {
  const b = standBuilding(s);
  if (!b) return no('Build a Farm Stand first');
  if (!ITEM[item]) return no('Unknown item');
  const slot = s.stand.stock[item];
  const kinds = Object.values(s.stand.stock).filter((q) => q.qty > 0).length;
  if (!slot?.qty && kinds >= SHELVES[b.level]) return no(`Your ${standName(s)} has room for ${SHELVES[b.level]} kinds of goods`);
  const room = SHELF_UNITS[b.level] - (slot?.qty ?? 0);
  const n = Math.min(Math.floor(qty), s.inventory[item] ?? 0, room);
  if (n <= 0) return no(room <= 0 ? 'That shelf is full' : 'None in the barn');
  s.inventory[item] -= n;
  s.stand.stock[item] = { qty: (slot?.qty ?? 0) + n, price: slot?.price ?? ITEM[item].retail };
  return ok(`Stocked ${n} ${ITEM[item].name}`);
}
export function unstock(s: GameState, item: string): Result {
  const slot = s.stand.stock[item];
  if (!slot?.qty) return no('Nothing on that shelf');
  s.inventory[item] = (s.inventory[item] ?? 0) + slot.qty;
  slot.qty = 0;
  return ok('Moved back to the barn');
}
export function setPrice(s: GameState, item: string, price: number): Result {
  if (!(price > 0) || price > 10000) return no('Enter a price');
  const slot = (s.stand.stock[item] ??= { qty: 0, price: ITEM[item].retail });
  slot.price = Math.round(price * 100) / 100;
  return ok(`${ITEM[item].name}: $${slot.price.toFixed(2)}`);
}

/** Chance a shopper buys at a given price: ~60% at a fair price, falling off as you charge more. */
export const buyChance = (price: number, fair: number) => Math.min(0.97, Math.max(0.02, 1.4 - 0.8 * (price / fair)));

export function customersPerHour(s: GameState) {
  const b = standBuilding(s);
  if (!b) return 0;
  const base = [0, 1.6, 2.6, 4.2][b.level];
  const weather = { sunny: 1, cloudy: 0.9, rain: 0.6, storm: 0.3, snow: 0.5 }[s.weather];
  const cashier = s.workers.cashier > 0 ? 1.3 : isMarket(s) ? 0.6 : 1;
  const extras = 1 + countBuilding(s, 'landscaping') * 0.1 + (hasBuilding(s, 'farm_sign') ? 0.1 : 0) + (s.upgrades.includes('stand_sign') ? 0.25 : 0);
  return base * weather * cashier * extras;
}

hooks.hour.push((s, ev) => {
  const b = standBuilding(s);
  const hour = s.time.minute / 60;
  if (!b || hour < 8 || hour > 19) return;
  const stocked = Object.keys(s.stand.stock).filter((k) => s.stand.stock[k].qty > 0);
  if (!stocked.length) return;
  const rate = customersPerHour(s);
  const n = Math.floor(rate) + (nextRandom(s) < rate % 1 ? 1 : 0);
  for (let c = 0; c < n; c++) {
    s.stand.today.customers++;
    let spent = 0;
    const wants = randInt(s, 1, 2);
    for (let k = 0; k < wants; k++) {
      const avail = Object.keys(s.stand.stock).filter((q) => s.stand.stock[q].qty > 0);
      if (!avail.length) break;
      const item = avail[Math.floor(nextRandom(s) * avail.length)];
      const slot = s.stand.stock[item];
      if (!chance(s, buyChance(slot.price, ITEM[item].retail))) continue;
      const qty = Math.min(slot.qty, randInt(s, 1, 3));
      slot.qty -= qty;
      const money = Math.round(slot.price * qty * 100) / 100;
      earn(s, money, item === 'goods' ? 'Freewalker Goods' : isMarket(s) ? 'Farm Market' : 'Farm Stand');
      s.stand.today.sold[item] = (s.stand.today.sold[item] ?? 0) + qty;
      s.stand.today.revenue = Math.round((s.stand.today.revenue + money) * 100) / 100;
      if (slot.qty === 0 && !s.stand.today.ranOut.includes(item)) s.stand.today.ranOut.push(item);
      stat(s, 'standSold', qty);
      spent += money;
    }
    ev.push({ type: 'sale', x: b.x, y: b.y, amount: spent });
    if (spent) addXp(s, spent / 60);
  }
});

hooks.day.push((s) => {
  const t = s.stand.today;
  if (standBuilding(s)) s.stand.last = { ...t, day: s.time.day - 1 };
  s.stand.today = { sold: {}, revenue: 0, ranOut: [], customers: 0 };
  // The Farm Market makes Freewalker Goods merchandise every day.
  if (isMarket(s) && spend(s, 6 * 5, 'Freewalker Goods')) s.inventory.goods = (s.inventory.goods ?? 0) + 6;
});

// ── workers ─────────────────────────────────────────────────────────────────
export const WORKERS: Record<'farmhand' | 'cashier' | 'ranchhand', { name: string; wage: number; max: number; desc: string }> = {
  farmhand: { name: 'Farmhand', wage: 60, max: 3, desc: 'Harvests ready fields and replants them every morning (one tractor-load each).' },
  cashier: { name: 'Cashier', wage: 50, max: 1, desc: 'Runs the stand: more customers, and the Farm Market needs one.' },
  ranchhand: { name: 'Ranch hand', wage: 40, max: 2, desc: 'Collects eggs, honey, produce and more from your buildings.' },
};
export function hire(s: GameState, kind: keyof typeof WORKERS): Result {
  const w = WORKERS[kind];
  if (s.workers[kind] >= w.max) return no(`You have all the ${w.name.toLowerCase()}s you need`);
  if (kind === 'cashier' && !standBuilding(s)) return no('Build a Farm Stand first');
  if (s.level < 5) return no('Hiring unlocks at level 5');
  if (!spend(s, w.wage, 'Wages')) return no('Not enough money for the first day');
  s.workers[kind]++;
  return ok(`Hired a ${w.name.toLowerCase()} for $${w.wage}/day`);
}
export function fire(s: GameState, kind: keyof typeof WORKERS): Result {
  if (s.workers[kind] <= 0) return no('Nobody to let go');
  s.workers[kind]--;
  return ok(`Let a ${WORKERS[kind].name.toLowerCase()} go`);
}

hooks.day.push((s, ev) => {
  for (const kind of Object.keys(WORKERS) as (keyof typeof WORKERS)[]) {
    for (let k = s.workers[kind]; k > 0; k--) {
      if (spend(s, WORKERS[kind].wage, 'Wages')) continue;
      s.workers[kind]--;
      ev.push({ type: 'toast', text: `Couldn't pay wages — a ${WORKERS[kind].name.toLowerCase()} quit` });
    }
  }
});
// Workers do their rounds at 7 AM.
hooks.hour.push((s, ev) => {
  if (s.time.minute !== 7 * 60) return;
  for (let k = 0; k < s.workers.ranchhand; k++) for (const b of s.buildings) if (b.ready > 0 && BUILDING[b.type].produces) collect(s, b.id, ev);
  for (let k = 0; k < s.workers.farmhand; k++) {
    const i = s.tiles.findIndex((t, j) => !!t.f?.crop && t.f.growth >= 1 && farmable(s, j));
    if (i < 0) break;
    const crop = s.tiles[i].f!.crop!;
    for (const j of fieldGroup(s, i, tractorCapacity(s))) {
      harvest(s, j, ev);
      if (CROP[crop].seasons.includes(seasonOf(s.time.day))) plant(s, j, crop);
    }
  }
});

// ── cattle ──────────────────────────────────────────────────────────────────
export const CALF_PRICE = 900;
export const CATTLE_MATURE = 18; // days
export const cattleCapacity = (s: GameState) =>
  countBuilding(s, 'cattle_corral') ? Math.floor(s.tiles.filter((t) => t.owned && t.t === 'pasture' && !t.lease && !t.b).length / 2) + countBuilding(s, 'cattle_corral') * 4 : 0;
export const cattlePrice = (s: GameState) => Math.round(1700 * (s.market.cattle ?? 1));

export function buyCalves(s: GameState, n: number): Result {
  const corral = s.buildings.find((b) => b.type === 'cattle_corral');
  if (!corral) return no('Build a Cattle Corral first');
  n = Math.min(Math.floor(n), cattleCapacity(s) - s.cattle.length);
  if (n <= 0) return no('No more room on your pasture');
  if (!spend(s, CALF_PRICE * n, 'Cattle')) return no('Not enough money');
  const pasture = s.tiles.map((t, i) => (t.owned && t.t === 'pasture' && !t.lease && !t.b ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < n; k++) {
    const p = pasture.length ? xy(s, pasture[Math.floor(nextRandom(s) * pasture.length)]) : { x: corral.x, y: corral.y };
    s.cattle.push({ id: s.nextId++, age: 0, x: p.x + 0.3 + nextRandom(s) * 0.4, y: p.y + 0.3 + nextRandom(s) * 0.4 });
  }
  return ok(`Bought ${n} calf${n > 1 ? 'ves' : ''}`);
}
export function sellCattle(s: GameState, ev?: SimEvent[]): Result {
  const ready = s.cattle.filter((c) => c.age >= CATTLE_MATURE);
  if (!ready.length) return no(`Cattle are ready at ${CATTLE_MATURE} days old`);
  const total = ready.length * cattlePrice(s);
  s.cattle = s.cattle.filter((c) => c.age < CATTLE_MATURE);
  earn(s, total, 'Cattle');
  stat(s, 'cattleSold', ready.length);
  addXp(s, total / 100, ev);
  return ok(`Sold ${ready.length} head for $${total.toLocaleString()}`);
}
hooks.day.push((s) => {
  s.market.cattle = Math.round(Math.min(1.4, Math.max(0.75, (s.market.cattle ?? 1) + (1 - (s.market.cattle ?? 1)) * 0.15 + (nextRandom(s) - 0.5) * 0.1)) * 1000) / 1000;
  if (!s.cattle.length) return;
  for (const c of s.cattle) c.age++;
  // Winter hay
  if (seasonOf(s.time.day) === 3 && !spend(s, 6 * s.cattle.length, 'Feed')) log(s, 'Ran short of hay money this winter.');
});
