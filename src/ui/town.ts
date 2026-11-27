import * as sim from '../sim';
import { ITEM } from '../sim/content/items';
import { btn, h, modal, money } from './dom';
import type { Game } from './game';
import { toolbarItems } from './registry';

// The Town of Stillwater: drive in, pop into the shops, drive home.
const SHOPS = [
  { id: 'store', name: 'General Store', icon: '🛒', color: '#c0392b', open: openStore },
  { id: 'diner', name: 'Stillwater Diner', icon: '🍽️', color: '#2f7a8a', open: openDiner },
  { id: 'bank', name: 'First Prairie Bank', icon: '🏦', color: '#5b6b7a', open: openBank },
  { id: 'post', name: 'Post Office', icon: '📮', color: '#2b5fa8', open: openPost },
  { id: 'insurance', name: 'Hartley Insurance', icon: '🛡️', color: '#7a5a2b', open: openInsurance },
];

export function goToTown(g: Game) {
  g.closeSheet();
  g.fastForward(sim.TRAVEL_MINUTES);
  g.toast(`🚚 Drove into town (${sim.TRAVEL_MINUTES} min)`);
  const street = h('div.town-street', { 'data-testid': 'town-street' });
  const render = () => {
    street.innerHTML = '';
    for (const shop of SHOPS) {
      const note = shop.id === 'post' && sim.subsidyReady(g.s) ? h('span.town-badge', {}, '1') : '';
      street.append(h('button.town-shop', { style: `--shop:${shop.color}`, 'data-testid': `shop-${shop.id}`, onclick: () => shop.open(g, render) },
        h('span.town-awning'), h('span.town-icon', {}, shop.icon), h('b', {}, shop.name), note));
    }
  };
  render();
  const m = modal(g.ui, '🏘️ Town of Stillwater', [
    h('p.muted', {}, `${sim.dateLabel(g.s.time.day)} · ${sim.clock(g.s.time.minute)} · tap a shop to go in`),
    street,
    h('div.row', {}, btn('🚚 Drive home', () => m.close(), 'blue', { 'data-testid': 'leave-town' })),
  ], () => { g.fastForward(sim.TRAVEL_MINUTES); g.toast('🏡 Back on the farm'); }, 'town');
  m.box.classList.add('town');
}

/** A shop window on top of the street. `body` re-renders after every purchase. */
function shopModal(g: Game, title: string, testid: string, fill: (body: HTMLElement, rerender: () => void) => void, after: () => void) {
  const body = h('div');
  const render = () => { body.innerHTML = ''; fill(body, render); after(); };
  modal(g.ui, title, [body], undefined, testid);
  render();
}

function openStore(g: Game, after: () => void) {
  shopModal(g, '🛒 General Store', 'store', (body, render) => {
    const s = g.s;
    body.append(h('p.muted', {}, `"Morning! What can I get you?" · You have ${s.inventory.hay ?? 0} hay bales${s.flags.fert ? ` · fertilizer for ${s.flags.fert} more harvests` : ''}${s.flags.bait === s.time.day ? ' · bait for today' : ''}`));
    for (const it of sim.STORE) {
      body.append(h('div.row', {}, h('span', { style: 'flex:1;min-width:200px' }, h('b', {}, `${it.icon} ${it.name} · ${money(it.price)}`), h('div.muted', {}, it.desc)),
        btn('Buy', () => { g.act(sim.buyFromStore(s, it.id, 1)); render(); }, 'small gold', { 'data-testid': `store-${it.id}` }),
        it.id === 'hay' ? btn('Buy 10', () => { g.act(sim.buyFromStore(s, it.id, 10)); render(); }, 'small') : ''));
    }
  }, after);
}

function openDiner(g: Game, after: () => void) {
  shopModal(g, '🍽️ Stillwater Diner', 'diner', (body, render) => {
    const s = g.s;
    body.append(h('p.muted', {}, `The chef buys fresh from local farms and pays ${Math.round((sim.CHEF_PREMIUM - 1) * 100)}% over a fair stand price. Today's order:`));
    const tb = h('table', {}, h('tr', {}, h('th', {}, 'Wanted'), h('th.num', {}, 'Still needs'), h('th.num', {}, 'You have'), h('th.num', {}, 'Pays'), h('th', {}, '')));
    for (const o of sim.chefOrders(s)) {
      const it = ITEM[o.item], have = s.inventory[o.item] ?? 0;
      tb.append(h('tr', {}, h('td', {}, `${it.icon} ${it.name}`), h('td.num', {}, `${o.left} ${it.unit}`), h('td.num', {}, have), h('td.num', {}, `${money(o.price)}/${it.unit}`),
        h('td', { style: 'text-align:right' }, btn(o.left ? 'Sell' : '✓ Done', () => { g.act(sim.sellToChef(s, o.item)); render(); }, o.left && have ? 'small gold' : 'small grey', { 'data-testid': `chef-${o.item}` }))));
    }
    body.append(tb, h('p.muted', {}, 'New orders every morning.'));
  }, after);
}

