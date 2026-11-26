import * as sim from '../sim';
import { btn, h } from './dom';
import type { Game } from './game';
import { hudItems, menuSections } from './registry';

// A short guided tour for a brand-new farm. Progress is kept per farm in
// s.flags.tutorial (step number; 99 = finished or skipped).
interface Step { icon: string; title: string; text: string; done?: (g: Game) => boolean }

export const STEPS: Step[] = [
  { icon: '👋', title: 'Welcome to the 80!', text: 'This is your land: 43 acres of cropland, 37 of pasture and Lake Stillwater. Drag with one finger to look around, pinch (or scroll) to zoom.' },
  { icon: '🚜', title: 'Till a field', text: 'Tap a light-green cropland tile near the road, then tap Till. With the tractor box ticked, it works the whole field at once.', done: (g) => g.s.tiles.some((t) => t.f?.tilled) },
  { icon: '🌱', title: 'Plant a crop', text: 'Tap the tilled field again and pick a seed — corn is a good start. Water it if it needs it; rain does that for you.', done: (g) => g.s.tiles.some((t) => t.f?.crop) || (g.s.stats.harvested ?? 0) > 0 },
  { icon: '🔨', title: 'Start your Basecamp', text: 'Tap Build and choose the Shipping Container. Tap a tile to see a green (OK) or red ghost, then tap ✓ Place.', done: (g) => sim.basecampLevel(g.s) >= 1 },
  { icon: '🕹️', title: 'Get moving', text: 'Use the joystick (or WASD / arrow keys) to walk. The buttons on the right switch to the truck or tractor — Ace rides along. Driving the tractor over a field works it.', done: (g) => (g.s.stats.tilesDriven ?? 0) >= 3 },
  { icon: '💬', title: 'Bubbles mean "ready"', text: 'When crops are grown or a building has something for you, a bubble floats above it. Tap the bubble to harvest or collect. Then sell from the Sell button — or stock your Farm Stand later.' },
  { icon: '🪧', title: 'Grow the farm', text: 'Parcels with a wooden sign touch your land and are for sale. Tap one to buy or rent it. The Land button has auctions, leases and farm loans.' },
  { icon: '📒', title: "You're all set", text: 'The Ledger shows what each business earns. The game saves itself, and Menu → Export save makes a backup. There is no finish line — build the legacy at your own pace.' },
];

hudItems.push((g) => {
  const card = h('div.tutorial', { 'data-testid': 'tutorial' });
  g.ui.append(card);
  let shown = -1;
  const render = () => {
    // Older farms that never saw the tour start with it finished.
    const k = g.s.flags.tutorial ?? (g.s.time.day > 1 || g.s.buildings.length ? 99 : 0);
    if (k >= STEPS.length) { card.classList.add('hidden'); shown = k; return; }
    const st = STEPS[k];
    if (st.done?.(g)) { g.s.flags.tutorial = k + 1; g.scheduleSave(); render(); return; }
    card.classList.remove('hidden');
    if (shown === k) return;
    shown = k;
    card.innerHTML = '';
    card.append(
      h('div', { style: 'font-size:30px' }, st.icon),
      h('div', { style: 'flex:1' }, h('b', {}, `${st.title}`), h('div', { style: 'font-size:15px' }, st.text), h('small.muted', {}, `Step ${k + 1} of ${STEPS.length}`)),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
        st.done ? h('small.muted', {}, 'Do it to continue') : btn(k === STEPS.length - 1 ? 'Done' : 'Next', () => { g.s.flags.tutorial = k + 1; g.scheduleSave(); render(); }, 'small', { 'data-testid': 'tutorial-next' }),
        btn('Skip', () => { g.s.flags.tutorial = 99; g.scheduleSave(); render(); }, 'small grey', { 'data-testid': 'tutorial-skip' })),
    );
  };
  render();
  const timer = setInterval(() => { if (!card.isConnected) clearInterval(timer); else render(); }, 500);
  return h('span.hidden');
});

menuSections.push((g, close) => [h('div.row', {}, btn('🎓 Replay the tutorial', () => { g.s.flags.tutorial = 0; close(); }, 'small grey'))]);
