import './ui/style.css';
import { CLOSING_LINE, GAME_NAME, SHORT_NAME, TAGLINE } from './config';
import * as sim from './sim';
import { newGame, dateLabel, type GameState } from './sim';
import { IdbBackend, SaveManager, SLOTS } from './save/saves';
import { Game } from './ui/game';
import { ask, askYes, btn, h, money, pickFile, tell } from './ui/dom';
import './ui/features';

document.title = GAME_NAME;
const app = document.getElementById('app')!;
const saves = new SaveManager(new IdbBackend());
let game: Game | null = null;

/** Starts (or swaps to) a farm; `paused` keeps it behind the title screen. */
function start(s: GameState, slot: number, paused: boolean) {
  game?.destroy();
  game = new Game(app, s, slot, saves);
  game.paused = paused;
  game.onExit = () => showTitle();
  (window as any).__game = game; // test & debug hooks
  (window as any).__sim = sim;
  return game;
}

async function lastSlot(): Promise<number> {
  const list = await saves.list();
  let best = -1, at = -1;
  list.forEach((m, i) => { if (m && m.savedAt > at) { at = m.savedAt; best = i; } });
  return best;
}

async function showTitle() {
  const list = await saves.list();
  const latest = await lastSlot();
  let notice = '';
  // Resume the latest farm automatically behind the title screen.
  if (latest >= 0 && game?.slot !== latest) {
    try {
      const r = (await saves.load(latest))!;
      start(r.state, latest, true);
      if (r.fellBack) notice = 'Your newest save could not be read, so the previous autosave was loaded.';
    } catch (e) { notice = (e as Error).message; }
  }
  if (!game) start(newGame(1874), -1, true);
  game!.paused = true;

  const el = h('div.title', { 'data-testid': 'title' });
  const close = () => el.remove();
  const play = async (slot: number) => {
    if (game?.slot !== slot) {
      try {
        const r = (await saves.load(slot))!;
        start(r.state, slot, false);
        if (r.fellBack) game!.toast('Your newest save could not be read — loaded the previous autosave.', 'bad');
      } catch (e) { await tell((e as Error).message); return; }
    }
    game!.paused = false; close(); maybeTip();
  };
  const fresh = async (slot: number) => {
    const name = (await ask('Name your farm:', { title: '🌾 New farm', value: SHORT_NAME, ok: 'Start farming' }))?.trim();
    if (!name) return;
    const s = newGame((Date.now() % 1_000_000) + slot * 7919, name.slice(0, 40));
    start(s, slot, false);
    await game!.save();
    close(); maybeTip();
  };

  const cont = latest >= 0 ? list[latest]! : null;
  el.append(
    h('h1', {}, SHORT_NAME),
    h('div.sub', {}, 'The Legacy of the 80'),
    h('div.tag', {}, TAGLINE),
    notice ? h('div.toast.bad', { 'data-testid': 'fallback-notice' }, notice) : '',
    cont ? btn(`▶ Continue — ${cont.farmName}`, () => play(latest), 'gold', { 'data-testid': 'continue', style: 'font-size:22px;padding:14px 26px' }) : '',
    cont ? h('div.tag', { 'data-testid': 'continue-info' }, `${dateLabel(cont.day)} · ${money(cont.money)} · ${cont.acres} acres`) : '',
    h('div.slots', {}, ...list.map((m, i) => h('div.slot', { 'data-testid': `slot-${i}` },
      h('div.info', {}, m ? [h('b', {}, m.farmName), h('div.muted', {}, `${dateLabel(m.day)} · ${money(m.money)} · ${m.acres} acres`)] : [h('b', {}, `Empty slot ${i + 1}`), h('div.muted', {}, 'Start a new farm here')]),
      m ? btn('Play', () => play(i), 'small') : btn('New Game', () => fresh(i), 'small gold', { 'data-testid': `new-${i}` }),
      m ? btn('🗑', async () => { if (await askYes(`Delete ${m.farmName}? This cannot be undone.`, 'Delete')) { await saves.remove(i); if (game?.slot === i) game = (game.destroy(), null); el.remove(); showTitle(); } }, 'small red', { 'aria-label': 'Delete' }) : '',
    ))),
    h('div.row', {},
      btn('⬆️ Import save', async () => {
        const text = await pickFile(); if (!text) return;
        const slot = list.findIndex((m) => !m);
        const target = slot >= 0 ? slot : Number(await ask(`All slots are full. Overwrite which slot (1-${SLOTS})?`, { value: '' })) - 1;
        if (!(target >= 0 && target < SLOTS)) return;
        try { await saves.save(target, saves.importJson(text)); el.remove(); game?.destroy(); game = null; showTitle(); }
        catch (e) { await tell(`Couldn't import: ${(e as Error).message}`); }
      }, 'small blue', { 'data-testid': 'title-import' }),
    ),
    h('div.sub', { style: 'font-size:20px;margin-top:6px' }, CLOSING_LINE),
  );
  app.append(el);
}

// Safari can clear site data after ~7 days unless the game is on the Home Screen.
function maybeTip() {
  const iPad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  if (!iPad || standalone || localStorage.getItem('ff-tip')) return;
  localStorage.setItem('ff-tip', '1');
  game?.toast('Tip: tap Share → Add to Home Screen so your farm is always saved.', 'big');
}

// Save whenever the page is hidden or closed.
const flush = () => { if (game && game.slot >= 0) game.save(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', flush);

if ('serviceWorker' in navigator && import.meta.env.PROD && !navigator.webdriver) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

showTitle();
