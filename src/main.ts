import { GAME_NAME } from './config';
import { newGame, advance, GAME_MINUTES_PER_REAL_SECOND } from './sim';
import { View } from './render/view';
import { attachControls } from './render/controls';

document.title = GAME_NAME;
const app = document.getElementById('app')!;
app.style.cssText = 'position:fixed;inset:0';
const s = newGame(1);
const view = new View(app);
view.sync(s);
view.focus(s.player.x, s.player.y + 2);
attachControls(app, view, { tap: (t) => view.select(s, t), drawMode: () => false });
window.addEventListener('resize', () => view.resize());
(window as any).__view = view; (window as any).__state = s;
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(s, dt * GAME_MINUTES_PER_REAL_SECOND);
  view.frame(s, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
