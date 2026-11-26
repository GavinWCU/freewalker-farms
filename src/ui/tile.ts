import * as sim from '../sim';
import type { SimEvent } from '../sim';
import { btn, h, money } from './dom';
import type { Game } from './game';
import { openBuildMenu } from './panels';
import { buildingSections, tileSections } from './registry';

const TERRAIN = { crop: 'Cropland', pasture: 'Pasture', timber: 'Timber', water: 'Lake Stillwater', road: 'County road' };

/** Contents of the bottom sheet for a tapped tile. */
export function tilePanel(g: Game, x: number, y: number): Node[] {
  const s = g.s, i = sim.idx(s, x, y), t = s.tiles[i];
  const out: Node[] = [];
  const b = sim.buildingAt(s, i);
  const extra = tileExtras(g, i);
  if (b) return [...buildingPanel(g, b), ...extra];

  const lm = t.landmark === 'ridge' ? 'Buffalo Ridge' : t.landmark === 'sentinel' ? 'Sentinel Tree' : t.landmark === 'entrance' ? 'Gravel Entrance' : '';
  out.push(h('h3', {}, lm || (sim.isLakefront(s, i) && t.t !== 'water' ? `Lakefront ${TERRAIN[t.t].toLowerCase()}` : TERRAIN[t.t])));
  const owner = t.owned ? (t.home ? 'Your land · the original 80' : 'Your land') : t.t === 'road' ? '' : 'Neighbor land';
  if (t.t !== 'water' && t.t !== 'road') out.push(h('p.muted', {}, `${owner} · 1 acre · soil ${Math.round(t.soil * 100)}%${t.path ? ` · ${t.path === 'gravel' ? 'gravel road' : 'trail'}` : ''}`));

  if (sim.farmable(s, i)) out.push(...fieldPanel(g, i));
  else if (t.owned && !t.lease && t.t === 'pasture' && !t.landmark) {
    out.push(h('div.row', {}, btn(`Break ground → cropland (${money(sim.BREAK_GROUND_COST)})`, () => g.act(sim.breakGround(s, i)), 'small grey')));
  }
  if (sim.usable(s, i) && !t.landmark?.match(/ridge|sentinel/)) {
    out.push(h('div.row', {}, btn('🔨 Build here', () => openBuildMenu(g), 'small blue', { 'data-testid': 'build-here' })));
  }
  out.push(...extra);
  return out;
}

const tileExtras = (g: Game, i: number) => tileSections.flatMap((f) => f(g, i));

function fieldPanel(g: Game, i: number): Node[] {
  const s = g.s, t = s.tiles[i], f = t.f;
  const out: Node[] = [];
  const cap = sim.tractorCapacity(s);
  const run = (a: sim.FieldAction, crop?: string) => { const ev: SimEvent[] = []; g.act(sim.fieldAction(s, i, a, crop, g.whole, ev), ev); };
  const st = sim.fieldState(t);
  if (f?.crop) {
    const c = sim.CROP[f.crop];
    const inSeason = c.seasons.includes(sim.seasonOf(s.time.day));
    out.push(h('p', {}, `${c.name}: ${f.growth >= 1 ? 'ready to harvest!' : `${Math.floor(f.growth * 100)}% grown`}${f.growth < 1 ? (f.watered ? ' · 💧 watered' : ' · needs water') : ''}${!inSeason && f.growth < 1 ? ' · out of season, not growing' : ''}`));
  } else out.push(h('p', {}, f?.tilled ? 'Tilled and ready to plant.' : 'Untilled cropland.'));

  const row = h('div.row');
  if (st === 'till') row.append(btn(`🚜 Till${sim.hasBuilding(s, 'tool_rack') ? '' : ` (${money(sim.TILL_COST)}/acre)`}`, () => run('till'), '', { 'data-testid': 'act-till' }));
  if (st === 'plant') {
    const season = sim.seasonOf(s.time.day);
    for (const c of sim.CROPS) {
      const ok = c.seasons.includes(season) && s.level >= c.level;
      row.append(btn(`🌱 ${c.name} ${money(c.seed)}`, () => run('plant', c.id), ok ? 'small' : 'small grey', { disabled: !ok || undefined, 'data-testid': `plant-${c.id}`, title: ok ? '' : s.level < c.level ? `Level ${c.level}` : 'Wrong season' }));
    }
  }
  if (st === 'water') row.append(btn('💧 Water', () => run('water'), 'blue', { 'data-testid': 'act-water' }));
  if (st === 'harvest') row.append(btn('🌾 Harvest', () => run('harvest'), 'gold', { 'data-testid': 'act-harvest' }));
  out.push(row);
  if (cap > 1) {
    const box = h('input', { type: 'checkbox', ...(g.whole ? { checked: true } : {}), style: 'width:24px;height:24px' }) as HTMLInputElement;
    box.onchange = () => { g.whole = box.checked; };
    out.push(h('label.row', { style: 'gap:6px' }, box, `Use the tractor on the whole field (up to ${cap} acres)`));
  }
  return out;
}

function buildingPanel(g: Game, b: sim.Building): Node[] {
  const s = g.s, def = sim.BUILDING[b.type];
  const name = b.type === 'farm_stand' && b.level >= 3 ? 'Freewalker Farm Market' : def.name;
  const out: Node[] = [h('h3', {}, name), h('p.muted', {}, `${def.desc}${sim.maxLevel(b.type) > 1 ? ` · Level ${b.level}` : ''}`)];
  if (def.produces) {
    const p = def.produces;
    out.push(h('p', {}, `Makes ${p.amount * b.level} ${p.item} every ${p.hours}h${p.seasons ? ' (in season)' : ''} · ready: ${b.ready}`));
  }
  if (def.income) out.push(h('p', {}, `Earns about ${money(def.income.perDay * b.level)}/day for ${def.income.business}`));
  const row = h('div.row');
  if (def.produces && b.ready > 0) row.append(btn(`✅ Collect ${b.ready}`, () => { const ev: SimEvent[] = []; g.act(sim.collect(s, b.id, ev), ev); }, 'gold', { 'data-testid': 'act-collect' }));
  const up = sim.upgradeInfo(s, b);
  if (up) row.append(btn(`⬆️ Upgrade ${money(up.cost)}${up.need ? ` · needs ${up.need}` : ''}`, () => g.act(sim.upgrade(s, b.id)), up.need ? 'small grey' : 'small', { 'data-testid': 'act-upgrade' }));
  row.append(btn('✋ Move', () => g.setMode({ kind: 'move', id: b.id }), 'small blue'));
  row.append(btn('🗑️ Remove', () => { if (confirm(`Remove ${name}? You get back a third of its cost.`)) g.act(sim.demolish(s, b.id)); }, 'small red'));
  out.push(row);
  out.push(...buildingSections.flatMap((f) => f(g, b)));
  return out;
}
