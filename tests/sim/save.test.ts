import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { advance, build, deserialize, homeToWorld, newGame, serialize, fieldAction, idx, SAVE_VERSION } from '../../src/sim';
import { MemoryBackend, SaveManager } from '../../src/save/saves';

function played(seed = 9) {
  const s = newGame(seed);
  const p = homeToWorld(6, 6);
  build(s, 'container', p.x, p.y);
  const c = homeToWorld(0, 0);
  fieldAction(s, idx(s, c.x, c.y), 'till', undefined, true);
  fieldAction(s, idx(s, c.x, c.y), 'plant', 'corn', true);
  advance(s, 1440 * 3 + 77);
  return s;
}

describe('save / load', () => {
  it('round-trips exactly', () => {
    const s = played();
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('a game saved and loaded midway continues identically', () => {
    const a = played(), b = deserialize(serialize(played()));
    advance(a, 1440 * 20); advance(b, 1440 * 20);
    expect(b).toEqual(a);
  });
  it('rotates the last 3 saves and falls back when the newest is corrupt', async () => {
    const mem = new MemoryBackend();
    const sm = new SaveManager(mem, () => 0);
    const s = played();
    for (let k = 0; k < 4; k++) { s.money = 1000 + k; await sm.save(0, s); }
    const keys = [...mem.data.keys()].filter((k) => k.startsWith('slot0/r'));
    expect(keys.length).toBe(3);
    const ok = await sm.load(0);
    expect(ok!.state.money).toBe(1003);
    expect(ok!.fellBack).toBe(false);
    const meta = (await sm.meta(0))!;
    mem.data.set(`slot0/r${meta.head}`, '{"broken":');
    const fb = await sm.load(0);
    expect(fb!.fellBack).toBe(true);
    expect(fb!.state.money).toBe(1002);
  });
  it('keeps separate slots', async () => {
    const sm = new SaveManager(new MemoryBackend());
    const a = newGame(1, 'Kim'), b = newGame(2, 'Paige');
    await sm.save(0, a); await sm.save(2, b);
    const list = await sm.list();
    expect(list[0]!.farmName).toBe('Kim');
    expect(list[1]).toBeNull();
    expect(list[2]!.acres).toBe(80);
  });
  it('rejects broken imports', () => {
    const sm = new SaveManager(new MemoryBackend());
    expect(() => sm.importJson('{}')).toThrow();
    expect(() => sm.importJson(JSON.stringify({ ...newGame(1), saveVersion: 999 }))).toThrow(/newer/);
  });
  it('loads the frozen v1 save fixture into the current format', () => {
    const raw = readFileSync('tests/fixtures/save-v1.json', 'utf8');
    expect(JSON.parse(raw).saveVersion).toBe(1);
    const s = deserialize(raw);
    expect(s.saveVersion).toBe(SAVE_VERSION);
    expect(s.buildings.length).toBeGreaterThan(0);
    advance(s, 1440 * 40); // and keeps running
    expect(s.money).toBeGreaterThanOrEqual(0);
  });
});
