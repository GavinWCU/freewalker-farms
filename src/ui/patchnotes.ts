import { btn, h, modal } from './dom';
import type { Game } from './game';
import { menuSections } from './registry';

// Patch notes, newest first. To announce an update, add an entry at the top with a new
// `version`; players see it once, the next time they load into a farm.
export const NOTES: { version: string; date: string; title: string; items: string[] }[] = [
  {
    version: '1.4', date: 'November 2026', title: 'Fast forward, ice fishing and selling land',
    items: [
      '⏩ Fast forward: tap the ⏵ 1× button at the top to run the clock at 2×, 5× or 10× (or press F). Great for getting through a long winter.',
      '🎣 Ice fishing: Lake Stillwater no longer closes in winter. Perch, bluegill, crappie, walleye and pike bite through the ice; bass and catfish are slow.',
      '💲 Sell land: tap an acre you bought and choose Sell. You get market value minus 10% closing costs. The original 80 stays in the family, and you can\'t sell an acre with a building or lease on it, or one that would cut off other land you own.',
      '📜 Patch notes like this one, shown after each update. Reread them any time from ☰ Menu → What\'s new.',
    ],
  },
  {
    version: '1.3', date: 'November 2026', title: 'Battery saver',
    items: [
      '🔋 The game now uses much less battery: it draws 30 frames a second instead of up to 120, and almost nothing while a menu is open.',
      '☰ Menu → Graphics switches between Battery saver (default), High quality (sharper, soft shadows, 60 fps) and Lowest.',
    ],
  },
  {
    version: '1.2', date: 'November 2026', title: 'Hunting all year',
    items: [
      '🎯 Hunt any season on your own land. Tap open land and choose Go hunting.',
      '🦃 Wild turkeys in the timber, 🐓 rooster pheasants in open fields, 🦆 mallards along the lake, plus whitetail and mule deer.',
      'Daily limits: deer 1, turkey 1, pheasant 3, duck 6. Birds fly, so lead your shot.',
      '🥩 Venison and 🍗 wild fowl to sell, and a record book in the Journal.',
    ],
  },
  {
    version: '1.1', date: 'November 2026', title: 'Lumber and the wind turbine',
    items: [
      '🪓 Cut trees on your land for logs and sell the lumber. Your timber slowly grows back.',
      '💨 Wind Turbine (level 10): earns daily wind power income.',
      '🛠️ Fixes: New Game now works on every device, and the game always loads the newest version after an update.',
    ],
  },
];
export const LATEST = NOTES[0].version;
const KEY = 'ff-notes-seen';

function seen(): string | null { try { return localStorage.getItem(KEY); } catch { return LATEST; } }
function markSeen() { try { localStorage.setItem(KEY, LATEST); } catch { /* private mode */ } }

/** Shows the notes. `since`: only the updates newer than this version. */
export function showPatchNotes(g: Game, since?: string | null) {
  const list = since ? NOTES.filter((n) => Number(n.version) > Number(since)) : NOTES;
  const body = list.flatMap((n) => [
    h('h3', { style: 'margin:12px 0 4px' }, `${n.title}`),
    h('p.muted', { style: 'margin:0 0 4px' }, `Version ${n.version} · ${n.date}`),
    h('ul', { style: 'margin:0;padding-left:20px;line-height:1.45' }, ...n.items.map((t) => h('li', { style: 'margin:4px 0' }, t))),
  ]);
  const m = modal(g.ui, "📜 What's new", [...body, h('div.row', { style: 'margin-top:12px' }, btn('Back to the farm', () => m.close(), 'gold', { 'data-testid': 'notes-ok' }))], undefined, 'patch-notes');
  markSeen();
}

/**
 * Call after loading into a farm. Returning players see what changed since their last
 * visit; brand-new players skip it (they get the tutorial) but won't see these notes later.
 */
export function maybeShowPatchNotes(g: Game, returningPlayer: boolean) {
  const last = seen();
  if (last && Number(last) >= Number(LATEST)) return;
  if (!last && !returningPlayer) { markSeen(); return; }
  showPatchNotes(g, last);
}

menuSections.push((g, close) => [h('div.row', {}, btn("📜 What's new", () => { close(); showPatchNotes(g); }, 'small blue', { 'data-testid': 'whats-new' }))]);
