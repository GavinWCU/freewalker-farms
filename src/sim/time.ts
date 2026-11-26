// Calendar: 1 game day = 10 real minutes. 3 months of 3 days make a season,
// 4 seasons make a 36-day year.
export const REAL_SECONDS_PER_DAY = 600;
export const GAME_MINUTES_PER_REAL_SECOND = 1440 / REAL_SECONDS_PER_DAY;
export const DAYS_PER_MONTH = 3;
export const MONTHS_PER_SEASON = 3;
export const DAYS_PER_SEASON = DAYS_PER_MONTH * MONTHS_PER_SEASON;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
export const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
export const START_MINUTE = 6 * 60;

export const yearOf = (day: number) => Math.floor((day - 1) / DAYS_PER_YEAR) + 1;
export const seasonOf = (day: number) => Math.floor(((day - 1) % DAYS_PER_YEAR) / DAYS_PER_SEASON);
export const dayOfSeason = (day: number) => ((day - 1) % DAYS_PER_SEASON) + 1;
export const seasonIndex = (day: number) => Math.floor((day - 1) / DAYS_PER_SEASON); // absolute season count
export const isMonthStart = (day: number) => (day - 1) % DAYS_PER_MONTH === 0;
export const isSeasonStart = (day: number) => (day - 1) % DAYS_PER_SEASON === 0;
export const seasonKey = (day: number) => `Y${yearOf(day)} ${SEASONS[seasonOf(day)]}`;

export function clock(minute: number): string {
  const h = Math.floor(minute / 60), m = Math.floor(minute % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const dateLabel = (day: number) => `${SEASONS[seasonOf(day)]} ${dayOfSeason(day)}, Year ${yearOf(day)}`;

/** 0 at night, 1 at noon. */
export function daylight(minute: number): number {
  const h = minute / 60;
  if (h < 5 || h > 21) return 0;
  return Math.max(0, Math.sin(((h - 5) / 16) * Math.PI));
}
/** Golden Hour: 6–8 PM every evening. */
export const isGoldenHour = (minute: number) => minute >= 18 * 60 && minute < 20 * 60;
