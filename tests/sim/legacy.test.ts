import { describe, expect, it } from 'vitest';
import {
  addXp, build, buyUpgrade, checkLoops, checkMilestones, drawPaths, homeToWorld, idx, newGame, ringBell, trailLoops,
  visitRidge, visitSentinel, xpForLevel, DAYS_PER_SEASON, advance, canBuild, titleFor, tractorCapacity, prestige, MAX_LEVEL,
} from '../../src/sim';

describe('levels unlock things', () => {
  it('buildings unlock by level and titles follow the five bands', () => {
    const s = newGame(1);
    const p = homeToWorld(6, 6);
    expect(canBuild(s, 'black_barn', p.x, p.y).msg).toMatch(/level 9/);
    s.money = 1e6;
    addXp(s, xpForLevel(9));
    expect(canBuild(s, 'black_barn', p.x, p.y).ok).toBe(true);
    expect(titleFor(1).title).toBe('Landowner');
    expect(titleFor(6).title).toBe('Homesteader');
    expect(titleFor(10).title).toBe('Farmer');
    expect(titleFor(14).title).toBe('Entrepreneur');
    expect(titleFor(20).title).toBe('Legacy Builder');
  });
  it('keeps going after level 20 with prestige stars', () => {
    const s = newGame(1);
    addXp(s, xpForLevel(MAX_LEVEL) + 12000);
    expect(s.level).toBe(20);
    expect(prestige(s)).toBe(2);
  });
});

describe('milestones and the Bell Post', () => {
  it('major milestones wait for the bell', () => {
    const s = newGame(1);
    s.money = 1e5;
    addXp(s, xpForLevel(7));
    const p = homeToWorld(6, 6);
    build(s, 'container', p.x, p.y);
    checkMilestones(s);
    expect(s.achievements).toContain('first_build');
    expect(s.bell).toContain('first_build');
    expect(ringBell(s).ok).toBe(false); // no bell post yet
    build(s, 'bell_post', p.x + 1, p.y);
    expect(ringBell(s).ok).toBe(true);
    expect(s.bell).toEqual([]);
  });
});

describe('landmarks and Easter eggs', () => {
  it('a closed trail loop becomes Leonard\'s Loop, a second the Golden Hour Loop', () => {
    const s = newGame(2);
    const ring = (c0: number, r0: number) => {
      const out: number[] = [];
      for (let c = c0; c < c0 + 3; c++) for (let r = r0; r < r0 + 3; r++) if (c === c0 || r === r0 || c === c0 + 2 || r === r0 + 2) { const p = homeToWorld(c, r); out.push(idx(s, p.x, p.y)); }
      return out;
    };
    drawPaths(s, ring(5, 0).slice(0, 5), 'trail');
    expect(trailLoops(s).length).toBe(0);
    drawPaths(s, ring(5, 0), 'trail');
    checkLoops(s);
    expect(s.achievements).toContain('loop_1');
    expect(s.flags.leonardTile).toBeDefined();
    drawPaths(s, ring(5, 4), 'trail');
    checkLoops(s);
    expect(trailLoops(s).length).toBe(2);
    expect(s.achievements).toContain('loop_2');
  });
  it('the Sentinel Tree rewards visits in every season and at Golden Hour', () => {
    const s = newGame(3);
    for (let k = 0; k < 4; k++) { visitSentinel(s); advance(s, 1440 * DAYS_PER_SEASON); }
    expect(s.achievements).toContain('sentinel_seasons');
    s.time.minute = 18 * 60 + 30;
    visitSentinel(s);
    expect(s.achievements).toContain('sentinel_golden');
  });
  it('Buffalo Ridge gives a view once a day', () => {
    const s = newGame(3);
    const xp = s.xp;
    visitRidge(s); visitRidge(s);
    expect(s.xp - xp).toBe(20 + 50); // daily view + achievement
  });
  it("Gavin's Workshop and Paige's Lab sell upgrades", () => {
    const s = newGame(3);
    s.money = 1e6;
    expect(buyUpgrade(s, 'big_tractor').ok).toBe(false);
    addXp(s, xpForLevel(13));
    const p = homeToWorld(6, 6);
    build(s, 'lab', p.x, p.y);
    expect(buyUpgrade(s, 'big_tractor').ok).toBe(true);
    expect(tractorCapacity(s)).toBe(40);
  });
});
