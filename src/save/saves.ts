import { DB_NAME } from '../config';
import { acresOwned } from '../sim/world';
import { deserialize, serialize } from '../sim/save';
import type { GameState } from '../sim/types';

// Saves live in the player's own browser. The backend is swappable so a cloud
// store (Supabase, Firebase…) could be added later behind the same interface.
export interface SaveBackend {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export const SLOTS = 3;
export const ROTATION = 3; // keep the last 3 autosaves per slot

export interface SlotMeta { head: number; farmName: string; day: number; money: number; acres: number; savedAt: number }
export interface LoadResult { state: GameState; fellBack: boolean; error?: string }

export class SaveManager {
  constructor(private db: SaveBackend, private now: () => number = () => Date.now()) {}

  private metaKey = (slot: number) => `slot${slot}/meta`;
  private dataKey = (slot: number, r: number) => `slot${slot}/r${r}`;

  async meta(slot: number): Promise<SlotMeta | null> {
    const raw = await this.db.get(this.metaKey(slot));
    try { return raw ? (JSON.parse(raw) as SlotMeta) : null; } catch { return null; }
  }
  async list() { return Promise.all(Array.from({ length: SLOTS }, (_, i) => this.meta(i))); }

  /** Writes to the next rotation entry, then points the slot's meta at it. */
  async save(slot: number, s: GameState) {
    const m = await this.meta(slot);
    const head = m ? (m.head + 1) % ROTATION : 0;
    await this.db.set(this.dataKey(slot, head), serialize(s));
    const meta: SlotMeta = { head, farmName: s.farmName, day: s.time.day, money: Math.floor(s.money), acres: acresOwned(s), savedAt: this.now() };
    await this.db.set(this.metaKey(slot), JSON.stringify(meta));
    return meta;
  }

  /** Loads the newest good save, falling back through older rotations. */
  async load(slot: number): Promise<LoadResult | null> {
    const m = await this.meta(slot);
    if (!m) return null;
    let firstError: string | undefined;
    for (let k = 0; k < ROTATION; k++) {
      const r = (m.head - k + ROTATION) % ROTATION;
      const raw = await this.db.get(this.dataKey(slot, r));
      if (!raw) { firstError ??= 'missing'; continue; }
      try { return { state: deserialize(raw), fellBack: k > 0, error: firstError }; }
      catch (e) { firstError ??= (e as Error).message; }
    }
    throw new Error(`No readable save in slot ${slot + 1}: ${firstError}`);
  }

  async remove(slot: number) {
    await this.db.del(this.metaKey(slot));
    for (let r = 0; r < ROTATION; r++) await this.db.del(this.dataKey(slot, r));
  }

  exportJson(s: GameState) { return serialize(s); }
  /** Parses (and migrates) an exported file; throws on a bad file. */
  importJson(json: string): GameState { return deserialize(json); }
}

export class MemoryBackend implements SaveBackend {
  data = new Map<string, string>();
  async get(k: string) { return this.data.get(k); }
  async set(k: string, v: string) { this.data.set(k, v); }
  async del(k: string) { this.data.delete(k); }
}

export class IdbBackend implements SaveBackend {
  private dbp: Promise<IDBDatabase>;
  constructor(name = DB_NAME) {
    this.dbp = new Promise((res, rej) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, f: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.dbp;
    return new Promise((res, rej) => {
      const t = db.transaction('kv', mode);
      const r = f(t.objectStore('kv'));
      t.oncomplete = () => res(r.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  get(k: string) { return this.tx('readonly', (st) => st.get(k) as IDBRequest<string | undefined>); }
  async set(k: string, v: string) { await this.tx('readwrite', (st) => st.put(v, k)); }
  async del(k: string) { await this.tx('readwrite', (st) => st.delete(k)); }
}
