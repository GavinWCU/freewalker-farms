import { ITEM, ITEMS } from './content/items';
import { addXp } from './levels';
import { hooks } from './sim';
import { nextRandom } from './rng';
import { earn, stat } from './state';
import { hasBuilding, no, ok, type Result } from './build';
import type { GameState } from './types';

const GRAIN = ['corn', 'soybeans', 'wheat'];
export const BUSINESS_OF: Record<string, string> = {
  corn: 'Corn & soybeans', soybeans: 'Corn & soybeans', wheat: 'Corn & soybeans', pumpkins: 'Field crops',
  vegetables: 'Greenhouses', flowers: 'Gardens', apples: 'Apple orchard', eggs: 'Chicken coop', honey: 'Honey production',
  fish: 'Fishing', goods: 'Freewalker Goods', lumber: 'Lumber', venison: 'Hunting',
};

/** Today's wholesale price for one unit at the county market. */
export function marketPrice(s: GameState, item: string) {
  const base = ITEM[item].price * (s.market[item] ?? 1);
  const silo = GRAIN.includes(item) && hasBuilding(s, 'silo') ? 1.1 : 1;
  return Math.round(base * silo * 100) / 100;
}

export function sell(s: GameState, item: string, qty: number): Result {
  const have = s.inventory[item] ?? 0;
  qty = Math.min(Math.floor(qty), have);
  if (qty <= 0) return no('Nothing to sell');
  const amount = Math.round(marketPrice(s, item) * qty * 100) / 100;
  s.inventory[item] = have - qty;
  earn(s, amount, BUSINESS_OF[item] ?? 'Market');
  stat(s, `sold_${item}`, qty);
  addXp(s, amount / 100);
  return ok(`Sold ${qty} ${ITEM[item].name} for $${amount.toLocaleString()}`);
}

// Prices wander a little each day and drift back toward normal.
hooks.day.push((s) => {
  for (const it of ITEMS) {
    const m = s.market[it.id] ?? 1;
    const shock = (nextRandom(s) - 0.5) * 0.12;
    s.market[it.id] = Math.round(Math.min(1.6, Math.max(0.6, m + (1 - m) * 0.15 + shock)) * 1000) / 1000;
  }
});
