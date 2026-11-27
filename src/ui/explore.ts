import * as sim from '../sim';
import type { SimEvent, Vehicle } from '../sim';
import { btn, h, modal, money } from './dom';
import type { Game } from './game';
import { bubbleSources, eventHandlers, hudItems, menuSections, tickers, tileSections } from './registry';

const DIRS: Record<string, [number, number]> = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
let follow = false;

// Drive with the on-screen stick or WASD / arrows. Screen "up" is away from the camera.
tickers.push((g, dt) => {
  let ix = g.stick.x, iy = g.stick.y;
  for (const k of g.keys) { const d = DIRS[k]; if (d) { ix += d[0]; iy += d[1]; } }
  if (!ix && !iy) { follow = false; return; }
  const wx = (ix - iy) / Math.SQRT2, wy = (-ix - iy) / Math.SQRT2;
  g.view.face(wx, wy);
  const ev = sim.movePlayer(g.s, wx, wy, dt);
  if (ev.length) { g.handle(ev); g.dirty = true; g.scheduleSave(); }
  // Camera follows while driving.
  const t = g.view.target, p = g.s.player;
  if (!follow && Math.hypot(t.x - p.x, t.z - p.y) > 2) follow = true;
  if (follow) { t.x += (p.x - t.x) * Math.min(1, dt * 3); t.z += (p.y - t.z) * Math.min(1, dt * 3); g.view.pan(0, 0); }
});

eventHandlers.push((g, e) => { if (e.type === 'worked' || e.type === 'toast') g.dirty = true; });

/** E: interact with whatever is under you. */
export function interact(g: Game) {
  const p = g.s.player;
  g.openTile({ x: Math.floor(p.x), y: Math.floor(p.y) });
}

// ── on-screen controls ──────────────────────────────────────────────────────
hudItems.push((g) => {
  // The joystick and the vehicle buttons live outside the HUD row.
  const knob = h('i');
  const stick = h('div.stick', { 'data-testid': 'joystick' }, knob) as HTMLDivElement;
  let id = -1;
  const move = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2, len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    g.stick.x = dx / max; g.stick.y = -dy / max;
  };
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); move(e); e.stopPropagation(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = () => { id = -1; knob.style.transform = ''; g.stick.x = g.stick.y = 0; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);

  const side = h('div.side');
  const render = () => {
    side.innerHTML = '';
    for (const v of g.s.vehicles) {
      const d = sim.VEHICLES[v];
      side.append(btn(d.icon, () => { g.act(sim.setVehicle(g.s, v as Vehicle)); render(); }, `round${g.s.player.vehicle === v ? ' gold' : ' grey'}`, { title: d.name, 'data-testid': `vehicle-${v}` }));
    }
    if (g.s.player.vehicle === 'tractor') {
      const [mode, crop] = g.s.player.tractorMode.split(':');
      const label = mode === 'plant' ? `🌱 ${sim.CROP[crop]?.name ?? 'Plant'}` : { harvest: '🌾 Harvest', till: '🟫 Till', water: '💧 Water' }[mode];
      side.append(btn(label!, () => {
        const season = sim.seasonOf(g.s.time.day);
        const crops = sim.CROPS.filter((c) => c.seasons.includes(season) && g.s.level >= c.level).map((c) => `plant:${c.id}`);
        const modes = ['harvest', 'till', 'water', ...crops];
        g.s.player.tractorMode = modes[(modes.indexOf(g.s.player.tractorMode) + 1) % modes.length];
        render();
      }, 'small blue', { title: 'Tractor works fields as you drive over them', 'data-testid': 'tractor-mode' }));
    }
    side.append(btn('E', () => interact(g), 'round blue', { title: 'Interact (E)' }));
  };
  render();
  (g as any).renderSide = render;
  g.ui.append(stick, side);
  return h('span.hidden');
});

// ── fishing ─────────────────────────────────────────────────────────────────
tileSections.push((g, i) => {
  const spot = sim.fishingSpot(g.s, i);
  if (!spot) return [];
  return [h('div.row', {}, btn(`🎣 Go ${sim.seasonOf(g.s.time.day) === 3 ? 'ice ' : ''}fishing${spot === 'dock' ? ' from the dock' : ''}`, () => openFishing(g, i), 'blue', { 'data-testid': 'go-fishing' }))];
});

