import * as sim from '../sim';
import type { SimEvent } from '../sim';
import { askYes, btn, h, modal, money } from './dom';
import type { Game } from './game';
import { bubbleSources, tileSections, toolbarItems } from './registry';

const dateOf = (day: number) => sim.dateLabel(day);

// ── tile panel: buy, rent, lease ────────────────────────────────────────────
tileSections.push((g, i) => {
  const s = g.s, t = s.tiles[i];
  if (!sim.isLand(t)) return [];
  const out: Node[] = [];
  const lease = t.lease ? s.leases.find((l) => l.id === t.lease) : undefined;
  if (lease) {
    const who = lease.dir === 'out' ? `${sim.TENANTS[lease.tenant]?.icon ?? ''} Leased to ${lease.name} (${sim.TENANTS[lease.tenant]?.name ?? 'tenant'})` : `📜 You rent this from ${lease.name}`;
    out.push(h('p', { 'data-testid': 'lease-info' }, who), h('p.muted', {}, `${lease.tiles.length} acres · ${money(lease.ratePerAcre)}/acre/season · ends ${dateOf(lease.endDay)}`));
    out.push(h('div.row', {}, btn(`Break lease (${money(sim.breakPenalty(s, lease))} penalty)`, async () => { if (await askYes('End this lease early and pay the penalty?', 'End lease')) g.act(sim.breakLease(s, lease.id)); }, 'small red', { 'data-testid': 'break-lease' })));
  }
  if (!t.owned && !lease) {
    if (sim.isBuyable(s, i)) {
      const a = sim.auctionFor(s, i);
      out.push(h('p', {}, `🪧 For sale: ${money(sim.landPrice(s, i))}${sim.isLakefront(s, i) ? ' · lakefront' : ''}`));
      if (a) out.push(h('p.muted', {}, `🔨 ${a.label} (${a.factor < 1 ? `${Math.round((1 - a.factor) * 100)}% off` : `${Math.round((a.factor - 1) * 100)}% over market`})`));
      const row = h('div.row', {}, btn(`Buy this acre ${money(sim.landPrice(s, i))}`, () => { const ev: SimEvent[] = []; g.act(sim.buyParcel(s, i, ev), ev); }, 'gold', { 'data-testid': 'buy-parcel' }));
      out.push(row);
      const block = sim.leaseInBlock(s, i, g.whole);
      if (block.length) {
        const rate = sim.rentInRate(s, i);
        out.push(h('p.muted', {}, `Or rent ${block.length > 1 ? `this block of ${block.length} acres` : 'it'} from the neighbor for ${money(rate)}/acre/season:`));
        out.push(h('div.row', {}, ...[1, 3, 5].map((n) => btn(`${n} season${n > 1 ? 's' : ''}`, () => g.act(sim.leaseIn(s, sim.leaseInBlock(s, i, g.whole), n)), 'small blue', { 'data-testid': `lease-in-${n}` }))));
        out.push(wholeToggle(g, 'Rent the whole connected block (up to 6 acres)'));
      }
    } else if (t.t !== 'road') out.push(h('p.muted', {}, 'Not for sale yet — buy the land next to it first.'));
  }
  if (t.owned && !lease && !t.b && !t.f?.crop && !t.landmark) {
    out.push(h('div.row', {}, btn('📜 Lease out…', () => openLeaseDialog(g, i), 'small grey', { 'data-testid': 'lease-out' })));
  }
  if (t.owned && !t.home) {
    const why = sim.cantSell(s, i), price = sim.salePrice(s, i);
    out.push(h('div.row', {}, btn(`💲 Sell this acre ${money(price)}`, async () => {
      const crop = t.f?.crop ? ' The crop growing on it goes with the land.' : '';
      if (await askYes(`Sell this acre for ${money(price)}? That's market value minus 10% closing costs.${crop}`, 'Sell')) { const ev: SimEvent[] = []; g.act(sim.sellParcel(s, i, ev), ev); }
    }, why ? 'small grey' : 'small', { 'data-testid': 'sell-parcel', disabled: why ? true : undefined, title: why ?? '' })));
    if (why) out.push(h('p.muted', {}, `Can't sell: ${why.toLowerCase()}.`));
  }
  return out;
});

function wholeToggle(g: Game, label: string) {
  const box = h('input', { type: 'checkbox', ...(g.whole ? { checked: true } : {}), style: 'width:24px;height:24px' }) as HTMLInputElement;
  box.onchange = () => { g.whole = box.checked; if (g.selected) g.openTile(g.selected, true); };
  return h('label.row', { style: 'gap:6px' }, box, label);
}

export function openLeaseDialog(g: Game, i: number) {
  const s = g.s;
  let whole = true;
  const body = h('div');
  const render = () => {
    const tiles = sim.leaseBlock(s, i, whole);
    const offers = sim.leaseOffers(s, tiles);
    body.innerHTML = '';
    const box = h('input', { type: 'checkbox', ...(whole ? { checked: true } : {}), style: 'width:24px;height:24px' }) as HTMLInputElement;
    box.onchange = () => { whole = box.checked; render(); };
    body.append(
      h('p', {}, `${tiles.length} acre${tiles.length > 1 ? 's' : ''} of ${s.tiles[i].t}. Leased land pays rent at the start of every season. You can't build on it or farm it until the lease ends.`),
      h('label.row', { style: 'gap:6px' }, box, 'Lease the whole connected block of open land'),
    );
    const grid = h('div.grid');
    offers.forEach((o, k) => {
      const d = sim.TENANTS[o.tenant];
      grid.append(h('div.card', { 'data-testid': `offer-${k}` },
        h('b', {}, `${d.icon} ${o.name}`), h('small', {}, d.name),
        h('span.price', {}, `${money(o.ratePerAcre)}/acre/season`),
        h('small', {}, `${o.seasons} season${o.seasons > 1 ? 's' : ''} · ${money(o.ratePerAcre * tiles.length)} per season`),
        btn('Accept', () => { if (g.act(sim.leaseOut(s, tiles, o))) m.close(); }, 'small', { 'data-testid': `accept-offer-${k}` })));
    });
    body.append(grid);
  };
  const m = modal(g.ui, 'Lease out land', [body], undefined, 'lease-dialog');
  render();
}

