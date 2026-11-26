// Seeded RNG (mulberry32). The generator state lives inside GameState so a
// saved game resumes the exact same sequence of weather, events and prices.
export interface HasRng { rng: number }

export function nextRandom(s: HasRng): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (s: HasRng, lo: number, hi: number) => lo + Math.floor(nextRandom(s) * (hi - lo + 1));
export const chance = (s: HasRng, p: number) => nextRandom(s) < p;
export function pick<T>(s: HasRng, arr: readonly T[]): T { return arr[Math.floor(nextRandom(s) * arr.length)]; }

// Stateless hash noise, used for world generation and decoration.
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
export function valueNoise(x: number, y: number, seed: number, scale: number): number {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
