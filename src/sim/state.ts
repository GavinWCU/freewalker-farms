import { generateTiles, homeToWorld } from './world';
import { generateSpots } from './explore';
import { START, WORLD_H, WORLD_W } from './map/home80';
import { START_MINUTE, seasonKey } from './time';
import type { GameState } from './types';

export const SAVE_VERSION = 2;
export const START_MONEY = 25000;

export function newGame(seed: number, farmName = 'Freewalker Farms'): GameState {
  const p = homeToWorld(START.col, START.row);
  const s: GameState = {
    saveVersion: SAVE_VERSION,
    seed: seed | 0,
    rng: (seed * 2654435761) | 0,
    farmName,
    time: { day: 1, minute: START_MINUTE },
    money: START_MONEY,
    xp: 0,
    level: 1,
    w: WORLD_W,
    h: WORLD_H,
    tiles: generateTiles(seed),
    buildings: [],
    nextId: 1,
    inventory: {},
    market: {},
    weather: 'sunny',
    events: [],
    landBought: 0,
    auction: null,
    leases: [],
    loan: { principal: 0, rate: 0.08, missed: 0 },
    stand: { stock: {}, today: { sold: {}, revenue: 0, ranOut: [], customers: 0 }, last: null },
    workers: { farmhand: 0, cashier: 0, ranchhand: 0 },
    cattle: [],
    player: { x: p.x + 0.5, y: p.y + 0.5, vehicle: 'foot', tractorMode: 'harvest' },
    vehicles: ['foot', 'truck', 'tractor'],
    fishing: { records: {}, caught: 0 },
    spots: [],
    gifts: [],
    parked: { truck: { x: p.x + 1.1, y: p.y + 1 }, tractor: { x: p.x - 0.1, y: p.y + 1 } },
    upgrades: [],
    achievements: [],
    bell: [],
    ledger: [{ key: seasonKey(1), income: {}, expense: {} }],
    log: [],
    stats: {},
    flags: {},
  };
  s.spots = generateSpots(s.seed, s.tiles, s.w);
  return s;
}

// ── money & bookkeeping ────────────────────────────────────────────────────

function ledgerNow(s: GameState) {
  const key = seasonKey(s.time.day);
  let l = s.ledger[s.ledger.length - 1];
  if (!l || l.key !== key) {
    l = { key, income: {}, expense: {} };
    s.ledger.push(l);
    if (s.ledger.length > 12) s.ledger.shift();
  }
  return l;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function earn(s: GameState, amount: number, business: string) {
  if (amount <= 0) return;
  s.money = round2(s.money + amount);
  const l = ledgerNow(s);
  l.income[business] = round2((l.income[business] ?? 0) + amount);
  s.stats.earned = round2((s.stats.earned ?? 0) + amount);
}

/** Spends money if affordable. Money never goes negative. */
export function spend(s: GameState, amount: number, category: string): boolean {
  if (amount > s.money + 1e-9) return false;
  s.money = round2(s.money - amount);
  const l = ledgerNow(s);
  l.expense[category] = round2((l.expense[category] ?? 0) + amount);
  return true;
}

export function log(s: GameState, text: string) {
  s.log.push({ day: s.time.day, text });
  if (s.log.length > 60) s.log.shift();
}

export const stat = (s: GameState, k: string, n = 1) => { s.stats[k] = (s.stats[k] ?? 0) + n; };
