// Extension points: feature modules (land, stand, vehicles, landmarks…) plug
// their UI in here. Expansion packs would register the same way.
import type * as sim from '../sim';
import type { SimEvent } from '../sim';
import type { Game } from './game';

type Add = (x: number, y: number, icon: string, onTap: () => void, testid: string, h?: number) => void;
export const tileSections: ((g: Game, i: number) => Node[])[] = [];
export const buildingSections: ((g: Game, b: sim.Building) => Node[])[] = [];
export const menuSections: ((g: Game, close: () => void) => Node[])[] = [];
export const toolbarItems: ((g: Game) => HTMLElement)[] = [];
export const bubbleSources: ((g: Game, add: Add) => void)[] = [];
export const eventHandlers: ((g: Game, e: SimEvent) => void)[] = [];
export const tickers: ((g: Game, dt: number) => void)[] = [];
export const hudItems: ((g: Game) => HTMLElement)[] = [];
