import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as S from '../../src/sim';
import type { GameState } from '../../src/sim';

const rich = (seed = 5) => { const s = S.newGame(seed); s.money = 1e7; s.level = 20; s.flags.calm = 1; return s; };
const free = (s: GameState, t: string) => s.tiles.findIndex((q, i) => q.owned && q.t === t && !q.b && !q.lease && !q.landmark && S.canPlace(s, 'bench', ...xyA(s, i)).ok);
const xyA = (s: GameState, i: number): [number, number] => [i % s.w, Math.floor(i / s.w)];
const put = (s: GameState, type: string, terrain = 'crop') => { const i = free(s, terrain); const r = S.build(s, type, ...xyA(s, i)); expect(r.ok, r.msg).toBe(true); return i; };
const toSeason = (s: GameState, season: number, hour = 10) => { while (S.seasonOf(s.time.day) !== season) S.advance(s, 1440); S.advance(s, ((hour * 60 - s.time.minute) + 1440) % 1440); };

describe('saves from before this update', () => {
  it('loads the frozen v3 save, keeps the farm, and plays a full year', () => {
    const raw = readFileSync('tests/fixtures/save-v3.json', 'utf8');
    expect(JSON.parse(raw).saveVersion).toBe(3);
    const s = S.deserialize(raw);
    expect(s.saveVersion).toBe(S.SAVE_VERSION);
    expect(s.buffalo).toEqual([]);
    expect(s.cattle.length).toBe(3);
    expect(s.farmName).toBe('Fixture Farm v3');
    expect(s.hunting.records.turkey).toBe(21);
    const types = s.buildings.map((b) => b.type);
    expect(types).toContain('wind_turbine');
    S.advance(s, 1440 * S.DAYS_PER_YEAR);
    expect(Number.isFinite(s.money)).toBe(true);
    expect(S.deserialize(S.serialize(s))).toEqual(s);
  });
  it('v1 and v2 saves still come all the way forward', () => {
    for (const f of ['save-v1.json', 'save-v2.json']) {
      const s = S.deserialize(readFileSync(`tests/fixtures/${f}`, 'utf8'));
      expect(s.saveVersion).toBe(S.SAVE_VERSION);
      expect(s.buffalo).toEqual([]);
      S.advance(s, 1440 * S.DAYS_PER_SEASON);
    }
  });
  it('every new building has its own 3D model', async () => {
    const { BUILDINGS } = S;
    const src = readFileSync('src/render/meshes.ts', 'utf8');
    for (const b of BUILDINGS) expect(src, b.id).toMatch(new RegExp(`id: '${b.id}'`));
  });
});

describe('buffalo', () => {
  it('buy calves, share pasture with cattle, roam daily, sell when grown', () => {
    const s = rich();
    put(s, 'buffalo_paddock', 'pasture');
    expect(S.buyYoung(s, 'buffalo', 2).ok).toBe(true);
    expect(s.buffalo.length).toBe(2);
    const cap = S.cattleCapacity(s);
    expect(S.herdRoom(s)).toBe(cap - 2);
    expect(S.buyCalves(s, 1).ok).toBe(false); // no corral for cattle
    put(s, 'cattle_corral', 'pasture');
    S.buyCalves(s, 1000);
    expect(s.cattle.length + s.buffalo.length).toBe(S.cattleCapacity(s));
    const before = s.buffalo.map((b) => [b.x, b.y]);
    S.advance(s, 1440);
    const moved = s.buffalo.some((b, k) => b.x !== before[k][0] || b.y !== before[k][1]);
    expect(moved).toBe(true);
    for (const b of s.buffalo) expect(s.tiles[S.idx(s, Math.floor(b.x), Math.floor(b.y))].t).toBe('pasture');
    expect(S.sellGrown(s, 'buffalo').ok).toBe(false);
    S.advance(s, 1440 * S.HERDS.buffalo.mature);
    const m = s.money;
    const r = S.sellGrown(s, 'buffalo');
    expect(r.ok).toBe(true);
    expect(s.money).toBeGreaterThan(m + 2 * 3000);
    expect(s.buffalo.length).toBe(0);
  });
  it('winter feed comes out of the hay in the barn first', () => {
    const s = rich();
    put(s, 'buffalo_paddock', 'pasture');
    S.buyYoung(s, 'buffalo', 2);
    toSeason(s, 3);
    s.inventory.hay = 10;
    const spent = s.stats.spent ?? 0;
    S.advance(s, 1440);
    expect(s.inventory.hay).toBe(8);
    expect(s.stats.spent ?? 0).toBe(spent);
  });
});

