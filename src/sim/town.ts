// Town of Stillwater: General Store, Restaurant, Bank, Post Office and Insurance Agent.
// Everything here keeps its state in flags/inventory, so it needs no new save fields.
import { ITEM } from './content/items';
import { addXp } from './levels';
import { hash2 } from './rng';
import { earn, log, spend, stat } from './state';
import { DAYS_PER_SEASON, seasonIndex } from './time';
import { no, ok, type Result } from './build';
import { isInsured } from './explore';
import type { GameState } from './types';

export const TRAVEL_MINUTES = 30; // each way, by truck

// ── General Store ───────────────────────────────────────────────────────────
export const STORE: { id: string; name: string; icon: string; price: number; desc: string }[] = [
  { id: 'hay', name: 'Hay bales', icon: '🌿', price: 12, desc: 'Winter feed: cattle and buffalo eat hay from the barn before bought feed.' },
  { id: 'bait', name: 'Live bait', icon: '🪱', price: 25, desc: 'Fish bite better for the rest of today.' },
  { id: 'fertilizer', name: 'Fertilizer (10 acres)', icon: '🧪', price: 220, desc: 'Your next 10 harvests yield 25% more.' },
];
export function buyFromStore(s: GameState, id: string, qty = 1): Result {
  const it = STORE.find((q) => q.id === id);
  if (!it) return no('The store is out of that');
  qty = Math.max(1, Math.floor(qty));
  if (id === 'bait' && s.flags.bait === s.time.day) return no('You already have bait for today');
  if (!spend(s, it.price * qty, 'General Store')) return no('Not enough money');
  if (id === 'hay') s.inventory.hay = (s.inventory.hay ?? 0) + qty;
  if (id === 'bait') s.flags.bait = s.time.day;
  if (id === 'fertilizer') s.flags.fert = (s.flags.fert ?? 0) + 10 * qty;
  stat(s, 'storeBuys');
  return ok(`Bought ${it.name.toLowerCase()}`);
}

// ── Restaurant: the chef wants a few things each day and pays above market ──
export const CHEF_MENU = ['vegetables', 'eggs', 'honey', 'apples', 'fish', 'venison', 'fowl', 'pumpkins', 'flowers', 'corn', 'wheat'];
export const CHEF_PREMIUM = 1.25; // × fair stand price
/** Today's orders: 3 items with how many the chef will take. Fixed per farm and day (no dice roll). */
export function chefOrders(s: GameState) {
  const out: { item: string; want: number; price: number; left: number }[] = [];
  for (let k = 0; out.length < 3 && k < 20; k++) {
    const item = CHEF_MENU[Math.floor(hash2(k, s.time.day, s.seed) * CHEF_MENU.length)];
    if (out.some((o) => o.item === item)) continue;
    const want = 6 + Math.floor(hash2(k + 50, s.time.day, s.seed ^ 0x5bd1) * 15);
    const price = Math.round(ITEM[item].retail * CHEF_PREMIUM * 100) / 100;
    out.push({ item, want, price, left: Math.max(0, want - chefSold(s, item)) });
  }
  return out;
}
const chefSold = (s: GameState, item: string) => { const f = s.flags[`chef_${item}`] ?? 0; return Math.floor(f / 1000) === s.time.day ? f % 1000 : 0; };
export function sellToChef(s: GameState, item: string): Result {
  const o = chefOrders(s).find((q) => q.item === item);
  if (!o) return no("The chef isn't buying that today");
  const n = Math.min(o.left, s.inventory[item] ?? 0);
  if (!o.left) return no('The chef has enough for today');
  if (n <= 0) return no(`You don't have any ${ITEM[item].name.toLowerCase()}`);
  s.inventory[item] -= n;
  s.flags[`chef_${item}`] = s.time.day * 1000 + chefSold(s, item) + n;
  const amount = Math.round(o.price * n * 100) / 100;
  earn(s, amount, 'Restaurant');
  addXp(s, amount / 80);
  stat(s, 'chefSales', n);
  return ok(`Sold ${n} ${ITEM[item].name} to the chef for $${amount.toLocaleString()}`);
}

// ── Post Office: a farm subsidy check every season, and mail orders ─────────
export function subsidyAmount(s: GameState) {
  let crop = 0, pasture = 0;
  for (const t of s.tiles) if (t.owned && !(t.lease && s.leases.some((l) => l.id === t.lease && l.dir === 'out'))) { if (t.t === 'crop') crop++; else if (t.t === 'pasture') pasture++; }
  return Math.max(250, Math.round((crop * 18 + pasture * 9) / 10) * 10);
}
export const subsidyReady = (s: GameState) => (s.flags.subsidy ?? 0) !== seasonIndex(s.time.day) + 1;
export function cashSubsidy(s: GameState): Result {
  if (!subsidyReady(s)) return no(`Already picked up this season's check. The next one comes in ${DAYS_PER_SEASON - ((s.time.day - 1) % DAYS_PER_SEASON)} days`);
  const amt = subsidyAmount(s);
  s.flags.subsidy = seasonIndex(s.time.day) + 1;
  earn(s, amt, 'Farm subsidy');
  log(s, `Picked up a farm subsidy check for $${amt.toLocaleString()}.`);
  stat(s, 'subsidies');
  return ok(`📬 Farm subsidy check: $${amt.toLocaleString()}`);
}
export const MAIL_ITEMS = ['goods', 'honey', 'flowers'];
export const POSTAGE = 0.1; // share of the retail price
export function mailOrder(s: GameState, item: string): Result {
  if (!MAIL_ITEMS.includes(item)) return no("That doesn't ship well");
  const n = Math.min(20, s.inventory[item] ?? 0);
  if (n <= 0) return no(`You don't have any ${ITEM[item].name.toLowerCase()}`);
  s.inventory[item] -= n;
  const amount = Math.round(ITEM[item].retail * (1 - POSTAGE) * n * 100) / 100;
  earn(s, amount, 'Mail orders');
  return ok(`Shipped ${n} ${ITEM[item].name} to customers: $${amount.toLocaleString()}`);
}

// ── Insurance agent: crop insurance, one season at a time ───────────────────
export function insuredAcres(s: GameState) {
  return s.tiles.filter((t) => t.t === 'crop' && (t.owned ? !t.lease || s.leases.some((l) => l.id === t.lease && l.dir === 'in') : s.leases.some((l) => l.id === t.lease && l.dir === 'in'))).length;
}
export const premium = (s: GameState) => Math.max(200, Math.round(insuredAcres(s) * 12 / 10) * 10);
export function buyInsurance(s: GameState): Result {
  if (isInsured(s)) return no("You're already covered this season");
  const p = premium(s);
  if (!spend(s, p, 'Insurance')) return no('Not enough money');
  s.flags.insured = seasonIndex(s.time.day) + 1;
  log(s, `Bought crop insurance for the season ($${p}).`);
  return ok(`🛡️ Your crops are insured for the rest of the season`);
}
