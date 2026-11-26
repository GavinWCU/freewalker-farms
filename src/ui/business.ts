import * as sim from '../sim';
import type { SimEvent } from '../sim';
import { ITEM, ITEMS } from '../sim/content/items';
import { btn, h, modal, money } from './dom';
import type { Game } from './game';
import { bubbleSources, buildingSections, toolbarItems } from './registry';

// ── Farm Stand ──────────────────────────────────────────────────────────────
export function openStand(g: Game) {
  const s = g.s;
  const b = sim.standBuilding(s);
  if (!b) return;
  const body = h('div');
  const render = () => {
    body.innerHTML = '';
    const last = s.stand.last;
    body.append(h('p.muted', {}, `Shelves: ${sim.SHELVES[b.level]} kinds × ${sim.SHELF_UNITS[b.level]} each · about ${sim.customersPerHour(s).toFixed(1)} customers/hour, 8 AM–7 PM · higher prices mean fewer sales`));
    if (last) {
      const soldList = Object.entries(last.sold).map(([k, n]) => `${ITEM[k].icon} ${n}`).join('  ') || 'nothing';
      body.append(h('div.card', { 'data-testid': 'stand-summary', style: 'cursor:default' },
        h('b', {}, `Yesterday (${sim.dateLabel(last.day)})`),
        h('span', {}, `${last.customers} customers · revenue ${money(last.revenue)}`),
        h('span', {}, `Sold: ${soldList}`),
        last.ranOut.length ? h('span', { style: 'color:#a83a33' }, `Ran out of: ${last.ranOut.map((k) => ITEM[k].name).join(', ')}`) : ''));
    }
    const t = s.stand.today;
    body.append(h('p', {}, `Today so far: ${t.customers} customers · ${money(t.revenue)}`));
    const tb = h('table', {}, h('tr', {}, h('th', {}, 'Item'), h('th.num', {}, 'Barn'), h('th.num', {}, 'On shelf'), h('th', {}, 'Price'), h('th', {}, '')));
    for (const it of ITEMS) {
      const have = s.inventory[it.id] ?? 0, slot = s.stand.stock[it.id];
      if (!have && !slot?.qty) continue;
      const price = h('input', { type: 'number', min: '0.5', step: '0.5', value: String(slot?.price ?? it.retail), 'data-testid': `price-${it.id}` }) as HTMLInputElement;
      price.onchange = () => { g.act(sim.setPrice(s, it.id, Number(price.value))); render(); };
      tb.append(h('tr', {}, h('td', {}, `${it.icon} ${it.name}`), h('td.num', {}, have), h('td.num', {}, slot?.qty ?? 0),
        h('td', {}, price, h('div.muted', {}, `fair ${money(it.retail)}`)),
        h('td', { style: 'white-space:nowrap;text-align:right' },
          btn('+10', () => { g.act(sim.stock(s, it.id, 10)); render(); }, 'small grey'), ' ',
          btn('Stock all', () => { g.act(sim.stock(s, it.id, have)); render(); }, 'small', { 'data-testid': `stock-${it.id}` }), ' ',
          slot?.qty ? btn('↩', () => { g.act(sim.unstock(s, it.id)); render(); }, 'small grey', { 'aria-label': 'Back to barn' }) : '')));
    }
    if (tb.children.length === 1) body.append(h('p', {}, 'Nothing to sell yet. Collect eggs, produce, apples, honey and more, then stock them here.'));
    else body.append(tb);
  };
  modal(g.ui, sim.standName(s), [body], () => { g.s.flags.standSeen = s.time.day; g.dirty = true; }, 'stand-dialog');
  render();
}

