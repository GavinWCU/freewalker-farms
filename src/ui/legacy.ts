import * as sim from '../sim';
import type { SimEvent } from '../sim';
import { btn, h, modal, money } from './dom';
import type { Game } from './game';
import { bubbleSources, buildingSections, eventHandlers, hudItems, tileSections } from './registry';
import { journalSections } from './explore';

// ── levels ──────────────────────────────────────────────────────────────────
export function openLevels(g: Game) {
  const s = g.s;
  const tb = h('table', {}, h('tr', {}, h('th', {}, 'Lv'), h('th', {}, 'Title'), h('th.num', {}, 'XP'), h('th', {}, 'Unlocks')));
  for (let L = 1; L <= sim.MAX_LEVEL; L++) {
    const unlocks = [...sim.BUILDINGS.filter((b) => b.level === L).map((b) => b.name), ...sim.CROPS.filter((c) => c.level === L).map((c) => `${c.name} seed`)];
    if (L === 5) unlocks.push('Hiring workers');
    if (L === 8) unlocks.push('Bigger Farm Stand');
    if (L === 13) unlocks.push('Freewalker Farm Market');
    const band = sim.TITLES.find((t) => t.from === L);
    tb.append(h('tr', { style: L === s.level ? 'background:#ffe9a8' : L < s.level ? 'opacity:.6' : '' },
      h('td', {}, L), h('td', {}, band ? h('b', {}, band.title) : ''), h('td.num', {}, sim.xpForLevel(L).toLocaleString()), h('td', {}, unlocks.join(', ') || '—')));
  }
  const t = sim.titleFor(s.level);
  const pr = sim.prestige(s);
  modal(g.ui, `⭐ Level ${s.level} — ${t.title}`, [
    h('p', {}, `${t.focus}. ${s.xp.toLocaleString()} XP${s.level < sim.MAX_LEVEL ? ` · ${(sim.xpForLevel(s.level + 1) - s.xp).toLocaleString()} to level ${s.level + 1}` : ` · ${pr} prestige star${pr === 1 ? '' : 's'} — there is always more to build`}`),
    h('p.muted', {}, 'XP comes from harvesting, building, selling, buying land and milestones.'),
    tb,
  ], undefined, 'levels');
}
hudItems.push((g) => {
  // Make the level chip open the levels table; add a Golden Hour badge.
  setTimeout(() => g.ui.querySelector('[data-testid=hud-level]')?.addEventListener('click', () => openLevels(g)));
  const gold = h('div.chip.hidden', { 'data-testid': 'golden-hour', style: 'background:#ffcf6b' }, '✨ Golden Hour');
  setInterval(() => gold.classList.toggle('hidden', !sim.isGoldenHour(g.s.time.minute)), 1000);
  return gold;
});

// ── landmarks ───────────────────────────────────────────────────────────────
tileSections.push((g, i) => {
  const lm = g.s.tiles[i].landmark;
  if (lm === 'ridge') return [h('p.muted', {}, 'The highest point on the property.'), h('div.row', {}, btn('🦬 Take in the view', () => {
    const ev: SimEvent[] = [];
    g.act(sim.visitRidge(g.s, ev), ev);
    const { x, y } = sim.xy(g.s, i);
    g.closeSheet();
    g.view.focus(x + 3, y + 4); g.view.viewSize = 26; g.view.resize();
  }, 'gold', { 'data-testid': 'ridge-view' }))];
  if (lm === 'sentinel') {
    const seen = [0, 1, 2, 3].map((k) => (g.s.achievements.includes(`sentinel_${k}`) ? ['🌸', '☀️', '🍂', '❄️'][k] : '·')).join(' ');
    return [h('p.muted', {}, `A lone old tree that has watched over this land for generations. Seasons you've visited: ${seen}`),
      h('div.row', {}, btn('🌳 Visit the Sentinel Tree', () => { const ev: SimEvent[] = []; g.act(sim.visitSentinel(g.s, ev), ev); }, 'gold', { 'data-testid': 'visit-sentinel' }))];
  }
  if (g.s.tiles[i].path === 'trail' && g.s.flags.leonardTile !== undefined) {
    const loops = sim.trailLoops(g.s);
    const name = loops.find((l) => l.includes(i) && l.includes(g.s.flags.leonardTile)) ? "Leonard's Loop" : loops.find((l) => l.includes(i)) && g.s.flags.goldenTile !== undefined ? 'Golden Hour Loop' : '';
    if (name) return [h('p', {}, `🥾 ${name}${name.startsWith('Leonard') ? ' — in honor of Grandpa' : ' — best ridden at sunset'}`)];
  }
  return [];
});

// ── Bell Post, Workshop, Lab ────────────────────────────────────────────────
function chime() {
  try {
    const ac = new AudioContext();
    for (const [f, t] of [[784, 0], [988, 0.18], [1175, 0.36]] as const) {
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, ac.currentTime + t);
      gn.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 1.6);
      o.connect(gn).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 1.7);
    }
  } catch { /* no audio */ }
}
export function ring(g: Game) {
  const ev: SimEvent[] = [];
  const r = sim.ringBell(g.s, ev);
  if (r.ok) { chime(); g.toast(r.msg, 'big'); g.act({ ok: true, msg: '' }, ev); } else g.act(r, ev);
}
buildingSections.push((g, b) => {
  if (b.type === 'bell_post') return [h('p', {}, g.s.bell.length ? `${g.s.bell.length} milestone${g.s.bell.length > 1 ? 's' : ''} to celebrate!` : 'No milestones waiting.'),
    h('div.row', {}, btn('🔔 Ring the bell', () => ring(g), g.s.bell.length ? 'gold' : 'grey', { 'data-testid': 'ring-bell' }))];
  if (b.type !== 'workshop' && b.type !== 'lab') return [];
  const out: Node[] = [h('h3', { style: 'margin-top:8px' }, b.type === 'lab' ? '🔬 Research' : '🛠️ Upgrades')];
  for (const u of sim.UPGRADES.filter((q) => q.needs === b.type)) {
    const have = g.s.upgrades.includes(u.id);
    out.push(h('div.row', {}, h('span', { style: 'flex:1;min-width:180px' }, h('b', {}, u.name), h('div.muted', {}, u.desc)),
      have ? h('b', {}, '✓ Installed') : btn(money(u.cost), () => g.act(sim.buyUpgrade(g.s, u.id)), 'small', { 'data-testid': `upgrade-${u.id}` })));
  }
  return out;
});
bubbleSources.push((g, add) => {
  const post = g.s.buildings.find((b) => b.type === 'bell_post');
  if (post && g.s.bell.length) add(post.x, post.y, '🔔', () => ring(g), 'bubble-bell', 0.8);
});

eventHandlers.push((g, e) => { if (e.type === 'milestone') { g.toast(`🏆 ${e.text}`, 'big'); g.dirty = true; } });

journalSections.push((g) => {
  const got = sim.MILESTONES.filter((m) => g.s.achievements.includes(m.id));
  return [h('h3', {}, `🏆 Milestones & achievements (${got.length}/${sim.MILESTONES.length})`),
    h('div.grid', {}, ...sim.MILESTONES.map((m) => h('div.card' + (g.s.achievements.includes(m.id) ? '' : '.locked'), { style: 'cursor:default' }, h('b', {}, `${g.s.achievements.includes(m.id) ? (m.major ? '🔔' : '🏅') : '🔒'} ${m.name}`), h('small', {}, `+${m.xp} XP`))))];
});
