import { describe, expect, it } from 'vitest';
import {
  acresOwned, advance, borrow, breakLease, breakPenalty, build, buyAuction, buyParcel, canBuild, fenceEdges, homeToWorld,
  idx, isBuyable, landPrice, leaseBlock, leaseIn, leaseOffers, leaseOut, loanLimit, monthlyInterest, newGame, repay,
  till, plant, farmable, DAYS_PER_SEASON, DAYS_PER_MONTH, addXp, xpForLevel,
} from '../../src/sim';
import type { GameState } from '../../src/sim';

const at = (s: GameState, col: number, row: number) => { const p = homeToWorld(col, row); return idx(s, p.x, p.y); };
const toSeasonStart = (s: GameState) => { const d = Math.ceil((s.time.day - 1) / DAYS_PER_SEASON) * DAYS_PER_SEASON + 1; advance(s, (d - s.time.day) * 1440 - s.time.minute + 60); };

describe('buying land', () => {
  it('only parcels touching your land are for sale', () => {
    const s = newGame(3);
    expect(isBuyable(s, at(s, -1, 3))).toBe(true);   // just west of the 80
    expect(isBuyable(s, at(s, -3, 3))).toBe(false);  // two parcels away
    expect(isBuyable(s, at(s, 2, 2))).toBe(false);   // already ours
    expect(isBuyable(s, at(s, 2, -2))).toBe(true);   // across the county road
  });
  it('charges the price, needs the money and grows the property', () => {
    const s = newGame(3);
    const i = at(s, -1, 3);
    const price = landPrice(s, i);
    expect(price).toBeGreaterThan(1000);
    const edgesBefore = fenceEdges(s);
    expect(buyParcel(s, i).ok).toBe(true);
    expect(s.money).toBe(25000 - price);
    expect(acresOwned(s)).toBe(81);
    expect(s.tiles[i].owned).toBe(true);
    // fence moved: the old west edge at that row is gone, the new parcel is fenced on its outer sides
    const edges = fenceEdges(s);
    const [x, y] = [i % s.w, Math.floor(i / s.w)];
    expect(edgesBefore.some(([ex, ey, side]) => ex === x + 1 && ey === y && side === 3)).toBe(true);
    expect(edges.some(([ex, ey, side]) => ex === x + 1 && ey === y && side === 3)).toBe(false);
    expect(edges.some(([ex, ey, side]) => ex === x && ey === y && side === 3)).toBe(true);
    // now buildable
    expect(canBuild(s, 'tool_rack', x, y).ok).toBe(true);
    // the next parcel west became buyable, and land got a little pricier
    expect(isBuyable(s, at(s, -2, 3))).toBe(true);
    s.money = 10;
    expect(buyParcel(s, at(s, -2, 3)).ok).toBe(false);
  });
  it('prices rise a little as you expand', () => {
    const s = newGame(3);
    const j = at(s, -1, 5);
    const p0 = landPrice(s, j);
    buyParcel(s, at(s, -1, 3));
    expect(landPrice(s, j)).toBeGreaterThan(p0);
  });
  it('land auctions sell a block at a different price', () => {
    const s = newGame(3);
    s.money = 1e6;
    for (let d = 0; d < 200 && !s.auction; d++) advance(s, 1440);
    expect(s.auction).not.toBeNull();
    const a = s.auction!;
    expect(a.factor).not.toBe(1);
    const n = acresOwned(s);
    expect(buyAuction(s).ok).toBe(true);
    expect(acresOwned(s)).toBeGreaterThan(n);
  });
});

