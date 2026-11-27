// Building catalog. Add an entry here (and a mesh in src/render/meshes.ts) to
// add a building; expansion packs can push more entries into BUILDINGS.

export type Placement = 'land' | 'road' | 'lakefront' | 'pasture';

export interface BuildingDef {
  id: string;
  name: string;
  cost: number;
  level: number;          // player level needed
  tier: 1 | 2 | 3 | 4;    // Basecamp level it belongs to
  place: Placement;       // road = must touch the county road
  unique?: boolean;
  desc: string;
  /** Produces `amount` of `item` every `hours` (times building level). */
  produces?: { item: string; amount: number; hours: number; seasons?: number[] };
  /** Pays `perDay` dollars per day (times building level) into `business`, only in `seasons` if given. */
  income?: { business: string; perDay: number; seasons?: number[] };
  maxLevel?: number;
  /** Outdoor decor: each piece brings a few more visitors to your stand and attractions. */
  decor?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  // ── Level 1 — The Beginning
  { id: 'container', name: 'Shipping Container', cost: 1500, level: 1, tier: 1, place: 'land', unique: true, desc: 'Your first lockable base. Starts Freewalker Basecamp.' },
  { id: 'farm_sign', name: 'Freewalker Farm Sign', cost: 250, level: 1, tier: 1, place: 'road', unique: true, desc: 'A gravel entrance and the family sign: "Family roots since 1874".' },
  { id: 'tool_rack', name: 'Tool Rack', cost: 400, level: 1, tier: 1, place: 'land', unique: true, desc: 'Tools within reach: tilling is free.' },
  { id: 'camper', name: 'Camper', cost: 3000, level: 2, tier: 1, place: 'land', unique: true, desc: 'A place to sleep. Lets you skip the night.' },
  { id: 'garden_bed', name: 'Raised Garden Bed', cost: 300, level: 1, tier: 1, place: 'land', desc: 'Fresh vegetables every day except in winter.', produces: { item: 'vegetables', amount: 1, hours: 24, seasons: [0, 1, 2] } },
  { id: 'chicken_coop', name: 'Chicken Coop', cost: 1800, level: 2, tier: 1, place: 'land', desc: 'Hens lay eggs every day.', produces: { item: 'eggs', amount: 4, hours: 24 } },
  { id: 'bench', name: 'Garden Bench', cost: 150, level: 1, tier: 1, place: 'land', decor: true, desc: 'Decor: a place to sit. Brings a few more visitors.' },
  { id: 'planter', name: 'Flower Planter', cost: 120, level: 1, tier: 1, place: 'land', decor: true, desc: 'Decor: bright flowers. Brings a few more visitors.' },
  { id: 'lamp_post', name: 'Lamp Post', cost: 200, level: 2, tier: 1, place: 'land', decor: true, desc: 'Decor: glows at night. Brings a few more visitors.' },
  // ── Level 2 — Basecamp
  { id: 'cabin', name: 'Cabin', cost: 12000, level: 4, tier: 2, place: 'land', unique: true, desc: 'A real roof. Unlocks Basecamp level 2.' },
  { id: 'fire_pit', name: 'Fire Pit', cost: 300, level: 4, tier: 2, place: 'land', unique: true, desc: 'Evenings by the fire earn a little XP.' },
  { id: 'fishing_dock', name: 'Fishing Dock', cost: 3000, level: 4, tier: 2, place: 'lakefront', unique: true, desc: 'Cast from the dock for bigger fish.' },
  { id: 'farm_stand', name: 'Farm Stand', cost: 2000, level: 5, tier: 2, place: 'road', unique: true, maxLevel: 3, desc: 'A roadside stand. Stock it, set prices, customers stop by.' },
  { id: 'equipment_shed', name: 'Equipment Shed', cost: 6000, level: 5, tier: 2, place: 'land', desc: 'Rent out equipment to neighbors.', income: { business: 'Equipment rental', perDay: 70 } },
  { id: 'beehives', name: 'Beehives', cost: 1200, level: 6, tier: 2, place: 'land', desc: 'Honey every two days, spring to fall.', produces: { item: 'honey', amount: 3, hours: 48, seasons: [0, 1, 2] } },
  { id: 'solar_panels', name: 'Solar Panels', cost: 5000, level: 6, tier: 2, place: 'land', desc: 'Sells power back to the grid.', income: { business: 'Solar', perDay: 45 } },
  { id: 'gazebo', name: 'Gazebo', cost: 2500, level: 5, tier: 2, place: 'land', decor: true, desc: 'Decor: a white gazebo for picnics and weddings. Brings more visitors.' },
  { id: 'outdoor_kitchen', name: 'Outdoor Kitchen', cost: 6000, level: 6, tier: 2, place: 'land', unique: true, decor: true, desc: 'Decor: grill and stone counter. Host a cookout once a day for XP.' },
  { id: 'pumpkin_patch', name: 'Pumpkin Patch', cost: 3000, level: 6, tier: 2, place: 'land', desc: 'Farmtainment: U-pick pumpkins and hayrides. Earns every fall.', income: { business: 'Farmtainment', perDay: 160, seasons: [2] } },
  { id: 'horse_stable', name: 'Horse Stable', cost: 9000, level: 7, tier: 2, place: 'pasture', unique: true, desc: 'Riding lessons: students pay every day, and you can teach lessons yourself.', income: { business: 'Riding lessons', perDay: 70 } },
  { id: 'bell_post', name: 'The Bell Post', cost: 1500, level: 7, tier: 2, place: 'land', unique: true, desc: 'Ring the bell for every major milestone.' },
  // ── Level 3 — Working Farm
  { id: 'kims_garden', name: "Kim's Garden", cost: 6000, level: 8, tier: 3, place: 'land', unique: true, desc: 'Flowers, vegetables and a little greenhouse.', produces: { item: 'flowers', amount: 3, hours: 24 } },
  { id: 'windmill', name: 'Windmill', cost: 3500, level: 8, tier: 3, place: 'land', desc: 'Pumps water: fields within 2 tiles are always watered.' },
  { id: 'black_barn', name: 'Black Barn', cost: 25000, level: 9, tier: 3, place: 'land', unique: true, desc: 'The heart of a working farm. Unlocks Basecamp level 3.' },
  { id: 'cattle_corral', name: 'Cattle Corral', cost: 4000, level: 9, tier: 3, place: 'pasture', desc: 'Lets you raise cattle on your pasture.' },
  { id: 'buffalo_paddock', name: 'Buffalo Paddock', cost: 7000, level: 9, tier: 3, place: 'pasture', desc: 'Raise a buffalo herd that roams your pasture. They share pasture with cattle.' },
  { id: 'corn_maze', name: 'Corn Maze', cost: 5000, level: 8, tier: 3, place: 'land', desc: 'Farmtainment: a maze cut through tall corn. Earns in summer and fall.', income: { business: 'Farmtainment', perDay: 190, seasons: [1, 2] } },
  { id: 'haunted_house', name: 'Haunted House', cost: 15000, level: 11, tier: 3, place: 'land', unique: true, desc: 'Farmtainment: spooky nights every fall. Big crowds in October.', income: { business: 'Farmtainment', perDay: 450, seasons: [2] } },
  { id: 'tree_lot', name: 'Christmas Tree Lot', cost: 6000, level: 9, tier: 3, place: 'land', desc: 'Farmtainment: cut-your-own trees and cocoa. Earns every winter.', income: { business: 'Farmtainment', perDay: 230, seasons: [3] } },
  { id: 'fountain', name: 'Stone Fountain', cost: 4000, level: 9, tier: 3, place: 'land', decor: true, desc: 'Decor: a stone fountain. Brings more visitors.' },
  { id: 'silo', name: 'Grain Silo', cost: 5000, level: 9, tier: 3, place: 'land', desc: 'Store grain: corn, soybeans and wheat sell for 10% more.' },
  { id: 'greenhouse', name: 'Greenhouse', cost: 8000, level: 10, tier: 3, place: 'land', desc: 'Produce all year round.', produces: { item: 'vegetables', amount: 4, hours: 24 } },
  { id: 'orchard', name: 'Apple Orchard', cost: 4000, level: 10, tier: 3, place: 'land', desc: 'Apples ripen through summer and fall.', produces: { item: 'apples', amount: 6, hours: 48, seasons: [1, 2] } },
  { id: 'wind_turbine', name: 'Wind Turbine', cost: 22000, level: 10, tier: 3, place: 'land', desc: 'A tall turbine that sells wind power to the grid.', income: { business: 'Wind power', perDay: 140 } },
  { id: 'workshop', name: "Gavin's Workshop", cost: 15000, level: 11, tier: 3, place: 'land', unique: true, desc: 'Technology, automation and farm upgrades.' },
  // ── Level 4 — Freewalker Estate
  { id: 'lab', name: "Paige's Engineering Lab", cost: 40000, level: 13, tier: 4, place: 'land', unique: true, desc: 'Unlocks better equipment and building upgrades.' },
  { id: 'guest_cabin', name: 'Fishing Cabin', cost: 20000, level: 14, tier: 4, place: 'lakefront', desc: 'Guests rent it to fish Lake Stillwater.', income: { business: 'Fishing cabins', perDay: 160 } },
  { id: 'buffalo_storage', name: 'Buffalo Storage', cost: 35000, level: 15, tier: 4, place: 'road', desc: 'Storage units by the road. Monthly passive income.', income: { business: 'Buffalo Storage', perDay: 300 } },
  { id: 'farmhouse', name: 'Dream Farmhouse', cost: 120000, level: 17, tier: 4, place: 'land', unique: true, desc: 'Home. Unlocks Freewalker Estate (Basecamp level 4).' },
  { id: 'landscaping', name: 'Landscaped Grounds', cost: 2500, level: 17, tier: 4, place: 'land', desc: 'Gardens and paths. More visitors to your stand and cabins.' },
];

export const BUILDING: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** Buildings that raise the Basecamp level when built. */
export const BASECAMP_KEYS: Record<number, string> = { 1: 'container', 2: 'cabin', 3: 'black_barn', 4: 'farmhouse' };
export const BASECAMP_NAMES = ['', 'The Beginning', 'Basecamp', 'Working Farm', 'Freewalker Estate'];

export const upgradeCost = (def: BuildingDef, level: number) => Math.round(def.cost * 0.6 * level);
