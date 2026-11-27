import { addXp } from './levels';
import { hooks } from './sim';
import { chance, hash2, nextRandom, pick, randInt } from './rng';
import { earn, log, spend, stat } from './state';
import { DAYS_PER_SEASON } from './time';
import { no, ok, type Result } from './build';
import { COUNTY_ROAD_Y } from './map/home80';
import { N4, idx, inBounds, isLakefront, isLand, xy } from './world';
import type { GameState, Lease, LeaseOffer, SimEvent } from './types';

// ── buying land ─────────────────────────────────────────────────────────────
export const BASE_ACRE: Record<string, number> = { crop: 3000, pasture: 2200, timber: 1800 };
export const GOAL_ACRES = 1000;

/** Neighbors of a tile, treating the county road as no barrier. */
function touching(s: GameState, i: number): number[] {
  const { x, y } = xy(s, i);
  const out: number[] = [];
  for (const [dx, dy] of N4) {
    let nx = x + dx, ny = y + dy;
    if (!inBounds(s, nx, ny)) continue;
    if (s.tiles[idx(s, nx, ny)].t === 'road' && dy !== 0 && (ny === COUNTY_ROAD_Y)) { ny += dy; if (!inBounds(s, nx, ny)) continue; }
    out.push(idx(s, nx, ny));
  }
  return out;
}

export function isBuyable(s: GameState, i: number) {
  const t = s.tiles[i];
  if (t.owned || !isLand(t)) return false;
  if (t.lease && s.leases.some((l) => l.id === t.lease && l.dir === 'out')) return false;
  return touching(s, i).some((n) => s.tiles[n].owned && isLand(s.tiles[n]));
}

/** Market value of one acre (before auctions). */
export function acreValue(s: GameState, i: number) {
  const t = s.tiles[i];
  const base = (BASE_ACRE[t.t] ?? 2000) * (isLakefront(s, i) ? 1.5 : 1) * t.soil;
  return base * (1 + 0.004 * s.landBought);
}

export function auctionFor(s: GameState, i: number) {
  return s.auction && s.auction.endDay > s.time.day && s.auction.tiles.includes(i) ? s.auction : null;
}

export function landPrice(s: GameState, i: number) {
  const a = auctionFor(s, i);
  return Math.round((acreValue(s, i) * (a ? a.factor : 1)) / 10) * 10;
}

export function buyParcel(s: GameState, i: number, ev?: SimEvent[]): Result {
  if (s.tiles[i].owned) return no('You already own this');
  if (!isBuyable(s, i)) return no('You can only buy land touching yours');
  const price = landPrice(s, i);
  if (!spend(s, price, 'Land')) return no(`Not enough money (${'$' + price.toLocaleString()})`);
  const t = s.tiles[i];
  // Buying land you were renting ends that lease.
  if (t.lease) endLease(s, s.leases.find((l) => l.id === t.lease)!, 'bought');
  t.owned = true;
  s.landBought++;
  addXp(s, 40, ev);
  stat(s, 'acresBought');
  ev?.push({ type: 'bought', x: xy(s, i).x, y: xy(s, i).y });
  return ok(`Bought 1 acre for $${price.toLocaleString()}`);
}

/** Buy an entire auction block in one go (tiles become buyable as the block grows). */
export function buyAuction(s: GameState, ev?: SimEvent[]): Result {
  const a = s.auction;
  if (!a || a.endDay <= s.time.day) return no('No auction right now');
  const total = a.tiles.reduce((n, i) => n + landPrice(s, i), 0);
  if (s.money < total) return no(`Not enough money ($${total.toLocaleString()})`);
  let left = [...a.tiles], bought = 0;
  while (left.length) {
    const i = left.find((k) => isBuyable(s, k));
    if (i === undefined) break;
    if (buyParcel(s, i, ev).ok) bought++;
    left = left.filter((k) => k !== i);
  }
  s.auction = null;
  return bought ? ok(`Won the auction: ${bought} acres!`) : no('Could not buy the block');
}

