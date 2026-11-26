import { addXp, MAX_LEVEL } from './levels';
import { hooks } from './sim';
import { log, spend, stat } from './state';
import { isGoldenHour, seasonOf, SEASONS } from './time';
import { basecampLevel, collect, hasBuilding, no, ok, type Result } from './build';
import { N4, acresOwned, idx, inBounds, landmarkTile, xy } from './world';
import type { GameState, SimEvent } from './types';

// ── milestones (ring the Bell Post) and achievements ────────────────────────
export interface Milestone { id: string; name: string; xp: number; major: boolean; test: (s: GameState) => boolean }
const has = (s: GameState, a: string) => s.achievements.includes(a);

export const MILESTONES: Milestone[] = [
  { id: 'first_build', name: 'Broke ground on Freewalker Basecamp', xp: 50, major: true, test: (s) => basecampLevel(s) >= 1 },
  { id: 'first_harvest', name: 'First harvest', xp: 50, major: true, test: (s) => (s.stats.harvested ?? 0) >= 1 },
  { id: 'basecamp_2', name: 'Basecamp: the cabin is up', xp: 150, major: true, test: (s) => basecampLevel(s) >= 2 },
  { id: 'farm_stand', name: 'Opened the Farm Stand', xp: 100, major: true, test: (s) => hasBuilding(s, 'farm_stand') },
  { id: 'first_land', name: 'Bought the first neighbor parcel', xp: 100, major: true, test: (s) => (s.stats.acresBought ?? 0) >= 1 },
  { id: 'first_lease', name: 'Signed the first lease', xp: 80, major: true, test: (s) => (s.stats.leasesOut ?? 0) + (s.stats.leasesIn ?? 0) >= 1 },
  { id: 'basecamp_3', name: 'Working Farm: the black barn stands', xp: 300, major: true, test: (s) => basecampLevel(s) >= 3 },
  { id: 'acres_100', name: '100 acres', xp: 200, major: true, test: (s) => acresOwned(s) >= 100 },
  { id: 'market', name: 'Freewalker Farm Market opens', xp: 400, major: true, test: (s) => s.buildings.some((b) => b.type === 'farm_stand' && b.level >= 3) },
  { id: 'acres_250', name: '250 acres', xp: 400, major: true, test: (s) => acresOwned(s) >= 250 },
  { id: 'basecamp_4', name: 'Freewalker Estate: the dream farmhouse', xp: 800, major: true, test: (s) => basecampLevel(s) >= 4 },
  { id: 'acres_500', name: '500 acres', xp: 800, major: true, test: (s) => acresOwned(s) >= 500 },
  { id: 'acres_1000', name: 'The 1,000-acre Freewalker empire', xp: 2000, major: true, test: (s) => acresOwned(s) >= 1000 },
  { id: 'level_20', name: 'Legacy Builder: level 20', xp: 500, major: true, test: (s) => s.level >= MAX_LEVEL },
  { id: 'money_100k', name: '$100,000 in the bank', xp: 300, major: true, test: (s) => s.money >= 100000 },
  { id: 'leonards_loop', name: "Leonard's Loop is complete", xp: 250, major: true, test: (s) => has(s, 'loop_1') },
  // smaller achievements (no bell)
  { id: 'sentinel_first', name: 'Sat beneath the Sentinel Tree', xp: 30, major: false, test: (s) => has(s, 'visit_sentinel') },
  { id: 'sentinel_seasons', name: 'The Sentinel Tree in all four seasons', xp: 200, major: false, test: (s) => [0, 1, 2, 3].every((k) => has(s, `sentinel_${k}`)) },
  { id: 'sentinel_golden', name: 'Golden Hour at the Sentinel Tree', xp: 120, major: false, test: (s) => has(s, 'sentinel_golden') },
  { id: 'ridge_view', name: 'The view from Buffalo Ridge', xp: 50, major: false, test: (s) => has(s, 'visit_ridge') },
  { id: 'golden_loop', name: 'Rode the Golden Hour Loop at sunset', xp: 150, major: false, test: (s) => has(s, 'golden_ride') },
  { id: 'fish_5', name: 'Five species on the record board', xp: 100, major: false, test: (s) => Object.keys(s.fishing.records).length >= 5 },
  { id: 'treasure_10', name: 'Ten finds dug up', xp: 150, major: false, test: (s) => (s.stats.treasures ?? 0) >= 10 },
  { id: 'kims_garden', name: "Kim's Garden is blooming", xp: 100, major: false, test: (s) => hasBuilding(s, 'kims_garden') },
  { id: 'workshop', name: "Gavin's Workshop opens its doors", xp: 150, major: false, test: (s) => hasBuilding(s, 'workshop') },
  { id: 'lab', name: "Paige's Engineering Lab is online", xp: 200, major: false, test: (s) => hasBuilding(s, 'lab') },
];
export const MILESTONE: Record<string, Milestone> = Object.fromEntries(MILESTONES.map((m) => [m.id, m]));

