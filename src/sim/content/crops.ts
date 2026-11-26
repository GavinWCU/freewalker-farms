// Field crops. Seasons: 0 Spring, 1 Summer, 2 Fall, 3 Winter.
export interface CropDef {
  id: string; name: string; item: string; seasons: number[];
  days: number;      // days to grow when watered
  seed: number;      // seed cost per acre
  yield: number;     // units per acre at soil 1.0
  level: number;
  color: string;     // ripe color (renderer)
  shape: 'tall' | 'clump' | 'bush' | 'round' | 'flower';
}

export const CROPS: CropDef[] = [
  { id: 'corn', name: 'Corn', item: 'corn', seasons: [0, 1], days: 5, seed: 80, yield: 30, level: 1, color: '#d9b45a', shape: 'tall' },
  { id: 'soybeans', name: 'Soybeans', item: 'soybeans', seasons: [0, 1], days: 4, seed: 70, yield: 25, level: 1, color: '#c9a64a', shape: 'bush' },
  { id: 'wheat', name: 'Wheat', item: 'wheat', seasons: [0, 2], days: 4, seed: 50, yield: 30, level: 2, color: '#f0c44c', shape: 'clump' },
  { id: 'pumpkins', name: 'Pumpkins', item: 'pumpkins', seasons: [1, 2], days: 5, seed: 90, yield: 20, level: 3, color: '#f08a24', shape: 'round' },
  { id: 'sunflowers', name: 'Sunflowers', item: 'flowers', seasons: [1], days: 4, seed: 60, yield: 30, level: 6, color: '#ffd23f', shape: 'flower' },
];
export const CROP: Record<string, CropDef> = Object.fromEntries(CROPS.map((c) => [c.id, c]));