buildingSections.push((g, b) => {
  if (b.type === 'farm_stand') return [h('div.row', {}, btn('🧺 Manage stand', () => openStand(g), 'gold', { 'data-testid': 'manage-stand' }))];
  if (b.type === 'cattle_corral') {
    const s = g.s, grown = s.cattle.filter((c) => c.age >= sim.CATTLE_MATURE).length;
    return [
      h('p', {}, `🐄 ${s.cattle.length} head (${grown} ready to sell) · room for ${sim.cattleCapacity(s)} on your pasture · ${money(sim.cattlePrice(s))}/head today`),
      h('div.row', {},
        btn(`Buy a calf ${money(sim.CALF_PRICE)}`, () => g.act(sim.buyCalves(s, 1)), 'small', { 'data-testid': 'buy-calf' }),
        btn('Buy 5', () => g.act(sim.buyCalves(s, 5)), 'small grey'),
        btn(`Sell grown cattle`, () => { const ev: SimEvent[] = []; g.act(sim.sellCattle(s, ev), ev); }, grown ? 'small gold' : 'small grey')),
    ];
  }
  return [];
});

bubbleSources.push((g, add) => {
  const b = sim.standBuilding(g.s);
  if (b && g.s.stand.last && (g.s.flags.standSeen ?? 0) < g.s.time.day) add(b.x, b.y, '💵', () => openStand(g), 'bubble-stand', 0.8);
  const corral = g.s.buildings.find((q) => q.type === 'cattle_corral');
  if (corral && g.s.cattle.some((c) => c.age >= sim.CATTLE_MATURE)) add(corral.x, corral.y, '🐄', () => g.openTile({ x: corral.x, y: corral.y }), 'bubble-cattle', 0.6);
});

// ── Ledger ──────────────────────────────────────────────────────────────────
export function openLedger(g: Game) {
  const s = g.s;
  let k = s.ledger.length - 1;
  const body = h('div');
  const render = () => {
    body.innerHTML = '';
    const tabs = h('div.tabs');
    s.ledger.slice(-6).forEach((l) => { const idx = s.ledger.indexOf(l); tabs.append(btn(l.key, () => { k = idx; render(); }, `small${idx === k ? ' on' : ' grey'}`)); });
    const l = s.ledger[k];
    const inc = Object.entries(l.income).sort((a, b) => b[1] - a[1]);
    const exp = Object.entries(l.expense).sort((a, b) => b[1] - a[1]);
    const sum = (e: [string, number][]) => e.reduce((n, [, v]) => n + v, 0);
    const table = (rows: [string, number][], title: string) => h('table', {}, h('tr', {}, h('th', {}, title), h('th.num', {}, '')), ...rows.map(([n, v]) => h('tr', {}, h('td', {}, n), h('td.num', {}, money(v)))), h('tr', {}, h('td', {}, h('b', {}, 'Total')), h('td.num', {}, h('b', {}, money(sum(rows))))));
    const net = sum(inc) - sum(exp);
    body.append(tabs,
      h('p', { style: 'font-size:18px;margin-top:10px' }, 'Net this season: ', h('b', { style: `color:${net >= 0 ? '#2f7a28' : '#a83a33'}` }, `${net < 0 ? '-' : ''}${money(Math.abs(net))}`)),
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px' }, table(inc, 'Income by business'), table(exp, 'Expenses')));
    // Workers
    body.append(h('h3', { style: 'margin-top:14px' }, '👷 Workers'));
    for (const [kind, w] of Object.entries(sim.WORKERS) as [keyof typeof sim.WORKERS, (typeof sim.WORKERS)['farmhand']][]) {
      body.append(h('div.row', {}, h('span', { style: 'flex:1;min-width:200px' }, h('b', {}, `${w.name} × ${s.workers[kind]}`), h('div.muted', {}, `${money(w.wage)}/day · ${w.desc}`)),
        btn('Hire', () => { g.act(sim.hire(s, kind)); render(); }, 'small', { 'data-testid': `hire-${kind}` }),
        s.workers[kind] ? btn('Let go', () => { g.act(sim.fire(s, kind)); render(); }, 'small grey') : ''));
    }
  };
  modal(g.ui, '📒 Ledger', [body], undefined, 'ledger');
  render();
}

toolbarItems.push((g) => h('button.btn.grey', { onclick: () => openLedger(g), 'data-testid': 'btn-ledger', style: 'background:#8e6bbf;box-shadow:inset 0 -5px 0 #6a4b95' }, h('b', {}, '📒'), 'Ledger'));