/** Property-line edges: [x, y, side] where side 0=N 1=E 2=S 3=W. The renderer fences these. */
export function fenceEdges(s: GameState): [number, number, number][] {
  const out: [number, number, number][] = [];
  const mine = (x: number, y: number) => inBounds(s, x, y) && s.tiles[idx(s, x, y)].owned && isLand(s.tiles[idx(s, x, y)]);
  s.tiles.forEach((t, i) => {
    if (!t.owned || !isLand(t)) return;
    const { x, y } = xy(s, i);
    ([[0, -1], [1, 0], [0, 1], [-1, 0]] as const).forEach(([dx, dy], side) => {
      const n = inBounds(s, x + dx, y + dy) ? s.tiles[idx(s, x + dx, y + dy)] : undefined;
      if (n?.t === 'water') return;
      if (!mine(x + dx, y + dy)) out.push([x, y, side]);
    });
  });
  return out;
}

// Auctions: a neighbor sells a block, at a discount or with bidding over market.
hooks.day.push((s, ev) => {
  if (s.auction && s.auction.endDay <= s.time.day) s.auction = null;
  if (s.auction || !chance(s, 0.07)) return;
  const candidates = s.tiles.map((_, i) => i).filter((i) => isBuyable(s, i) && !s.tiles[i].lease);
  if (!candidates.length) return;
  const start = pick(s, candidates);
  const block = [start];
  const want = randInt(s, 2, 5);
  for (let k = 0; k < 20 && block.length < want; k++) {
    const n = touching(s, pick(s, block)).filter((j) => !block.includes(j) && !s.tiles[j].owned && isLand(s.tiles[j]) && !s.tiles[j].lease);
    if (n.length) block.push(pick(s, n));
  }
  const discount = chance(s, 0.6);
  s.auction = {
    tiles: block,
    factor: discount ? 0.7 + nextRandom(s) * 0.15 : 1.15 + nextRandom(s) * 0.2,
    endDay: s.time.day + 3,
    label: discount ? 'A neighbor is selling a block below market' : 'Bidding war: land is going over market',
  };
  log(s, `Land auction: ${block.length} acres (${discount ? 'discount' : 'over market'}).`);
  ev.push({ type: 'toast', text: `🔨 Land auction! ${block.length} acres for 3 days` });
});

// ── leasing ─────────────────────────────────────────────────────────────────
export const TENANTS: Record<string, { name: string; icon: string; terrain: string[]; rate: number; lengths: number[]; people: string[] }> = {
  farmer: { name: 'Crop farmer', icon: '🌾', terrain: ['crop'], rate: 110, lengths: [1, 3, 5], people: ['Dale Hruska', 'Lena Vogt', 'Marty Pfeifer', 'Rosa Kuhn'] },
  rancher: { name: 'Cattle rancher', icon: '🐄', terrain: ['pasture', 'crop'], rate: 65, lengths: [1, 3, 5], people: ['Wade Bauer', 'June Kessler', 'Hank Ortiz'] },
  hunter: { name: 'Hunting club', icon: '🦌', terrain: ['timber', 'pasture'], rate: 35, lengths: [1, 3], people: ['Platte Valley Hunt Club', 'Elk Creek Sportsmen'] },
  solar: { name: 'Solar company', icon: '☀️', terrain: ['crop', 'pasture'], rate: 160, lengths: [3, 5], people: ['Prairie Sun Energy', 'Bright Acre Solar'] },
};

/** Tiles that can be leased out together starting from i (connected, same terrain, unused). */
export function leaseBlock(s: GameState, i: number, whole: boolean): number[] {
  const ok1 = (j: number) => { const t = s.tiles[j]; return t.owned && isLand(t) && !t.lease && !t.b && !t.f?.crop && !t.landmark; };
  if (!ok1(i)) return [];
  if (!whole) return [i];
  const terr = s.tiles[i].t, out = [i], q = [i], seen = new Set(q);
  while (q.length && out.length < 40) {
    for (const n of touching(s, q.shift()!)) {
      if (seen.has(n) || !ok1(n) || s.tiles[n].t !== terr) continue;
      seen.add(n); out.push(n); q.push(n);
    }
  }
  return out.slice(0, 40);
}

