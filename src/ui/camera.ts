import * as sim from '../sim';
import { btn, h, modal, askYes } from './dom';
import type { Game } from './game';
import { hudItems, menuSections } from './registry';

// 📷 Camera: hide the HUD, frame a shot (pan and zoom as usual), snap it into the farm's photo album.
export function openCamera(g: Game) {
  g.closeSheet();
  g.ui.classList.add('photo-mode');
  const flash = h('div.photo-flash');
  const ui = h('div.photo-ui', { 'data-testid': 'camera' },
    h('div.photo-frame'),
    h('div.photo-bar', {},
      btn('✕', () => close(), 'round grey', { 'aria-label': 'Close camera', 'data-testid': 'camera-close' }),
      btn('📸', () => snap(), 'round gold photo-shutter', { 'aria-label': 'Take picture', 'data-testid': 'shutter' }),
      btn('🖼️', () => { close(); openAlbum(g); }, 'round blue', { 'aria-label': 'Photo album', 'data-testid': 'camera-album' })),
    flash);
  const close = () => { ui.remove(); g.ui.classList.remove('photo-mode'); g.dirty = true; };
  const snap = async () => {
    const tint = (g.ui.querySelector('.tint') as HTMLElement | null)?.style.background ?? '';
    const url = g.view.snapshot(1600, tint);
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    await g.saves.addPhoto(g.slot, url, `${g.s.farmName} · ${sim.dateLabel(g.s.time.day)} · ${sim.clock(g.s.time.minute)}`);
    g.toast('📸 Saved to your photo album');
  };
  g.ui.append(ui);
}

export async function openAlbum(g: Game) {
  const body = h('div', { 'data-testid': 'album' });
  const render = async () => {
    body.innerHTML = '';
    const list = await g.saves.photos(g.slot);
    if (!list.length) { body.append(h('p', {}, 'No photos yet. Tap 📷 at the top of the screen, frame your farm, and press 📸.')); return; }
    body.append(h('p.muted', {}, `${list.length} photo${list.length > 1 ? 's' : ''} of ${g.s.farmName}. Tap one to see it big. Long-press it to save it to your device.`));
    const grid = h('div.album-grid');
    for (const p of list) {
      const url = await g.saves.photo(g.slot, p.id);
      if (!url) continue;
      grid.append(h('img.album-thumb', { src: url, alt: p.caption, title: p.caption, 'data-testid': 'album-photo', onclick: () => view(p.id, url, p.caption) }));
    }
    body.append(grid);
  };
  const view = (id: number, url: string, caption: string) => {
    const v = modal(g.ui, '🖼️ Photo', [
      h('img', { src: url, alt: caption, style: 'width:100%;border:3px solid var(--ink);border-radius:12px;display:block' }),
      h('p.muted', {}, caption),
      h('div.row', {},
        h('a.btn.small.gold', { href: url, download: `${caption.replace(/[^\w]+/g, '-')}.jpg`, 'data-testid': 'photo-download' }, '⬇️ Save picture'),
        btn('🗑️ Delete', async () => { if (await askYes('Delete this photo?', 'Delete')) { await g.saves.deletePhoto(g.slot, id); v.close(); render(); } }, 'small red')),
    ], undefined, 'photo-view');
  };
  modal(g.ui, '🖼️ Photo album', [body], undefined, 'album-dialog');
  await render();
}

hudItems.push((g) => {
  const b = h('button.chip.camera-btn', { 'data-testid': 'btn-camera', title: 'Camera: take pictures of your farm', 'aria-label': 'Camera' }, '📷');
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => { e.stopPropagation(); openCamera(g); });
  return b;
});
menuSections.push((g, close) => [h('div.row', {}, btn('🖼️ Photo album', () => { close(); openAlbum(g); }, 'small blue', { 'data-testid': 'menu-album' }))]);
