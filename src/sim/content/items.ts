// Everything the farm can produce. `price` is the base wholesale price at the
// county elevator/market; `retail` is a fair Farm Stand price.
export interface ItemDef { id: string; name: string; unit: string; icon: string; price: number; retail: number }

export const ITEMS: ItemDef[] = [
  { id: 'corn', name: 'Corn', unit: 'bu', icon: '🌽', price: 18, retail: 26 },
  { id: 'soybeans', name: 'Soybeans', unit: 'bu', icon: '🫘', price: 19, retail: 25 },
  { id: 'wheat', name: 'Wheat', unit: 'bu', icon: '🌾', price: 14, retail: 20 },
  { id: 'pumpkins', name: 'Pumpkins', unit: 'ea', icon: '🎃', price: 24, retail: 38 },
  { id: 'vegetables', name: 'Vegetables', unit: 'crate', icon: '🥕', price: 22, retail: 35 },
  { id: 'flowers', name: 'Flowers', unit: 'bunch', icon: '🌻', price: 12, retail: 20 },
  { id: 'apples', name: 'Apples', unit: 'crate', icon: '🍎', price: 26, retail: 40 },
  { id: 'eggs', name: 'Eggs', unit: 'dozen', icon: '🥚', price: 4, retail: 7 },
  { id: 'honey', name: 'Honey', unit: 'jar', icon: '🍯', price: 9, retail: 15 },
  { id: 'fish', name: 'Fish', unit: 'lb', icon: '🐟', price: 6, retail: 10 },
  { id: 'goods', name: 'Freewalker Goods', unit: 'item', icon: '👕', price: 15, retail: 32 },
];
export const ITEM: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