/** 2–3 offers for a block. Derived from the day and place, so they don't change while you look. */
export function leaseOffers(s: GameState, tiles: number[]): LeaseOffer[] {
  if (!tiles.length) return [];
  const t = s.tiles[tiles[0]];
  const soil = tiles.reduce((n, i) => n + s.tiles[i].soil, 0) / tiles.length;
  const kinds = Object.keys(TENANTS).filter((k) => TENANTS[k].terrain.includes(t.t));
  const seed = tiles[0] * 31 + s.time.day;
  const out: LeaseOffer[] = [];
  kinds.forEach((k, n) => {
    if (out.length >= 3 || (n > 0 && hash2(seed, n, 11) < 0.25 && kinds.length > 2)) return;
    const d = TENANTS[k];
    const r = hash2(seed, n, 12);
    out.push({
      tenant: k,
      name: d.people[Math.floor(hash2(seed, n, 13) * d.people.length)],
      ratePerAcre: Math.round(d.rate * soil * (0.85 + r * 0.3)),
      seasons: d.lengths[Math.floor(hash2(seed, n, 14) * d.lengths.length)],
    });
  });
  return out;
}

const seasonStart = (day: number) => Math.floor((day - 1) / DAYS_PER_SEASON) * DAYS_PER_SEASON + 1;
const leaseSeasons = (l: Lease) => Math.round((l.endDay - seasonStart(l.startDay)) / DAYS_PER_SEASON);

export function leaseOut(s: GameState, tiles: number[], offer: LeaseOffer, ev?: SimEvent[]): Result {
  if (!tiles.length) return no('Nothing to lease');
  for (const i of tiles) {
    const t = s.tiles[i];
    if (!t.owned || t.lease || t.b || t.f?.crop || !isLand(t)) return no('Only open land you own can be leased');
  }
  const id = s.nextId++;
  const start = s.time.day;
  const lease: Lease = { id, dir: 'out', tiles: [...tiles], tenant: offer.tenant, name: offer.name, ratePerAcre: offer.ratePerAcre, startDay: start, endDay: seasonStart(start) + offer.seasons * DAYS_PER_SEASON, paid: 1 };
  s.leases.push(lease);
  for (const i of tiles) { const t = s.tiles[i]; t.lease = id; t.f = undefined; delete t.fence; }
  earn(s, offer.ratePerAcre * tiles.length, 'Leased land');
  addXp(s, 10 * tiles.length, ev);
  stat(s, 'leasesOut');
  log(s, `Leased ${tiles.length} acres to ${offer.name}.`);
  return ok(`Leased ${tiles.length} acre${tiles.length > 1 ? 's' : ''} to ${offer.name} — first season's rent paid`);
}

/** Rent per acre per season to lease a neighbor's field. */
export const rentInRate = (s: GameState, i: number) => Math.round(acreValue(s, i) * 0.035);

export function leaseInBlock(s: GameState, i: number, whole: boolean): number[] {
  const ok1 = (j: number) => { const t = s.tiles[j]; return !t.owned && !t.lease && (t.t === 'crop' || t.t === 'pasture'); };
  if (!ok1(i) || !isBuyable(s, i)) return [];
  if (!whole) return [i];
  const out = [i], q = [i], seen = new Set(q);
  while (q.length && out.length < 6) {
    for (const n of touching(s, q.shift()!)) {
      if (seen.has(n) || !ok1(n) || s.tiles[n].t !== s.tiles[i].t) continue;
      seen.add(n); out.push(n); q.push(n);
    }
  }
  return out.slice(0, 6);
}

