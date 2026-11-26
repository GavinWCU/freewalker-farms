import { log } from './state';
import type { GameState, SimEvent } from './types';

// Twenty levels in five titled bands; XP keeps counting after 20 as prestige.
export const MAX_LEVEL = 20;
export const TITLES = [
  { from: 1, title: 'Landowner', focus: 'Establish the farm and basecamp' },
  { from: 5, title: 'Homesteader', focus: 'Become self-sufficient and open the Farm Stand' },
  { from: 9, title: 'Farmer', focus: 'Expand production, buy equipment and land' },
  { from: 13, title: 'Entrepreneur', focus: 'Run several profitable businesses' },
  { from: 17, title: 'Legacy Builder', focus: 'A thriving multigenerational estate' },
];
export const xpForLevel = (level: number) => Math.round(100 * Math.pow(level - 1, 1.75));
export const PRESTIGE_XP = 5000;
export const titleFor = (level: number) => [...TITLES].reverse().find((t) => level >= t.from)!;
export const prestige = (s: GameState) => (s.level < MAX_LEVEL ? 0 : Math.floor((s.xp - xpForLevel(MAX_LEVEL)) / PRESTIGE_XP));

export function levelProgress(s: GameState) {
  if (s.level >= MAX_LEVEL) {
    const into = (s.xp - xpForLevel(MAX_LEVEL)) % PRESTIGE_XP;
    return { into, need: PRESTIGE_XP };
  }
  const a = xpForLevel(s.level), b = xpForLevel(s.level + 1);
  return { into: s.xp - a, need: b - a };
}

export function addXp(s: GameState, amount: number, ev?: SimEvent[]) {
  const before = prestige(s);
  s.xp += Math.max(0, Math.round(amount));
  while (s.level < MAX_LEVEL && s.xp >= xpForLevel(s.level + 1)) {
    s.level++;
    log(s, `Reached level ${s.level} — ${titleFor(s.level).title}!`);
    ev?.push({ type: 'levelup', amount: s.level, text: `Level ${s.level}: ${titleFor(s.level).title}` });
  }
  const after = prestige(s);
  if (after > before) ev?.push({ type: 'prestige', amount: after, text: `Prestige star ${after}!` });
}
