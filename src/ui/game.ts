import * as sim from '../sim';
import type { GameState, SimEvent, PathKind } from '../sim';
import { View, type Quality } from '../render/view';

export const QUALITIES: Quality[] = ['battery', 'high', 'low'];
/** Saved graphics setting. Older saves of the 'Lower quality' switch (ff-low) still count. */
export function getQuality(): Quality {
  try {
    const q = localStorage.getItem('ff-quality') as Quality | null;
    if (q && QUALITIES.includes(q)) return q;
    return localStorage.getItem('ff-low') === '1' ? 'low' : 'battery';
  } catch { return 'battery'; }
}
export function setQualitySetting(q: Quality) { try { localStorage.setItem('ff-quality', q); localStorage.removeItem('ff-low'); } catch { /* private mode */ } }
import { attachControls } from '../render/controls';
import type { SaveManager } from '../save/saves';
import { btn, h, money } from './dom';
import { tilePanel } from './tile';
import { openBuildMenu, openInventory, openMenu } from './panels';
import { ITEM } from '../sim/content/items';
import { bubbleSources, eventHandlers, hudItems, tickers, toolbarItems } from './registry';

export type Mode =
  | { kind: 'place'; type: string; at?: { x: number; y: number } }
  | { kind: 'move'; id: number; at?: { x: number; y: number } }
  | { kind: 'draw'; tool: PathKind | 'fence' | 'remove' }
  | null;

/** Runs one farm: the clock, the view, input, autosave and the overlay UI. */
export class Game {
  view: View;
  paused = false;
  dirty = true;
  mode: Mode = null;
  selected: { x: number; y: number } | null = null;
  whole = true;            // tractor works the whole field
  lastSaveAt = 0;
  saveCount = 0;
  private saveTimer = 0;
  private lastHour = -1;
  private raf = 0;
  private last = performance.now();
  readonly ui: HTMLElement;
  private hud = { money: h('span'), date: h('span'), clock: h('span'), weather: h('span'), acres: h('span'), level: h('span'), xp: h('i'), saved: h('div.chip.saved', { 'data-testid': 'saved' }, '✓ Saved'), camp: h('span') };
  sheet: HTMLElement | null = null;
  private banner: HTMLElement | null = null;
  private toasts = h('div.toasts');
  private bubbles = h('div.bubbles');
  private tint = h('div.tint');
  private bubbleEls: { el: HTMLElement; x: number; y: number; h: number }[] = [];
  keys = new Set<string>();
  stick = { x: 0, y: 0 };
  onExit: () => void = () => {};

  constructor(private root: HTMLElement, public s: GameState, public slot: number, public saves: SaveManager) {
    const world = h('div', { id: 'world' });
    this.ui = h('div', { id: 'ui' });
    root.append(world, this.ui);
    this.view = new View(world);
    this.view.setQuality(getQuality());
    this.view.sync(s);
    this.view.focus(s.player.x + 1, s.player.y + 1);
    this.buildHud();
    attachControls(world, this.view, {
      tap: (t) => this.tap(t),
      drawMode: () => this.mode?.kind === 'draw',
      draw: (t, phase) => this.draw(t, phase),
    });
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.raf = requestAnimationFrame(this.loop);
  }