export function leaseIn(s: GameState, tiles: number[], seasons: number): Result {
  if (!tiles.length) return no('That land is not available to rent');
  if (![1, 3, 5].includes(seasons)) return no('Leases run 1, 3 or 5 seasons');
  const rate = Math.round(tiles.reduce((n, i) => n + rentInRate(s, i), 0) / tiles.length);
  if (!spend(s, rate * tiles.length, 'Rent paid')) return no('Not enough money for the first season');
  const id = s.nextId++;
  const t0 = s.tiles[tiles[0]];
  const owner = pick({ rng: (tiles[0] * 7919) | 0 }, ['the Hruska family', 'the Vogts', 'Old Man Pfeifer', 'the Kessler estate', 'the Bauers']);
  s.leases.push({ id, dir: 'in', tiles: [...tiles], tenant: 'you', name: owner, ratePerAcre: rate, startDay: s.time.day, endDay: seasonStart(s.time.day) + seasons * DAYS_PER_SEASON, paid: 1 });
  for (const i of tiles) { s.tiles[i].lease = id; s.tiles[i].trees = 0; s.tiles[i].rock = false; }
  stat(s, 'leasesIn');
  return ok(`Renting ${tiles.length} acre${tiles.length > 1 ? 's' : ''} of ${t0.t === 'crop' ? 'cropland' : 'pasture'} from ${owner}`);
}

export function breakPenalty(_s: GameState, l: Lease) { return Math.round(l.ratePerAcre * l.tiles.length * (l.dir === 'out' ? 1.5 : 1)); }

export function breakLease(s: GameState, id: number): Result {
  const l = s.leases.find((q) => q.id === id);
  if (!l) return no('No such lease');
  const p = breakPenalty(s, l);
  if (!spend(s, p, 'Lease penalties')) return no(`Breaking it costs $${p.toLocaleString()}`);
  endLease(s, l, 'broken');
  return ok(`Lease ended early. Paid a $${p.toLocaleString()} penalty.`);
}

export function endLease(s: GameState, l: Lease, why: string) {
  s.leases = s.leases.filter((q) => q !== l);
  for (const i of l.tiles) {
    const t = s.tiles[i];
    if (t.lease !== l.id) continue;
    delete t.lease;
    if (l.dir === 'in' && !t.owned) t.f = undefined; // crops on rented land go back with it
  }
  log(s, `Lease with ${l.name} ended (${why}).`);
}

export const activeLeases = (s: GameState, dir: 'in' | 'out') => s.leases.filter((l) => l.dir === dir);

hooks.season.push((s, ev) => {
  const drought = s.events.some((e) => e.kind === 'drought' && e.until > s.time.day);
  for (const l of [...s.leases]) {
    if (l.endDay <= s.time.day) continue; // ends below
    if ((l.paid ?? 0) >= leaseSeasons(l)) continue;
    const amount = l.ratePerAcre * l.tiles.length;
    if (l.dir === 'out') {
      const cut = drought && (l.tenant === 'farmer' || l.tenant === 'rancher') ? 0.7 : 1;
      earn(s, Math.round(amount * cut), 'Leased land');
      if (cut < 1) ev.push({ type: 'toast', text: `${l.name} could only pay 70% rent in the drought` });
    } else if (!spend(s, amount, 'Rent paid')) {
      endLease(s, l, 'rent unpaid');
      ev.push({ type: 'toast', text: `Couldn't pay rent — the lease from ${l.name} ended` });
      continue;
    }
    l.paid = (l.paid ?? 0) + 1;
  }
});

hooks.day.push((s, ev) => {
  for (const l of [...s.leases]) {
    if (l.endDay <= s.time.day) {
      endLease(s, l, 'finished');
      // Sometimes a good tenant asks to renew, at a higher rate.
      if (l.dir === 'out' && chance(s, 0.5)) {
        s.events.push({ kind: 'renewal', until: s.time.day + 3, data: { tenant: l.tenant, name: l.name, rate: Math.round(l.ratePerAcre * (1.1 + nextRandom(s) * 0.1)), seasons: Math.max(1, leaseSeasons(l)), tiles: l.tiles.join(',') } });
        ev.push({ type: 'toast', text: `${l.name} wants to renew their lease at a higher rate` });
      } else ev.push({ type: 'toast', text: `Lease with ${l.name} is over` });
    } else if (l.dir === 'out' && !s.flags.calm && chance(s, 0.004)) {
      // A tenant leaves early and pays half a season to get out.
      earn(s, Math.round(l.ratePerAcre * l.tiles.length * 0.5), 'Leased land');
      endLease(s, l, 'tenant left early');
      ev.push({ type: 'toast', text: `${l.name} is leaving early and paid half a season's rent` });
    }
  }
  s.events = s.events.filter((e) => e.until > s.time.day);
});