export function openFishing(g: Game, i: number) {
  const s = g.s, { x, y } = sim.xy(s, i);
  if (s.player.vehicle !== 'foot') sim.setVehicle(s, 'foot');
  s.player.x = x + 0.5; s.player.y = y + 0.5;
  g.closeSheet();
  const bar = h('div', { style: 'position:relative;height:34px;border:3px solid var(--ink);border-radius:12px;background:#bfe3f2;margin:12px 0;overflow:hidden' });
  const zone = h('div', { style: 'position:absolute;top:0;bottom:0;background:#7ed07a' });
  const mark = h('div', { style: 'position:absolute;top:-2px;bottom:-2px;width:6px;background:var(--ink);border-radius:3px' });
  bar.append(zone, mark);
  const result = h('p', { 'data-testid': 'fish-result' }, 'Wait for the marker to cross the green zone, then reel in!');
  let pos = 0, dir = 1, z0 = 0.4, zw = 0.22, running = true, raf = 0;
  const newZone = () => { zw = 0.16 + Math.random() * 0.14; z0 = Math.random() * (1 - zw); zone.style.left = `${z0 * 100}%`; zone.style.width = `${zw * 100}%`; };
  newZone();
  const tick = () => { if (running) { pos += dir * 0.012; if (pos > 1 || pos < 0) dir *= -1; mark.style.left = `calc(${pos * 100}% - 3px)`; } raf = requestAnimationFrame(tick); };
  tick();
  const reel = () => {
    if (!running) { running = true; newZone(); result.textContent = 'Line is in the water…'; reelBtn.textContent = '🎣 Reel in!'; return; }
    running = false;
    const mid = z0 + zw / 2, d = Math.abs(pos - mid);
    const skill = d < zw / 2 ? 0.6 + 0.4 * (1 - d / (zw / 2)) : Math.max(0, 0.45 - (d - zw / 2) * 3);
    const ev: SimEvent[] = [];
    const r = sim.castLine(s, i, skill, ev);
    g.act(r, ev);
    result.textContent = r.ok ? `🐟 ${r.msg}` : `💨 ${r.msg}`;
    reelBtn.textContent = '🎣 Cast again';
  };
  const reelBtn = btn('🎣 Reel in!', reel, 'gold', { 'data-testid': 'fish-reel', style: 'width:100%' });
  const recs = Object.keys(s.fishing.records).length;
  modal(g.ui, sim.seasonOf(s.time.day) === 3 ? '🎣 Ice fishing on Lake Stillwater' : '🎣 Lake Stillwater', [h('p.muted', {}, `${s.fishing.caught} fish caught · ${recs} species on your record board · bigger fish bite from the dock, catfish at night`), bar, reelBtn, result], () => cancelAnimationFrame(raf), 'fishing');
}

// ── finds, Ace's gifts ──────────────────────────────────────────────────────
bubbleSources.push((g, add) => {
  g.s.gifts.forEach((gift, k) => add(gift.x - 0.5, gift.y - 0.5, '🎁', () => { const ev: SimEvent[] = []; g.act(sim.collectGift(g.s, k, ev), ev); }, 'bubble-gift', 0.4));
});

// ── garage & journal (menu) ─────────────────────────────────────────────────
menuSections.push((g, close) => {
  const out: Node[] = [h('h3', { style: 'margin-top:14px' }, '🚜 Garage')];
  const row = h('div.row');
  for (const v of ['atv'] as Vehicle[]) {
    if (g.s.vehicles.includes(v)) continue;
    row.append(btn(`Buy ${sim.VEHICLES[v].icon} ${sim.VEHICLES[v].name} ${money(sim.VEHICLES[v].price)}`, () => { if (g.act(sim.buyVehicle(g.s, v))) { (g as any).renderSide?.(); close(); } }, 'small', { 'data-testid': `buy-${v}` }));
  }
  row.append(btn('📖 Journal', () => { close(); openJournal(g); }, 'small blue', { 'data-testid': 'journal' }));
  out.push(row);
  return out;
});

export const journalSections: ((g: Game) => Node[])[] = [];
export function openJournal(g: Game) {
  const s = g.s;
  const fish = h('table', {}, h('tr', {}, h('th', {}, 'Fish'), h('th.num', {}, 'Personal record')),
    ...sim.FISH.map((f) => h('tr', {}, h('td', {}, f.name), h('td.num', {}, s.fishing.records[f.id] ? `${s.fishing.records[f.id]} lb 🏆` : '—'))));
  const found = Object.entries(sim.TREASURES).map(([k, t]) => h('div.card', { style: 'cursor:default' }, h('b', {}, `${s.stats[`found_${k}`] ? t.icon : '❔'} ${s.stats[`found_${k}`] ? t.name : '???'}`), h('small', {}, s.stats[`found_${k}`] ? `found ×${s.stats[`found_${k}`]}` : 'still hidden somewhere')));
  modal(g.ui, '📖 Journal', [
    ...journalSections.flatMap((f) => f(g)),
    h('h3', { style: 'margin-top:10px' }, '🎣 Lake Stillwater records'), fish,
    h('h3', { style: 'margin-top:14px' }, '🔎 Finds'), h('div.grid', {}, ...found),
    h('h3', { style: 'margin-top:14px' }, '📜 Farm log'), h('div', {}, ...s.log.slice(-12).reverse().map((l) => h('p.muted', {}, `${sim.dateLabel(l.day)} — ${l.text}`))),
  ], undefined, 'journal-dialog');
}
