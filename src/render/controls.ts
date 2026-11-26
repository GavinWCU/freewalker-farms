import type { View } from './view';

export interface ControlHandlers {
  tap(tile: { x: number; y: number } | null, clientX: number, clientY: number): void;
  hover?(tile: { x: number; y: number } | null): void;
  /** In draw mode a one-finger drag paints tiles instead of panning. */
  drawMode(): boolean;
  draw?(tile: { x: number; y: number }, phase: 'start' | 'move' | 'end'): void;
}

/** Touch-first camera controls: one finger pans (or draws), two fingers pinch, wheel zooms. */
export function attachControls(el: HTMLElement, view: View, h: ControlHandlers) {
  const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  let moved = false, drawing = false, pinchDist = 0;

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    moved = false;
    if (pts.size === 1 && h.drawMode() && e.button === 0) {
      const t = view.pick(e.clientX, e.clientY);
      if (t) { drawing = true; h.draw?.(t, 'start'); }
    }
    if (pts.size === 2) {
      if (drawing) { drawing = false; }
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) { h.hover?.(view.pick(e.clientX, e.clientY)); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) moved = true;
    if (pts.size === 1) {
      if (drawing) { const t = view.pick(e.clientX, e.clientY); if (t) h.draw?.(t, 'move'); }
      else if (moved) view.pan(dx, dy);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) view.zoom(pinchDist / d);
      pinchDist = d;
      view.pan(dx / 2, dy / 2);
    }
  });
  const end = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (drawing && pts.size === 0) { drawing = false; const t = view.pick(e.clientX, e.clientY); h.draw?.(t ?? { x: -1, y: -1 }, 'end'); return; }
    if (!moved && pts.size === 0 && e.type === 'pointerup') h.tap(view.pick(e.clientX, e.clientY), e.clientX, e.clientY);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  el.style.touchAction = 'none';
}