describe('hay', () => {
  it('bales your pasture once a season, never in winter', () => {
    const s = rich();
    const n = S.hayReady(s).length;
    expect(n).toBeGreaterThan(0);
    const r = S.baleHay(s);
    expect(r.ok, r.msg).toBe(true);
    expect(s.inventory.hay).toBeGreaterThanOrEqual(n * 2);
    expect(S.baleHay(s).ok).toBe(false); // already done this season
    S.advance(s, 1440 * S.DAYS_PER_SEASON);
    expect(S.baleHay(s).ok).toBe(true); // grass grew back
    toSeason(s, 3);
    expect(S.baleHay(s).msg).toMatch(/winter/);
    const hay = s.inventory.hay;
    expect(S.sell(s, 'hay', hay).ok).toBe(true);
  });
  it('rented pasture counts; pasture leased out to someone else does not', () => {
    const s = rich();
    const out = s.tiles.findIndex((t, i) => t.owned && t.t === 'pasture' && S.hayable(s, i));
    S.leaseOut(s, [out], { tenant: 'rancher', name: 'T', ratePerAcre: 50, seasons: 1 });
    expect(S.hayable(s, out)).toBe(false);
    const rent = s.tiles.findIndex((t, i) => !t.owned && t.t === 'pasture' && S.leaseInBlock(s, i, false).length);
    expect(S.hayable(s, rent)).toBe(false);
    expect(S.leaseIn(s, [rent], 1).ok).toBe(true);
    expect(S.hayable(s, rent)).toBe(true);
    expect(S.hayReady(s)).toContain(rent);
  });
});

describe('farmtainment, decor and lessons', () => {
  it('a pumpkin patch only earns in the fall', () => {
    const s = rich();
    put(s, 'pumpkin_patch');
    const earned = (k: string) => s.ledger.reduce((n, l) => n + (l.income[k] ?? 0), 0);
    toSeason(s, 1);
    const summer = earned('Farmtainment');
    S.advance(s, 1440 * 3);
    expect(earned('Farmtainment')).toBe(summer);
    toSeason(s, 2);
    S.advance(s, 1440 * 3);
    expect(earned('Farmtainment')).toBeGreaterThan(summer);
  });
  it('decor brings more customers to the stand', () => {
    const s = rich();
    const road = s.tiles.findIndex((_, i) => S.canBuild(s, 'farm_stand', ...xyA(s, i)).ok);
    S.build(s, 'farm_stand', ...xyA(s, road));
    const base = S.customersPerHour(s);
    put(s, 'gazebo'); put(s, 'fountain'); put(s, 'bench');
    expect(S.customersPerHour(s)).toBeGreaterThan(base);
  });
  it('riding lessons: three a day, daytime only', () => {
    const s = rich();
    expect(S.teachLesson(s).ok).toBe(false);
    put(s, 'horse_stable', 'pasture');
    S.advance(s, ((9 * 60 - s.time.minute) + 1440) % 1440);
    const m = s.money;
    for (let k = 0; k < 3; k++) expect(S.teachLesson(s).ok).toBe(true);
    expect(S.teachLesson(s).ok).toBe(false);
    expect(s.money).toBeGreaterThan(m);
    S.advance(s, 1440);
    expect(S.teachLesson(s).ok).toBe(true);
    S.advance(s, ((21 * 60 - s.time.minute) + 1440) % 1440);
    expect(S.teachLesson(s).msg).toMatch(/8 AM/);
  });
  it('one cookout a day at the outdoor kitchen', () => {
    const s = rich();
    expect(S.hostCookout(s).ok).toBe(false);
    put(s, 'outdoor_kitchen');
    s.inventory.venison = 10;
    expect(S.hostCookout(s).ok).toBe(true);
    expect(s.inventory.venison).toBe(6);
    expect(S.hostCookout(s).ok).toBe(false);
  });
});

