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

// ── hunting: deer, turkey, pheasants and ducks, any season ─────────────────
tileSections.push((g, i) => {
  if (!sim.huntSpot(g.s, i)) return [];
  return [h('div.row', {}, btn('🎯 Go hunting', () => openHunting(g, i), 'blue', { 'data-testid': 'go-hunting' }))];
});

const SPOT_TEXT = { woods: 'deer and turkeys in the timber', field: 'pheasants, mule deer and turkeys in the open', shore: 'ducks along Lake Stillwater' };

/** Aiming game: an animal appears, the crosshair sways; take the shot when it's on target. Birds fly. */
export function openHunting(g: Game, i: number) {
  const s = g.s, { x, y } = sim.xy(s, i);
  const spot = sim.huntSpot(s, i)!;
  if (s.player.vehicle !== 'foot') sim.setVehicle(s, 'foot');
  s.player.x = x + 0.5; s.player.y = y + 0.5;
  g.closeSheet();
  const sky = spot === 'shore' ? 'linear-gradient(#cfe6f5 0 40%, #6fa8c9 40%)' : 'linear-gradient(#cfe6f5 0 45%, #9cc46b 45%)';
  const field = h('div', { style: `position:relative;height:190px;border:3px solid var(--ink);border-radius:12px;background:${sky};margin:12px 0;overflow:hidden;touch-action:none` });
  const target = h('div', { 'data-testid': 'hunt-target', style: 'position:absolute;font-size:46px;line-height:1;transform:translate(-50%,-50%) scaleX(-1)' });
  const cross = h('div', { style: 'position:absolute;width:44px;height:44px;border:3px solid #b3261e;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 0 2px #fff' },
    h('div', { style: 'position:absolute;left:50%;top:-8px;bottom:-8px;width:2px;background:#b3261e;transform:translateX(-50%)' }),
    h('div', { style: 'position:absolute;top:50%;left:-8px;right:-8px;height:2px;background:#b3261e;transform:translateY(-50%)' }));
  field.append(target, cross);
  const title = h('b', { 'data-testid': 'hunt-animal' });
  const result = h('p', { 'data-testid': 'hunt-result' });
  let animal: string | null = null, tx = 0.5, ty = 0.6, vx = 0, t = Math.random() * 10, aiming = false, raf = 0, cx = 0.5, cy = 0.5;
  const appear = () => {
    animal = sim.spotGame(s, i);
    if (!animal) { aiming = false; target.textContent = ''; title.textContent = 'Nothing left to hunt here today'; result.textContent = "You've reached today's limit for everything at this spot. Try another spot or come back tomorrow."; shotBtn.setAttribute('disabled', ''); shotBtn.textContent = '✅ Done for today'; return; }
    const a = sim.GAME_BY_ID[animal];
    target.textContent = a.icon; target.style.opacity = '1';
    tx = 0.15 + Math.random() * 0.7; ty = a.flies ? 0.2 + Math.random() * 0.2 : 0.5 + Math.random() * 0.3;
    vx = a.flies ? (Math.random() < 0.5 ? -1 : 1) * 0.0035 : 0;
    target.style.transform = `translate(-50%,-50%) scaleX(${vx < 0 ? 1 : -1})`;
    title.textContent = `A ${a.name.toLowerCase()} ${a.flies ? 'flushes!' : 'steps out…'} (${sim.bagged(s, animal)}/${a.bag} today)`;
    result.textContent = 'Take the shot when the crosshair is on it.';
    shotBtn.textContent = '🎯 Take the shot';
    aiming = true;
  };
  const tick = () => {
    if (aiming) {
      t += 0.016;
      tx += vx; if (tx < 0.08 || tx > 0.92) vx = -vx, target.style.transform = `translate(-50%,-50%) scaleX(${vx < 0 ? 1 : -1})`;
      target.style.left = `${tx * 100}%`; target.style.top = `${ty * 100}%`;
      cx = tx + Math.sin(t * 1.7) * 0.28 + Math.sin(t * 4.3) * 0.05;
      cy = ty + Math.sin(t * 2.3 + 1) * 0.22 + Math.cos(t * 5.1) * 0.04;
      cross.style.left = `${cx * 100}%`; cross.style.top = `${cy * 100}%`;
    }
    raf = requestAnimationFrame(tick);
  };
  const shoot = () => {
    if (!aiming) { appear(); return; }
    aiming = false;
    const d = Math.hypot(cx - tx, (cy - ty) * 0.8);
    const skill = Math.max(0, 1 - d / 0.12);
    const ev: SimEvent[] = [];
    const r = sim.takeShot(s, i, skill, animal!, ev);
    g.act(r, ev);
    if (r.ok) target.style.opacity = '0.25';
    result.textContent = r.ok ? `${sim.GAME_BY_ID[animal!].icon} ${r.msg}` : `💨 ${r.msg}`;
    shotBtn.textContent = '👀 Wait for the next one';
  };
  const shotBtn = btn('🎯 Take the shot', shoot, 'gold', { 'data-testid': 'hunt-shoot', style: 'width:100%' });
  modal(g.ui, '🎯 Hunting', [h('p.muted', {}, `Here: ${SPOT_TEXT[spot]} · best at dawn and dusk · ${s.hunting.harvested} harvested so far`), title, field, shotBtn, result], () => cancelAnimationFrame(raf), 'hunting');
  appear();
  tick();
}

journalSections.push((g) => {
  const s = g.s;
  const rows = sim.GAME.map((a) => h('tr', {}, h('td', {}, `${a.icon} ${a.name}`), h('td.num', {}, s.hunting.records[a.id] ? `${s.hunting.records[a.id]} lb 🏆` : '—')));
  return [
    h('h3', { style: 'margin-top:10px' }, '🎯 Hunting records'),
    h('table', {}, h('tr', {}, h('th', {}, 'Game'), h('th.num', {}, 'Personal record')), ...rows,
      h('tr', {}, h('td', {}, '🦌 Biggest rack'), h('td.num', {}, s.hunting.bestPoints ? `${s.hunting.bestPoints} points` : '—'))),
  ];
});