/** Awards any newly reached milestones. Major ones wait at the Bell Post. */
export function checkMilestones(s: GameState, ev: SimEvent[] = []) {
  for (const m of MILESTONES) {
    if (has(s, m.id) || !m.test(s)) continue;
    s.achievements.push(m.id);
    addXp(s, m.xp, ev);
    if (m.major) s.bell.push(m.id);
    log(s, `Milestone: ${m.name}.`);
    ev.push({ type: 'milestone', text: m.name });
  }
  return ev;
}
hooks.day.push((s, ev) => { checkMilestones(s, ev); });

export function ringBell(s: GameState, ev?: SimEvent[]): Result {
  if (!hasBuilding(s, 'bell_post')) return no('Build the Bell Post first');
  if (!s.bell.length) return no('Nothing to ring for yet — keep building!');
  const names = s.bell.map((id) => MILESTONE[id]?.name ?? id);
  addXp(s, 25 * s.bell.length, ev);
  stat(s, 'bellRung');
  s.bell = [];
  return ok(`🔔 Ding! ${names.join(' · ')}`);
}

// ── landmarks ───────────────────────────────────────────────────────────────
function award(s: GameState, id: string) { if (!has(s, id)) s.achievements.push(id); }

export function visitSentinel(s: GameState, ev: SimEvent[] = []): Result {
  const i = landmarkTile(s, 'sentinel');
  const { x, y } = xy(s, i);
  s.player.x = x + 0.5; s.player.y = y + 0.9;
  award(s, 'visit_sentinel');
  award(s, `sentinel_${seasonOf(s.time.day)}`);
  const golden = isGoldenHour(s.time.minute);
  if (golden) award(s, 'sentinel_golden');
  const seen = [0, 1, 2, 3].filter((k) => has(s, `sentinel_${k}`)).map((k) => SEASONS[k]);
  checkMilestones(s, ev);
  return ok(golden ? 'The Sentinel Tree glows in the Golden Hour light. ✨' : `You rest under the Sentinel Tree. Seasons seen here: ${seen.join(', ')}.`);
}

export function visitRidge(s: GameState, ev: SimEvent[] = []): Result {
  const i = landmarkTile(s, 'ridge');
  const { x, y } = xy(s, i);
  s.player.x = x + 0.5; s.player.y = y + 0.5;
  award(s, 'visit_ridge');
  let bonus = '';
  if ((s.flags.ridgeDay ?? 0) < s.time.day) { s.flags.ridgeDay = s.time.day; addXp(s, 20, ev); bonus = ' (+20 XP)'; }
  checkMilestones(s, ev);
  return ok(`From Buffalo Ridge you can see all ${acresOwned(s)} acres${bonus}.`);
}

/** Closed loops of trail tiles. The first is Leonard's Loop, the second the Golden Hour Loop. */
export function trailLoops(s: GameState): number[][] {
  const seen = new Set<number>(), loops: number[][] = [];
  s.tiles.forEach((t, i) => {
    if (t.path !== 'trail' || seen.has(i)) return;
    const comp: number[] = [], q = [i];
    seen.add(i);
    let edges = 0;
    while (q.length) {
      const c = q.pop()!;
      comp.push(c);
      const { x, y } = xy(s, c);
      for (const [dx, dy] of N4) {
        if (!inBounds(s, x + dx, y + dy)) continue;
        const n = idx(s, x + dx, y + dy);
        if (s.tiles[n].path !== 'trail') continue;
        edges++;
        if (!seen.has(n)) { seen.add(n); q.push(n); }
      }
    }
    if (edges / 2 >= comp.length && comp.length >= 4) loops.push(comp.sort((a, b) => a - b));
  });
  return loops;
}

