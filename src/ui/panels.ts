import * as sim from '../sim';
import { BASECAMP_NAMES } from '../sim/content/buildings';
import { btn, download, h, modal, money, pickFile } from './dom';
import { getQuality, QUALITIES, setQualitySetting, type Game } from './game';
import { menuSections } from './registry';

export function openBuildMenu(g: Game) {
  const s = g.s;
  let tier = Math.min(4, Math.max(1, sim.basecampLevel(s) + (sim.basecampLevel(s) >= 1 ? 1 : 0)));
  const body = h('div');
  const tabs = h('div.tabs');
  const render = () => {
    tabs.innerHTML = '';
    for (let t = 1; t <= 4; t++) tabs.append(btn(`${t} · ${BASECAMP_NAMES[t]}`, () => { tier = t; render(); }, `small${t === tier ? ' on' : ' grey'}`));
    body.innerHTML = '';
    const grid = h('div.grid');
    for (const d of sim.BUILDINGS.filter((b) => b.tier === tier)) {
      const locked = s.level < d.level;
      const owned = d.unique && sim.hasBuilding(s, d.id);
      const card = h('div.card' + (locked || owned ? '.locked' : ''), {
        'data-testid': `build-${d.id}`,
        onclick: () => { if (locked || owned) return; m.close(); g.setMode({ kind: 'place', type: d.id }); },
      }, h('b', {}, d.name), h('span.price', {}, money(d.cost)), h('small', {}, locked ? `🔒 Level ${d.level}` : owned ? '✓ Built' : d.desc));
      grid.append(card);
    }
    body.append(grid);
    if (tier === 1) {
      body.append(h('h3', { style: 'margin-top:14px' }, 'Roads, trails & fences'), h('p.muted', {}, 'Pick one, then drag across your land with one finger (two fingers pan).'));
      const row = h('div.row');
      for (const [tool, label] of [['gravel', '🪨 Gravel road $40'], ['trail', '🥾 ATV trail $10'], ['fence', '🪵 Fence $15'], ['remove', '🧹 Remove']] as const) {
        row.append(btn(label, () => { m.close(); g.setMode({ kind: 'draw', tool }); }, 'small blue', { 'data-testid': `draw-${tool}` }));
      }
      body.append(row);
    }
  };
  const m = modal(g.ui, 'Build', [tabs, body], undefined, 'build-menu');
  render();
}

export function openInventory(g: Game) {
  const s = g.s;
  const body = h('div');
  const render = () => {
    body.innerHTML = '';
    const items = sim.ITEMS.filter((it) => (s.inventory[it.id] ?? 0) > 0);
    if (!items.length) { body.append(h('p', {}, 'Your barn is empty. Harvest fields and collect from buildings to fill it.')); return; }
    const tb = h('table', {}, h('tr', {}, h('th', {}, 'Item'), h('th.num', {}, 'Have'), h('th.num', {}, 'Market price'), h('th', {}, '')));
    for (const it of items) {
      const n = s.inventory[it.id];
      const p = sim.marketPrice(s, it.id);
      const trend = p > it.price * 1.05 ? ' ▲' : p < it.price * 0.95 ? ' ▼' : '';
      tb.append(h('tr', {}, h('td', {}, `${it.icon} ${it.name}`), h('td.num', {}, `${n} ${it.unit}`), h('td.num', {}, `${money(p)}${trend}`),
        h('td', { style: 'text-align:right;white-space:nowrap' },
          btn('Sell 1', () => { g.act(sim.sell(s, it.id, 1)); render(); }, 'small grey'), ' ',
          btn(`Sell all ${money(p * n)}`, () => { g.act(sim.sell(s, it.id, n)); render(); }, 'small gold', { 'data-testid': `sell-${it.id}` }))));
    }
    body.append(h('p.muted', {}, 'Prices change every day at the county market.'), tb);
  };
  render();
  modal(g.ui, 'Barn & Market', [body], undefined, 'inventory');
}

export function openMenu(g: Game) {
  g.paused = true;
  const q = getQuality();
  const QNAME = { battery: '🔋 Graphics: Battery saver', high: '✨ Graphics: High quality', low: '🐢 Graphics: Lowest' };
  const body = [
    h('p.muted', {}, `${g.s.farmName} · slot ${g.slot + 1} · ${sim.dateLabel(g.s.time.day)}`),
    h('div.row', {},
      btn('▶ Resume', () => m.close(), '', { 'data-testid': 'resume' }),
      btn('💾 Save now', () => g.save(), 'blue'),
    ),
    h('div.row', {},
      btn('⬇️ Export save', () => download(`${g.s.farmName.replace(/\W+/g, '-')}-day${g.s.time.day}.json`, g.saves.exportJson(g.s)), 'small blue', { 'data-testid': 'export' }),
      btn('⬆️ Import save', async () => {
        const text = await pickFile();
        if (!text) return;
        try { const st = g.saves.importJson(text); await g.saves.save(g.slot, st); location.reload(); }
        catch (e) { g.toast(`Couldn't import: ${(e as Error).message}`, 'bad'); }
      }, 'small blue'),
    ),
    h('div.row', {},
      btn(QNAME[q], () => { const next = QUALITIES[(QUALITIES.indexOf(q) + 1) % QUALITIES.length]; setQualitySetting(next); g.view.setQuality(next); g.dirty = true; m.close(); g.toast(`${QNAME[next]}${next === 'high' ? ' — uses more battery' : ''}`); }, 'small grey', { 'data-testid': 'quality', title: 'Tap to switch: Battery saver → High quality → Lowest' }),
      btn('🏠 Switch farm / title', async () => { await g.save(); g.onExit(); }, 'small grey'),
    ),
    ...menuSections.flatMap((f) => f(g, () => m.close())),
  ];
  const m = modal(g.ui, 'Paused', body, () => { g.paused = false; }, 'menu');
}