// ── Land & finance overview ─────────────────────────────────────────────────
export function openLand(g: Game) {
  const s = g.s;
  const body = h('div');
  const render = () => {
    body.innerHTML = '';
    const acres = sim.acresOwned(s);
    body.append(
      h('p', { style: 'font-size:18px' }, h('b', {}, `${acres.toLocaleString()} acres`), ` of the ${sim.GOAL_ACRES.toLocaleString()}-acre Freewalker empire`),
      h('div.xpbar', { style: 'width:100%;height:16px' }, h('i', { style: `width:${Math.min(100, (acres / sim.GOAL_ACRES) * 100)}%;background:var(--green)` })),
      h('p.muted', {}, `Land value ${money(sim.landValue(s))} · leased out ${sim.acresLeasedOut(s)} acres · renting ${sim.acresLeasedIn(s)} acres · tap any parcel with a 🪧 sign to buy it`),
    );
    const a = s.auction && s.auction.endDay > s.time.day ? s.auction : null;
    if (a) {
      const total = a.tiles.reduce((n, i) => n + sim.landPrice(s, i), 0);
      body.append(h('h3', { style: 'margin-top:12px' }, '🔨 Land auction'), h('p', {}, `${a.label}: ${a.tiles.length} acres for ${money(total)} — ends ${dateOf(a.endDay)}`),
        h('div.row', {}, btn('Buy the whole block', () => { const ev: SimEvent[] = []; g.act(sim.buyAuction(s, ev), ev); render(); }, 'gold', { 'data-testid': 'buy-auction' }),
          btn('Show me', () => { const p = sim.xy(s, a.tiles[0]); m.close(); g.view.focus(p.x + 0.5, p.y + 0.5); }, 'small blue')));
    }
    s.events.filter((e) => e.kind === 'renewal').forEach((e, k) => {
      body.append(h('p', {}, `📜 ${e.data!.name} wants to renew at ${money(Number(e.data!.rate))}/acre/season (until ${dateOf(e.until)})`),
        btn('Accept renewal', () => { g.act(sim.acceptRenewal(s, k)); render(); }, 'small'));
    });
    if (s.leases.length) {
      const tb = h('table', {}, h('tr', {}, h('th', {}, 'Lease'), h('th.num', {}, 'Acres'), h('th.num', {}, '$/acre/season'), h('th', {}, 'Ends'), h('th', {}, '')));
      for (const l of s.leases) tb.append(h('tr', {},
        h('td', {}, l.dir === 'out' ? `${sim.TENANTS[l.tenant]?.icon ?? ''} ${l.name}` : `📜 from ${l.name}`),
        h('td.num', {}, l.tiles.length), h('td.num', {}, money(l.ratePerAcre)), h('td', {}, dateOf(l.endDay)),
        h('td', {}, btn('Show', () => { const p = sim.xy(s, l.tiles[0]); m.close(); g.view.focus(p.x + 0.5, p.y + 0.5); }, 'small grey'))));
      body.append(h('h3', { style: 'margin-top:12px' }, 'Leases'), tb);
    }
    // Loans
    const L = s.loan;
    const amt = h('input', { type: 'number', min: '0', step: '1000', value: '10000', 'data-testid': 'loan-amount' }) as HTMLInputElement;
    body.append(
      h('h3', { style: 'margin-top:12px' }, '🏦 Farm loan'),
      h('p', {}, L.principal > 0 ? `You owe ${money(L.principal)} at ${(L.rate * 100).toFixed(1)}% · interest ${money(sim.monthlyInterest(s))} due each month` : 'No loan. The county bank will lend against your land.'),
      L.missed ? h('p', { style: 'color:#a83a33' }, `⚠️ ${L.missed} missed payment${L.missed > 1 ? 's' : ''} — late fees added, no new loans until caught up.`) : '',
      h('p.muted', {}, `You can borrow up to ${money(sim.loanLimit(s))}.`),
      h('div.row', {}, amt,
        btn('Borrow', () => { g.act(sim.borrow(s, Number(amt.value))); render(); }, 'small blue', { 'data-testid': 'borrow' }),
        btn('Repay', () => { g.act(sim.repay(s, Number(amt.value))); render(); }, 'small', { 'data-testid': 'repay' }),
        L.principal > 0 ? btn('Repay all', () => { g.act(sim.repay(s, L.principal)); render(); }, 'small gold') : ''),
    );
  };
  const m = modal(g.ui, 'Land & Finance', [body], undefined, 'land');
  render();
}

toolbarItems.push((g) => h('button.btn.blue', { onclick: () => openLand(g), 'data-testid': 'btn-land' }, h('b', {}, '🗺️'), 'Land'));

bubbleSources.push((g, add) => {
  const a = g.s.auction;
  if (a && a.endDay > g.s.time.day) { const p = sim.xy(g.s, a.tiles[0]); add(p.x, p.y, '🔨', () => openLand(g), 'bubble-auction', 0.6); }
});