describe('town', () => {
  it('general store: hay, bait for today, fertilizer for the next 10 harvests', () => {
    const s = rich();
    S.buyFromStore(s, 'hay', 5);
    expect(s.inventory.hay).toBe(5);
    expect(S.buyFromStore(s, 'bait').ok).toBe(true);
    expect(S.buyFromStore(s, 'bait').ok).toBe(false);
    const c = S.homeToWorld(0, 0), i = S.idx(s, c.x, c.y);
    S.fieldAction(s, i, 'till'); S.fieldAction(s, i, 'plant', 'corn');
    s.tiles[i].f!.growth = 1;
    const plain = S.harvestYield(s, i);
    S.buyFromStore(s, 'fertilizer');
    expect(s.flags.fert).toBe(10);
    expect(S.harvestYield(s, i)).toBeGreaterThan(plain);
    S.harvest(s, i);
    expect(s.flags.fert).toBe(9);
  });
  it('restaurant: same orders all day, pays over market, takes only what it ordered', () => {
    const s = rich();
    const a = S.chefOrders(s), b = S.chefOrders(s);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
    const o = a[0];
    s.inventory[o.item] = 500;
    const r = S.sellToChef(s, o.item);
    expect(r.ok).toBe(true);
    expect(s.inventory[o.item]).toBe(500 - o.want);
    expect(o.price).toBeGreaterThan(S.marketPrice(s, o.item));
    expect(S.sellToChef(s, o.item).ok).toBe(false);
    S.advance(s, 1440);
    expect(S.chefOrders(s).every((q) => q.left === q.want)).toBe(true);
  });
  it('post office: one subsidy check a season, and mail orders', () => {
    const s = rich();
    const m = s.money;
    expect(S.cashSubsidy(s).ok).toBe(true);
    expect(s.money).toBe(m + S.subsidyAmount(s));
    expect(S.cashSubsidy(s).ok).toBe(false);
    S.advance(s, 1440 * S.DAYS_PER_SEASON);
    expect(S.cashSubsidy(s).ok).toBe(true);
    s.inventory.honey = 5;
    expect(S.mailOrder(s, 'honey').ok).toBe(true);
    expect(s.inventory.honey).toBe(0);
  });
  it('insurance pays out when a storm hits insured crops', () => {
    const s = S.newGame(5); s.money = 1e6;
    const c = S.homeToWorld(0, 0), i = S.idx(s, c.x, c.y);
    S.fieldAction(s, i, 'till', undefined, true); S.fieldAction(s, i, 'plant', 'corn', true);
    expect(S.buyInsurance(s).ok).toBe(true);
    expect(S.buyInsurance(s).ok).toBe(false);
    let paid = 0;
    for (let d = 0; d < 400 && !paid; d++) {
      for (const t of s.tiles) if (t.f?.crop) t.f.growth = Math.min(t.f.growth, 0.5);
      if (!S.isInsured(s)) S.buyInsurance(s);
      S.advance(s, 1440);
      paid = s.ledger.reduce((n, l) => n + (l.income['Insurance claims'] ?? 0), 0);
    }
    expect(paid).toBeGreaterThan(0);
  });
});

describe('photo album storage', () => {
  it('keeps photos out of the farm save, caps the album, and clears it with the slot', async () => {
    const { MemoryBackend, SaveManager, MAX_PHOTOS } = await import('../../src/save/saves');
    const mem = new MemoryBackend(), sm = new SaveManager(mem);
    const s = S.newGame(3);
    await sm.save(0, s);
    for (let k = 0; k < MAX_PHOTOS + 3; k++) await sm.addPhoto(0, `data:image/jpeg;base64,${k}`, `shot ${k}`);
    const list = await sm.photos(0);
    expect(list.length).toBe(MAX_PHOTOS);
    expect(list[0].caption).toBe(`shot ${MAX_PHOTOS + 2}`); // newest first
    expect(await sm.photo(0, 1)).toBeUndefined(); // oldest dropped
    expect([...mem.data.keys()].filter((k) => k.includes('/photo/')).length).toBe(MAX_PHOTOS);
    expect((await sm.load(0))!.state).toEqual(s); // the save itself is untouched
    await sm.deletePhoto(0, list[0].id);
    expect((await sm.photos(0)).length).toBe(MAX_PHOTOS - 1);
    await sm.remove(0);
    expect([...mem.data.keys()].filter((k) => k.startsWith('slot0/')).length).toBe(0);
  });
});
