// Game state is plain JSON (no Map/Set/Date/classes) so it saves and loads exactly.

export type Terrain = 'crop' | 'pasture' | 'timber' | 'water' | 'road';
export type PathKind = 'gravel' | 'trail';
export type Vehicle = 'foot' | 'truck' | 'tractor' | 'atv';
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow';

export interface Field {
  tilled: boolean;
  crop: string | null;   // crop id
  growth: number;        // 0..1, ready at 1
  watered: boolean;      // watered today
}

export interface Tile {
  t: Terrain;
  h: number;             // ground height in world units
  soil: number;          // soil quality multiplier, ~0.7..1.3
  owned: boolean;
  home: boolean;         // part of the original 80 (or its lake)
  landmark?: string;     // 'ridge' | 'sentinel' | 'entrance'
  lease?: number;        // id of an active lease touching this tile
  b?: number;            // building id
  path?: PathKind;
  fence?: boolean;       // player-drawn fence
  trees: number;         // decorative trees 0..4 (cleared when building/farming)
  rock: boolean;
  f?: Field;
}

export interface Building {
  id: number;
  type: string;
  x: number;
  y: number;
  level: number;
  ready: number;         // finished output waiting for collection (bubble)
  progress: number;      // 0..1 toward next output
}

export interface StandSlot { qty: number; price: number }
export interface StandDay { sold: Record<string, number>; revenue: number; ranOut: string[]; customers: number }
export interface Stand {
  stock: Record<string, StandSlot>;
  today: StandDay;
  last: (StandDay & { day: number }) | null;
}

export interface Lease {
  id: number;
  dir: 'out' | 'in';
  tiles: number[];
  tenant: string;        // tenant kind id (out) or neighbor name (in)
  name: string;
  ratePerAcre: number;   // $ per acre per season
  startDay: number;
  endDay: number;        // first day the lease is over
  paid?: number;         // seasons of rent paid so far
}

export interface LeaseOffer { tenant: string; name: string; ratePerAcre: number; seasons: number }

export interface Loan { principal: number; rate: number; missed: number }

export interface Auction { tiles: number[]; factor: number; endDay: number; label: string }

export interface Spot { x: number; y: number; item: string; found: boolean }

export interface Animal { id: number; age: number; x: number; y: number }

export interface LedgerSeason { key: string; income: Record<string, number>; expense: Record<string, number> }

export interface Workers { farmhand: number; cashier: number; ranchhand: number }

export interface GameEvent { kind: string; until: number; data?: Record<string, number | string> }

export interface GameState {
  saveVersion: number;
  seed: number;
  rng: number;
  farmName: string;
  time: { day: number; minute: number };   // day is 1-based
  money: number;
  xp: number;
  level: number;
  w: number;
  h: number;
  tiles: Tile[];
  buildings: Building[];
  nextId: number;
  inventory: Record<string, number>;
  market: Record<string, number>;          // price multiplier per item
  weather: Weather;
  events: GameEvent[];
  landBought: number;                      // acres bought (drives price creep)
  auction: Auction | null;
  leases: Lease[];
  loan: Loan;
  stand: Stand;
  workers: Workers;
  cattle: Animal[];
  player: { x: number; y: number; vehicle: Vehicle; tractorMode: string };
  vehicles: Vehicle[];                     // owned
  fishing: { records: Record<string, number>; caught: number };
  spots: Spot[];
  upgrades: string[];                      // workshop / lab research
  achievements: string[];
  bell: string[];                          // milestones waiting for the bell
  ledger: LedgerSeason[];
  log: { day: number; text: string }[];
  stats: Record<string, number>;
  flags: Record<string, number>;           // one-off flags (daily visits etc.)
}

/** Things the UI/renderer may want to react to; returned from sim calls, never saved. */
export interface SimEvent { type: string; text?: string; x?: number; y?: number; item?: string; amount?: number }
