import * as sim from '../sim';
import type { SimEvent } from '../sim';
import { btn, h, modal } from './dom';
import type { Game } from './game';
import { journalSections } from './explore';
import { tileSections } from './registry';

// ── lumber ──────────────────────────────────────────────────────────────────
tileSections.push((g, i) => {
  const n = sim.choppable(g.s, i);
  if (!n) return [];
  return [h('div.row', {}, btn(`🪓 Cut ${n} tree${n > 1 ? 's' : ''} → ${n * sim.LOGS_PER_TREE} logs`, () => {
    const ev: SimEvent[] = []; g.act(sim.chopTrees(g.s, i, ev), ev); g.closeSheet();
  }, 'small', { 'data-testid': 'chop-trees', title: 'Sell lumber at the market or your Farm Stand. Your timber slowly grows back.' }))];
});

// ── deer hunting ────────────────────────────────────────────────────────────
tileSections.push((g, i) => {
  const spot = sim.huntSpot(g.s, i);
  if (!spot) return [];
  const open = sim.HUNT_SEASONS.includes(sim.seasonOf(g.s.time.day));
  return [h('div.row', {}, btn(open ? '🦌 Go hunting' : '🦌 Hunting opens in the fall', () => openHunting(g, i), open ? 'blue' : 'small grey', { 'data-testid': 'go-hunting', disabled: !open || undefined }))];
});

/** Aiming game: the crosshair sways; take the shot when it's over the deer. */
export function openHunting(g: Game, i: number) {
  const s = g.s, { x, y } = sim.xy(s, i);
  if (s.player.vehicle !== 'foot') sim.setVehicle(s, 'foot');
  s.player.x = x + 0.5; s.player.y = y + 0.5;
  g.closeSheet();
  const field = h('div', { style: 'position:relative;height:190px;border:3px solid var(--ink);border-radius:12px;background:linear-gradient(#cfe6f5 0 45%, #9cc46b 45%);margin:12px 0;overflow:hidden;touch-action:none' });
  const deer = h('div', { style: 'position:absolute;font-size:46px;line-height:1;transform:translate(-50%,-50%) scaleX(-1)' }, '🦌');
  const cross = h('div', { style: 'position:absolute;width:44px;height:44px;border:3px solid #b3261e;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 0 2px #fff' },
    h('div', { style: 'position:absolute;left:50%;top:-8px;bottom:-8px;width:2px;background:#b3261e;transform:translateX(-50%)' }),
    h('div', { style: 'position:absolute;top:50%;left:-8px;right:-8px;height:2px;background:#b3261e;transform:translateY(-50%)' }));
  field.append(deer, cross);
  const result = h('p', { 'data-testid': 'hunt-result' }, 'Hold steady… take the shot when the crosshair is on the deer.');
  let dx = 0.5, dy = 0.6, t = Math.random() * 10, aiming = true, raf = 0;
  const placeDeer = () => { dx = 0.15 + Math.random() * 0.7; dy = 0.5 + Math.random() * 0.3; deer.style.left = `${dx * 100}%`; deer.style.top = `${dy * 100}%`; deer.style.opacity = '1'; };
  placeDeer();
  let cx = 0.5, cy = 0.5;
  const tick = () => {
    if (aiming) {
      t += 0.016;
      cx = dx + Math.sin(t * 1.7) * 0.28 + Math.sin(t * 4.3) * 0.05;
      cy = dy + Math.sin(t * 2.3 + 1) * 0.22 + Math.cos(t * 5.1) * 0.04;
      cross.style.left = `${cx * 100}%`; cross.style.top = `${cy * 100}%`;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  const shoot = () => {
    if (!aiming) { aiming = true; placeDeer(); result.textContent = 'Another deer steps out of the trees…'; shotBtn.textContent = '🎯 Take the shot'; return; }
    aiming = false;
    const d = Math.hypot(cx - dx, (cy - dy) * 0.8);
    const skill = Math.max(0, 1 - d / 0.12);
    const ev: SimEvent[] = [];
    const r = sim.takeShot(s, i, skill, ev);
    g.act(r, ev);
    if (r.ok) deer.style.opacity = '0.25';
    result.textContent = r.ok ? `🦌 ${r.msg}` : `💨 ${r.msg}`;
    shotBtn.textContent = s.flags.deerTag === s.time.day ? '✅ Tag filled for today' : '🎯 Wait for another deer';
    if (s.flags.deerTag === s.time.day) shotBtn.setAttribute('disabled', '');
  };
  const shotBtn = btn('🎯 Take the shot', shoot, 'gold', { 'data-testid': 'hunt-shoot', style: 'width:100%' });
  if (s.flags.deerTag === s.time.day) { shotBtn.textContent = '✅ Tag filled for today'; shotBtn.setAttribute('disabled', ''); }
  modal(g.ui, '🦌 Deer hunting', [h('p.muted', {}, `${s.hunting.harvested} deer harvested · one deer per day · best at dawn and dusk · mule deer like open pasture`), field, shotBtn, result], () => cancelAnimationFrame(raf), 'hunting');
}

journalSections.push((g) => {
  const s = g.s;
  const rows = sim.DEER.map((d) => h('tr', {}, h('td', {}, d.name), h('td.num', {}, s.hunting.records[d.id] ? `${s.hunting.records[d.id]} lb 🏆` : '—')));
  return [
    h('h3', { style: 'margin-top:10px' }, '🦌 Hunting records'),
    h('table', {}, h('tr', {}, h('th', {}, 'Deer'), h('th.num', {}, 'Personal record')), ...rows,
      h('tr', {}, h('td', {}, 'Biggest rack'), h('td.num', {}, s.hunting.bestPoints ? `${s.hunting.bestPoints} points` : '—'))),
  ];
});
