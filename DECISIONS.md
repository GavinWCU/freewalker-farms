# Design decisions

Choices made while building, so they can be revisited.

## Map and scale
- **1 parcel = 1 tile = 1 acre.** The world is a 48 × 44 grid (2,112 acres). The county road, the lake and the home 80 sit near the middle; everything else is neighbor land, so growing past 1,000 acres is possible.
- **The home 80** is drawn as an ASCII grid in `src/sim/map/home80.ts`: 43 cropland + 37 pasture tiles. Lake Stillwater's owned part (10 water tiles) is extra and is **not** counted as acres; the lake continues into neighbor land.
- Neighbor terrain (crop / pasture / timber) comes from seeded noise, so each new game's surroundings differ slightly while the home 80 is always the same.
- Parcels across the county road count as touching your land (the road is not a barrier to buying).

## Time
- 1 game day = 10 real minutes (2.4 game minutes per real second).
- A month is 3 days, a season is 3 months (9 days), a year is 36 days (~6 real hours). Short seasons keep crop cycles and leases meaningful within 20-minute evening sessions.
- Golden Hour is 6–8 PM every evening.

## Simulation
- All game state is one plain JSON object with the RNG state inside it. The sim advances in whole-hour steps, so fast-forwarding and the 100-year test are cheap and deterministic.
- Money never goes negative: automatic charges that can't be paid have consequences instead (late fees, workers quitting, leases lapsing).