function openBank(g: Game, after: () => void) {
  shopModal(g, '🏦 First Prairie Bank', 'bank', (body, render) => {
    const s = g.s, L = s.loan;
    const amt = h('input', { type: 'number', min: '0', step: '1000', value: '10000', 'data-testid': 'bank-amount' }) as HTMLInputElement;
    body.append(
      h('p', {}, 'Cash on hand: ', h('b', {}, money(s.money)), ` · Land value: ${money(sim.landValue(s))}`),
      h('p', {}, L.principal > 0 ? `Farm loan: ${money(L.principal)} at ${(L.rate * 100).toFixed(1)}% · ${money(sim.monthlyInterest(s))} interest each month` : 'No farm loan. We lend against your land.'),
      L.missed ? h('p', { style: 'color:#a83a33' }, `⚠️ ${L.missed} missed payment${L.missed > 1 ? 's' : ''}: catch up before borrowing more.`) : '',
      h('p.muted', {}, `You can borrow up to ${money(sim.loanLimit(s))}.`),
      h('div.row', {}, amt,
        btn('Borrow', () => { g.act(sim.borrow(s, Number(amt.value))); render(); }, 'small blue', { 'data-testid': 'bank-borrow' }),
        btn('Repay', () => { g.act(sim.repay(s, Number(amt.value))); render(); }, 'small', { 'data-testid': 'bank-repay' }),
        L.principal > 0 ? btn('Repay all', () => { g.act(sim.repay(s, L.principal)); render(); }, 'small gold') : ''),
    );
  }, after);
}

function openPost(g: Game, after: () => void) {
  shopModal(g, '📮 Post Office', 'post', (body, render) => {
    const s = g.s;
    if (sim.subsidyReady(s)) {
      body.append(h('div.card', { style: 'cursor:default' }, h('b', {}, '✉️ You have mail: a farm subsidy check'), h('span', {}, `The county farm program pays ${money(sim.subsidyAmount(s))} this season for the land you farm.`),
        h('div.row', {}, btn('Open it and cash the check', () => { g.act(sim.cashSubsidy(s)); render(); }, 'gold', { 'data-testid': 'cash-subsidy' }))));
    } else body.append(h('p', {}, '📭 No mail today. A new subsidy check comes every season.'));
    body.append(h('h3', { style: 'margin-top:12px' }, '📦 Mail orders'), h('p.muted', {}, `Ship up to 20 at a time to customers at the full stand price, minus ${Math.round(sim.POSTAGE * 100)}% postage.`));
    for (const id of sim.MAIL_ITEMS) {
      const it = ITEM[id], have = s.inventory[id] ?? 0;
      body.append(h('div.row', {}, h('span', { style: 'flex:1' }, `${it.icon} ${it.name}: you have ${have}`),
        btn(`Ship ${Math.min(20, have)}`, () => { g.act(sim.mailOrder(s, id)); render(); }, have ? 'small gold' : 'small grey', { 'data-testid': `mail-${id}` })));
    }
  }, after);
}

function openInsurance(g: Game, after: () => void) {
  shopModal(g, '🛡️ Hartley Insurance', 'insurance', (body, render) => {
    const s = g.s, covered = sim.isInsured(s);
    body.append(
      h('p', {}, '"Weather\'s a gamble. Your farm shouldn\'t be."'),
      h('p', {}, `Crop insurance covers this season: ${money(sim.STORM_CLAIM)} for every acre a storm knocks back, and ${money(sim.DROUGHT_CLAIM)} per planted acre when a drought sets in.`),
      h('p', {}, covered ? h('b', { style: 'color:#2f7a28' }, '✅ You are covered for the rest of this season.') : `Premium: ${money(sim.premium(s))} for ${sim.insuredAcres(s)} acres of cropland this season.`),
      covered ? '' : h('div.row', {}, btn(`Buy coverage ${money(sim.premium(s))}`, () => { g.act(sim.buyInsurance(s)); render(); }, 'gold', { 'data-testid': 'buy-insurance' })),
    );
  }, after);
}

toolbarItems.push((g) => h('button.btn', { onclick: () => goToTown(g), 'data-testid': 'btn-town', style: 'background:#d9822b;box-shadow:inset 0 -5px 0 #a85e17' }, h('b', {}, '🏘️'), 'Town'));