export function acceptRenewal(s: GameState, k: number): Result {
  const e = s.events.filter((q) => q.kind === 'renewal')[k];
  if (!e?.data) return no('That offer has expired');
  const tiles = String(e.data.tiles).split(',').map(Number);
  s.events = s.events.filter((q) => q !== e);
  return leaseOut(s, tiles, { tenant: String(e.data.tenant), name: String(e.data.name), ratePerAcre: Number(e.data.rate), seasons: Number(e.data.seasons) });
}

// ── loans ───────────────────────────────────────────────────────────────────
export const landValue = (s: GameState) => s.tiles.reduce((n, t, i) => n + (t.owned && isLand(t) ? acreValue(s, i) : 0), 0);
export const loanLimit = (s: GameState) => Math.max(0, Math.floor((landValue(s) * 0.5 - s.loan.principal) / 100) * 100);
export const monthlyInterest = (s: GameState) => Math.round(s.loan.principal * (s.loan.rate / 12) * 100) / 100;

export function borrow(s: GameState, amount: number): Result {
  amount = Math.floor(amount);
  if (amount <= 0) return no('Enter an amount');
  if (s.loan.missed > 0) return no('The bank wants your missed payments caught up first');
  if (amount > loanLimit(s)) return no(`The bank will lend up to $${loanLimit(s).toLocaleString()}`);
  s.loan.principal += amount;
  earn(s, amount, 'Loans');
  stat(s, 'borrowed', amount);
  return ok(`Borrowed $${amount.toLocaleString()} at ${(s.loan.rate * 100).toFixed(1)}%`);
}

export function repay(s: GameState, amount: number): Result {
  amount = Math.min(Math.floor(amount * 100) / 100, s.loan.principal);
  if (amount <= 0) return no('Nothing to repay');
  if (!spend(s, amount, 'Loan repayment')) return no('Not enough money');
  s.loan.principal = Math.round((s.loan.principal - amount) * 100) / 100;
  if (s.loan.principal <= 0) { s.loan.missed = 0; s.loan.rate = Math.max(0.08, s.loan.rate - 0.01); }
  return ok(s.loan.principal <= 0 ? 'Loan paid off! 🎉' : `Repaid $${amount.toLocaleString()}`);
}

// Interest is due at the start of every month. Missing it adds a late fee and
// raises the rate, but the game always goes on.
hooks.month.push((s, ev) => {
  if (s.loan.principal <= 0) return;
  const due = monthlyInterest(s);
  if (spend(s, due, 'Loan interest')) { s.loan.missed = 0; return; }
  s.loan.missed++;
  const fee = Math.round(due * 0.25);
  s.loan.principal = Math.round((s.loan.principal + due + fee) * 100) / 100;
  if (s.loan.missed >= 3) s.loan.rate = Math.min(0.2, s.loan.rate + 0.01);
  log(s, `Missed a loan payment ($${due}). Late fee $${fee}.`);
  ev.push({ type: 'toast', text: `⚠️ Missed loan payment — late fee added${s.loan.missed >= 3 ? ', rate went up' : ''}` });
});

export const acresLeasedOut = (s: GameState) => activeLeases(s, 'out').reduce((n, l) => n + l.tiles.length, 0);
export const acresLeasedIn = (s: GameState) => activeLeases(s, 'in').reduce((n, l) => n + l.tiles.length, 0);
