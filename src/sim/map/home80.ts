// ─────────────────────────────────────────────────────────────────────────────
//  THE HOME 80 — edit this file to match the real property.
//
//  1 tile = 1 parcel = 1 acre. North is the top row, which sits right on the
//  south shoulder of the county road. Characters:
//
//    C  productive cropland            P  rolling pasture
//    W  Lake Stillwater (owned water)  .  not part of the property
//
//  The rows must all be the same length. After editing, run `npm test`: the
//  tests check there are exactly 43 C and 37 P, that the land touches the road
//  and the lake, and that Buffalo Ridge is the highest point.
// ─────────────────────────────────────────────────────────────────────────────

export const HOME_ROWS = [
  'CCCCCPPPPP',
  'CCCCCPPPPP',
  'CCCCCPPPPP',
  'CCCCCPPPPP',
  'CCCCCPPPPP',
  'CCCCCCPPPP',
  'CCCCCCPPWW',
  'CCCCCCPPWW',
  'PPPPWWWWWW',
];

/** World size in tiles. Everything outside the home 80 is neighbor land you can buy. */
export const WORLD_W = 48;
export const WORLD_H = 44;

/** World tile of the home layout's top-left character. */
export const HOME_ORIGIN = { x: 19, y: 13 };

/** The paved county road runs east–west along this world row, power lines beside it. */
export const COUNTY_ROAD_Y = 12;

/** Lake Stillwater spreads past the property line into neighbor land. */
export const LAKE = { cx: 29.5, cy: 22.5, rx: 6.5, ry: 4.5 };

/** Landmarks, in home-layout coordinates (column, row). */
export const LANDMARKS = {
  entrance: { col: 4, row: 0, name: 'Gravel Entrance' },     // where the farm sign goes, off the county road
  ridge: { col: 8, row: 1, name: 'Buffalo Ridge' },          // highest point on the property
  sentinel: { col: 6, row: 3, name: 'Sentinel Tree' },       // the lone special tree
};

/** Starting spot for the player, Ace, the pickup and the small tractor. */
export const START = { col: 4, row: 1 };
