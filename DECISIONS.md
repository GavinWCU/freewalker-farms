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

## Art
- **Blender was not reachable** when the art was built (the MCP add-on server wasn't running), so every model is built from code primitives in `src/render/meshes.ts` as the prompt's fallback allows. The registry there is what `/dev/gallery.html` shows; a `.glb` loader can be slotted in per model later without touching the sim.
- Ace's colors (tan coat, red collar) are a guess; change them in `dog()` in `src/render/meshes.ts`.
- Font: Fredoka (SIL Open Font License), bundled in `src/ui/fonts/` with its licence.

## Building and farming
- Every building fills one tile (one acre). Buildings face the county road when they're beside it; docks and fishing cabins face the water.
- The starting small tractor works up to 12 connected acres per tap ("whole field" toggle); a bigger tractor from Paige's Lab works 40.
- Unwatered crops grow at 60% speed (30% in a drought). Rain waters everything; windmills water fields within 2 tiles.
- Unfinished crops wither on the first day of winter; ready ones can still be harvested.
- Building levels 2–3 raise output; level 3 needs Paige's Engineering Lab. The Farm Stand's level 3 is the Freewalker Farm Market.
- Pasture can be converted to cropland ("Break ground").

## Saves
- Each slot keeps its last 3 saves in rotation (`slotN/r0..r2`) plus a small `slotN/meta` record that points to the newest. Data is written before the pointer, so a failed write never replaces a good save.
- Saves are the game state as JSON with `saveVersion`; `src/sim/save.ts` holds the migrations. `tests/fixtures/save-v1.json` is a frozen v1 save that must always keep loading.
- The latest farm resumes automatically behind the title screen; "Continue" is one tap.
- The service worker is only registered in production builds and is blocked in automated tests.

## Land
- An acre's price = base by terrain (crop $3,000, pasture $2,200, timber $1,800) × soil quality × 1.5 if lakefront × (1 + 0.4% per acre already bought). Auctions sell a 2–5 acre block for 3 days at 70–85% (a neighbor selling) or 115–135% (a bidding war).
- Leases run 1, 3 or 5 seasons. The first season's rent is paid when the lease is signed, then at the start of each following season. Lease lengths end on a season boundary.
- Tenants: crop farmer, cattle rancher, hunting club, solar company. Leased-out land gets a white fence and shows the tenant's crops, cattle or solar panels.
- Renting a neighbor's field costs 3.5% of its value per acre per season. You can farm it but not build on it; crops still on it when the lease ends go back with the land. Buying land you rent ends the lease.
- Breaking a lease costs 1.5 seasons of rent (leased out) or 1 season (rented in).
- Loans: up to 50% of your land's value at 8% a year, interest due on the 1st of each month. A missed payment adds the interest plus a 25% late fee to the balance and freezes new borrowing; three in a row raise the rate by a point. The game never ends.

## Farm Stand and businesses
- Shoppers come 8 AM–7 PM. A shopper buys an item with probability `1.4 − 0.8 × (price ÷ fair price)` (clamped 2–97%), so a fair price sells ~60% of the time and double the fair price almost never sells.
- Stand level 1: 4 kinds × 40 units, ~1.6 shoppers/hour. Level 2 (bigger stand): 6 × 80, ~2.6/hour. Level 3 is the Freewalker Farm Market: 9 × 150, ~4.2/hour, but it runs at 60% without a cashier. The Market makes 6 Freewalker Goods a day ($5 each to make).
- Workers are paid daily (farmhand $60, cashier $50, ranch hand $40). If wages can't be paid, a worker quits. Hiring unlocks at level 5.
- Cattle: $900 a calf, ready to sell at 18 days for ~$1,700 (market moves ±25%). Pasture holds one head per 2 open acres plus 4 per corral. Winter hay costs $6/head/day.
- Income buildings: equipment shed (rental), solar panels, fishing cabins (daily, with occupancy), Buffalo Storage (paid monthly). Ledger shows income by business and expenses for each of the last seasons.
