// Feature modules register their UI sections here.
import * as sim from '../sim';
import { btn, h } from './dom';
import { buildingSections } from './tile';

buildingSections.push((g, b) => {
  if (!['camper', 'cabin', 'farmhouse'].includes(b.type)) return [];
  return [h('div.row', {}, btn('😴 Sleep until morning', () => { const { r, ev } = sim.sleep(g.s); g.act(r, ev); }, sim.canSleep(g.s) ? 'blue' : 'grey small'))];
});