/** Names new trail loops. Called after drawing trails. */
export function checkLoops(s: GameState, ev: SimEvent[] = []) {
  const loops = trailLoops(s);
  if (loops.length >= 1 && !has(s, 'loop_1')) {
    award(s, 'loop_1'); s.flags.leonardTile = loops[0][0];
    ev.push({ type: 'toast', text: "🥾 Your trail closes a loop. It's named Leonard's Loop, after Grandpa." });
  }
  if (loops.length >= 2 && !has(s, 'loop_2')) {
    award(s, 'loop_2'); s.flags.goldenTile = loops.find((l) => !l.includes(s.flags.leonardTile))?.[0] ?? loops[1][0];
    ev.push({ type: 'toast', text: '🌅 A second loop! This one is the Golden Hour Loop — ride it at sunset.' });
  }
  checkMilestones(s, ev);
  return ev;
}

// Riding a trail during Golden Hour.
hooks.hour.push((s, ev) => {
  if (!isGoldenHour(s.time.minute) || s.flags.trailToday !== s.time.day || !has(s, 'loop_1')) return;
  if ((s.flags.goldenDay ?? 0) >= s.time.day) return;
  s.flags.goldenDay = s.time.day;
  award(s, 'golden_ride');
  addXp(s, 30, ev);
  ev.push({ type: 'toast', text: '🌅 Golden Hour on the trail. Worth every minute. (+30 XP)' });
  checkMilestones(s, ev);
});
// An evening by the fire pit.
hooks.hour.push((s, ev) => {
  if (s.time.minute !== 20 * 60 || !hasBuilding(s, 'fire_pit')) return;
  addXp(s, 10, ev);
});

// ── Gavin's Workshop & Paige's Engineering Lab ──────────────────────────────
export const UPGRADES: { id: string; name: string; cost: number; needs: 'workshop' | 'lab'; desc: string }[] = [
  { id: 'sprinklers', name: 'Smart sprinklers', cost: 8000, needs: 'workshop', desc: 'Every field you farm is watered automatically.' },
  { id: 'auto_collect', name: 'Auto-collector', cost: 6000, needs: 'workshop', desc: 'Buildings send their output to the barn every evening.' },
  { id: 'stand_sign', name: 'Digital road sign', cost: 5000, needs: 'workshop', desc: '+25% customers at the Farm Stand.' },
  { id: 'solar_grid', name: 'Battery bank', cost: 7000, needs: 'workshop', desc: 'Solar panels earn 50% more.' },
  { id: 'big_tractor', name: 'Big tractor', cost: 20000, needs: 'lab', desc: 'Work 40 acres at a time instead of 12.' },
  { id: 'combine', name: 'Combine harvester', cost: 15000, needs: 'lab', desc: '+15% yield on every harvest.' },
  { id: 'drone', name: 'Crop-scouting drone', cost: 9000, needs: 'lab', desc: 'Storms only knock back half as much.' },
];
export function buyUpgrade(s: GameState, id: string): Result {
  const u = UPGRADES.find((q) => q.id === id);
  if (!u) return no('Unknown upgrade');
  if (s.upgrades.includes(id)) return no('Already installed');
  if (!hasBuilding(s, u.needs)) return no(u.needs === 'lab' ? "Needs Paige's Engineering Lab" : "Needs Gavin's Workshop");
  if (!spend(s, u.cost, 'Upgrades')) return no('Not enough money');
  s.upgrades.push(id);
  addXp(s, u.cost / 50);
  return ok(`Installed: ${u.name}`);
}
hooks.hour.push((s, ev) => {
  if (s.time.minute !== 19 * 60 || !s.upgrades.includes('auto_collect')) return;
  for (const b of s.buildings) if (b.ready > 0) collect(s, b.id, ev);
});
