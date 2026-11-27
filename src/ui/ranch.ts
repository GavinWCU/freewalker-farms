import * as sim from '../sim';
import type { SimEvent } from '../sim';
import { btn, h, money } from './dom';
import type { Game } from './game';
import { bubbleSources, buildingSections, tileSections } from './registry';

const run = (g: Game, f: (ev: SimEvent[]) => sim.Result) => { const ev: SimEvent[] = []; g.act(f(ev), ev); };

buildingSections.push((g, b) => {
  const s = g.s;
  if (b.type === 'buffalo_paddock') {
    const grown = s.buffalo.filter((c) => c.age >= sim.HERDS.buffalo.mature).length;
    return [
      h('p', {}, `🦬 ${s.buffalo.length} buffalo (${grown} ready to sell, grown at ${sim.HERDS.buffalo.mature} days) · they roam your pasture`),
      h('p.muted', {}, `Room for ${sim.herdRoom(s)} more head on your pasture (shared with cattle) · ${money(sim.herdPrice(s, 'buffalo'))}/head today · in winter they eat hay from the barn first`),
      h('div.row', {},
        btn(`Buy a buffalo calf ${money(sim.HERDS.buffalo.buy)}`, () => g.act(sim.buyYoung(s, 'buffalo', 1)), 'small', { 'data-testid': 'buy-buffalo' }),
        btn('Buy 3', () => g.act(sim.buyYoung(s, 'buffalo', 3)), 'small grey'),
        btn('Sell grown buffalo', () => run(g, (ev) => sim.sellGrown(s, 'buffalo', ev)), grown ? 'small gold' : 'small grey', { 'data-testid': 'sell-buffalo' })),
    ];
  }
  if (b.type === 'horse_stable') {
    const n = sim.lessonsToday(s);
    return [
      h('p', {}, `🐴 Students pay for lessons every day. Teach up to ${sim.LESSONS_PER_DAY} yourself (8 AM–7 PM): ${n}/${sim.LESSONS_PER_DAY} today.`),
      h('div.row', {}, btn('🏇 Teach a riding lesson', () => run(g, (ev) => sim.teachLesson(s, ev)), n < sim.LESSONS_PER_DAY ? 'gold' : 'grey', { 'data-testid': 'teach-lesson' })),
    ];
  }
  if (b.type === 'outdoor_kitchen') {
    return [h('div.row', {}, btn('🍖 Host a cookout', () => run(g, (ev) => sim.hostCookout(s, ev)), sim.canCookout(s) ? 'gold' : 'grey', { 'data-testid': 'cookout', title: 'Once a day. Bring 4 lb of venison, fowl or fish for big XP.' }))];
  }
  return [];
});

// Hay: from any pasture you own or rent.
tileSections.push((g, i) => {
  const s = g.s;
  if (!sim.hayable(s, i)) return [];
  const ready = sim.hayReady(s).length;
  if (sim.seasonOf(s.time.day) === 3) return [h('p.muted', {}, '🌿 Pasture is dormant. Bale hay again in spring.')];
  if (!ready) return [h('p.muted', {}, '🌿 Hay is baled for this season. It grows back next season.')];
  return [h('div.row', {}, btn(`🌿 Bale hay on ${ready} acre${ready > 1 ? 's' : ''} of pasture (${money(ready * sim.BALE_COST)})`, () => { run(g, (ev) => sim.baleHay(s, ev)); g.closeSheet(); }, 'small', { 'data-testid': 'bale-hay', title: 'Sell the bales, or keep them to feed your herd in winter' }))];
});

bubbleSources.push((g, add) => {
  const pen = g.s.buildings.find((q) => q.type === 'buffalo_paddock');
  if (pen && g.s.buffalo.some((c) => c.age >= sim.HERDS.buffalo.mature)) add(pen.x, pen.y, '🦬', () => g.openTile({ x: pen.x, y: pen.y }), 'bubble-buffalo', 0.6);
});
