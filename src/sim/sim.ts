import { isMonthStart, isSeasonStart } from './time';
import { rollWeather } from './weather';
import type { GameState, SimEvent } from './types';

// Systems hook into the clock here. Each runs on whole hours / days so a long
// fast-forward (or the 100-year test) stays cheap and deterministic.
type Hook = (s: GameState, ev: SimEvent[]) => void;
export const hooks: { hour: Hook[]; day: Hook[]; month: Hook[]; season: Hook[] } = { hour: [], day: [], month: [], season: [] };

function startDay(s: GameState, ev: SimEvent[]) {
  rollWeather(s);
  ev.push({ type: 'day', text: s.weather });
  if (isSeasonStart(s.time.day)) for (const h of hooks.season) h(s, ev);
  if (isMonthStart(s.time.day)) for (const h of hooks.month) h(s, ev);
  for (const h of hooks.day) h(s, ev);
}

/** Advances the game clock by `minutes` game minutes. Returns what happened. */
export function advance(s: GameState, minutes: number): SimEvent[] {
  const ev: SimEvent[] = [];
  let left = minutes;
  while (left > 1e-9) {
    const toHour = 60 - (s.time.minute % 60);
    if (left < toHour) { s.time.minute += left; break; }
    s.time.minute = Math.round(s.time.minute + toHour);
    left -= toHour;
    if (s.time.minute >= 1440) { s.time.minute = 0; s.time.day += 1; startDay(s, ev); }
    for (const h of hooks.hour) h(s, ev);
  }
  s.time.minute = Math.round(s.time.minute * 1000) / 1000;
  return ev;
}