  private onResize = () => this.view.resize();
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'escape') {
      const m = this.ui.querySelector('.modal-bg');
      if (m) (m.querySelector('.close') as HTMLElement)?.click();
      else if (this.mode) this.setMode(null);
      else if (this.sheet) this.closeSheet();
      else openMenu(this);
    }
    if (k === 'e') this.interact();
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.view.dispose();
    this.root.innerHTML = '';
  }

  // ── main loop ─────────────────────────────────────────────────────────────
  private lastDraw = -1e9;
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    // Battery: the screen may refresh 60-120 times a second, but we only do work at the
    // chosen frame rate, and barely at all while a menu or the title screen covers the farm.
    const covered = this.paused || !!this.ui.querySelector('.modal-bg');
    if (now - this.lastDraw < (covered ? 500 : 1000 / this.view.fps) - 4) return;
    this.lastDraw = now;
    const dt = Math.min(0.6, (now - this.last) / 1000); // clamp: a backgrounded tab must not jump the sim
    this.last = now;
    if (!this.paused) {
      this.tickInput(dt);
      this.handle(sim.advance(this.s, dt * sim.GAME_MINUTES_PER_REAL_SECOND));
    }
    const hour = this.s.time.day * 24 + Math.floor(this.s.time.minute / 60);
    if (hour !== this.lastHour) {
      if (this.lastHour >= 0) { this.dirty = true; this.save(); } // hourly autosave
      this.lastHour = hour;
    }
    if (this.dirty) { this.dirty = false; this.view.sync(this.s); this.rebuildBubbles(); if (this.sheet && this.selected) this.openTile(this.selected, true); }
    this.view.frame(this.s, dt);
    this.updateHud();
    this.placeBubbles();
    this.updateTint();
  };

  // ── test & debug helpers (used by Playwright) ────────────────────────────
  fastForward(minutes: number) { this.handle(sim.advance(this.s, minutes)); this.dirty = true; }
  tileScreen(x: number, y: number) { const p = this.view.toScreen(x + 0.5, this.view.ground(x + 0.5, y + 0.5), y + 0.5); return { x: p.x, y: p.y }; }

  tickInput(dt: number) { for (const f of tickers) f(this, dt); }
  interact() { const p = this.s.player; this.openTile({ x: Math.floor(p.x), y: Math.floor(p.y) }); }

  /** React to sim events: toasts, level-ups, cars at the stand… */
  handle(ev: SimEvent[]) {
    for (const e of ev) {
      if (e.type === 'levelup') { this.toast(`🎉 ${e.text}`, 'big'); this.dirty = true; this.save(); }
      else if (e.type === 'prestige') this.toast(`⭐ ${e.text}`, 'big');
      else if (e.type === 'toast' && e.text) this.toast(e.text);
      else if (e.type === 'day') this.dirty = true;
      else if (e.type === 'sale' && e.x !== undefined) this.view.spawnCar(e.x);
      for (const f of eventHandlers) f(this, e);
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────
  /** Applies a sim result: toast it, refresh the world and autosave. */
  act(r: sim.Result, ev: SimEvent[] = []) {
    this.handle(ev);
    if (r.msg) this.toast(r.msg, r.ok ? '' : 'bad');
    if (r.ok) { this.dirty = true; this.scheduleSave(); this.handle(sim.checkMilestones(this.s)); }
    return r.ok;
  }

  toast(text: string, cls = '') {
    const t = h('div.toast' + (cls ? '.' + cls : ''), {}, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), cls === 'big' ? 4000 : 2600);
  }

  // ── saving ────────────────────────────────────────────────────────────────
  scheduleSave() { clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => this.save(), 800); }
  async save() {
    clearTimeout(this.saveTimer);
    if (this.slot < 0) return;
    try {
      await this.saves.save(this.slot, this.s);
      if (!localStorage.getItem('ff-persist')) { localStorage.setItem('ff-persist', '1'); navigator.storage?.persist?.(); }
      this.lastSaveAt = Date.now(); this.saveCount++;
      this.hud.saved.classList.add('on');
      setTimeout(() => this.hud.saved.classList.remove('on'), 1500);
    } catch (e) { this.toast(`Save failed: ${(e as Error).message}`, 'bad'); }
  }

  // ── input on the map ──────────────────────────────────────────────────────
  tap(t: { x: number; y: number } | null) {
    if (!t) return;
    const m = this.mode;
    if (m?.kind === 'place' || m?.kind === 'move') {
      m.at = t;
      const r = m.kind === 'place' ? sim.canBuild(this.s, m.type, t.x, t.y) : sim.canPlace(this.s, this.s.buildings.find((b) => b.id === m.id)!.type, t.x, t.y, m.id);
      this.view.ghost(this.s, m.kind === 'place' ? m.type : this.s.buildings.find((b) => b.id === m.id)!.type, t.x, t.y, r.ok);
      this.showBanner();
      if (!r.ok) this.toast(r.msg, 'bad');
      return;
    }
    if (m?.kind === 'draw') return;
    this.openTile(t);
  }
  private drawn = new Set<number>();
  draw(t: { x: number; y: number }, phase: 'start' | 'move' | 'end') {
    if (this.mode?.kind !== 'draw') return;
    if (phase === 'start') this.drawn.clear();
    if (t.x >= 0 && !this.drawn.has(sim.idx(this.s, t.x, t.y))) {
      const i = sim.idx(this.s, t.x, t.y);
      this.drawn.add(i);
      const r = sim.drawPaths(this.s, [i], this.mode.tool);
      if (r.ok) { this.dirty = true; this.view.select(this.s, t); }
    }
    if (phase === 'end') {
      if (this.drawn.size) this.toast(`Updated ${this.drawn.size} tiles`);
      this.handle(sim.checkLoops(this.s));
      this.scheduleSave();
    }
  }

  setMode(m: Mode) {
    this.mode = m;
    this.view.ghost(this.s, null);
    this.closeSheet();
    if (m && (m.kind === 'place' || m.kind === 'move')) {
      const at = m.at ?? this.selected;
      if (at) this.tap(at);
    }
    this.showBanner();
  }
  private showBanner() {
    this.banner?.remove(); this.banner = null;
    const m = this.mode;
    if (!m) return;
    let text = '';
    const kids: Node[] = [];
    if (m.kind === 'place' || m.kind === 'move') {
      const type = m.kind === 'place' ? m.type : this.s.buildings.find((b) => b.id === m.id)!.type;
      text = `${m.kind === 'place' ? 'Place' : 'Move'} ${sim.BUILDING[type].name}${m.kind === 'place' ? ` (${money(sim.BUILDING[type].cost)})` : ''}`;
      if (m.at) kids.push(btn('✓ Place', () => this.confirmPlace(), '', { 'data-testid': 'confirm-place' }));
      else text += ' — tap a tile';
    } else {
      const names = { gravel: 'Gravel road ($40/acre)', trail: 'Trail ($10/acre)', fence: 'Fence ($15/acre)', remove: 'Remove roads & fences' };
      text = `${names[m.tool]} — drag one finger to draw, two to pan`;
    }
    this.banner = h('div.banner', { 'data-testid': 'banner' }, h('span', {}, text), ...kids, btn('✕', () => this.setMode(null), 'red small'));
    this.ui.append(this.banner);
  }
  private confirmPlace() {
    const m = this.mode;
    if (!m || (m.kind !== 'place' && m.kind !== 'move') || !m.at) return;
    const ev: SimEvent[] = [];
    const r = m.kind === 'place' ? sim.build(this.s, m.type, m.at.x, m.at.y, ev) : sim.moveBuilding(this.s, m.id, m.at.x, m.at.y);
    if (this.act(r, ev)) { const at = m.at; this.setMode(null); this.select(at); }
  }

  select(t: { x: number; y: number } | null) { this.selected = t; this.view.select(this.s, t); }
  openTile(t: { x: number; y: number }, refresh = false) {
    if (!refresh) this.select(t);
    const kids = tilePanel(this, t.x, t.y);
    const sheet = h('div.sheet', { 'data-testid': 'tile-panel' }, btn('✕', () => this.closeSheet(), 'red small close'), ...kids);
    const scroll = this.sheet?.scrollTop ?? 0;
    this.sheet?.remove();
    this.sheet = sheet;
    this.ui.append(sheet);
    sheet.scrollTop = scroll;
  }
  closeSheet() { this.sheet?.remove(); this.sheet = null; this.select(null); }

  // ── bubbles ───────────────────────────────────────────────────────────────
  rebuildBubbles() {
    this.bubbles.innerHTML = '';
    this.bubbleEls = [];
    const add = (x: number, y: number, icon: string, onTap: () => void, testid: string, hgt = 0.7) => {
      const el = h('div.bubble', { 'data-testid': testid, onpointerdown: (e: Event) => e.stopPropagation(), onclick: (e: Event) => { e.stopPropagation(); onTap(); } }, h('span', {}, icon));
      this.bubbles.append(el);
      this.bubbleEls.push({ el, x: x + 0.5, y: y + 0.5, h: hgt });
    };
    const s = this.s;
    const seen = new Set<number>();
    s.tiles.forEach((t, i) => {
      if (seen.has(i) || !t.f?.crop || t.f.growth < 1 || !sim.farmable(s, i)) return;
      const group = sim.fieldGroup(s, i, sim.tractorCapacity(s));
      group.forEach((g) => seen.add(g));
      // Float the bubble over the middle of the field.
      const cx = group.reduce((n, g) => n + sim.xy(s, g).x, 0) / group.length, cy = group.reduce((n, g) => n + sim.xy(s, g).y, 0) / group.length;
      const mid = group.reduce((b, g) => { const p = sim.xy(s, g), q = sim.xy(s, b); return Math.hypot(p.x - cx, p.y - cy) < Math.hypot(q.x - cx, q.y - cy) ? g : b; }, group[0]);
      const { x, y } = sim.xy(s, mid);
      add(x, y, ITEM[sim.CROP[t.f.crop].item].icon, () => { const ev: SimEvent[] = []; this.act(sim.fieldAction(s, i, 'harvest', undefined, this.whole, ev), ev); }, 'bubble-field', 0.55);
    });
    for (const b of s.buildings) {
      const icon = this.buildingBubble(b);
      if (icon) add(b.x, b.y, icon.icon, icon.tap, `bubble-${b.type}`, 0.75);
    }
    for (const f of bubbleSources) f(this, add);
  }
  buildingBubble(b: GameState['buildings'][number]): { icon: string; tap: () => void } | null {
    const p = sim.BUILDING[b.type].produces;
    if (p && b.ready > 0) return { icon: '✅', tap: () => { const ev: SimEvent[] = []; this.act(sim.collect(this.s, b.id, ev), ev); } };
    return null;
  }
  private placeBubbles() {
    for (const b of this.bubbleEls) {
      const p = this.view.toScreen(b.x, this.view.ground(b.x, b.y) + b.h, b.y);
      b.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      b.el.style.display = p.visible ? '' : 'none';
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  private buildHud() {
    const H = this.hud;
    const hud = h('div.hud',
      {},
      h('div.chip', { 'data-testid': 'hud-money' }, '💰', H.money),
      h('div.chip', {}, '🌱', H.date, h('small', {}, H.clock), H.weather),
      h('div.chip', { 'data-testid': 'hud-acres' }, '🗺️', H.acres),
      h('div.chip', { 'data-testid': 'hud-level' }, '⭐', H.level, h('div.xpbar', {}, H.xp)),
      h('div.chip.hide-phone', {}, '🏕️', H.camp),
      ...hudItems.map((f) => f(this)),
      H.saved,
    );
    const toolbar = h('div.toolbar',
      {},
      h('button.btn', { onclick: () => openBuildMenu(this), 'data-testid': 'btn-build' }, h('b', {}, '🔨'), 'Build'),
      h('button.btn.gold', { onclick: () => openInventory(this), 'data-testid': 'btn-barn' }, h('b', {}, '📦'), 'Sell'),
      ...toolbarItems.map((f) => f(this)),
      h('button.btn.grey', { onclick: () => openMenu(this), 'data-testid': 'btn-menu' }, h('b', {}, '☰'), 'Menu'),
    );
    this.ui.append(this.tint, this.bubbles, hud, toolbar, this.toasts);
  }

  /** Warm Golden Hour glow in the evening, blue at night. */
  private updateTint() {
    const m = this.s.time.minute, hr = m / 60;
    const golden = hr >= 17.5 && hr < 20.5 ? Math.sin(((hr - 17.5) / 3) * Math.PI) : 0;
    const night = hr >= 20.5 || hr < 5 ? 1 : hr < 6.5 ? (6.5 - hr) / 1.5 : hr > 20 ? (hr - 20) * 2 : 0;
    const bg = golden > night ? `rgba(255,140,40,${(golden * 0.22).toFixed(3)})` : `rgba(20,30,90,${(Math.min(1, night) * 0.38).toFixed(3)})`;
    if (this.tint.style.background !== bg) this.tint.style.background = bg;
  }
  private hudCache = '';
  private updateHud() {
    const s = this.s, H = this.hud;
    const W = { sunny: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️', snow: '❄️' }[s.weather];
    const prog = sim.levelProgress(s);
    const camp = sim.basecampLevel(s);
    const key = `${Math.floor(s.money)}|${s.time.day}|${Math.floor(s.time.minute / 10)}|${s.weather}|${s.level}|${s.xp}|${camp}|${this.paused}`;
    if (key === this.hudCache) return;
    this.hudCache = key;
    H.money.textContent = money(s.money);
    H.date.textContent = sim.dateLabel(s.time.day);
    H.clock.textContent = this.paused ? 'Paused' : sim.clock(s.time.minute);
    H.weather.textContent = W;
    H.acres.textContent = `${sim.acresOwned(s)} acres`;
    const pr = sim.prestige(s);
    H.level.textContent = `Lv ${s.level}${pr ? ` ★${pr}` : ''}`;
    H.xp.style.width = `${Math.min(100, (prog.into / prog.need) * 100)}%`;
    H.camp.textContent = camp ? `Basecamp ${camp}: ${sim.BASECAMP_NAMES[camp]}` : 'No basecamp yet';
  }
}