describe('leasing out', () => {
  it('offers 2–3 tenants and blocks building/farming on leased land', () => {
    const s = newGame(4);
    const tiles = leaseBlock(s, at(s, 9, 3), true);
    expect(tiles.length).toBeGreaterThan(1);
    const offers = leaseOffers(s, tiles);
    expect(offers.length).toBeGreaterThanOrEqual(2);
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(leaseOut(s, tiles, offers[0]).ok).toBe(true);
    const p = homeToWorld(9, 3);
    expect(canBuild(s, 'tool_rack', p.x, p.y).ok).toBe(false);
    const crop = at(s, 0, 0);
    expect(leaseOut(s, [crop], { tenant: 'farmer', name: 'T', ratePerAcre: 100, seasons: 1 }).ok).toBe(true);
    expect(farmable(s, crop)).toBe(false);
    expect(till(s, crop).ok).toBe(false);
  });
  it('pays rent every season for the length of the lease, then ends', () => {
    const s = newGame(4);
    s.flags.calm = 1;
    s.time.day = 1; // first day of spring
    const tiles = [at(s, 0, 0), at(s, 1, 0)];
    const m0 = s.money;
    leaseOut(s, tiles, { tenant: 'farmer', name: 'T', ratePerAcre: 100, seasons: 3 });
    expect(s.money).toBe(m0 + 200); // first season up front
    advance(s, 1440 * DAYS_PER_SEASON * 3 + 60);
    const rent = s.ledger.reduce((n, l) => n + (l.income['Leased land'] ?? 0), 0);
    expect(rent).toBe(600);
    expect(s.leases.length).toBe(0);
    expect(s.tiles[tiles[0]].lease).toBeUndefined();
  });
  it('breaking a lease early costs a penalty', () => {
    const s = newGame(4);
    leaseOut(s, [at(s, 0, 0)], { tenant: 'solar', name: 'Sun Co', ratePerAcre: 160, seasons: 5 });
    const l = s.leases[0];
    const pen = breakPenalty(s, l);
    const m = s.money;
    expect(breakLease(s, l.id).ok).toBe(true);
    expect(s.money).toBe(m - pen);
    expect(s.tiles[at(s, 0, 0)].lease).toBeUndefined();
  });
});

describe('leasing in', () => {
  it('rents a neighbor field you can farm but not build on, and pays each season', () => {
    const s = newGame(6);
    addXp(s, xpForLevel(2));
    // find a neighbor cropland parcel touching the 80
    const i = s.tiles.findIndex((t, k) => t.t === 'crop' && isBuyable(s, k));
    const m = s.money;
    expect(leaseIn(s, [i], 3).ok).toBe(true);
    expect(s.money).toBeLessThan(m);
    expect(farmable(s, i)).toBe(true);
    const { x, y } = { x: i % s.w, y: Math.floor(i / s.w) };
    expect(canBuild(s, 'tool_rack', x, y).ok).toBe(false);
    expect(till(s, i).ok).toBe(true);
    expect(plant(s, i, 'soybeans').ok).toBe(true);
    toSeasonStart(s);
    expect(s.ledger.reduce((n, l) => n + (l.expense['Rent paid'] ?? 0), 0)).toBeGreaterThan(0);
    advance(s, 1440 * DAYS_PER_SEASON * 3);
    expect(s.tiles[i].lease).toBeUndefined();
    expect(farmable(s, i)).toBe(false);
  });
});

describe('loans', () => {
  it('borrows against land, charges monthly interest, and can be repaid', () => {
    const s = newGame(8);
    const limit = loanLimit(s);
    expect(limit).toBeGreaterThan(50000);
    expect(borrow(s, limit + 1000).ok).toBe(false);
    expect(borrow(s, 20000).ok).toBe(true);
    expect(s.money).toBe(45000);
    const interest = monthlyInterest(s);
    advance(s, 1440 * DAYS_PER_MONTH);
    expect(s.ledger.reduce((n, l) => n + (l.expense['Loan interest'] ?? 0), 0)).toBeCloseTo(interest, 1);
    expect(repay(s, 20000).ok).toBe(true);
    expect(s.loan.principal).toBe(0);
  });
  it('missing a payment adds a late fee but never ends the game', () => {
    const s = newGame(8);
    s.flags.calm = 1;
    borrow(s, 30000);
    s.money = 0;
    advance(s, 1440 * DAYS_PER_MONTH * 4);
    expect(s.loan.missed).toBeGreaterThan(0);
    expect(s.loan.principal).toBeGreaterThan(30000);
    expect(s.money).toBeGreaterThanOrEqual(0);
    expect(borrow(s, 100).ok).toBe(false); // frozen until caught up
    build(s, 'tool_rack', homeToWorld(6, 6).x, homeToWorld(6, 6).y); // still playable
  });
});
