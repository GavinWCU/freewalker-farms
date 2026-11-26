import { chance, nextRandom } from './rng';
import { seasonOf } from './time';
import type { GameState, Weather } from './types';

const hasEvent = (s: GameState, kind: string) => s.events.some((e) => e.kind === kind && e.until > s.time.day);

/** Rolls the day's weather. Droughts stop the rain; winter brings snow. */
export function rollWeather(s: GameState): Weather {
  const season = seasonOf(s.time.day);
  const r = nextRandom(s);
  let w: Weather;
  if (season === 3) w = r < 0.3 ? 'snow' : r < 0.6 ? 'cloudy' : 'sunny';
  else if (hasEvent(s, 'drought')) w = r < 0.25 ? 'cloudy' : 'sunny';
  else w = r < 0.08 && season !== 2 && chance(s, 0.7) ? 'storm' : r < 0.3 ? 'rain' : r < 0.5 ? 'cloudy' : 'sunny';
  s.weather = w;
  return w;
}
export const isWet = (w: Weather) => w === 'rain' || w === 'storm';
